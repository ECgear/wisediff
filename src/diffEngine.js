/**
 * diffEngine.js — 差分計算（純粋関数・DOM非依存・テスト可能）
 *
 * 2段構成:
 *   行モード … 行アラインメント(jsdiff diffLines) → 変更行ペアは文字単位インライン差分(diff-match-patch)
 *   単語/文字モード … 連続ストリームとして語/文字単位で差分
 *
 * 出力は「構造化モデル」。HTML 化は呼び出し側(app.js)が whitespace.segHtml で行う。
 *
 * @license MIT
 * Copyright (c) 2026 ECgear
 */

import { diffLines, diffWords, diffWordsWithSpace, diffChars } from './vendor/jsdiff.js';
import {
  diffMain, diffCleanupSemantic,
  DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL,
} from './vendor/diff-match-patch-es.js';
import { isWhitespaceOnly, detectLineEnding, hasFinalNewline } from './whitespace.js';

const DEFAULTS = { mode: 'line', ignoreCase: false, ignoreWhitespace: false, inlineChar: true };

/** jsdiff のブロック値を行配列へ（末尾改行由来の空要素は除去） */
function splitBlock(value) {
  const arr = value.split('\n');
  if (arr.length > 1 && arr[arr.length - 1] === '') arr.pop();
  return arr;
}

/** 入力メタ情報（改行種別・末尾改行・行数・文字数・一致） */
function buildMeta(a, b) {
  const ea = detectLineEnding(a), eb = detectLineEnding(b);
  return {
    left:  { ending: ea, finalNewline: hasFinalNewline(a), chars: [...a].length, lines: a === '' ? 0 : a.split('\n').length },
    right: { ending: eb, finalNewline: hasFinalNewline(b), chars: [...b].length, lines: b === '' ? 0 : b.split('\n').length },
    identical: a === b,
    endingMismatch: a !== '' && b !== '' && ea !== eb && ea !== 'none' && eb !== 'none',
    finalNewlineMismatch: hasFinalNewline(a) !== hasFinalNewline(b),
  };
}

/**
 * 1行どうしの文字単位インライン差分。
 * 戻り値: { left:[{text,op:'same'|'del'}], right:[{text,op:'same'|'ins'}], wsOnly:boolean }
 */
export function inlineCharDiff(leftLine, rightLine) {
  const d = diffMain(leftLine, rightLine);
  diffCleanupSemantic(d);
  const left = [], right = [];
  let changed = '';
  for (const [op, text] of d) {
    if (op === DIFF_EQUAL) { left.push({ text, op: 'same' }); right.push({ text, op: 'same' }); }
    else if (op === DIFF_DELETE) { left.push({ text, op: 'del' }); changed += text; }
    else { right.push({ text, op: 'ins' }); changed += text; }
  }
  return { left, right, wsOnly: isWhitespaceOnly(changed) };
}

/** 行モード: 側並び(side-by-side)行モデルを生成 */
export function computeLineDiff(a, b, opts) {
  const parts = diffLines(a, b, {
    ignoreCase: opts.ignoreCase,
    ignoreWhitespace: opts.ignoreWhitespace,
    stripTrailingCr: true,
  });

  const rows = [];
  let ln = 0, rn = 0;
  const stats = { addLines: 0, delLines: 0, chgLines: 0 };

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];

    if (!p.added && !p.removed) {
      for (const line of splitBlock(p.value)) {
        ln++; rn++;
        rows.push({ type: 'equal', left: { num: ln, segs: [{ text: line, op: 'same' }] }, right: { num: rn, segs: [{ text: line, op: 'same' }] } });
      }
      continue;
    }

    if (p.removed) {
      const leftLines = splitBlock(p.value);
      const next = parts[i + 1];
      if (next && next.added) {
        const rightLines = splitBlock(next.value);
        i++; // ペアの追加ブロックを消費
        const n = Math.max(leftLines.length, rightLines.length);
        for (let k = 0; k < n; k++) {
          const L = leftLines[k], R = rightLines[k];
          if (L !== undefined && R !== undefined) {
            ln++; rn++;
            if (opts.inlineChar) {
              const { left, right, wsOnly } = inlineCharDiff(L, R);
              rows.push({ type: 'chg', wsOnly, left: { num: ln, segs: left }, right: { num: rn, segs: right } });
            } else {
              rows.push({ type: 'chg', wsOnly: false, left: { num: ln, segs: [{ text: L, op: 'del' }] }, right: { num: rn, segs: [{ text: R, op: 'ins' }] } });
            }
            stats.chgLines++;
          } else if (L !== undefined) {
            ln++; rows.push({ type: 'del', left: { num: ln, segs: [{ text: L, op: 'del' }] }, right: null }); stats.delLines++;
          } else {
            rn++; rows.push({ type: 'ins', left: null, right: { num: rn, segs: [{ text: R, op: 'ins' }] } }); stats.addLines++;
          }
        }
      } else {
        for (const line of leftLines) { ln++; rows.push({ type: 'del', left: { num: ln, segs: [{ text: line, op: 'del' }] }, right: null }); stats.delLines++; }
      }
      continue;
    }

    // p.added（単独の追加ブロック）
    for (const line of splitBlock(p.value)) { rn++; rows.push({ type: 'ins', left: null, right: { num: rn, segs: [{ text: line, op: 'ins' }] } }); stats.addLines++; }
  }

  return { kind: 'line', rows, stats, meta: buildMeta(a, b) };
}

/** 単語/文字モード: 統合(インライン)ストリームモデルを生成 */
export function computeStreamDiff(a, b, mode, opts) {
  let parts;
  if (mode === 'word') {
    parts = opts.ignoreWhitespace
      ? diffWords(a, b, { ignoreCase: opts.ignoreCase })
      : diffWordsWithSpace(a, b, { ignoreCase: opts.ignoreCase });
  } else { // char
    if (opts.ignoreCase || opts.ignoreWhitespace) {
      parts = diffChars(a, b, { ignoreCase: opts.ignoreCase }); // jsdiff（無視オプション対応・原文ベース）
    } else {
      const d = diffMain(a, b); diffCleanupSemantic(d); // dmp（日本語の可読性が最良）
      parts = d.map(([op, text]) => ({ value: text, added: op === DIFF_INSERT, removed: op === DIFF_DELETE }));
    }
  }

  const segments = [];
  const stats = { addChars: 0, delChars: 0 };
  for (const p of parts) {
    const op = p.added ? 'ins' : p.removed ? 'del' : 'same';
    segments.push({ text: p.value, op, wsOnly: op !== 'same' && isWhitespaceOnly(p.value) });
    if (op === 'ins') stats.addChars += [...p.value].length;
    else if (op === 'del') stats.delChars += [...p.value].length;
  }
  return { kind: 'stream', segments, stats, meta: buildMeta(a, b) };
}

/** 公開 API: モードに応じて差分モデルを返す */
export function computeDiff(a, b, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (opts.mode === 'line') return computeLineDiff(a, b, opts);
  return computeStreamDiff(a, b, opts.mode, opts);
}
