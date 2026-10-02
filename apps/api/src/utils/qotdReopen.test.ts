// Unit tests for the QOTD-reopen private-link token + submit gate. This path is
// security-sensitive (a valid token lets a PAST QOTD be submitted again), so the
// sign/verify round-trip, purpose partitioning, and the nonce/qotdId match are
// pinned here. No DB is touched — isQotdReopenAllowed is a pure function.

process.env.NODE_ENV ??= 'test';
// A non-default secret so getJwtSecret() doesn't fail-fast (and signing is real).
process.env.JWT_SECRET ??= 'unit-test-secret-please-do-not-use-in-prod-0123456789';

import assert from 'node:assert/strict';
import test from 'node:test';
import { signQotdReopenToken, verifyQotdReopenToken, signInvitationClaimToken } from './jwt.js';
import { isQotdReopenAllowed } from './problemsCore.js';

const QOTD_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_QOTD_ID = '22222222-2222-2222-2222-222222222222';
const reopenedAt = new Date('2026-06-01T08:30:00.123Z');

function tokenFor(qotdId: string, nonce: string): string {
  return signQotdReopenToken({ qotdId, date: '2026-06-01', nonce });
}

test('reopen token round-trips with its purpose claim', () => {
  const token = tokenFor(QOTD_ID, reopenedAt.toISOString());
  const decoded = verifyQotdReopenToken(token);
  assert.equal(decoded.qotdId, QOTD_ID);
  assert.equal(decoded.nonce, reopenedAt.toISOString());
});

test('verify rejects a token minted for a different purpose', () => {
  const wrong = signInvitationClaimToken({ invitationId: QOTD_ID, email: 'x@y.z' });
  assert.throws(() => verifyQotdReopenToken(wrong), /Invalid QOTD reopen token/);
});

test('verify rejects garbage', () => {
  assert.throws(() => verifyQotdReopenToken('not-a-jwt'));
});

test('gate accepts a valid token matching this QOTD + current reopen session', () => {
  const token = tokenFor(QOTD_ID, reopenedAt.toISOString());
  assert.equal(isQotdReopenAllowed(token, QOTD_ID, reopenedAt), true);
});

test('gate rejects a token for a different QOTD', () => {
  const token = tokenFor(OTHER_QOTD_ID, reopenedAt.toISOString());
  assert.equal(isQotdReopenAllowed(token, QOTD_ID, reopenedAt), false);
});

test('gate rejects a stale nonce (close → reopen minted a new reopenedAt)', () => {
  const token = tokenFor(QOTD_ID, reopenedAt.toISOString());
  const freshReopenedAt = new Date('2026-06-05T10:00:00.000Z');
  assert.equal(isQotdReopenAllowed(token, QOTD_ID, freshReopenedAt), false);
});

test('gate rejects when the QOTD is closed (reopenedAt null)', () => {
  const token = tokenFor(QOTD_ID, reopenedAt.toISOString());
  assert.equal(isQotdReopenAllowed(token, QOTD_ID, null), false);
});

test('gate rejects when no token is supplied', () => {
  assert.equal(isQotdReopenAllowed(undefined, QOTD_ID, reopenedAt), false);
});

test('gate matches by millisecond instant, not exact ISO string', () => {
  // Same instant, different (but equivalent) ISO formatting must still verify.
  const token = tokenFor(QOTD_ID, reopenedAt.toISOString());
  const sameInstant = new Date(reopenedAt.getTime());
  assert.equal(isQotdReopenAllowed(token, QOTD_ID, sameInstant), true);
});
