/**
 * searchReplace.js — 検索・置換・正規表現（純粋関数・DOM非依存・テスト可能）
 * @license MIT
 * Copyright (c) 2026 ECgear
 */

/** 正規表現の特殊文字をエスケープ（プレーン検索用） */
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 検索用 RegExp を構築。無効な正規表現は呼び出し側で try/catch すること。
 * opts: { regex:boolean, caseSensitive:boolean, multiline:boolean, dotAll:boolean, global:boolean }
 */
export function buildRegex(query, opts = {}) {
  if (!query) return null;
  let flags = opts.global === false ? '' : 'g';
  if (!opts.caseSensitive) flags += 'i';
  if (opts.multiline) flags += 'm';
  if (opts.dotAll) flags += 's';
  flags += 'u'; // Unicode（日本語/絵文字を正しく扱う）
  const source = opts.regex ? query : escapeRegExp(query);
  return new RegExp(source, flags);
}

/**
 * すべての一致位置を返す: [{ start, end }]
 * 無効な正規表現の場合は例外を投げる（呼び出し側で表示）。
 */
export function findMatches(text, query, opts = {}) {
  const re = buildRegex(query, { ...opts, global: true });
  if (!re) return [];
  const out = [];
  let m, guard = 0;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++; // 幅0マッチの無限ループ回避
    if (++guard > 1_000_000) break;
  }
  return out;
}

/**
 * 置換を適用: { result, count }
 * opts.once=true なら最初の1件のみ。regex=true なら $1 等の後方参照を有効化。
 * 無効な正規表現の場合は例外を投げる。
 */
export function applyReplace(text, query, replacement, opts = {}) {
  if (!query) return { result: text, count: 0 };
  const count = findMatches(text, query, opts).length;
  if (count === 0) return { result: text, count: 0 };
  // プレーン置換では $ を literal 扱いにする（$& 等の誤展開を防ぐ）
  const repl = opts.regex ? replacement : replacement.replace(/\$/g, '$$$$');
  if (opts.once) {
    const re1 = buildRegex(query, { ...opts, global: false });
    return { result: text.replace(re1, repl), count: 1 };
  }
  const reAll = buildRegex(query, { ...opts, global: true });
  return { result: text.replace(reAll, repl), count };
}

/** 正規表現が有効か検査: { valid, error } */
export function validateRegex(query, opts = {}) {
  if (!query) return { valid: true, error: null };
  try { buildRegex(query, opts); return { valid: true, error: null }; }
  catch (e) { return { valid: false, error: e.message }; }
}
