import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAndDecode } from '../src/encoding.js';

// 「あいうえお」を各エンコードのバイト列で用意（ひらがなは連続コードで確実）
const SJIS   = [0x82, 0xA0, 0x82, 0xA2, 0x82, 0xA4, 0x82, 0xA6, 0x82, 0xA8];
const EUCJP  = [0xA4, 0xA2, 0xA4, 0xA4, 0xA4, 0xA6, 0xA4, 0xA8, 0xA4, 0xAA];
const UTF8   = [0xE3, 0x81, 0x82, 0xE3, 0x81, 0x84, 0xE3, 0x81, 0x86, 0xE3, 0x81, 0x88, 0xE3, 0x81, 0x8A];
const U16LE  = [0xFF, 0xFE, 0x42, 0x30, 0x44, 0x30, 0x46, 0x30, 0x48, 0x30, 0x4A, 0x30];
const HELLO  = 'あいうえお';

const buf = (arr) => new Uint8Array(arr);
const hasMojibake = (s) => s.includes('�');

test('UTF-8 を判定してデコードできる', () => {
  const r = detectAndDecode(buf(UTF8));
  assert.equal(r.encoding, 'utf-8');
  assert.equal(r.text, HELLO);
});

test('UTF-8 (BOM 付き) を判定し BOM を除去する', () => {
  const r = detectAndDecode(buf([0xEF, 0xBB, 0xBF, ...UTF8]));
  assert.equal(r.encoding, 'utf-8');
  assert.equal(r.text, HELLO);
  assert.ok(!r.text.startsWith('﻿'));
});

test('Shift_JIS を文字化けせずデコードできる', () => {
  const r = detectAndDecode(buf(SJIS));
  assert.equal(r.encoding, 'shift_jis');
  assert.equal(r.text, HELLO);
  assert.ok(!hasMojibake(r.text));
});

test('EUC-JP を文字化けせずデコードできる', () => {
  const r = detectAndDecode(buf(EUCJP));
  assert.equal(r.encoding, 'euc-jp');
  assert.equal(r.text, HELLO);
  assert.ok(!hasMojibake(r.text));
});

test('UTF-16LE (BOM 付き) を判定できる', () => {
  const r = detectAndDecode(buf(U16LE));
  assert.equal(r.encoding, 'utf-16le');
  assert.equal(r.text, HELLO);
});

test('ASCII はそのまま読める', () => {
  const r = detectAndDecode(buf([...'name,age'].map((c) => c.charCodeAt(0))));
  assert.equal(r.text, 'name,age');
  assert.ok(!hasMojibake(r.text));
});

test('ASCII と Shift_JIS 混在の CSV 行が化けない', () => {
  // "名,あ" 相当: ASCII の "A,," + SJIS の「あ」。leading 0x82 で UTF-8 fatal が失敗→SJIS 推定。
  const r = detectAndDecode(buf([0x41, 0x2C, 0x82, 0xA0]));
  assert.equal(r.text, 'A,あ');
  assert.ok(!hasMojibake(r.text));
});

test('ArrayBuffer をそのまま渡しても動く', () => {
  const u8 = buf(UTF8);
  const r = detectAndDecode(u8.buffer);
  assert.equal(r.text, HELLO);
});

test('空入力でも例外を投げない', () => {
  const r = detectAndDecode(buf([]));
  assert.equal(r.text, '');
});
