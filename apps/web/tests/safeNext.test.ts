import assert from 'node:assert/strict';
import test from 'node:test';
import { getSafeNextUrl, getSafeRelativePath } from '../src/lib/safeNext.ts';

const ORIGIN = 'https://codescriet.dev';

// ─── getSafeNextUrl (open-redirect guard) ────────────────────────────────────

test('getSafeNextUrl accepts same-origin relative paths', () => {
  assert.equal(getSafeNextUrl('/events/my-event', ORIGIN), `${ORIGIN}/events/my-event`);
  assert.equal(getSafeNextUrl('/events/my-event?register=1', ORIGIN), `${ORIGIN}/events/my-event?register=1`);
  assert.equal(getSafeNextUrl('/dashboard/coding#tab', ORIGIN), `${ORIGIN}/dashboard/coding#tab`);
});

test('getSafeNextUrl accepts known codescriet subdomains', () => {
  assert.equal(getSafeNextUrl('https://code.codescriet.dev/play', ORIGIN), 'https://code.codescriet.dev/play');
  assert.equal(getSafeNextUrl('https://www.codescriet.dev/x', ORIGIN), 'https://www.codescriet.dev/x');
});

test('getSafeNextUrl REJECTS off-origin redirects (open-redirect guard)', () => {
  assert.equal(getSafeNextUrl('https://evil.example/phish', ORIGIN), null);
  assert.equal(getSafeNextUrl('http://codescriet.dev.evil.com', ORIGIN), null);
  assert.equal(getSafeNextUrl('https://evil.com', ORIGIN), null);
  // Protocol-relative resolves to a foreign origin → rejected.
  assert.equal(getSafeNextUrl('//evil.com/x', ORIGIN), null);
});

test('getSafeNextUrl handles empty/garbage input', () => {
  assert.equal(getSafeNextUrl(null, ORIGIN), null);
  assert.equal(getSafeNextUrl('', ORIGIN), null);
  assert.equal(getSafeNextUrl(undefined, ORIGIN), null);
});

// ─── getSafeRelativePath (strict relative-only) ──────────────────────────────

test('getSafeRelativePath accepts a single-leading-slash path', () => {
  assert.equal(getSafeRelativePath('/events/x'), '/events/x');
  assert.equal(getSafeRelativePath('/events/x?register=1#a'), '/events/x?register=1#a');
});

test('getSafeRelativePath rejects protocol-relative, absolute, and backslash tricks', () => {
  assert.equal(getSafeRelativePath('//evil.com'), null);
  assert.equal(getSafeRelativePath('https://evil.com'), null);
  assert.equal(getSafeRelativePath('/\\evil.com'), null);   // backslash → browser may normalize to //
  assert.equal(getSafeRelativePath('events/x'), null);       // no leading slash
  assert.equal(getSafeRelativePath('/\tx'), null);           // control char
  assert.equal(getSafeRelativePath(null), null);
  assert.equal(getSafeRelativePath(''), null);
});
