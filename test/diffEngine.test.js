import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDiff, inlineCharDiff } from '../src/diffEngine.js';

test('identical text → no line changes, meta.identical true', () => {
  const m = computeDiff('a\nb\nc\n', 'a\nb\nc\n', { mode: 'line' });
  assert.equal(m.kind, 'line');
  assert.equal(m.meta.identical, true);
  assert.equal(m.stats.addLines, 0);
  assert.equal(m.stats.delLines, 0);
  assert.equal(m.stats.chgLines, 0);
});

test('added line is detected', () => {
  const m = computeDiff('a\nb\n', 'a\nb\nc\n', { mode: 'line' });
  assert.equal(m.stats.addLines, 1);
  assert.equal(m.stats.delLines, 0);
});

test('changed line gets inline char segments', () => {
  const m = computeDiff('hello\n', 'help\n', { mode: 'line' });
  const chg = m.rows.find(r => r.type === 'chg');
  assert.ok(chg, 'expected a chg row');
  assert.ok(chg.left.segs.some(s => s.op === 'del'));
  assert.ok(chg.right.segs.some(s => s.op === 'ins'));
});

test('trailing-space-only difference is flagged wsOnly', () => {
  const m = computeDiff('a \n', 'a\n', { mode: 'line' });
  const chg = m.rows.find(r => r.type === 'chg');
  assert.ok(chg, 'expected a chg row');
  assert.equal(chg.wsOnly, true);
});

test('newline inserted in the middle is representable', () => {
  const m = computeDiff('ab', 'a\nb', { mode: 'line' });
  // 右側は2行ぶんの内容を持つ
  const rightLines = m.rows.filter(r => r.right).length;
  assert.ok(rightLines >= 2);
});

test('ignoreCase makes case-only differences equal', () => {
  const m = computeDiff('Hello\nWorld\n', 'hello\nWorld\n', { mode: 'line', ignoreCase: true });
  assert.equal(m.stats.chgLines, 0);
  assert.equal(m.stats.addLines, 0);
  assert.equal(m.stats.delLines, 0);
});

test('ignoreWhitespace ignores trailing whitespace at line ends', () => {
  const m = computeDiff('a  \nb\n', 'a\nb\n', { mode: 'line', ignoreWhitespace: true });
  assert.equal(m.stats.chgLines, 0);
});

test('final newline mismatch is reported in meta', () => {
  const m = computeDiff('a\nb', 'a\nb\n', { mode: 'line' });
  assert.equal(m.meta.finalNewlineMismatch, true);
});

test('CRLF vs LF mismatch is reported in meta', () => {
  const m = computeDiff('a\r\nb\r\n', 'a\nb\n', { mode: 'line' });
  assert.equal(m.meta.endingMismatch, true);
  assert.equal(m.meta.left.ending, 'CRLF');
  assert.equal(m.meta.right.ending, 'LF');
});

test('word mode produces a stream with ins/del segments', () => {
  const m = computeDiff('foo bar baz', 'foo qux baz', { mode: 'word' });
  assert.equal(m.kind, 'stream');
  assert.ok(m.segments.some(s => s.op === 'del'));
  assert.ok(m.segments.some(s => s.op === 'ins'));
  assert.ok(m.segments.some(s => s.op === 'same'));
});

test('char mode handles Japanese (dmp path)', () => {
  const m = computeDiff('今日は晴れ', '今日は雨です', { mode: 'char' });
  assert.equal(m.kind, 'stream');
  const same = m.segments.find(s => s.op === 'same');
  assert.ok(same && same.text.includes('今日は'));
  assert.ok(m.segments.some(s => s.op === 'del'));
  assert.ok(m.segments.some(s => s.op === 'ins'));
});

test('inlineCharDiff returns left/right segments and wsOnly flag', () => {
  const r = inlineCharDiff('color', 'colour');
  assert.ok(r.right.some(s => s.op === 'ins' && s.text === 'u'));
  assert.equal(r.wsOnly, false);
});
