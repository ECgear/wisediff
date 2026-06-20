/**
 * whitespace.js — 不可視文字の可視化と行末/空白の判定（純粋関数・DOM非依存）
 * @license MIT
 * Copyright (c) 2026 ECgear
 */

const GLYPH = {
  space: '·',     // U+00B7 MIDDLE DOT
  tab: '→',       // U+2192 RIGHTWARDS ARROW
  newline: '¶',   // U+00B6 PILCROW
  cr: '␍',        // U+240D
  nbsp: '␣',      // U+2423 OPEN BOX
};

/** HTML 特殊文字をエスケープ */
export function escapeHtml(text) {
  let out = '';
  for (const ch of text) {
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else out += ch;
  }
  return out;
}

/**
 * セグメント文字列を安全な HTML に変換する。
 * showWs=true のときは不可視文字をグリフ付き span に置換（CSS でスタイル可能）。
 * showWs=false でも改行/タブ/空白は実体のまま残り、コンテナの white-space:pre-wrap で表示される。
 * surrogate pair（絵文字等）を壊さないよう for..of で走査する。
 */
export function segHtml(text, showWs = false) {
  let out = '';
  for (const ch of text) {
    switch (ch) {
      case '&': out += '&amp;'; break;
      case '<': out += '&lt;'; break;
      case '>': out += '&gt;'; break;
      case '"': out += '&quot;'; break;
      case ' ':
        out += showWs ? `<span class="ws ws-space">${GLYPH.space}</span>` : ' ';
        break;
      case '\t':
        out += showWs ? `<span class="ws ws-tab">${GLYPH.tab}</span>\t` : '\t';
        break;
      case ' ': // non-breaking space
        out += showWs ? `<span class="ws ws-nbsp">${GLYPH.nbsp}</span>` : ' ';
        break;
      case '\r':
        out += showWs ? `<span class="ws ws-cr">${GLYPH.cr}</span>` : '';
        break;
      case '\n':
        out += (showWs ? `<span class="ws ws-nl">${GLYPH.newline}</span>` : '') + '\n';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** 文字列が「空でなく、かつ空白文字のみ」で構成されるか */
export function isWhitespaceOnly(text) {
  return text.length > 0 && /^\s+$/u.test(text);
}

/** 改行コードの種別を返す: 'none' | 'LF' | 'CRLF' | 'CR' | 'mixed' */
export function detectLineEnding(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  // 単独 CR / 単独 LF（CRLF を構成しないもの）を数える
  const lone = text.replace(/\r\n/g, '');
  const cr = (lone.match(/\r/g) || []).length;
  const lf = (lone.match(/\n/g) || []).length;
  const kinds = [crlf > 0, cr > 0, lf > 0].filter(Boolean).length;
  if (kinds === 0) return 'none';
  if (kinds > 1) return 'mixed';
  if (crlf > 0) return 'CRLF';
  if (cr > 0) return 'CR';
  return 'LF';
}

/** 末尾に改行があるか */
export function hasFinalNewline(text) {
  return /\r\n$|\n$|\r$/.test(text);
}

export { GLYPH };
