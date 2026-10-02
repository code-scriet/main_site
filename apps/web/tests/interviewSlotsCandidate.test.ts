// Offline unit tests for the candidate interview-slot helpers.
// No DB, no network — pure date grouping, IST formatting and error mapping.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookingReference,
  buildInterviewICSContent,
  extractSlotErrorType,
  formatISTWithSuffix,
  formatSlotDayLabel,
  formatSlotTimeRangeIST,
  groupSlotsByDate,
  isCancellableSlot,
  slotBookErrorCopy,
  spotsLeftLabel,
  spotsLeftTone,
  type CandidateSlotLike,
} from '../src/lib/interviewSlotsCandidate.ts';

function slot(overrides: Partial<CandidateSlotLike> & { id: string; startsAt: string }): CandidateSlotLike {
  return {
    endsAt: '2026-01-10T05:00:00.000Z',
    capacity: 4,
    bookedCount: 1,
    spotsLeft: 3,
    isOpen: true,
    applyingRole: null,
    venue: 'Room 101',
    ...overrides,
  };
}

// ─── groupSlotsByDate ─────────────────────────────────────────────────────────

test('groupSlotsByDate sorts ascending and groups by IST calendar day', () => {
  const late = slot({ id: 'late', startsAt: '2026-01-10T10:00:00.000Z' }); // 15:30 IST, 10 Jan
  const early = slot({ id: 'early', startsAt: '2026-01-10T04:00:00.000Z' }); // 09:30 IST, 10 Jan
  const nextDay = slot({ id: 'next', startsAt: '2026-01-10T20:00:00.000Z' }); // 01:30 IST, 11 Jan
  const groups = groupSlotsByDate([late, nextDay, early]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, '2026-01-10');
  assert.deepEqual(groups[0].slots.map((s) => s.id), ['early', 'late']);
  assert.equal(groups[1].key, '2026-01-11');
  assert.deepEqual(groups[1].slots.map((s) => s.id), ['next']);
});

test('groupSlotsByDate keys days in IST, not UTC', () => {
  // 19:00 UTC = 00:30 IST next day.
  const s = slot({ id: 'x', startsAt: '2026-01-10T19:00:00.000Z' });
  const groups = groupSlotsByDate([s]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, '2026-01-11');
});

test('groupSlotsByDate returns [] for no slots', () => {
  assert.deepEqual(groupSlotsByDate([]), []);
});

// ─── IST formatting ───────────────────────────────────────────────────────────

test('formatISTWithSuffix renders en-IN IST with explicit suffix', () => {
  const out = formatISTWithSuffix('2026-01-10T04:30:00.000Z'); // 10:00 IST
  assert.match(out, /IST$/);
  assert.match(out, /10:00/);
  assert.match(out, /Jan/);
});

test('formatISTWithSuffix returns empty for bad input', () => {
  assert.equal(formatISTWithSuffix(undefined), '');
  assert.equal(formatISTWithSuffix('not-a-date'), '');
});

test('formatSlotTimeRangeIST joins start/end with IST suffix', () => {
  const out = formatSlotTimeRangeIST('2026-01-10T04:30:00.000Z', '2026-01-10T05:00:00.000Z');
  assert.match(out, /10:00.*10:30/);
  assert.match(out, /IST$/);
});

test('formatSlotTimeRangeIST returns empty when either end is bad', () => {
  assert.equal(formatSlotTimeRangeIST('bad', '2026-01-10T05:00:00.000Z'), '');
});

test('formatSlotDayLabel names the IST weekday', () => {
  // 2026-01-10 is a Saturday.
  assert.match(formatSlotDayLabel('2026-01-10T04:30:00.000Z'), /Saturday/);
});

// ─── spots-left pill ──────────────────────────────────────────────────────────

test('spotsLeftLabel covers full / last / many', () => {
  assert.equal(spotsLeftLabel(0), 'Full');
  assert.equal(spotsLeftLabel(-2), 'Full');
  assert.equal(spotsLeftLabel(1), 'Last spot');
  assert.equal(spotsLeftLabel(3), '3 spots left');
});

test('spotsLeftTone escalates as capacity runs out', () => {
  assert.equal(spotsLeftTone(0), 'neutral');
  assert.equal(spotsLeftTone(1), 'warning');
  assert.equal(spotsLeftTone(5), 'info');
});

// ─── error_type → copy ────────────────────────────────────────────────────────

test('slotBookErrorCopy maps every typed booking error', () => {
  assert.match(slotBookErrorCopy('slot_full'), /just taken/i);
  assert.match(slotBookErrorCopy('already_booked'), /already have a booking/);
  assert.match(slotBookErrorCopy('slot_closed'), /closed/);
  assert.match(slotBookErrorCopy('past_slot'), /passed/);
  assert.match(slotBookErrorCopy('cancel_cutoff'), /24 hours/);
  assert.match(slotBookErrorCopy('conflict'), /just changed/);
});

test('slotBookErrorCopy falls back for unknown types', () => {
  assert.equal(slotBookErrorCopy(undefined), 'Something went wrong. Try again.');
  assert.equal(slotBookErrorCopy('weird_new_type'), 'Something went wrong. Try again.');
});

test('extractSlotErrorType reads top-level and nested shapes', () => {
  assert.equal(extractSlotErrorType({ error_type: 'slot_full' }), 'slot_full');
  assert.equal(
    extractSlotErrorType({ error: { message: 'x', error_type: 'already_booked' } }),
    'already_booked',
  );
  assert.equal(extractSlotErrorType({ error: { message: 'nope' } }), undefined);
  assert.equal(extractSlotErrorType(null), undefined);
});

// ─── cancellation window ──────────────────────────────────────────────────────

test('isCancellableSlot enforces the 24h cutoff', () => {
  const now = new Date('2026-01-01T00:00:00.000Z').getTime();
  assert.equal(isCancellableSlot('2026-01-02T00:00:01.000Z', now), true); // 24h + 1s
  assert.equal(isCancellableSlot('2026-01-01T23:59:59.000Z', now), false); // just under
  assert.equal(isCancellableSlot('2025-12-31T00:00:00.000Z', now), false); // past
  assert.equal(isCancellableSlot('bad-date', now), false);
});

// ─── booking reference ────────────────────────────────────────────────────────

test('bookingReference shortens a uuid deterministically', () => {
  assert.equal(bookingReference('a3f9c2e1-0000-4000-8000-000000000000'), 'A3F9C2E1');
});

// ─── ICS content ──────────────────────────────────────────────────────────────

test('buildInterviewICSContent emits a minimal valid calendar', () => {
  const ics = buildInterviewICSContent({
    uid: 'test-uid-1@codescriet.dev',
    title: 'Interview — code.scriet',
    startsAt: '2026-01-10T04:30:00.000Z',
    endsAt: '2026-01-10T05:00:00.000Z',
    venue: 'Room 101',
    description: 'Arrive early',
    url: 'https://codescriet.dev/hiring/slots?token=abc',
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.match(ics, /UID:test-uid-1@codescriet\.dev/);
  assert.match(ics, /DTSTART:20260110T043000Z/);
  assert.match(ics, /DTEND:20260110T050000Z/);
  assert.match(ics, /LOCATION:Room 101/);
});

test('buildInterviewICSContent returns empty for unusable dates', () => {
  assert.equal(
    buildInterviewICSContent({
      uid: 'u',
      title: 't',
      startsAt: '2026-01-10T05:00:00.000Z',
      endsAt: '2026-01-10T04:30:00.000Z', // end before start
    }),
    '',
  );
});
