#!/usr/bin/env node
/**
 * build.mjs — 依存ゼロのインライナ。
 * ES モジュール群と vendor ライブラリ、CSS を 1 ファイル dist/index.html に内包する。
 * 生成物は file:// でもオフライン動作し、make-good-life.com/tools/diff/ へドロップインできる。
 *
 * 仕組み: 各モジュールを「インポートを冒頭で分割代入し、エクスポートを return する IIFE」に変換し、
 * 名前空間定数として連結する（実 ES モジュールのスコープ分離を再現）。
 *
 * @license MIT — Copyright (c) 2026 ECgear
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const r = (...p) => join(ROOT, ...p);

// モジュール名 → 名前空間変数
const NS = {
  'src/vendor/jsdiff.js': '__m_jsdiff',
  'src/vendor/diff-match-patch-es.js': '__m_dmp',
  'src/whitespace.js': '__m_ws',
  'src/searchReplace.js': '__m_sr',
  'src/i18n.js': '__m_i18n',
  'src/diffEngine.js': '__m_diff',
  'src/app.js': '__m_app',
};
// 連結順（依存順）
const ORDER = Object.keys(NS);
// import 指定子 → モジュールパス（相対指定の解決）
const RESOLVE = {
  './vendor/jsdiff.js': 'src/vendor/jsdiff.js',
  './vendor/diff-match-patch-es.js': 'src/vendor/diff-match-patch-es.js',
  './whitespace.js': 'src/whitespace.js',
  './searchReplace.js': 'src/searchReplace.js',
  './i18n.js': 'src/i18n.js',
  './diffEngine.js': 'src/diffEngine.js',
  './app.js': 'src/app.js',
};

/** vendor の `export{a as b,...}` を return マップへ変換し IIFE 化 */
function wrapVendor(nsVar, code) {
  // `export default ...;`（jsDelivr +esm が付与する `export default null` 等）を除去。
  // これを残すと classic script で "Unexpected token 'export'" になる。
  code = code.replace(/export\s+default\s+[^;]+;/g, '');
  const m = code.match(/export\s*\{([^}]*)\}\s*;?/);
  let ret = 'return {}';
  if (m) {
    const pairs = m[1].split(',').map(s => s.trim()).filter(Boolean).map(p => {
      const mm = p.split(/\s+as\s+/);
      return mm.length === 2 ? `${mm[1].trim()}:${mm[0].trim()}` : `${p}:${p}`;
    });
    ret = `return {${pairs.join(',')}}`;
    code = code.replace(m[0], ';' + ret + ';');
  } else {
    code += '\n' + ret + ';';
  }
  return `const ${nsVar} = (function(){\n${code}\n})();`;
}

/** 自作モジュールを「import を分割代入・export を return」に変換し IIFE 化 */
function wrapModule(nsVar, code) {
  // import を収集して prelude を作る
  const prelude = [];
  const importRe = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
  let im;
  while ((im = importRe.exec(code)) !== null) {
    const names = im[1].split(',').map(s => s.trim()).filter(Boolean)
      .map(n => n.includes(' as ') ? n.split(/\s+as\s+/).map(x => x.trim()).join(':') : n);
    const src = RESOLVE[im[2]];
    if (!src) throw new Error(`unresolved import: ${im[2]}`);
    prelude.push(`const {${names.join(',')}} = ${NS[src]};`);
  }
  code = code.replace(importRe, '');

  // export を収集
  const exports = new Set();
  let mm;
  const fnRe = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm;
  while ((mm = fnRe.exec(code))) exports.add(mm[1]);
  const vRe = /^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm;
  while ((mm = vRe.exec(code))) exports.add(mm[1]);
  const blockRe = /^export\s*\{([^}]*)\}\s*;?/gm;
  while ((mm = blockRe.exec(code))) {
    for (const n of mm[1].split(',').map(s => s.trim()).filter(Boolean)) {
      exports.add(n.includes(' as ') ? n.split(/\s+as\s+/)[1].trim() : n);
    }
  }

  // export キーワードを除去（`export { x }; // 注釈` のような行末コメントも許容）
  code = code.replace(/^export\s+(?=(?:async\s+)?function\s)/gm, '');
  code = code.replace(/^export\s+(?=(?:const|let|var)\s)/gm, '');
  code = code.replace(/^export\s*\{[^}]*\}\s*;?/gm, '');

  const ret = `return {${[...exports].join(',')}};`;
  return `const ${nsVar} = (function(){\n"use strict";\n${prelude.join('\n')}\n${code}\n${ret}\n})();`;
}

async function main() {
  const blocks = [];
  for (const path of ORDER) {
    const code = await readFile(r(path), 'utf8');
    blocks.push(path.startsWith('src/vendor/') ? wrapVendor(NS[path], code) : wrapModule(NS[path], code));
  }
  const inlineJs = `(function(){\n"use strict";\ntry{\n${blocks.join('\n\n')}\n}catch(__e){console.error('wisediff boot error:',__e);}\n})();`;

  // ガード: 変換漏れの import/export が残っていないか（classic script では SyntaxError になる）
  const leftover = inlineJs.match(/^[ \t]*(?:export|import)\b.*$/m);
  if (leftover) throw new Error('leftover module statement in bundle: ' + leftover[0].slice(0, 80));

  const css = await readFile(r('styles.css'), 'utf8');
  let html = await readFile(r('index.html'), 'utf8');

  // CSS をインライン化（id を付与し saveHtml で参照できるように）
  // 置換文字列に $ が含まれるため、関数形式で literal 挿入する（$& 等の特殊解釈を防ぐ）。
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/?>/,
    () => `<style id="app-style">\n${css}\n</style>`
  );
  // モジュールスクリプトをインライン化
  html = html.replace(
    /<script\s+type="module"\s+src="\.\/src\/app\.js"\s*><\/script>/,
    () => `<script>\n${inlineJs}\n</script>`
  );

  if (html.includes('styles.css') || html.includes('./src/app.js')) {
    throw new Error('inlining failed: link/script tag not replaced');
  }

  await mkdir(r('dist'), { recursive: true });
  await writeFile(r('dist/index.html'), html, 'utf8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✓ built dist/index.html (${kb} KB, self-contained, offline-ready)`);
}

main().catch((e) => { console.error('build failed:', e.message); process.exit(1); });
