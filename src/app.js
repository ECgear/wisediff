/**
 * app.js — UI 配線・描画・イベント処理（ブラウザ専用）
 * 純粋ロジックは diffEngine / searchReplace / whitespace / i18n に分離。
 * @license MIT
 * Copyright (c) 2026 ECgear
 */

import { computeDiff } from './diffEngine.js';
import { isWhitespaceOnly, segHtml, escapeHtml } from './whitespace.js';
import { findMatches, applyReplace, validateRegex } from './searchReplace.js';
import { detectAndDecode } from './encoding.js';
import { STRINGS, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'wisediff:settings';
const TEXT_KEY = 'wisediff:text';
// 自動比較を一時停止する目安（巨大入力で固まるのを防ぐ。常時ライブだが、超えたら手動比較）。
// 通信ゼロ＝サーバー負荷ではなく、閲覧端末の体感速度のための目安。
const HEAVY_LINES = 10000;
const HEAVY_CHARS = 1000000;

const DEFAULTS = {
  lang: (navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en',
  mode: 'line', view: 'sbs',
  showWs: false, ignoreWs: false, ignoreCase: false,
  syncScroll: false, lineNumbers: true,
  theme: 'light', scheme: 'default',
};

let state = { ...DEFAULTS };
let lastModel = null;
let isEmbed = false;
let diffBlocks = [];   // 相違ブロック（各要素 = そのブロックの DOM 要素配列）
let currentDiff = -1;  // 現在の相違インデックス（-1 = 未選択）

/* ---------- 設定の保存/復元 ---------- */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    state = { ...DEFAULTS, ...s };
  } catch { state = { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

/* ---------- i18n 反映 ---------- */
function applyI18n() {
  const lang = state.lang;
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(lang, el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(lang, el.dataset.i18nPh);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(lang, el.dataset.i18nTitle);
}

/* ---------- セグメント→HTML ---------- */
function segsToHtml(segs) {
  let html = '';
  for (const s of segs) {
    const force = s.op !== 'same' && isWhitespaceOnly(s.text);
    const cls = `seg seg-${s.op}${force ? ' ws-strong' : ''}`;
    html += `<span class="${cls}">${segHtml(s.text, state.showWs || force)}</span>`;
  }
  return html || '<span class="seg seg-same"></span>';
}

/* ---------- 描画 ---------- */
function render(model) {
  const result = $('result');
  const empty = ($('inputA').value === '' && $('inputB').value === '');
  if (empty) {
    result.innerHTML = `<p class="placeholder" data-i18n="emptyState">${t(state.lang, 'emptyState')}</p>`;
    $('stats').innerHTML = '';
    rebuildDiffNav();
    postHeight();
    return;
  }
  renderStats(model);
  if (model.kind === 'line') {
    result.innerHTML = state.view === 'inline' ? lineInlineHtml(model) : lineSbsHtml(model);
  } else {
    result.innerHTML = streamHtml(model);
  }
  result.classList.toggle('hide-lineno', !state.lineNumbers);
  rebuildDiffNav();
  postHeight();
}

/* 埋め込み(iframe)時、親ページへ高さを通知（postMessage は connect-src 'none' に抵触しない） */
function postHeight() {
  if (!isEmbed) return;
  try { parent.postMessage({ type: 'wisediff:height', h: document.documentElement.scrollHeight }, '*'); } catch {}
}

/* ---------- 相違箇所のジャンプ ---------- */
/* #result から「連続する変更要素」を1ブロックに束ねて収集する（行/ストリーム両対応） */
function collectDiffBlocks() {
  const result = $('result');
  const blocks = [];
  let cur = null;
  const group = (nodes, isChanged) => {
    for (const el of nodes) {
      if (isChanged(el)) { if (!cur) { cur = []; blocks.push(cur); } cur.push(el); }
      else cur = null;
    }
  };
  const rows = result.querySelectorAll('table.diff > tbody > tr.row');
  if (rows.length) {
    group(rows, (tr) => !tr.classList.contains('row-equal'));
  } else {
    group(result.querySelectorAll('.diff.stream > .seg'), (sp) => !sp.classList.contains('seg-same'));
  }
  return blocks;
}

function rebuildDiffNav() {
  // 既存ハイライトを除去してから再収集
  for (const b of diffBlocks) for (const el of b) el.classList.remove('diff-current');
  diffBlocks = collectDiffBlocks();
  currentDiff = -1;
  const nav = $('diffNav');
  if (nav) nav.hidden = diffBlocks.length === 0;
  updateDiffCounter();
}

function updateDiffCounter() {
  const el = $('diffNavCounter');
  if (!el) return;
  const n = diffBlocks.length;
  const label = t(state.lang, 'diffNavLabel');
  el.textContent = n === 0 ? '' : (currentDiff < 0 ? `${label} ${n}` : `${currentDiff + 1} / ${n}`);
}

function gotoDiff(idx) {
  const n = diffBlocks.length;
  if (n === 0) return;
  if (currentDiff >= 0 && diffBlocks[currentDiff]) for (const el of diffBlocks[currentDiff]) el.classList.remove('diff-current');
  currentDiff = ((idx % n) + n) % n; // 循環
  const block = diffBlocks[currentDiff];
  for (const el of block) el.classList.add('diff-current');
  scrollToBlock(block[0]);
  updateDiffCounter();
}

/* 対象ブロック先頭が #result の中央に来るよう内部スクロール（window/親は動かさない） */
function scrollToBlock(el) {
  const r = $('result');
  if (!r || !el) return;
  const top = (el.getBoundingClientRect().top - r.getBoundingClientRect().top) + r.scrollTop
    - (r.clientHeight / 2) + (el.getBoundingClientRect().height / 2);
  try { r.scrollTo({ top, behavior: 'smooth' }); } catch { r.scrollTop = top; }
}

function lineSbsHtml(model) {
  let rows = '';
  for (const r of model.rows) {
    const wsc = r.wsOnly ? ' ws-only' : '';
    const lNum = r.left ? r.left.num : '';
    const rNum = r.right ? r.right.num : '';
    const lCode = r.left ? segsToHtml(r.left.segs) : '';
    const rCode = r.right ? segsToHtml(r.right.segs) : '';
    rows += `<tr class="row row-${r.type}${wsc}">`
      + `<td class="lineno">${lNum}</td><td class="code code-l ${r.left ? '' : 'filler'}">${lCode}</td>`
      + `<td class="lineno">${rNum}</td><td class="code code-r ${r.right ? '' : 'filler'}">${rCode}</td>`
      + `</tr>`;
  }
  return `<table class="diff sbs"><tbody>${rows}</tbody></table>`;
}

function lineInlineHtml(model) {
  let rows = '';
  const line = (sign, num, segs, type, ws) =>
    `<tr class="row row-${type}${ws ? ' ws-only' : ''}"><td class="sign">${sign}</td>`
    + `<td class="lineno">${num}</td><td class="code">${segsToHtml(segs)}</td></tr>`;
  for (const r of model.rows) {
    if (r.type === 'equal') rows += line(' ', r.left.num, r.left.segs, 'equal', false);
    else if (r.type === 'del') rows += line('-', r.left.num, r.left.segs, 'del', false);
    else if (r.type === 'ins') rows += line('+', r.right.num, r.right.segs, 'ins', false);
    else { // chg
      rows += line('-', r.left.num, r.left.segs, 'del', r.wsOnly);
      rows += line('+', r.right.num, r.right.segs, 'ins', r.wsOnly);
    }
  }
  return `<table class="diff unified"><tbody>${rows}</tbody></table>`;
}

function streamHtml(model) {
  let html = '';
  for (const s of model.segments) {
    const force = s.wsOnly;
    html += `<span class="seg seg-${s.op}${force ? ' ws-strong' : ''}">${segHtml(s.text, state.showWs || force)}</span>`;
  }
  return `<div class="diff stream">${html}</div>`;
}

function renderStats(model) {
  const lang = state.lang, m = model.meta;
  let parts = [];
  if (m.identical) {
    parts.push(`<span class="stat ok">${t(lang, 'identical')}</span>`);
  } else if (model.kind === 'line') {
    const s = model.stats;
    parts.push(`<span class="stat add">+${s.addLines} ${t(lang, 'added')}</span>`);
    parts.push(`<span class="stat del">-${s.delLines} ${t(lang, 'deleted')}</span>`);
    parts.push(`<span class="stat chg">~${s.chgLines} ${t(lang, 'changed')}</span>`);
  } else {
    const s = model.stats;
    parts.push(`<span class="stat add">+${s.addChars} ${t(lang, 'chars')}</span>`);
    parts.push(`<span class="stat del">-${s.delChars} ${t(lang, 'chars')}</span>`);
  }
  // メタ: 改行コード/末尾改行
  const badge = (label, val) => `<span class="badge">${label}: ${val}</span>`;
  parts.push(badge('A ' + t(lang, 'lineEnding'), m.left.ending));
  parts.push(badge('B ' + t(lang, 'lineEnding'), m.right.ending));
  if (m.endingMismatch) parts.push(`<span class="badge warn">${t(lang, 'endingMismatch')}</span>`);
  if (m.finalNewlineMismatch) parts.push(`<span class="badge warn">${t(lang, 'finalNlMismatch')}</span>`);
  $('stats').innerHTML = parts.join(' ');
}

/* ---------- 比較実行 ---------- */
function compare() {
  const a = $('inputA').value, b = $('inputB').value;
  updateSizeNotice();
  lastModel = computeDiff(a, b, { mode: state.mode, ignoreCase: state.ignoreCase, ignoreWhitespace: state.ignoreWs });
  render(lastModel);
}
let debTimer = null;
function liveCompare() {
  // 常時ライブ。ただし巨大入力は固まりを避けるため自動比較を止め、案内の「比較する」で手動計算する。
  if (isHeavy($('inputA').value, $('inputB').value)) { clearTimeout(debTimer); updateSizeNotice(); return; }
  clearTimeout(debTimer);
  debTimer = setTimeout(compare, 180);
}

/* 行数を配列確保なしで数える（巨大文字列でも軽い） */
function countLines(s) {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}
function isHeavy(a, b) {
  if (a.length > HEAVY_CHARS || b.length > HEAVY_CHARS) return true;
  return countLines(a) > HEAVY_LINES || countLines(b) > HEAVY_LINES;
}

/* 巨大入力の案内＋手動「比較する」（閾値未満では非表示） */
function updateSizeNotice() {
  const el = $('sizeNotice');
  if (!el) return;
  const a = $('inputA').value, b = $('inputB').value;
  if (!isHeavy(a, b)) { el.hidden = true; return; }
  $('sizeNoticeText').textContent = t(state.lang, 'largeInputNotice', countLines(a), countLines(b));
  el.hidden = false;
}

/* ---------- 検索ハイライト（入力欄のオーバーレイ） ---------- */
function searchOpts() {
  return { regex: $('optRegex').checked, caseSensitive: $('optMatchCase').checked };
}
function targets() {
  const v = document.querySelector('input[name="searchTarget"]:checked')?.value || 'both';
  if (v === 'A') return ['A'];
  if (v === 'B') return ['B'];
  return ['A', 'B'];
}
function updateHighlights() {
  const q = $('findInput').value;
  const opts = searchOpts();
  const vr = validateRegex(q, opts);
  $('findInput').classList.toggle('invalid', !vr.valid);
  let total = 0;
  for (const side of ['A', 'B']) {
    const ta = $('input' + side), bd = $('hl' + side);
    if (!targets().includes(side) || !q || !vr.valid) { bd.innerHTML = ''; continue; }
    let matches = [];
    try { matches = findMatches(ta.value, q, opts); } catch { matches = []; }
    total += matches.length;
    bd.innerHTML = highlightHtml(ta.value, matches);
    bd.scrollTop = ta.scrollTop; bd.scrollLeft = ta.scrollLeft;
  }
  const status = $('searchStatus');
  if (!q) status.textContent = '';
  else if (!vr.valid) status.textContent = t(state.lang, 'invalidRegex');
  else status.textContent = total === 0 ? t(state.lang, 'noMatch') : `${total}`;
}
function highlightHtml(text, matches) {
  if (!matches.length) return escapeHtml(text);
  let html = '', pos = 0;
  for (const m of matches) {
    html += escapeHtml(text.slice(pos, m.start));
    html += `<mark>${escapeHtml(text.slice(m.start, m.end))}</mark>`;
    pos = m.end;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

/* ---------- 置換 ---------- */
function doReplace(all) {
  const q = $('findInput').value, repl = $('replaceInput').value;
  const opts = searchOpts();
  const vr = validateRegex(q, opts);
  if (!q || !vr.valid) { updateHighlights(); return; }
  let count = 0;
  for (const side of targets()) {
    const ta = $('input' + side);
    try {
      const res = applyReplace(ta.value, q, repl, { ...opts, once: !all });
      ta.value = res.result; count += res.count;
    } catch { /* invalid regex ignored */ }
    if (!all && count > 0) break; // 単発は1件で終了
  }
  persistTextIfEnabled();
  compare();
  updateHighlights();
  $('searchStatus').textContent = t(state.lang, 'replacedN', count); // ハイライト更新後に表示（上書き防止）
}

/* ---------- ファイル読込（ブラウザ内のみ） ---------- */
function loadFileInto(side, file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    // 文字コードを自動判定（Shift_JIS / EUC-JP / UTF-8(BOM) / UTF-16 等）して文字化けを防ぐ
    let text = '';
    try { text = detectAndDecode(reader.result).text; }
    catch { try { text = new TextDecoder().decode(reader.result); } catch { text = ''; } }
    $('input' + side).value = text;
    persistTextIfEnabled(); compare(); updateHighlights();
  };
  reader.readAsArrayBuffer(file);
}

/* ---------- 結果のコピー/保存 ---------- */
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); flash(btn); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); flash(btn); } catch {} ta.remove();
  }
}
function saveHtml() {
  const css = document.getElementById('app-style')?.textContent || '';
  const doc = `<!doctype html><html lang="${state.lang}"><head><meta charset="utf-8">`
    + `<title>wisediff result</title><style>${css}</style></head><body class="export">`
    + `<div id="stats">${$('stats').innerHTML}</div>${$('result').innerHTML}`
    + `</body></html>`;
  const blob = new Blob([doc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'wisediff-result.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function flash(btn) { if (!btn) return; btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 600); }

/* ---------- テキストのローカル保存 ---------- */
function persistTextIfEnabled() {
  if (!state.saveText) return;
  try { localStorage.setItem(TEXT_KEY, JSON.stringify({ a: $('inputA').value, b: $('inputB').value })); } catch {}
}

/* ---------- テーマ/配色 ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.scheme = state.scheme;
}

/* ---------- コントロールの初期化 ---------- */
function reflectControls() {
  $('optShowWs').checked = state.showWs;
  $('optIgnoreWs').checked = state.ignoreWs;
  $('optIgnoreCase').checked = state.ignoreCase;
  $('optSyncScroll').checked = state.syncScroll;
  $('optLineNumbers').checked = state.lineNumbers;
  for (const el of document.querySelectorAll('[data-mode]')) el.classList.toggle('active', el.dataset.mode === state.mode);
  for (const el of document.querySelectorAll('[data-view]')) el.classList.toggle('active', el.dataset.view === state.view);
  for (const el of document.querySelectorAll('[data-lang]')) el.classList.toggle('active', el.dataset.lang === state.lang);
  $('schemeSelect').value = state.scheme;
  document.body.classList.toggle('view-inline', state.view === 'inline');
}

function bind() {
  $('btnComparePaused').addEventListener('click', compare);
  $('btnSwap').addEventListener('click', () => {
    const a = $('inputA').value; $('inputA').value = $('inputB').value; $('inputB').value = a;
    persistTextIfEnabled(); compare(); updateHighlights();
  });
  $('btnClear').addEventListener('click', () => {
    $('inputA').value = ''; $('inputB').value = '';
    try { localStorage.removeItem(TEXT_KEY); } catch {} // 「保存を削除」相当を全消去に集約
    persistTextIfEnabled(); compare(); updateHighlights();
  });
  $('btnCopyA').addEventListener('click', () => copyText($('inputA').value, $('btnCopyA')));
  $('btnCopyB').addEventListener('click', () => copyText($('inputB').value, $('btnCopyB')));
  $('btnSave').addEventListener('click', saveHtml);

  // 相違箇所ジャンプ
  $('btnNextDiff').addEventListener('click', () => gotoDiff(currentDiff + 1));
  $('btnPrevDiff').addEventListener('click', () => gotoDiff(currentDiff <= 0 ? diffBlocks.length - 1 : currentDiff - 1));

  // 入力
  for (const side of ['A', 'B']) {
    const ta = $('input' + side);
    ta.addEventListener('input', () => { persistTextIfEnabled(); liveCompare(); if (!$('searchBar').hidden) updateHighlights(); });
    ta.addEventListener('scroll', () => {
      $('hl' + side).scrollTop = ta.scrollTop; $('hl' + side).scrollLeft = ta.scrollLeft;
      if (state.syncScroll) { const o = side === 'A' ? 'B' : 'A'; $('input' + o).scrollTop = ta.scrollTop; }
    });
    // ドラッグ&ドロップ
    const wrap = ta.closest('.editor-wrap');
    wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drop'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
    wrap.addEventListener('drop', (e) => {
      e.preventDefault(); wrap.classList.remove('drop');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFileInto(side, e.dataTransfer.files[0]);
    });
    $('btnLoad' + side).addEventListener('click', () => { const fi = $('fileInput'); fi.dataset.side = side; fi.click(); });
  }
  $('fileInput').addEventListener('change', (e) => { loadFileInto($('fileInput').dataset.side || 'A', e.target.files[0]); e.target.value = ''; });

  // モード/表示/言語
  for (const el of document.querySelectorAll('[data-mode]')) el.addEventListener('click', () => { state.mode = el.dataset.mode; saveSettings(); reflectControls(); compare(); });
  for (const el of document.querySelectorAll('[data-view]')) el.addEventListener('click', () => { state.view = el.dataset.view; saveSettings(); reflectControls(); render(lastModel || { kind: 'line', rows: [], stats: {}, meta: { left: {}, right: {} } }); });
  for (const el of document.querySelectorAll('[data-lang]')) el.addEventListener('click', () => { state.lang = el.dataset.lang; saveSettings(); applyI18n(); reflectControls(); buildRegexHelp(); if (lastModel) render(lastModel); });

  // オプション
  $('optShowWs').addEventListener('change', (e) => { state.showWs = e.target.checked; saveSettings(); if (lastModel) render(lastModel); });
  $('optIgnoreWs').addEventListener('change', (e) => { state.ignoreWs = e.target.checked; saveSettings(); compare(); });
  $('optIgnoreCase').addEventListener('change', (e) => { state.ignoreCase = e.target.checked; saveSettings(); compare(); });
  $('optSyncScroll').addEventListener('change', (e) => { state.syncScroll = e.target.checked; saveSettings(); });
  $('optLineNumbers').addEventListener('change', (e) => { state.lineNumbers = e.target.checked; saveSettings(); if (lastModel) render(lastModel); });

  // テーマ/配色
  $('btnTheme').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveSettings(); applyTheme(); });
  $('schemeSelect').addEventListener('change', (e) => { state.scheme = e.target.value; saveSettings(); applyTheme(); });

  // 検索バー
  $('findInput').addEventListener('input', updateHighlights);
  $('optRegex').addEventListener('change', () => { syncRegexHelp(); updateHighlights(); });
  $('optMatchCase').addEventListener('change', updateHighlights);
  for (const el of document.querySelectorAll('input[name="searchTarget"]')) el.addEventListener('change', updateHighlights);
  $('btnReplaceOne').addEventListener('click', () => doReplace(false));
  $('btnReplaceAll').addEventListener('click', () => doReplace(true));
  $('btnSearchClose').addEventListener('click', closeSearch);

  // キーボード
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'f') { e.preventDefault(); openSearch(); }
    else if (mod && e.key === 'Enter') { e.preventDefault(); compare(); }
    else if (e.key === 'Escape' && !$('searchBar').hidden) { closeSearch(); }
  });
}

function openSearch() { $('searchBar').hidden = false; syncRegexHelp(); $('findInput').focus(); $('findInput').select(); updateHighlights(); }
function closeSearch() { $('searchBar').hidden = true; $('regexHelp').hidden = true; for (const s of ['A', 'B']) $('hl' + s).innerHTML = ''; }

/* ---------- 正規表現の早見表 ---------- */
function buildRegexHelp() {
  const list = $('regexHelpList');
  if (!list) return;
  const items = t(state.lang, 'regexExamples') || [];
  list.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.className = 'rx-token';
    code.textContent = it.p;
    const ins = it.ins != null ? it.ins : it.p;
    code.title = ins;
    code.addEventListener('click', () => insertIntoFind(ins));
    const desc = document.createElement('span');
    desc.className = 'rx-desc';
    desc.textContent = it.d;
    li.appendChild(code); li.appendChild(desc);
    list.appendChild(li);
  }
}
function syncRegexHelp() {
  const el = $('regexHelp');
  if (el) el.hidden = !$('optRegex').checked;
}
function insertIntoFind(token) {
  const fi = $('findInput');
  const s = fi.selectionStart != null ? fi.selectionStart : fi.value.length;
  const e = fi.selectionEnd != null ? fi.selectionEnd : fi.value.length;
  fi.value = fi.value.slice(0, s) + token + fi.value.slice(e);
  const caret = s + token.length;
  fi.focus(); try { fi.setSelectionRange(caret, caret); } catch {}
  updateHighlights();
}

/* ---------- 起動 ---------- */
function init() {
  // make-good-life.com への iframe 埋め込み（?embed=1）ではサイト側がヘッダ/フッタを提供する
  try { isEmbed = new URLSearchParams(location.search).get('embed') === '1'; } catch {}
  if (isEmbed) document.body.classList.add('embed');
  loadSettings();
  applyI18n();
  applyTheme();
  reflectControls();
  buildRegexHelp();
  bind();
  // 保存テキストの復元（既定オフ。過去に保存を有効化した利用者のみ復元される）
  if (state.saveText) {
    try {
      const tx = JSON.parse(localStorage.getItem(TEXT_KEY) || 'null');
      if (tx) { $('inputA').value = tx.a || ''; $('inputB').value = tx.b || ''; }
    } catch {}
  }
  if (isEmbed && 'ResizeObserver' in window) {
    try { new ResizeObserver(() => postHeight()).observe(document.body); } catch {}
  }
  compare();
}

function boot() {
  try { init(); }
  catch (e) { window.__initErr = String((e && e.stack) || e); console.error('wisediff init error:', e); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { init }; // テスト/ビルド補助
