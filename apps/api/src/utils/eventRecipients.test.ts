// Unit tests for the event-recipients audience resolver + feedback-poll timing
// helpers. These are pure functions (no DB), pinned here so the audience →
// Prisma filter mapping and the S-10 "don't silently schedule into a dead
// window" guarantee can't drift.

import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationType } from '@prisma/client';
import {
  buildAudienceWhere,
  computeFeedbackDeadline,
  resolveFeedbackDelivery,
  resolveEffectiveDay,
  EVENT_AUDIENCES,
  EVENT_RECIPIENT_CAP,
} from './eventRecipients.js';

const DAY_MS = 24 * 60 * 60 * 1000;

test("buildAudienceWhere('all') → no filter", () => {
  assert.deepEqual(buildAudienceWhere('all'), {});
});

test("buildAudienceWhere('participants') → PARTICIPANT filter", () => {
  assert.deepEqual(buildAudienceWhere('participants'), {
    registrationType: RegistrationType.PARTICIPANT,
  });
});

test("buildAudienceWhere('guests') → GUEST filter", () => {
  assert.deepEqual(buildAudienceWhere('guests'), {
    registrationType: RegistrationType.GUEST,
  });
});

test("buildAudienceWhere('attended') without dayNumber", () => {
  const where = buildAudienceWhere('attended');
  assert.equal(where.registrationType, RegistrationType.PARTICIPANT);
  assert.ok(Array.isArray(where.OR));
  assert.deepEqual(where.OR, [
    { attended: true },
    { dayAttendances: { some: { attended: true } } },
  ]);
});

test("buildAudienceWhere('attended') with dayNumber", () => {
  const where = buildAudienceWhere('attended', 3);
  assert.equal(where.registrationType, RegistrationType.PARTICIPANT);
  assert.deepEqual(where.OR, [
    { attended: true },
    { dayAttendances: { some: { dayNumber: 3, attended: true } } },
  ]);
});

test("buildAudienceWhere('absent') without dayNumber", () => {
  assert.deepEqual(buildAudienceWhere('absent'), {
    registrationType: RegistrationType.PARTICIPANT,
    attended: false,
  });
});

test("buildAudienceWhere('absent') with dayNumber uses dayAttendances.none", () => {
  const where = buildAudienceWhere('absent', 2);
  assert.equal(where.registrationType, RegistrationType.PARTICIPANT);
  assert.equal('attended' in where, false);
  assert.deepEqual(where.dayAttendances, { none: { dayNumber: 2, attended: true } });
});

test('computeFeedbackDeadline: future base → base + 24h', () => {
  const now = new Date('2026-07-09T12:00:00Z');
  const base = new Date('2026-07-10T18:00:00Z'); // event ends in the future
  const deadline = computeFeedbackDeadline(base, now);
  assert.equal(deadline.getTime() - base.getTime(), DAY_MS);
});

test('computeFeedbackDeadline: base far in the past → fresh now + 24h window', () => {
  const now = new Date('2026-07-09T12:00:00Z');
  const base = new Date(now.getTime() - 5 * DAY_MS); // event ended 5 days ago
  const deadline = computeFeedbackDeadline(base, now);
  assert.equal(deadline.getTime(), now.getTime() + DAY_MS);
  assert.notEqual(deadline.getTime(), base.getTime() + DAY_MS);
});

test('resolveFeedbackDelivery: sendNow=true with future base → send now, no schedule', () => {
  const now = new Date('2026-07-09T12:00:00Z');
  const base = new Date('2026-07-10T18:00:00Z');
  assert.deepEqual(resolveFeedbackDelivery(true, base, now), {
    shouldSendNow: true,
    willSchedule: false,
  });
});

test('resolveFeedbackDelivery: sendNow=false with future base → schedule, no send now', () => {
  const now = new Date('2026-07-09T12:00:00Z');
  const base = new Date('2026-07-10T18:00:00Z');
  assert.deepEqual(resolveFeedbackDelivery(false, base, now), {
    shouldSendNow: false,
    willSchedule: true,
  });
});

test('resolveFeedbackDelivery: sendNow=false with already-ended base → send now anyway (anti-silent-no-op)', () => {
  const now = new Date('2026-07-09T12:00:00Z');
  const base = new Date(now.getTime() - 5 * DAY_MS);
  assert.deepEqual(resolveFeedbackDelivery(false, base, now), {
    shouldSendNow: true,
    willSchedule: false,
  });
});

test('EVENT_AUDIENCES lists exactly the five supported audiences', () => {
  assert.deepEqual(EVENT_AUDIENCES, ['all', 'participants', 'guests', 'attended', 'absent']);
});

test('EVENT_RECIPIENT_CAP is a positive number', () => {
  assert.equal(typeof EVENT_RECIPIENT_CAP, 'number');
  assert.ok(EVENT_RECIPIENT_CAP > 0);
});

test('resolveEffectiveDay: single-day event ignores dayNumber', () => {
  assert.equal(resolveEffectiveDay(1, 1), undefined);
});

test('resolveEffectiveDay: multi-day event with in-range dayNumber passes it through', () => {
  assert.equal(resolveEffectiveDay(3, 2), 2);
});

test('resolveEffectiveDay: multi-day event with out-of-range dayNumber falls back to undefined', () => {
  assert.equal(resolveEffectiveDay(3, 5), undefined);
});

test('resolveEffectiveDay: multi-day event with no dayNumber → undefined', () => {
  assert.equal(resolveEffectiveDay(3, undefined), undefined);
});
