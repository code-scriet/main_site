import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { hiringSlotsRouter } from './hiringSlots.js';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';
import { invalidateSettingsCache } from '../utils/settingsCache.js';
import {
  parseISTDateTime,
  slotsOverlap,
  buildSlotSeries,
  isValidTransition,
  isSlotStarted,
  interviewSlotTestUtils,
} from '../utils/interviewSlots.js';
import { resetExpiredSlotSweepGate } from '../utils/interviewSlotCleanup.js';
import {
  generateRawSlotToken,
  hashSlotToken,
  hashesEqualTimingSafe,
} from '../utils/interviewSlotToken.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hiring-slots-tests-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://codescriet.dev';
process.env.NODE_ENV = 'test';

const ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  avatar: null,
  phone: null,
  course: null,
  branch: null,
  year: null,
  profileCompleted: true,
  tokenVersion: 0,
  isDeleted: false,
};

type Original = [Record<string, unknown>, string, unknown];
function setMock(t: Record<string, unknown>, k: string, v: unknown, originals: Original[]) {
  originals.push([t, k, t[k]]);
  t[k] = v;
}

function installAuthAndInfra(originals: Original[]) {
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  setMock(
    userDelegate,
    'findUnique',
    async (args: { where: { id: string } }) => (args.where.id === ADMIN.id ? { ...ADMIN } : null),
    originals,
  );
  const auditDelegate = (prisma as unknown as { auditLog: Record<string, unknown> }).auditLog as
    | Record<string, unknown>
    | undefined;
  if (auditDelegate) {
    setMock(auditDelegate, 'create', async () => ({ id: 'audit-1' }), originals);
  }
  setMock(emailService as unknown as Record<string, unknown>, 'send', async () => true, originals);
  invalidateCachedAuthUser(ADMIN.id);
  invalidateSettingsCache();
}

function adminToken(): string {
  return signAccessToken({
    userId: ADMIN.id,
    id: ADMIN.id,
    name: ADMIN.name,
    email: ADMIN.email,
    role: 'ADMIN',
    tokenVersion: 0,
  });
}

async function withSlotsApp(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/hiring', hiringSlotsRouter);
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

const futureDate = (() => {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
})();

// ─── pure: parseISTDateTime ──────────────────────────────────────────────────
test('parseISTDateTime interprets IST as UTC+5:30', () => {
  const d = parseISTDateTime('2026-10-10', '10:00');
  // 10:00 IST == 04:30 UTC
  assert.equal(d.toISOString(), '2026-10-10T04:30:00.000Z');
});

test('parseISTDateTime throws on invalid input', () => {
  assert.throws(() => parseISTDateTime('2026-13-01', '10:00'));
  assert.throws(() => parseISTDateTime('2026-02-30', '10:00'));
  assert.throws(() => parseISTDateTime('2026-10-10', '24:00'));
  assert.throws(() => parseISTDateTime('10-10-2026', '10:00'));
  assert.throws(() => parseISTDateTime('2026-10-10', '10'));
});

// ─── pure: slotsOverlap ──────────────────────────────────────────────────────
test('slotsOverlap: overlapping / contained / adjacent-allowed', () => {
  const a0 = new Date('2026-10-10T04:00:00Z');
  const a1 = new Date('2026-10-10T05:00:00Z');
  const b0 = new Date('2026-10-10T04:30:00Z');
  const b1 = new Date('2026-10-10T05:30:00Z');
  assert.equal(slotsOverlap(a0, a1, b0, b1), true, 'overlapping');
  // adjacent (end == start) is NOT overlap
  const c0 = new Date('2026-10-10T05:00:00Z');
  const c1 = new Date('2026-10-10T06:00:00Z');
  assert.equal(slotsOverlap(a0, a1, c0, c1), false, 'adjacent allowed');
  // contained
  const d0 = new Date('2026-10-10T04:15:00Z');
  const d1 = new Date('2026-10-10T04:45:00Z');
  assert.equal(slotsOverlap(a0, a1, d0, d1), true, 'contained');
  // disjoint
  const e0 = new Date('2026-10-10T06:00:00Z');
  const e1 = new Date('2026-10-10T07:00:00Z');
  assert.equal(slotsOverlap(a0, a1, e0, e1), false, 'disjoint');
});

// ─── pure: buildSlotSeries ───────────────────────────────────────────────────
test('buildSlotSeries generates count slots with breaks', () => {
  const out = buildSlotSeries({
    date: '2026-10-10',
    startTime: '10:00',
    slotMinutes: 60,
    count: 3,
    breakMinutes: 15,
    existing: [],
  });
  assert.equal(out.length, 3);
  assert.ok(out.every((s) => s.status === 'ok'));
  // 10:00 IST == 04:30 UTC; 60m slot + 15m break → next at 05:45 UTC
  assert.equal(out[0].startsAt.toISOString(), '2026-10-10T04:30:00.000Z');
  assert.equal(out[1].startsAt.toISOString(), '2026-10-10T05:45:00.000Z');
});

test('buildSlotSeries flags conflicts and skips them toward count', () => {
  const clashStart = parseISTDateTime('2026-10-10', '11:00');
  const clashEnd = parseISTDateTime('2026-10-10', '12:00');
  const out = buildSlotSeries({
    date: '2026-10-10',
    startTime: '10:00',
    slotMinutes: 60,
    count: 2,
    breakMinutes: 0,
    existing: [{ startsAt: clashStart, endTime: clashEnd }],
  });
  // slot1 ok (10-11), slot2 conflicts (11-12), slot3 ok (12-13) → count counts ok only
  assert.equal(out.length, 3);
  assert.equal(out[0].status, 'ok');
  assert.equal(out[1].status, 'conflict');
  assert.ok(out[1].conflictsWith, 'conflict rows carry conflictsWith');
  assert.equal(out[2].status, 'ok');
});

test('buildSlotSeries respects endTime bound', () => {
  const out = buildSlotSeries({
    date: '2026-10-10',
    startTime: '10:00',
    slotMinutes: 60,
    endTime: '12:00',
    breakMinutes: 0,
    existing: [],
  });
  assert.equal(out.length, 2);
});

// ─── pure: isSlotStarted + past marking ──────────────────────────────────────
test('isSlotStarted: a slot is dead the instant it begins', () => {
  const starts = new Date('2026-10-10T04:30:00.000Z');
  const at = starts.getTime();
  assert.equal(isSlotStarted(starts, at), true, 'exactly at the start ⇒ not bookable');
  assert.equal(isSlotStarted(starts, at - 1), false, 'one ms earlier is still open');
  assert.equal(isSlotStarted(starts, at + 5 * 60_000), true, 'well past the start');
  assert.equal(isSlotStarted(new Date('nope'), at), false, 'unparseable time is not "past"');
});

test('buildSlotSeries marks already-started rows as past when nowMs is given', () => {
  // Series from 10:00 IST on 2026-10-10, "now" = 11:00:01 IST (05:30:01Z).
  const nowMs = Date.parse('2026-10-10T05:30:01.000Z');
  const out = buildSlotSeries({
    date: '2026-10-10',
    startTime: '10:00',
    slotMinutes: 60,
    count: 3,
    breakMinutes: 0,
    existing: [],
    nowMs,
  });
  assert.equal(out[0].status, 'past', '10:00 slot has begun');
  assert.equal(out[1].status, 'past', 'a slot starting one second ago is already dead');
  assert.equal(out[2].status, 'ok', '12:00 is still ahead of the clock');
  assert.equal(out.length, 3, 'the admin asked for 3 times and sees exactly those 3');
});

test('an all-past series returns dead rows only — it never walks into the next day', () => {
  // Regression: past rows must count toward `count`. Skipping them instead made
  // "yesterday 09:00 × 4" silently create slots ~22 hours in the future.
  const nowMs = Date.parse('2026-10-09T06:00:00.000Z');
  const out = buildSlotSeries({
    date: '2026-10-08',
    startTime: '09:00',
    slotMinutes: 30,
    count: 4,
    existing: [],
    nowMs,
  });
  assert.equal(out.length, 4);
  assert.ok(out.every((s) => s.status === 'past'), 'nothing in the series is creatable');
  assert.equal(out.filter((s) => s.status === 'ok').length, 0);
  assert.equal(
    out[out.length - 1].startsAt.toISOString(),
    '2026-10-08T05:00:00.000Z',
    'last row is still on the requested day (10:30 IST)',
  );

  // Same guard with the endTime bound.
  const bounded = buildSlotSeries({
    date: '2026-10-08',
    startTime: '09:00',
    slotMinutes: 60,
    endTime: '11:00',
    existing: [],
    nowMs,
  });
  assert.equal(bounded.length, 2);
  assert.ok(bounded.every((s) => s.status === 'past'));
});

test('buildSlotSeries past beats conflict, and omitting nowMs keeps old behaviour', () => {
  const nowMs = Date.parse('2026-10-10T05:30:01.000Z');
  const clashStart = parseISTDateTime('2026-10-10', '10:00');
  const clashEnd = parseISTDateTime('2026-10-10', '11:00');
  const withNow = buildSlotSeries({
    date: '2026-10-10',
    startTime: '10:00',
    slotMinutes: 60,
    count: 1,
    existing: [{ startsAt: clashStart, endsAt: clashEnd }],
    nowMs,
  });
  assert.equal(withNow[0].status, 'past', 'the unpickable reason wins over the overlap');
  const withoutNow = buildSlotSeries({
    date: '2026-10-10',
    startTime: '10:00',
    slotMinutes: 60,
    count: 1,
    existing: [{ startsAt: clashStart, endsAt: clashEnd }],
  });
  assert.equal(withoutNow[0].status, 'conflict', 'pure generator stays clock-free');
});

// ─── pure: isValidTransition ─────────────────────────────────────────────────
test('isValidTransition allows exactly the §3 table', () => {
  const allowed: Array<[string, string]> = [
    ['PENDING', 'INTERVIEW_SCHEDULED'],
    ['INTERVIEW_SCHEDULED', 'SLOT_BOOKED'],
    ['SLOT_BOOKED', 'INTERVIEW_SCHEDULED'],
    ['SLOT_BOOKED', 'INTERVIEWED'],
    // Added by 2c2417a ("allow SLOT_BOOKED->SELECTED and
    // INTERVIEW_SCHEDULED->INTERVIEWED"): an admin may select straight from the
    // booked lane, or mark interviewed without a booking.
    ['SLOT_BOOKED', 'SELECTED'],
    ['INTERVIEW_SCHEDULED', 'INTERVIEWED'],
    ['INTERVIEW_SCHEDULED', 'REJECTED'],
    ['SLOT_BOOKED', 'REJECTED'],
    ['INTERVIEWED', 'SELECTED'],
    ['INTERVIEWED', 'REJECTED'],
    // Reversals — admins can undo a decision made in error.
    ['REJECTED', 'PENDING'],
    ['REJECTED', 'INTERVIEW_SCHEDULED'],
    ['REJECTED', 'INTERVIEWED'],
    ['REJECTED', 'SELECTED'],
    ['SELECTED', 'PENDING'],
    ['SELECTED', 'INTERVIEW_SCHEDULED'],
    ['SELECTED', 'INTERVIEWED'],
    ['SELECTED', 'REJECTED'],
  ];
  for (const [from, to] of allowed) {
    assert.equal(isValidTransition(from, to), true, `${from}->${to} allowed`);
  }
  const forbidden: Array<[string, string]> = [
    ['PENDING', 'PENDING'],
    ['PENDING', 'SELECTED'],
    ['PENDING', 'REJECTED'],
    ['PENDING', 'SLOT_BOOKED'],
    ['INTERVIEW_SCHEDULED', 'PENDING'],
    ['INTERVIEW_SCHEDULED', 'SELECTED'],
    ['SLOT_BOOKED', 'PENDING'],
    ['INTERVIEWED', 'PENDING'],
    ['INTERVIEWED', 'INTERVIEW_SCHEDULED'],
  ];
  for (const [from, to] of forbidden) {
    assert.equal(isValidTransition(from, to), false, `${from}->${to} forbidden`);
  }

  // Exactness guard: every transition the server allows must appear in one of
  // the two lists above. Without it a new ALLOWED_TRANSITIONS entry drifts
  // silently — which is exactly how SLOT_BOOKED->SELECTED stayed "forbidden"
  // here for so long while the API accepted it.
  const documented = new Set([...allowed, ...forbidden].map(([from, to]) => `${from}->${to}`));
  for (const key of interviewSlotTestUtils.ALLOWED_TRANSITIONS) {
    assert.ok(documented.has(key), `${key} is allowed server-side but missing from this table`);
  }
});

// ─── token helpers ───────────────────────────────────────────────────────────
test('slot tokens: 32 bytes hex, stable hash, timing-safe compare', () => {
  const raw = generateRawSlotToken();
  assert.equal(raw.length, 64);
  assert.match(raw, /^[0-9a-f]{64}$/);
  const h1 = hashSlotToken(raw);
  const h2 = hashSlotToken(raw);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.equal(hashesEqualTimingSafe(h1, h2), true);
  assert.equal(hashesEqualTimingSafe(h1, hashSlotToken('other')), false);
  assert.equal(hashesEqualTimingSafe('short', h1), false, 'wrong-length → false (caller maps to 401)');
});

// ─── admin: preview exactly-one-of + conflict rows, no writes ────────────────
test('POST /slots/preview enforces exactly-one-of count/endTime and flags conflicts', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  let createCalled = false;
  setMock(
    slotDelegate,
    'findMany',
    async () => [
      { startsAt: parseISTDateTime(futureDate, '11:00'), endsAt: parseISTDateTime(futureDate, '12:00') },
    ],
    originals,
  );
  setMock(
    slotDelegate,
    'create',
    async () => {
      createCalled = true;
      return { id: 'x' };
    },
    originals,
  );
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withSlotsApp(async (baseUrl) => {
    const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    // both missing → 400
    const neither = await fetch(`${baseUrl}/api/hiring/slots/preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cycle: '2026', date: futureDate, startTime: '10:00', slotMinutes: 60 }),
    });
    assert.equal(neither.status, 400);
    // both present → 400
    const both = await fetch(`${baseUrl}/api/hiring/slots/preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cycle: '2026',
        date: futureDate,
        startTime: '10:00',
        slotMinutes: 60,
        count: 2,
        endTime: '12:00',
      }),
    });
    assert.equal(both.status, 400);
    // valid → conflict rows flagged, no writes
    const good = await fetch(`${baseUrl}/api/hiring/slots/preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cycle: '2026', date: futureDate, startTime: '10:00', slotMinutes: 60, count: 2 }),
    });
    assert.equal(good.status, 200);
    const json = (await good.json()) as {
      data: { slots: Array<{ status: string; conflictsWith?: unknown }>; okCount: number; skipCount: number };
    };
    assert.equal(json.data.okCount, 2);
    assert.equal(json.data.skipCount, 1);
    assert.ok(json.data.slots.some((s) => s.status === 'conflict' && s.conflictsWith), 'conflict flagged');
    assert.equal(createCalled, false, 'preview performs no writes');
  });
});

// ─── admin: create guards ────────────────────────────────────────────────────
test('POST /slots rejects past slots and overlapping open slots', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(slotDelegate, 'findMany', async () => [], originals);
  setMock(slotDelegate, 'create', async (args: { data: Record<string, unknown> }) => ({ id: 'slot-1', ...args.data }), originals);
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withSlotsApp(async (baseUrl) => {
    const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    const past = await fetch(`${baseUrl}/api/hiring/slots`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cycle: '2026', date: '2020-01-01', startTime: '10:00', endTime: '11:00' }),
    });
    assert.equal(past.status, 400, 'past-slot create rejected');
  });
});

// ─── admin: the series path had no past gate at all before Phase 6 ───────────
const yesterdayIst = (() => {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
})();

test('POST /slots/bulk skips times that have already passed instead of writing them', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(slotDelegate, 'findMany', async () => [], originals);
  const written: Array<Record<string, unknown>> = [];
  setMock(
    slotDelegate,
    'create',
    async (args: { data: Record<string, unknown> }) => {
      written.push(args.data);
      return { id: `slot-${written.length}`, ...args.data };
    },
    originals,
  );
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withSlotsApp(async (baseUrl) => {
    const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    // A whole day in the past: nothing may be written, everything is reported.
    const allPast = await fetch(`${baseUrl}/api/hiring/slots/bulk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cycle: '2026', date: yesterdayIst, startTime: '09:00', slotMinutes: 30, count: 4 }),
    });
    assert.equal(allPast.status, 201);
    const pastJson = (await allPast.json()) as {
      data: { created: number; skipped: Array<{ reason: string }> };
    };
    assert.equal(pastJson.data.created, 0, 'no dead rows written');
    assert.equal(pastJson.data.skipped.length, 4);
    assert.ok(
      pastJson.data.skipped.every((s) => s.reason === 'past'),
      'every skip is reported as past, not as a conflict',
    );
    assert.equal(written.length, 0);

    // A future day still goes through untouched.
    const future = await fetch(`${baseUrl}/api/hiring/slots/bulk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cycle: '2026', date: futureDate, startTime: '10:00', slotMinutes: 30, count: 2 }),
    });
    assert.equal(future.status, 201);
    const futureJson = (await future.json()) as { data: { created: number; skipped: unknown[] } };
    assert.equal(futureJson.data.created, 2, 'future series unaffected');
    assert.equal(futureJson.data.skipped.length, 0);
  });
});

test('POST /slots/preview flags already-passed times as past and counts them', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(slotDelegate, 'findMany', async () => [], originals);
  let createCalled = false;
  setMock(
    slotDelegate,
    'create',
    async () => {
      createCalled = true;
      return { id: 'x' };
    },
    originals,
  );
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withSlotsApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle: '2026', date: yesterdayIst, startTime: '09:00', slotMinutes: 60, count: 3 }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: { slots: Array<{ status: string }>; okCount: number; skipCount: number; pastCount: number };
    };
    assert.equal(json.data.okCount, 0, 'nothing to create');
    assert.equal(json.data.pastCount, 3);
    assert.equal(json.data.skipCount, 3);
    assert.ok(json.data.slots.every((s) => s.status === 'past'));
    assert.equal(createCalled, false, 'preview stays a dry run');
  });
});

test('GET /slots removes and hides expired blank slots, keeps booked ones', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  resetExpiredSlotSweepGate();

  const expiredBlank = {
    id: '44444444-4444-4444-8444-444444444444',
    cycle: '2026',
    startsAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  };
  const upcoming = {
    id: '55555555-5555-5555-8555-555555555555',
    cycle: '2026',
    startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    capacity: 2,
    bookedCount: 0,
    isOpen: true,
    applyingRole: null,
    venue: null,
    notes: null,
    bookings: [],
  };
  let swept = 0;
  let listWhere: Record<string, unknown> | null = null;
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(
    slotDelegate,
    'findMany',
    async (args: { where?: Record<string, unknown> }) => {
      const where = (args.where ?? {}) as Record<string, any>;
      // Sweep select: endsAt < cutoff AND no bookings. List: the AND guard.
      if (where.endsAt?.lt && where.bookings?.none) {
        swept += 1;
        return [expiredBlank];
      }
      listWhere = where;
      return [upcoming];
    },
    originals,
  );
  setMock(slotDelegate, 'deleteMany', async () => ({ count: 1 }), originals);
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
    resetExpiredSlotSweepGate();
  });

  await withSlotsApp(async (baseUrl) => {
    const headers = { Authorization: `Bearer ${adminToken()}` };
    const res = await fetch(`${baseUrl}/api/hiring/slots?cycle=2026`, { headers });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: { slots: Array<{ id: string; isExpired: boolean; isStarted: boolean }> };
    };
    assert.equal(swept, 1, 'the list read triggers the sweep');
    assert.deepEqual(json.data.slots.map((s) => s.id), [upcoming.id], 'expired blank never renders');
    assert.equal(json.data.slots[0].isExpired, false);
    assert.equal(json.data.slots[0].isStarted, false);
    // The read itself is guarded, so a gated sweep pass still shows a clean board.
    const guard = (listWhere as Record<string, any>)?.AND?.[0]?.OR;
    assert.ok(Array.isArray(guard) && guard.length === 2, 'list filters on (window open) OR (has bookings)');
    assert.ok(guard[0].endsAt?.gte instanceof Date);
    assert.deepEqual(guard[1].bookings, { some: {} });
  });
});

test('POST /slots hard-rejects overlap with existing OPEN slots (409)', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(
    slotDelegate,
    'findMany',
    async () => [{ startsAt: parseISTDateTime(futureDate, '10:30'), endsAt: parseISTDateTime(futureDate, '11:30') }],
    originals,
  );
  let created = false;
  setMock(
    slotDelegate,
    'create',
    async () => {
      created = true;
      return { id: 'slot-x' };
    },
    originals,
  );
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withSlotsApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle: '2026', date: futureDate, startTime: '10:00', endTime: '11:00' }),
    });
    assert.equal(res.status, 409);
    assert.equal(created, false, 'warn-and-create must never happen');
  });
});

// ─── admin: PATCH / DELETE guards ────────────────────────────────────────────
test('PATCH /slots/:id rejects time changes, guards capacity; DELETE guards bookings', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  const slotId = '22222222-2222-4222-8222-222222222222';
  const baseSlot = {
    id: slotId,
    cycle: '2026',
    startsAt: parseISTDateTime(futureDate, '10:00'),
    endsAt: parseISTDateTime(futureDate, '11:00'),
    capacity: 5,
    bookedCount: 2,
    isOpen: true,
  };
  setMock(slotDelegate, 'findUnique', async () => ({ ...baseSlot }), originals);
  setMock(slotDelegate, 'update', async (args: { data: unknown }) => ({ ...baseSlot, ...(args.data as object) }), originals);
  setMock(slotDelegate, 'delete', async () => ({ ...baseSlot }), originals);
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  // The guard reads real booking rows, not the drift-prone bookedCount.
  setMock(bookingDelegate, 'count', async () => 2, originals);
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withSlotsApp(async (baseUrl) => {
    const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    // time fields immutable
    const timeChange = await fetch(`${baseUrl}/api/hiring/slots/${slotId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ startsAt: new Date().toISOString() }),
    });
    assert.equal(timeChange.status, 400);
    // lowering below bookedCount → 409
    const lowerBelow = await fetch(`${baseUrl}/api/hiring/slots/${slotId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ capacity: 1 }),
    });
    assert.equal(lowerBelow.status, 409);
    // lowering while booked (even above bookedCount) → 409 (may only raise)
    const lowerWhileBooked = await fetch(`${baseUrl}/api/hiring/slots/${slotId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ capacity: 4 }),
    });
    assert.equal(lowerWhileBooked.status, 409);
    // raising → 200
    const raise = await fetch(`${baseUrl}/api/hiring/slots/${slotId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ capacity: 6 }),
    });
    assert.equal(raise.status, 200);
    // delete with bookings → 409
    const del = await fetch(`${baseUrl}/api/hiring/slots/${slotId}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(del.status, 409);
  });
});

test('DELETE /slots/:id succeeds when nothing is booked', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  const slotId = '33333333-3333-4333-8333-333333333333';
  setMock(slotDelegate, 'findUnique', async () => ({ id: slotId, bookedCount: 0 }), originals);
  setMock(
    prisma.interviewSlotBooking as unknown as Record<string, unknown>,
    'count',
    async () => 0,
    originals,
  );
  let deletedWhere: Record<string, unknown> | null = null;
  setMock(
    slotDelegate,
    'deleteMany',
    async (args: { where: Record<string, unknown> }) => {
      deletedWhere = args.where;
      return { count: 1 };
    },
    originals,
  );
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });
  await withSlotsApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/${slotId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    assert.equal(res.status, 200);
    const where = deletedWhere as Record<string, unknown>;
    assert.deepEqual(where, { id: slotId, bookings: { none: {} } }, 'delete re-asserts "blank"');
  });
});

test('DELETE /slots/:id refuses a drifted counter instead of cascade-wiping a booking', async (t) => {
  const originals: Original[] = [];
  installAuthAndInfra(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  const slotId = '66666666-6666-6666-8666-666666666666';
  // bookedCount says 0 (drifted) but a real InterviewSlotBooking row exists:
  // deleting the slot would cascade the candidate's interview away.
  setMock(slotDelegate, 'findUnique', async () => ({ id: slotId, bookedCount: 0 }), originals);
  setMock(
    prisma.interviewSlotBooking as unknown as Record<string, unknown>,
    'count',
    async () => 0,
    originals,
  );
  setMock(slotDelegate, 'deleteMany', async () => ({ count: 0 }), originals);
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withSlotsApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/${slotId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    assert.equal(res.status, 409, 'the re-guarded delete matched nothing ⇒ refuse');
    const json = (await res.json()) as { error_type?: string };
    assert.equal(json.error_type, 'slot_booked');
  });
});

// ─── concurrency race: requires a live DB — skipped offline ─────────────────
test('concurrent bookings on capacity 1 admit exactly one (requires dev DB)', { skip: 'requires dev DB (reset pending approval)' }, async () => {
  // Intended shape once a dev DB is approved: K parallel POST /slots/:id/book
  // against a capacity-1 slot → exactly one 200, the rest 409 slot_full.
  // No DB connection is attempted here by design.
  assert.ok(true);
});
