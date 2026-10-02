// Unit tests for the backdate policy. This gate is the only thing standing between a
// PRES/SA typo and a permanently wrong date on a public, verifiable certificate, so
// every boundary is pinned here. resolveBackdate is pure — no DB, no ambient clock.

process.env.NODE_ENV ??= 'test';

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKDATE_FLOOR,
  BACKDATE_MIN_OFFSET_MS,
  EVENT_LEAD_TOLERANCE_MS,
  FUTURE_TOLERANCE_MS,
  resolveBackdate,
} from './backdate.js';

const NOW = new Date('2026-08-07T12:00:00.000Z');
const EVENT_START = new Date('2024-03-15T04:30:00.000Z');

test('an absent backdate resolves to now and is not flagged as backdated', () => {
  for (const requested of [null, undefined, '']) {
    const result = resolveBackdate({ requested, now: NOW });
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.at.getTime(), NOW.getTime());
    assert.equal(result.isBackdated, false);
  }
});

test('a genuine past date is accepted and flagged as backdated', () => {
  const result = resolveBackdate({
    requested: '2024-03-15T10:00:00.000Z',
    now: NOW,
    eventStart: EVENT_START,
  });
  assert.ok(result.ok);
  assert.equal(result.at.toISOString(), '2024-03-15T10:00:00.000Z');
  assert.equal(result.isBackdated, true);
});

test('a Date instance is accepted as well as an ISO string', () => {
  const result = resolveBackdate({ requested: new Date('2024-03-16T00:00:00.000Z'), now: NOW });
  assert.ok(result.ok);
  assert.equal(result.at.toISOString(), '2024-03-16T00:00:00.000Z');
});

test('garbage input is rejected rather than silently becoming Invalid Date', () => {
  const result = resolveBackdate({ requested: 'last tuesday', now: NOW });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reason, 'invalid');
});

test('a future date beyond the clock tolerance is rejected', () => {
  const result = resolveBackdate({
    requested: new Date(NOW.getTime() + FUTURE_TOLERANCE_MS + 1000).toISOString(),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reason, 'future');
});

test('a slightly fast client clock is clamped to now, not rejected', () => {
  const result = resolveBackdate({
    requested: new Date(NOW.getTime() + 30_000).toISOString(),
    now: NOW,
  });
  assert.ok(result.ok);
  assert.equal(result.at.getTime(), NOW.getTime());
  assert.equal(result.isBackdated, false);
});

test('a date below the global floor is rejected (mistyped year)', () => {
  const result = resolveBackdate({ requested: '0025-03-15T00:00:00.000Z', now: NOW });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reason, 'before_floor');
});

test('the floor itself is inclusive', () => {
  const result = resolveBackdate({ requested: BACKDATE_FLOOR.toISOString(), now: NOW });
  assert.ok(result.ok);
  assert.equal(result.at.getTime(), BACKDATE_FLOOR.getTime());
});

test('an event-linked record cannot be dated meaningfully before its event', () => {
  const result = resolveBackdate({
    requested: new Date(EVENT_START.getTime() - EVENT_LEAD_TOLERANCE_MS - 1000).toISOString(),
    now: NOW,
    eventStart: EVENT_START,
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reason, 'before_event');
});

test('the one-day lead tolerance absorbs timezone skew around the event start', () => {
  const result = resolveBackdate({
    requested: new Date(EVENT_START.getTime() - EVENT_LEAD_TOLERANCE_MS + 1000).toISOString(),
    now: NOW,
    eventStart: EVENT_START,
  });
  assert.ok(result.ok);
});

test('without an event, only the floor and the clock bound the date', () => {
  const result = resolveBackdate({ requested: '2016-01-01T00:00:00.000Z', now: NOW });
  assert.ok(result.ok);
  assert.equal(result.isBackdated, true);
});

test('a date inside the min-offset window counts as "now", not a backdate', () => {
  const result = resolveBackdate({
    requested: new Date(NOW.getTime() - BACKDATE_MIN_OFFSET_MS + 1000).toISOString(),
    now: NOW,
  });
  assert.ok(result.ok);
  assert.equal(result.isBackdated, false);
});

test('a date exactly at the min offset does count as a backdate', () => {
  const result = resolveBackdate({
    requested: new Date(NOW.getTime() - BACKDATE_MIN_OFFSET_MS).toISOString(),
    now: NOW,
  });
  assert.ok(result.ok);
  assert.equal(result.isBackdated, true);
});
