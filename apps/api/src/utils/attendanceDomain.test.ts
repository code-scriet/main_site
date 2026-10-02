import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editDayAttendance,
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
    async createMany(args: {
      data: Array<Partial<Row> & { registrationId: string; dayNumber: number }>;
      skipDuplicates?: boolean;
    }): Promise<{ count: number }> {
      calls.push('createMany');
      let count = 0;
      for (const entry of args.data) {
        const key = keyOf(entry.registrationId, entry.dayNumber);
        if (rows.has(key)) {
          if (!args.skipDuplicates) {
            throw new Error('fake unique violation');
          }
          continue; // ON CONFLICT DO NOTHING
        }
        rows.set(key, {
          attended: false,
          scannedAt: null,
          scannedBy: null,
          manualOverride: false,
          ...entry,
        });
        count++;
      }
      return { count };
    },
    async upsert(args: {
      where: { registrationId_dayNumber: { registrationId: string; dayNumber: number } };
      create: Partial<Row> & { registrationId: string; dayNumber: number };
      update: Partial<Row>;
    }): Promise<Row> {
      calls.push('upsert');
      const { registrationId, dayNumber } = args.where.registrationId_dayNumber;
      const key = keyOf(registrationId, dayNumber);
      const existing = rows.get(key);
      if (existing) {
        // Sparse update: only the keys present in `update` move, mirroring
        // Prisma's update semantics (absent fields untouched).
        Object.assign(existing, args.update);
        return existing;
      }
      const created: Row = {
        attended: false,
        scannedAt: null,
        scannedBy: null,
        manualOverride: false,
        ...args.create,
      };
      rows.set(key, created);
      return created;
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
  assert.ok(!calls.includes('createMany'), 'must not insert a row for a duplicate');
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

// Concurrency: two requests both find the row missing and both try to insert.
// The loser's createMany is skipped (count 0); the helper re-runs the atomic
// mark to settle instead of surfacing a P2002. Simulated with an inline fake
// where the row is invisible at findUnique time but already present at insert.
test('markDayAttendanceAtomic settles a lost create race as duplicate (racer marked it)', async () => {
  let updateManyCalls = 0;
  const client = {
    dayAttendance: {
      async updateMany(): Promise<{ count: number }> {
        updateManyCalls += 1;
        return { count: 0 }; // initial: row missing; retry: racer left it attended
      },
      async findUnique(): Promise<null> {
        return null; // racer's row not visible to us yet
      },
      async createMany(): Promise<{ count: number }> {
        return { count: 0 }; // skipped — racer already inserted
      },
    },
  } as unknown as AttendanceDbClient;

  const outcome = await markDayAttendanceAtomic(client, {
    registrationId: 'r1',
    dayNumber: 1,
    scannedAt: new Date(),
    scannedBy: 'admin-1',
  });

  assert.equal(outcome, 'duplicate');
  assert.equal(updateManyCalls, 2, 'initial mark + settle retry');
});

test('markDayAttendanceAtomic settles a lost create race as marked (racer left it unattended)', async () => {
  let updateManyCalls = 0;
  const client = {
    dayAttendance: {
      async updateMany(): Promise<{ count: number }> {
        updateManyCalls += 1;
        // initial: row missing → 0; settle retry: racer's row is unattended → flip → 1
        return { count: updateManyCalls === 1 ? 0 : 1 };
      },
      async findUnique(): Promise<null> {
        return null;
      },
      async createMany(): Promise<{ count: number }> {
        return { count: 0 }; // skipped — racer already inserted (as unattended)
      },
    },
  } as unknown as AttendanceDbClient;

  const outcome = await markDayAttendanceAtomic(client, {
    registrationId: 'r1',
    dayNumber: 1,
    scannedAt: new Date(),
    scannedBy: 'admin-1',
  });

  assert.equal(outcome, 'marked');
  assert.equal(updateManyCalls, 2, 'initial mark + settle retry');
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

// editDayAttendance owns the /edit endpoint's write seam. These tests pin the
// exact admin-edit semantics that previously lived inline in the route (and so
// were never covered): force-set on an already-attended row, unmark that keeps
// the override flag, and override-only edits that don't disturb attendance.

test('editDayAttendance marks a missing row at the supplied scannedAt', async () => {
  const { client, rows } = makeFakeClient([]);
  const when = new Date('2026-06-10T09:00:00Z');

  await editDayAttendance(client, {
    registrationId: 'r1',
    dayNumber: 1,
    editorId: 'admin-1',
    attendance: { kind: 'mark', scannedAt: when },
  });

  const row = rows.get('r1:1');
  assert.equal(row?.attended, true);
  assert.equal(row?.scannedAt?.toISOString(), when.toISOString());
  assert.equal(row?.scannedBy, 'admin-1');
  assert.equal(row?.manualOverride, false);
});

test('editDayAttendance force-overwrites scannedAt on an already-attended row', async () => {
  // The key difference from markDayAttendanceAtomic: an admin edit must replace
  // the timestamp instead of treating the existing attendance as a duplicate.
  const original = new Date('2026-06-10T09:00:00Z');
  const corrected = new Date('2026-06-10T11:30:00Z');
  const { client, rows } = makeFakeClient([
    { registrationId: 'r1', dayNumber: 1, attended: true, scannedAt: original, scannedBy: 'admin-0', manualOverride: false },
  ]);

  await editDayAttendance(client, {
    registrationId: 'r1',
    dayNumber: 1,
    editorId: 'admin-1',
    attendance: { kind: 'mark', scannedAt: corrected },
  });

  const row = rows.get('r1:1');
  assert.equal(row?.scannedAt?.toISOString(), corrected.toISOString());
  assert.equal(row?.scannedBy, 'admin-1');
});

test('editDayAttendance unmark clears attendance but preserves manualOverride', async () => {
  // Unlike unmarkDayAttendanceAtomic, an /edit unmark only changes what it was
  // told to: manualOverride is left as-is unless explicitly passed.
  const { client, rows } = makeFakeClient([
    { registrationId: 'r1', dayNumber: 1, attended: true, scannedAt: new Date(), scannedBy: 'admin-0', manualOverride: true },
  ]);

  await editDayAttendance(client, {
    registrationId: 'r1',
    dayNumber: 1,
    editorId: 'admin-1',
    attendance: { kind: 'unmark' },
  });

  const row = rows.get('r1:1');
  assert.equal(row?.attended, false);
  assert.equal(row?.scannedAt, null);
  assert.equal(row?.scannedBy, null);
  assert.equal(row?.manualOverride, true);
});

test('editDayAttendance override-only edit leaves attendance untouched', async () => {
  const scannedAt = new Date('2026-06-10T09:00:00Z');
  const { client, rows } = makeFakeClient([
    { registrationId: 'r1', dayNumber: 1, attended: true, scannedAt, scannedBy: 'admin-0', manualOverride: false },
  ]);

  await editDayAttendance(client, {
    registrationId: 'r1',
    dayNumber: 1,
    editorId: 'admin-1',
    manualOverride: true,
  });

  const row = rows.get('r1:1');
  assert.equal(row?.attended, true);
  assert.equal(row?.scannedAt?.toISOString(), scannedAt.toISOString());
  assert.equal(row?.scannedBy, 'admin-0');
  assert.equal(row?.manualOverride, true);
});

test('editDayAttendance override-only edit on a missing row creates it unattended', async () => {
  const { client, rows } = makeFakeClient([]);

  await editDayAttendance(client, {
    registrationId: 'r1',
    dayNumber: 2,
    editorId: 'admin-1',
    manualOverride: true,
  });

  const row = rows.get('r1:2');
  assert.equal(row?.attended, false);
  assert.equal(row?.scannedAt, null);
  assert.equal(row?.scannedBy, null);
  assert.equal(row?.manualOverride, true);
});
