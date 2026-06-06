import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectVerifiedGithubEmail, isGoogleEmailVerified, oauthStateMatches } from './oauthEmail.js';

// ── selectVerifiedGithubEmail (H1 account-takeover guard) ──

test('selectVerifiedGithubEmail prefers the primary verified email and lowercases it', () => {
  const email = selectVerifiedGithubEmail([
    { value: 'Other@X.com', verified: true, primary: false },
    { value: 'Primary@X.com', verified: true, primary: true },
  ]);
  assert.equal(email, 'primary@x.com');
});

test('selectVerifiedGithubEmail falls back to any verified email when no primary is verified', () => {
  const email = selectVerifiedGithubEmail([
    { value: 'unverified@x.com', verified: false, primary: true },
    { value: 'verified@x.com', verified: true, primary: false },
  ]);
  assert.equal(email, 'verified@x.com');
});

test('selectVerifiedGithubEmail REJECTS when only unverified emails exist (takeover guard)', () => {
  // The core security property: an attacker who added the victim's address to
  // their own GitHub account leaves it unverified — this must never authenticate.
  const email = selectVerifiedGithubEmail([
    { value: 'victim@admin.com', verified: false, primary: true },
    { value: 'attacker@x.com', verified: false, primary: false },
  ]);
  assert.equal(email, null);
});

test('selectVerifiedGithubEmail returns null for empty, non-array, or value-less input', () => {
  assert.equal(selectVerifiedGithubEmail([]), null);
  assert.equal(selectVerifiedGithubEmail(undefined), null);
  assert.equal(selectVerifiedGithubEmail(null), null);
  assert.equal(selectVerifiedGithubEmail('nope'), null);
  assert.equal(selectVerifiedGithubEmail([{ verified: true, primary: true }]), null); // no value
});

test('selectVerifiedGithubEmail ignores entries with blank/whitespace values', () => {
  const email = selectVerifiedGithubEmail([
    { value: '   ', verified: true, primary: true },
    { value: 'real@x.com', verified: true, primary: false },
  ]);
  assert.equal(email, 'real@x.com');
});

// ── isGoogleEmailVerified ──

test('isGoogleEmailVerified rejects only an explicit false', () => {
  assert.equal(isGoogleEmailVerified({ verified: true }), true);
  assert.equal(isGoogleEmailVerified({ verified: undefined }), true);
  assert.equal(isGoogleEmailVerified({}), true);
  assert.equal(isGoogleEmailVerified(undefined), true);
  assert.equal(isGoogleEmailVerified(null), true);
  assert.equal(isGoogleEmailVerified({ verified: false }), false);
});

// ── oauthStateMatches (M6 login-CSRF) ──

test('oauthStateMatches requires both present and strictly equal', () => {
  assert.equal(oauthStateMatches('abc123', 'abc123'), true);
  assert.equal(oauthStateMatches('abc123', 'different'), false);
  assert.equal(oauthStateMatches('', ''), false); // empty both → reject
  assert.equal(oauthStateMatches(undefined, 'abc123'), false); // no cookie → reject
  assert.equal(oauthStateMatches('abc123', undefined), false); // no query param → reject
  assert.equal(oauthStateMatches('abc123', ''), false);
});
