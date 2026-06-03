import assert from 'node:assert/strict';
import test from 'node:test';
import {
  markDayAttendanceAtomic,
  unmarkDayAttendanceAtomic,
  type AttendanceDbClient,
} from './attendanceDomain.js';

// The whole point of giving the atomic helpers a `client` parameter is that
// the TOCTOU mark/unmark protocol becomes testable without a database: the
// interface is the test surface. This fake records its calls and simulates
// the single DayAttendance row the helpers touch.

interface Row {
  registrationId: string;
  dayNumber: number;
  attended: boolean;
  scannedAt: Date | null;
  scannedBy: string | null;
  manualOverride: boolean;
}

function keyOf(registrationId: string, dayNumber: number): string {
  return `${registrationId}:${dayNumber}`;
}

function makeFakeClient(initialRows: Row[] = []) {
  const rows = new Map<string, Row>();
  for (const row of initialRows) {
    rows.set(keyOf(row.registrationId, row.dayNumber), { ...row });
  }
  const calls: string[] = [];

  const dayAttendance = {
    async updateMany(args: {
      where: { registrationId: string; dayNumber: number; attended: boolean };
      data: Partial<Row>;
    }): Promise<{ count: number }> {
      calls.push('updateMany');
      const row = rows.get(keyOf(args.where.registrationId, args.where.dayNumber));
      if (!row || row.attended !== args.where.attended) {
        return { count: 0 };
      }
      Object.assign(row, args.data);
      return { count: 1 };
    },
    async findUnique(args: {
      where: { registrationId_dayNumber: { registrationId: string; dayNumber: number } };
    }): Promise<Row | null> {
      calls.push('findUnique');
      const { registrationId, dayNumber } = args.where.registrationId_dayNumber;
      return rows.get(keyOf(registrationId, dayNumber)) ?? null;
    },
    async create(args: { data: Partial<Row> & { registrationId: string; dayNumber: number } }): Promise<Row> {
      calls.push('create');
      const row: Row = {
        attended: false,
        scannedAt: null,
        scannedBy: null,
        manualOverride: false,
        ...args.data,
      };
      rows.set(keyOf(row.registrationId, row.dayNumber), row);
      return row;
    },
  };

  const client = { dayAttendance } as unknown as AttendanceDbClient;
  return { client, rows, calls };
}

test('markDayAttendanceAtomic flips an unattended row present → marked', async () => {
  const { client, rows } = makeFakeClient([
    { registrationId: 'r1', dayNumber: 1, attended: false, scannedAt: null, scannedBy: null, manualOverride: false },
  ]);

  const outcome = await markDayAttendanceAtomic(client, {
    registrationId: 'r1',
    dayNumber: 1,
    scannedAt: new Date('2026-06-03T10:00:00Z'),
    scannedBy: 'admin-1',
  });

  assert.equal(outcome, 'marked');
  assert.equal(rows.get('r1:1')?.attended, true);
  assert.equal(rows.get('r1:1')?.scannedBy, 'admin-1');
});

test('markDayAttendanceAtomic on an already-attended row → duplicate, no create', async () => {
  const { client, calls } = makeFakeClient([
    { registrationId: 'r1', dayNumber: 1, attended: true, scannedAt: new Date(), scannedBy: 'admin-0', manualOverride: false },
  ]);

  const outcome = await markDayAttendanceAtomic(client, {
    registrationId: 'r1',
    dayNumber: 1,
    scannedAt: new Date(),
    scannedBy: 'admin-1',
  });

  assert.equal(outcome, 'duplicate');
  assert.ok(!calls.includes('create'), 'must not create a row for a duplicate');
});

test('markDayAttendanceAtomic creates a missing row → created (manualOverride honoured)', async () => {
  const { client, rows } = makeFakeClient([]);

  const outcome = await markDayAttendanceAtomic(client, {
    registrationId: 'r1',
    dayNumber: 2,
    scannedAt: new Date(),
    scannedBy: 'admin-1',
    manualOverride: true,
  });

  assert.equal(outcome, 'created');
  assert.equal(rows.get('r1:2')?.attended, true);
  assert.equal(rows.get('r1:2')?.manualOverride, true);
});

test('markDayAttendanceAtomic leaves manualOverride at default when not supplied (scan path)', async () => {
  const { client, rows } = makeFakeClient([]);

  await markDayAttendanceAtomic(client, {
    registrationId: 'r1',
    dayNumber: 1,
    scannedAt: new Date(),
    scannedBy: 'admin-1',
  });

  // A QR scan must never assert manualOverride — the created row keeps the
  // schema default (false).
  assert.equal(rows.get('r1:1')?.manualOverride, false);
});

test('unmarkDayAttendanceAtomic resets an attended row → unmarked', async () => {
  const { client, rows } = makeFakeClient([
    { registrationId: 'r1', dayNumber: 1, attended: true, scannedAt: new Date(), scannedBy: 'admin-0', manualOverride: true },
  ]);

  const outcome = await unmarkDayAttendanceAtomic(client, { registrationId: 'r1', dayNumber: 1 });

  assert.equal(outcome, 'unmarked');
  assert.equal(rows.get('r1:1')?.attended, false);
  assert.equal(rows.get('r1:1')?.scannedAt, null);
  assert.equal(rows.get('r1:1')?.scannedBy, null);
  assert.equal(rows.get('r1:1')?.manualOverride, false);
});

test('unmarkDayAttendanceAtomic on an unattended row → not-marked', async () => {
  const { client } = makeFakeClient([
    { registrationId: 'r1', dayNumber: 1, attended: false, scannedAt: null, scannedBy: null, manualOverride: false },
  ]);

  const outcome = await unmarkDayAttendanceAtomic(client, { registrationId: 'r1', dayNumber: 1 });

  assert.equal(outcome, 'not-marked');
});
