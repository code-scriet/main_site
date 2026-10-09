// Expired-slot cleanup: predicate shape, self-gating, and blast-radius guards.
// The deletes run against mocked Prisma delegates (offline, no DB), so the
// tests assert on the exact `where` clauses that reach the client — that is
// what keeps booked slots alive in production.

import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../lib/prisma.js';
import { socketEvents } from './socket.js';
import {
  EXPIRED_SLOT_GRACE_MS,
  EXPIRED_SLOT_MIN_INTERVAL_MS,
  expiredSlotCutoff,
  removeExpiredUnbookedSlots,
  removeExpiredUnbookedSlotsIfDue,
  resetExpiredSlotSweepGate,
} from './interviewSlotCleanup.js';

type Original = [Record<string, unknown>, string, unknown];
function setMock(target: Record<string, unknown>, key: string, value: unknown, originals: Original[]) {
  originals.push([target, key, target[key]]);
  target[key] = value;
}
function restoreAll(originals: Original[]) {
  for (const [target, key, value] of originals) target[key] = value;
}

function slotDelegate(): Record<string, unknown> {
  return prisma.interviewSlot as unknown as Record<string, unknown>;
}

const HOUR = 60 * 60 * 1000;

test('expiredSlotCutoff lags the clock by exactly the grace window', () => {
  const now = Date.parse('2026-10-09T12:00:00.000Z');
  assert.equal(
    expiredSlotCutoff(now).getTime(),
    now - EXPIRED_SLOT_GRACE_MS,
    'a slot is only removable once its window closed a full grace period ago',
  );
});

test('sweep selects on closed endsAt + zero booking rows, and re-guards the delete', async (t) => {
  const originals: Original[] = [];
  let findArgs: Record<string, unknown> | null = null;
  let deleteArgs: Record<string, unknown> | null = null;
  const rows = [
    {
      id: 'a'.repeat(8) + '-0000-4000-8000-000000000000',
      cycle: '2026',
      startsAt: new Date(Date.now() - 3 * HOUR),
      endsAt: new Date(Date.now() - 2 * HOUR),
    },
    {
      id: 'b'.repeat(8) + '-0000-4000-8000-000000000000',
      cycle: '2025',
      startsAt: new Date(Date.now() - 50 * HOUR),
      endsAt: new Date(Date.now() - 49 * HOUR),
    },
  ];
  setMock(
    slotDelegate(),
    'findMany',
    async (args: Record<string, unknown>) => {
      findArgs = args;
      return rows;
    },
    originals,
  );
  setMock(
    slotDelegate(),
    'deleteMany',
    async (args: Record<string, unknown>) => {
      deleteArgs = args;
      return { count: rows.length };
    },
    originals,
  );
  let invalidated = 0;
  setMock(
    socketEvents as unknown as Record<string, unknown>,
    'liveInvalidate',
    () => {
      invalidated += 1;
    },
    originals,
  );
  t.after(() => restoreAll(originals));

  const result = await removeExpiredUnbookedSlots();
  assert.equal(result.removed, 2);
  assert.equal(result.slots.length, 2);
  assert.equal(result.slots[0].endsAt, rows[0].endsAt.toISOString());

  // Selection predicate: window closed AND no booking rows (never bookedCount).
  const where = ((findArgs ?? {}) as { where?: Record<string, unknown> }).where as Record<string, any>;
  assert.ok(where.endsAt?.lt instanceof Date, 'filters on endsAt < cutoff');
  assert.deepEqual(where.bookings, { none: {} }, 'blank means "no booking rows"');
  assert.ok(where.cycle === undefined, 'unscoped sweep covers every cycle');

  // Delete predicate re-applies the blank guard on the ids, so a booking that
  // landed between the two statements still cannot be cascade-wiped.
  const delWhere = ((deleteArgs ?? {}) as { where?: Record<string, unknown> }).where as Record<string, any>;
  assert.deepEqual(delWhere.id, { in: rows.map((r) => r.id) });
  assert.deepEqual(delWhere.bookings, { none: {} }, 'delete re-checks the bookings relation');
  assert.equal(invalidated, 1, 'live boards are told to refetch');
});

test('cycle scoping is passed through to both statements', async (t) => {
  const originals: Original[] = [];
  const seen: Array<Record<string, any>> = [];
  setMock(
    slotDelegate(),
    'findMany',
    async (args: Record<string, any>) => {
      seen.push(args.where as Record<string, any>);
      return [];
    },
    originals,
  );
  setMock(slotDelegate(), 'deleteMany', async (args: Record<string, any>) => {
    seen.push(args.where as Record<string, any>);
    return { count: 0 };
  }, originals);
  t.after(() => restoreAll(originals));

  const result = await removeExpiredUnbookedSlots({ cycle: ' 2026 ' });
  assert.equal(result.removed, 0);
  assert.equal(seen.length, 1, 'nothing to delete ⇒ no delete statement');
  assert.equal(seen[0].cycle, '2026', 'cycle is trimmed and scoped');
});

test('a drift-free sweep writes nothing and invalidates nothing', async (t) => {
  const originals: Original[] = [];
  let deletes = 0;
  let invalidated = 0;
  setMock(slotDelegate(), 'findMany', async () => [], originals);
  setMock(
    slotDelegate(),
    'deleteMany',
    async () => {
      deletes += 1;
      return { count: 0 };
    },
    originals,
  );
  setMock(
    socketEvents as unknown as Record<string, unknown>,
    'liveInvalidate',
    () => {
      invalidated += 1;
    },
    originals,
  );
  t.after(() => restoreAll(originals));

  const result = await removeExpiredUnbookedSlots();
  assert.deepEqual(result, { removed: 0, slots: [] });
  assert.equal(deletes, 0);
  assert.equal(invalidated, 0);
});

test('IfDue self-gates so hot read paths sweep once per window', async (t) => {
  const originals: Original[] = [];
  let finds = 0;
  setMock(
    slotDelegate(),
    'findMany',
    async () => {
      finds += 1;
      return [];
    },
    originals,
  );
  t.after(() => restoreAll(originals));

  resetExpiredSlotSweepGate();
  const now = Date.now();
  await removeExpiredUnbookedSlotsIfDue({ nowMs: now });
  await removeExpiredUnbookedSlotsIfDue({ nowMs: now + 1000 });
  assert.equal(finds, 1, 'second call inside the window is a no-op');

  await removeExpiredUnbookedSlotsIfDue({ nowMs: now + EXPIRED_SLOT_MIN_INTERVAL_MS + 1 });
  assert.equal(finds, 2, 'a call after the window sweeps again');

  await removeExpiredUnbookedSlotsIfDue({ nowMs: now + EXPIRED_SLOT_MIN_INTERVAL_MS + 2, force: true });
  assert.equal(finds, 3, 'force ignores the gate (manual admin action)');
});

test('a failing sweep is swallowed and never breaks the caller', async (t) => {
  const originals: Original[] = [];
  setMock(
    slotDelegate(),
    'findMany',
    async () => {
      throw new Error('P1002 timeout');
    },
    originals,
  );
  t.after(() => restoreAll(originals));

  resetExpiredSlotSweepGate();
  const result = await removeExpiredUnbookedSlotsIfDue();
  assert.deepEqual(result, { removed: 0, slots: [] }, 'the slot list still renders');

  // Direct (manual endpoint) variant propagates so the admin sees the failure.
  await assert.rejects(() => removeExpiredUnbookedSlots(), /P1002/);
});
