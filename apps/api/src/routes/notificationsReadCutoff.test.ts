// Audit F3 — the notification bell's read state is a SINGLE cutoff timestamp
// (`User.notificationsReadAt`); every item is 'read' when `timestamp < cutoff`. A cutoff
// accepted from the client therefore has to be clamped: a future value silently marks all
// FUTURE notifications read too, permanently, with no UI to recover. Zod's
// `.datetime()` validates shape only, so the clamp is the actual guard.

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveReadCutoff } from './notifications.js';

const NOW = new Date('2026-08-06T12:00:00.000Z');

test('omitted cutoff defaults to now', () => {
  assert.equal(resolveReadCutoff(undefined, NOW).toISOString(), NOW.toISOString());
});

test('a past cutoff is honoured as-is', () => {
  const past = '2026-08-06T11:00:00.000Z';
  assert.equal(resolveReadCutoff(past, NOW).toISOString(), past);
});

test('a FUTURE cutoff is clamped to now (the F3 bug)', () => {
  // The realistic trigger is a device with a skewed clock sending its own timestamp.
  assert.equal(resolveReadCutoff('2099-01-01T00:00:00.000Z', NOW).toISOString(), NOW.toISOString());
});

test('a cutoff barely in the future is still clamped', () => {
  const justAhead = new Date(NOW.getTime() + 1).toISOString();
  assert.equal(resolveReadCutoff(justAhead, NOW).toISOString(), NOW.toISOString());
});

test('an unparseable timestamp falls back to now rather than an Invalid Date', () => {
  // Writing an Invalid Date to Prisma would throw; falling back keeps mark-read working.
  const resolved = resolveReadCutoff('not-a-timestamp', NOW);
  assert.ok(!Number.isNaN(resolved.getTime()));
  assert.equal(resolved.toISOString(), NOW.toISOString());
});

test('exactly now is accepted (boundary, not clamped away)', () => {
  assert.equal(resolveReadCutoff(NOW.toISOString(), NOW).toISOString(), NOW.toISOString());
});
