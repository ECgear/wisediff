/**
 * app.js — UI 配線・描画・イベント処理（ブラウザ専用）
 * 純粋ロジックは diffEngine / searchReplace / whitespace / i18n に分離。
 * @license MIT
 * Copyright (c) 2026 ECgear
 */

import { computeDiff } from './diffEngine.js';
import { isWhitespaceOnly, segHtml, escapeHtml } from './whitespace.js';
import { findMatches, applyReplace, validateRegex } from './searchReplace.js';
import { STRINGS, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'wisediff:settings';
const TEXT_KEY = 'wisediff:text';

const DEFAULTS = {
  lang: (navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en',
  mode: 'line', view: 'sbs',
  showWs: false, ignoreWs: false, ignoreCase: false,
  syncScroll: false, lineNumbers: true, live: true,
  theme: 'light', scheme: 'default',
};

let state = { ...DEFAULTS };
let lastModel = null;

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
    return;
  }
  renderStats(model);
  if (model.kind === 'line') {
    result.innerHTML = state.view === 'inline' ? lineInlineHtml(model) : lineSbsHtml(model);
  } else {
    result.innerHTML = streamHtml(model);
  }
  result.classList.toggle('hide-lineno', !state.lineNumbers);
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
  lastModel = computeDiff(a, b, { mode: state.mode, ignoreCase: state.ignoreCase, ignoreWhitespace: state.ignoreWs });
  render(lastModel);
}
let debTimer = null;
function liveCompare() {
  if (!state.live) return;
  clearTimeout(debTimer);
  debTimer = setTimeout(compare, 180);
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
  reader.onload = () => { $('input' + side).value = String(reader.result); persistTextIfEnabled(); compare(); updateHighlights(); };
  reader.readAsText(file);
}

/* ---------- 結果のコピー/保存 ---------- */
async function copyResult() {
  const text = $('result').innerText;
  try { await navigator.clipboard.writeText(text); flash($('btnCopy')); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); flash($('btnCopy')); } catch {} ta.remove();
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
  $('optLive').checked = state.live;
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
  $('btnCompare').addEventListener('click', compare);
  $('btnSwap').addEventListener('click', () => {
    const a = $('inputA').value; $('inputA').value = $('inputB').value; $('inputB').value = a;
    persistTextIfEnabled(); compare(); updateHighlights();
  });
  $('btnClear').addEventListener('click', () => {
    $('inputA').value = ''; $('inputB').value = ''; persistTextIfEnabled(); compare(); updateHighlights();
  });
  $('btnCopy').addEventListener('click', copyResult);
  $('btnSave').addEventListener('click', saveHtml);

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
  for (const el of document.querySelectorAll('[data-lang]')) el.addEventListener('click', () => { state.lang = el.dataset.lang; saveSettings(); applyI18n(); reflectControls(); if (lastModel) render(lastModel); });

  // オプション
  $('optLive').addEventListener('change', (e) => { state.live = e.target.checked; saveSettings(); });
  $('optShowWs').addEventListener('change', (e) => { state.showWs = e.target.checked; saveSettings(); if (lastModel) render(lastModel); });
  $('optIgnoreWs').addEventListener('change', (e) => { state.ignoreWs = e.target.checked; saveSettings(); compare(); });
  $('optIgnoreCase').addEventListener('change', (e) => { state.ignoreCase = e.target.checked; saveSettings(); compare(); });
  $('optSyncScroll').addEventListener('change', (e) => { state.syncScroll = e.target.checked; saveSettings(); });
  $('optLineNumbers').addEventListener('change', (e) => { state.lineNumbers = e.target.checked; saveSettings(); if (lastModel) render(lastModel); });

  // テーマ/配色
  $('btnTheme').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveSettings(); applyTheme(); });
  $('schemeSelect').addEventListener('change', (e) => { state.scheme = e.target.value; saveSettings(); applyTheme(); });

  // ローカル保存
  $('btnSaveLocal').addEventListener('click', () => { state.saveText = true; saveSettings(); persistTextIfEnabled(); flash($('btnSaveLocal')); });
  $('btnClearSaved').addEventListener('click', () => { state.saveText = false; saveSettings(); try { localStorage.removeItem(TEXT_KEY); } catch {} flash($('btnClearSaved')); });

  // 検索バー
  $('findInput').addEventListener('input', updateHighlights);
  $('optRegex').addEventListener('change', updateHighlights);
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

function openSearch() { $('searchBar').hidden = false; $('findInput').focus(); $('findInput').select(); updateHighlights(); }
function closeSearch() { $('searchBar').hidden = true; for (const s of ['A', 'B']) $('hl' + s).innerHTML = ''; }

/* ---------- 起動 ---------- */
function init() {
  loadSettings();
  applyI18n();
  applyTheme();
  reflectControls();
  bind();
  // 保存テキストの復元
  if (state.saveText) {
    try {
      const tx = JSON.parse(localStorage.getItem(TEXT_KEY) || 'null');
      if (tx) { $('inputA').value = tx.a || ''; $('inputB').value = tx.b || ''; }
    } catch {}
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
