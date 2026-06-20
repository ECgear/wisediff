import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegExp, buildRegex, findMatches, applyReplace, validateRegex } from '../src/searchReplace.js';

test('escapeRegExp escapes metacharacters', () => {
  assert.equal(escapeRegExp('a.b*c'), 'a\\.b\\*c');
});

test('buildRegex returns null for empty query', () => {
  assert.equal(buildRegex('', {}), null);
});

test('findMatches plain, case-insensitive by default', () => {
  const m = findMatches('aAbAa', 'a', { regex: false });
  assert.equal(m.length, 4); // a,A,A,a (case-insensitive)
});

test('findMatches respects caseSensitive', () => {
  const m = findMatches('aAbAa', 'a', { regex: false, caseSensitive: true });
  assert.equal(m.length, 2);
});

test('findMatches plain treats dot literally', () => {
  assert.equal(findMatches('a.b.c', '.', { regex: false }).length, 2);
  assert.equal(findMatches('axbxc', '.', { regex: false }).length, 0);
});

test('findMatches regex with \\d+', () => {
  const m = findMatches('a12b3c', '\\d+', { regex: true });
  assert.equal(m.length, 2);
});

test('findMatches does not infinite-loop on zero-width regex', () => {
  const m = findMatches('abc', 'x*', { regex: true });
  assert.ok(Array.isArray(m));
  assert.ok(m.length <= 10);
});

test('applyReplace plain replaces all and counts', () => {
  const r = applyReplace('a.a.a', '.', '-', { regex: false });
  assert.equal(r.result, 'a-a-a');
  assert.equal(r.count, 2);
});

test('applyReplace plain keeps $ literal', () => {
  const r = applyReplace('price a', 'a', '$&', { regex: false });
  assert.equal(r.result, 'price $&');
});

test('applyReplace regex supports backreferences', () => {
  const r = applyReplace('John Smith', '(\\w+) (\\w+)', '$2 $1', { regex: true });
  assert.equal(r.result, 'Smith John');
  assert.equal(r.count, 1);
});

test('applyReplace once replaces only the first match', () => {
  const r = applyReplace('aaa', 'a', 'b', { regex: false, once: true });
  assert.equal(r.result, 'baa');
  assert.equal(r.count, 1);
});

test('validateRegex flags invalid patterns', () => {
  assert.equal(validateRegex('(', { regex: true }).valid, false);
  assert.equal(validateRegex('(a)', { regex: true }).valid, true);
});
