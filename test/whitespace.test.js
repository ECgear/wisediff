import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, segHtml, isWhitespaceOnly, detectLineEnding, hasFinalNewline } from '../src/whitespace.js';

test('escapeHtml escapes special chars', () => {
  assert.equal(escapeHtml('<a> & "b"'), '&lt;a&gt; &amp; &quot;b&quot;');
});

test('segHtml keeps raw whitespace when showWs is off', () => {
  const out = segHtml('a b\tc', false);
  assert.ok(out.includes('a b\tc'));
  assert.ok(!out.includes('class="ws'));
});

test('segHtml adds glyph spans when showWs is on', () => {
  const out = segHtml('a b', true);
  assert.ok(out.includes('class="ws ws-space"'));
});

test('segHtml renders newline glyph + keeps the newline', () => {
  const out = segHtml('a\nb', true);
  assert.ok(out.includes('ws-nl'));
  assert.ok(out.includes('\n'));
});

test('segHtml handles surrogate pairs (emoji) without breaking', () => {
  const out = segHtml('a😀b', false);
  assert.ok(out.includes('😀'));
});

test('isWhitespaceOnly', () => {
  assert.equal(isWhitespaceOnly('   '), true);
  assert.equal(isWhitespaceOnly('\n'), true);
  assert.equal(isWhitespaceOnly('\t '), true);
  assert.equal(isWhitespaceOnly(''), false);
  assert.equal(isWhitespaceOnly('a'), false);
  assert.equal(isWhitespaceOnly(' a '), false);
});

test('detectLineEnding', () => {
  assert.equal(detectLineEnding('abc'), 'none');
  assert.equal(detectLineEnding('a\nb'), 'LF');
  assert.equal(detectLineEnding('a\r\nb'), 'CRLF');
  assert.equal(detectLineEnding('a\rb'), 'CR');
  assert.equal(detectLineEnding('a\r\nb\nc'), 'mixed');
});

test('hasFinalNewline', () => {
  assert.equal(hasFinalNewline('a\n'), true);
  assert.equal(hasFinalNewline('a\r\n'), true);
  assert.equal(hasFinalNewline('a'), false);
});
