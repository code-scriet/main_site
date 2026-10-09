import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKINGS_CSV_HEADERS,
  buildBookingsCsvRows,
  bulkCreateButtonLabel,
  computeDayGaps,
  deriveAwaitingPick,
  describePreviewSlot,
  flattenBookings,
  formatBulkResultMessage,
  formatCsvCell,
  formatCleanupMessage,
  formatSlotRangeIst,
  groupSlotsByIstDate,
  slotClockLabel,
  isSlotPickable,
  istDateKeyOf,
  isSlotWindowClosed,
  nextIstStartTime,
  pickableSlots,
  previewRowSkipReason,
  toCsvText,
  waitingDaysSince,
  type AdminInterviewSlot,
} from '../src/lib/interviewSlotsAdmin.ts';

function slot(overrides: Partial<AdminInterviewSlot> & { startsAt: string }): AdminInterviewSlot {
  return {
    id: `slot-${overrides.startsAt}`,
    cycle: '2026',
    startsAt: overrides.startsAt,
    endsAt: '2026-10-04T05:00:00.000Z',
    capacity: 4,
    bookedCount: 0,
    isOpen: true,
    applyingRole: null,
    venue: null,
    notes: null,
    spotsLeft: 4,
    bookings: [],
    ...overrides,
  };
}

// 2026-10-04T04:30:00Z == 10:00 IST (UTC+5:30, no DST).
const TEN_IST = '2026-10-04T04:30:00.000Z';
const TEN_THIRTY_IST = '2026-10-04T05:00:00.000Z';

test('istDateKeyOf uses the IST calendar day', () => {
  assert.equal(istDateKeyOf(TEN_IST), '2026-10-04');
  // 18:29Z is 23:59 IST on the 4th; 18:30Z is already the 5th in IST.
  assert.equal(istDateKeyOf('2026-10-04T18:29:00.000Z'), '2026-10-04');
  assert.equal(istDateKeyOf('2026-10-04T18:30:00.000Z'), '2026-10-05');
});

test('formatSlotRangeIst renders the spec row format', () => {
  assert.equal(formatSlotRangeIst(TEN_IST, TEN_THIRTY_IST), '10:00–10:30 IST');
});

test('describePreviewSlot appends the break suffix only when break > 0', () => {
  assert.equal(
    describePreviewSlot({ startsAt: TEN_IST, endsAt: TEN_THIRTY_IST }, 10),
    '10:00–10:30 interview · 10 min break',
  );
  assert.equal(
    describePreviewSlot({ startsAt: TEN_IST, endsAt: TEN_THIRTY_IST }, 0),
    '10:00–10:30 interview',
  );
});

test('bulkCreateButtonLabel pluralizes the live count', () => {
  assert.equal(bulkCreateButtonLabel(12), 'Create 12 slots');
  assert.equal(bulkCreateButtonLabel(1), 'Create 1 slot');
  assert.equal(bulkCreateButtonLabel(0), 'Create slots');
});

test('formatBulkResultMessage matches the spec toast copy', () => {
  assert.equal(formatBulkResultMessage(12, 2), 'Created 12, skipped 2 (conflicts)');
  assert.equal(formatBulkResultMessage(5, 0), 'Created 5 slots');
  assert.equal(formatBulkResultMessage(1, 0), 'Created 1 slot');
});

test('groupSlotsByIstDate groups on the IST boundary and sorts', () => {
  const late = slot({ id: 'late', startsAt: '2026-10-04T18:00:00.000Z' }); // 23:30 IST 4th
  const next = slot({ id: 'next', startsAt: '2026-10-04T18:45:00.000Z' }); // 00:15 IST 5th
  const early = slot({ id: 'early', startsAt: '2026-10-04T04:00:00.000Z' }); // 09:30 IST 4th
  const groups = groupSlotsByIstDate([late, next, early]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.dateKey, '2026-10-04');
  assert.deepEqual(groups[0]?.slots.map((s) => s.id), ['early', 'late']);
  assert.equal(groups[1]?.dateKey, '2026-10-05');
});

test('computeDayGaps returns the complement of busy ranges', () => {
  const gaps = computeDayGaps(
    [{ startsAt: TEN_IST, endsAt: TEN_THIRTY_IST }],
    '2026-10-04',
  );
  assert.equal(gaps.length, 2);
  assert.equal(istDateKeyOf(gaps[0]!.startsAt), '2026-10-04');
  assert.equal(gaps[0]!.endsAt, TEN_IST);
  assert.equal(gaps[1]!.startsAt, TEN_THIRTY_IST);
  assert.equal(gaps.length, 2);
  assert.deepEqual(computeDayGaps([], 'bad-key'), []);
});

test('flattenBookings flattens and sorts by slot start', () => {
  const slots = [
    slot({
      id: 'b',
      startsAt: '2026-10-05T04:30:00.000Z',
      endsAt: '2026-10-05T05:00:00.000Z',
      applyingRole: 'TECHNICAL',
      venue: 'Lab 2',
      bookings: [
        {
          id: 'bk-2',
          applicationId: 'app-2',
          bookedAt: '2026-10-01T10:00:00.000Z',
          name: 'Second',
          email: 'second@example.com',
          applyingRole: 'TECHNICAL',
        },
      ],
    }),
    slot({
      id: 'a',
      startsAt: TEN_IST,
      endsAt: TEN_THIRTY_IST,
      bookings: [
        {
          id: 'bk-1',
          applicationId: 'app-1',
          bookedAt: '2026-10-01T09:00:00.000Z',
          name: 'First "Quoted", Jr',
          email: 'first@example.com',
          applyingRole: 'DESIGNING',
        },
      ],
    }),
  ];
  const rows = flattenBookings(slots);
  assert.deepEqual(rows.map((r) => r.bookingId), ['bk-1', 'bk-2']);
  assert.equal(rows[0]?.slotRole, null);
  assert.equal(rows[1]?.venue, 'Lab 2');

  const csvRows = buildBookingsCsvRows(rows);
  assert.equal(csvRows.length, 2);
  assert.equal(csvRows[0]?.[0], '2026-10-04');
  assert.equal(csvRows[0]?.[1], '10:00–10:30 IST');
  assert.equal(BOOKINGS_CSV_HEADERS.length, 8);

  const text = toCsvText(BOOKINGS_CSV_HEADERS, csvRows);
  assert.ok(text.startsWith('"Slot date (IST)"'));
  // Quote + comma in a name are escaped, never break the column shape.
  assert.ok(text.includes('"First ""Quoted"", Jr"'));
  for (const line of text.split('\n').slice(1)) {
    assert.equal(line.split('","').length, BOOKINGS_CSV_HEADERS.length);
  }
});

test('formatCsvCell doubles embedded quotes', () => {
  assert.equal(formatCsvCell('a"b'), '"a""b"');
  assert.equal(formatCsvCell(42), '"42"');
});

test('deriveAwaitingPick keeps unbooked INTERVIEW_SCHEDULED, oldest first', () => {
  const apps = [
    { id: 'new', name: 'N', email: 'n@x.com', applyingRole: 'TECHNICAL', status: 'INTERVIEW_SCHEDULED', createdAt: '2026-10-03T00:00:00.000Z' },
    { id: 'old', name: 'O', email: 'o@x.com', applyingRole: 'TECHNICAL', status: 'INTERVIEW_SCHEDULED', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'booked', name: 'B', email: 'b@x.com', applyingRole: 'TECHNICAL', status: 'INTERVIEW_SCHEDULED', createdAt: '2026-09-30T00:00:00.000Z' },
    { id: 'pending', name: 'P', email: 'p@x.com', applyingRole: 'TECHNICAL', status: 'PENDING', createdAt: '2026-09-29T00:00:00.000Z' },
    { id: 'slotbooked', name: 'S', email: 's@x.com', applyingRole: 'TECHNICAL', status: 'SLOT_BOOKED', createdAt: '2026-09-28T00:00:00.000Z' },
  ];
  const rows = deriveAwaitingPick(apps, new Set(['booked']));
  assert.deepEqual(rows.map((r) => r.id), ['old', 'new']);
  // Array form works too.
  assert.deepEqual(deriveAwaitingPick(apps, ['booked']).map((r) => r.id), ['old', 'new']);
});

test('waitingDaysSince floors whole days and clamps the future', () => {
  const now = new Date('2026-10-04T12:00:00.000Z').getTime();
  assert.equal(waitingDaysSince('2026-10-01T12:00:00.000Z', now), 3);
  assert.equal(waitingDaysSince('2026-10-04T11:00:00.000Z', now), 0);
  assert.equal(waitingDaysSince('2026-10-05T00:00:00.000Z', now), 0);
});

// ─── Phase 6: past times cannot be offered, created, or left on the board ────

test('nextIstStartTime rounds the default start up to the next quarter-hour', () => {
  // 06:07Z == 11:37 IST. With a 15-minute lead the target is 11:52 → 12:00.
  assert.equal(nextIstStartTime(Date.parse('2026-10-09T06:07:00.000Z')), '12:00');
  // 06:00Z == 11:30 IST → +15m = 11:45, already on a boundary.
  assert.equal(nextIstStartTime(Date.parse('2026-10-09T06:00:00.000Z')), '11:45');
  // 05:59Z == 11:29 IST → +15m = 11:44 → 11:45.
  assert.equal(nextIstStartTime(Date.parse('2026-10-09T05:59:00.000Z')), '11:45');
  // Always a valid HH:mm, whatever the IST hour is.
  for (let h = 0; h < 24; h += 1) {
    const at = Date.parse(`2026-10-09T${String(h).padStart(2, '0')}:20:00.000Z`);
    assert.match(nextIstStartTime(at), /^([01]\d|2[0-3]):(00|15|30|45)$/);
  }
});

test('isSlotWindowClosed + slotClockLabel track the slot clock', () => {
  const s = { startsAt: '2026-10-09T04:30:00.000Z', endsAt: '2026-10-09T05:00:00.000Z' };
  assert.equal(isSlotWindowClosed(s, Date.parse('2026-10-09T04:00:00.000Z')), false);
  assert.equal(slotClockLabel(s, Date.parse('2026-10-09T04:00:00.000Z')), null, 'upcoming');
  assert.equal(slotClockLabel(s, Date.parse('2026-10-09T04:45:00.000Z')), 'In progress');
  assert.equal(isSlotWindowClosed(s, Date.parse('2026-10-09T05:00:00.000Z')), true, 'endsAt is inclusive');
  assert.equal(slotClockLabel(s, Date.parse('2026-10-09T05:30:00.000Z')), 'Past');
});

test('previewRowSkipReason explains every non-creatable row', () => {
  assert.equal(previewRowSkipReason({ startsAt: 'a', endsAt: 'b', status: 'ok' }), null);
  assert.equal(
    previewRowSkipReason({ startsAt: 'a', endsAt: 'b', status: 'past' }),
    'skips — time already passed',
  );
  assert.equal(
    previewRowSkipReason({ startsAt: 'a', endsAt: 'b', status: 'conflict' }),
    'skips — overlaps an existing slot',
  );
  assert.match(
    previewRowSkipReason({
      startsAt: 'a',
      endsAt: 'b',
      status: 'conflict',
      conflictsWith: { startsAt: '2026-10-09T04:30:00.000Z', endsAt: '2026-10-09T05:00:00.000Z' },
    }) ?? '',
    /^skips — overlaps .* IST$/,
  );
});

test('formatBulkResultMessage separates past skips from conflicts', () => {
  assert.equal(formatBulkResultMessage(12, 2), 'Created 12, skipped 2 (conflicts)');
  assert.equal(formatBulkResultMessage(5, 0), 'Created 5 slots');
  assert.equal(formatBulkResultMessage(1, 0), 'Created 1 slot');
  assert.equal(formatBulkResultMessage(0, 4, 4), 'Created 0, skipped 4 (4 past)');
  assert.equal(formatBulkResultMessage(2, 3, 1), 'Created 2, skipped 3 (1 past, 2 conflicts)');
  assert.equal(formatBulkResultMessage(2, 3, 2), 'Created 2, skipped 3 (2 past, 1 conflict)');
});

test('formatCleanupMessage reads as tidy, not as an error', () => {
  assert.equal(formatCleanupMessage(0), 'No expired blank slots to remove');
  assert.equal(formatCleanupMessage(1), 'Removed 1 expired slot');
  assert.equal(formatCleanupMessage(7), 'Removed 7 expired slots');
});

test('isSlotPickable + pickableSlots gate invites on a live seat in the future', () => {
  const now = Date.parse('2026-10-04T05:00:00.000Z'); // 10:30 IST
  const upcoming = slot({ startsAt: '2026-10-04T05:30:00.000Z', capacity: 2, bookedCount: 1 });
  const started = slot({ startsAt: '2026-10-04T05:00:00.000Z' });
  const closed = slot({ startsAt: '2026-10-04T06:00:00.000Z', isOpen: false });
  const full = slot({ startsAt: '2026-10-04T06:30:00.000Z', capacity: 1, bookedCount: 1 });

  assert.equal(isSlotPickable(upcoming, now), true, 'a future open seat is pickable');
  assert.equal(isSlotPickable(started, now), false, 'the start instant itself is dead');
  assert.equal(isSlotPickable(closed, now), false, 'closed slots are not offered');
  assert.equal(isSlotPickable(full, now), false, 'seats come from capacity - bookedCount');
  assert.deepEqual(pickableSlots([upcoming, started, closed, full], now).map((s) => s.id), [upcoming.id]);
  assert.deepEqual(pickableSlots([], now), []);
});
