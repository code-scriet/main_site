// Unit tests for parsePaginationNumber. Pins the CLAMP behaviour: an over-range
// but numeric limit/offset is clamped to [min, max] instead of returning null
// (→ 400). Regression guard for the /admin/achievements bug where the page's
// `limit=200` against a max-100 endpoint 400'd and silently emptied the list.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePaginationNumber, getQueryString } from './pagination.js';

test('undefined input returns the fallback', () => {
  assert.equal(parsePaginationNumber(undefined, 50, { min: 1, max: 200 }), 50);
});

test('in-range value passes through unchanged', () => {
  assert.equal(parsePaginationNumber('25', 50, { min: 1, max: 200 }), 25);
  assert.equal(parsePaginationNumber('200', 50, { min: 1, max: 200 }), 200);
});

test('REGRESSION: over-max numeric is clamped to max, never null/400', () => {
  // The exact /admin/achievements case: page asks for 200, endpoint allows 200.
  assert.equal(parsePaginationNumber('200', 50, { min: 1, max: 200 }), 200);
  // Asking beyond the cap clamps down rather than erroring.
  assert.equal(parsePaginationNumber('250', 50, { min: 1, max: 200 }), 200);
  assert.equal(parsePaginationNumber('999999', 50, { min: 1, max: 100 }), 100);
});

test('under-min numeric is clamped up to min', () => {
  assert.equal(parsePaginationNumber('0', 50, { min: 1, max: 200 }), 1);
  assert.equal(parsePaginationNumber('-5', 50, { min: 1, max: 200 }), 1);
});

test('offset over a large max clamps, not rejects', () => {
  assert.equal(parsePaginationNumber('1000001', 0, { min: 0, max: 1000000 }), 1000000);
});

test('genuinely malformed (non-integer) input still returns null → caller 400s', () => {
  assert.equal(parsePaginationNumber('abc', 50, { min: 1, max: 200 }), null);
  assert.equal(parsePaginationNumber('', 50, { min: 1, max: 200 }), null);
  assert.equal(parsePaginationNumber('NaN', 50, { min: 1, max: 200 }), null);
});

test('parseInt-style leading-number strings are accepted then clamped', () => {
  // Number.parseInt('30abc') === 30 — still a usable integer, clamped in range.
  assert.equal(parsePaginationNumber('30abc', 50, { min: 1, max: 200 }), 30);
});

test('getQueryString takes the last value of a repeated param', () => {
  assert.equal(getQueryString(['a', 'b']), 'b');
  assert.equal(getQueryString('x'), 'x');
  assert.equal(getQueryString(undefined), undefined);
});
