import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import type { Request } from 'express';
import {
  hiringSlotsRouter,
  resolveSlotRateLimitKey,
  SLOT_WRITE_LIMIT_MAX,
  SLOT_READ_LIMIT_MAX,
} from './hiringSlots.js';
import { announcementsRouter } from './announcements.js';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';
import { invalidateSettingsCache } from '../utils/settingsCache.js';
import { generateRawSlotToken, hashSlotToken } from '../utils/interviewSlotToken.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hiring-slots-phase5-tests-secret';
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

function installBase(originals: Original[]) {
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

async function withApp(
  run: (baseUrl: string) => Promise<void>,
  mount: 'slots' | 'announcements' = 'slots',
) {
  const app = express();
  app.use(express.json());
  if (mount === 'slots') app.use('/api/hiring', hiringSlotsRouter);
  else app.use('/api/announcements', announcementsRouter);
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

function mockReq(opts: { query?: unknown; body?: unknown; ip?: string; authorization?: string }): Request {
  return {
    query: opts.query ?? {},
    body: opts.body,
    ip: opts.ip ?? '10.0.0.1',
    headers: opts.authorization ? { authorization: opts.authorization } : {},
  } as unknown as Request;
}

// ─── limiter budgets ─────────────────────────────────────────────────────────
// Picker math: the slot list polls every 30s while open → 900s/30s = 30
// req/15min per tab, so the 60-read budget leaves 2x headroom; book/cancel is
// a handful of human retries against a 10-write budget.
test('slot limiter budgets fit human retry + picker polling', () => {
  assert.equal(SLOT_WRITE_LIMIT_MAX, 10);
  assert.equal(SLOT_READ_LIMIT_MAX, 60);
  const pollsPerWindow = (15 * 60) / 30;
  assert.ok(pollsPerWindow < SLOT_READ_LIMIT_MAX, 'one polling picker tab must stay under budget');
});

// ─── keyGenerator unit ───────────────────────────────────────────────────────
test('slot rate key: per-IP+token, never embeds the raw token', () => {
  const raw = generateRawSlotToken();
  const a = resolveSlotRateLimitKey(mockReq({ query: { token: raw } }));
  const b = resolveSlotRateLimitKey(mockReq({ query: { token: raw } }));
  assert.equal(a, b, 'same token → same bucket');
  const other = resolveSlotRateLimitKey(mockReq({ query: { token: generateRawSlotToken() } }));
  assert.notEqual(a, other, 'different applications → different buckets');
  assert.ok(!a.includes(raw), 'raw token must never appear in the key');
  assert.match(a, /^ip:[^:]+:slot:[0-9a-f]{16}$/);
});

test('slot rate key: verified session → per-user bucket, garbage → IP bucket', () => {
  const session = adminToken();
  const keyed = resolveSlotRateLimitKey(
    mockReq({ authorization: `Bearer ${session}`, query: { token: generateRawSlotToken() } }),
  );
  assert.equal(keyed, `u:${ADMIN.id}`, 'verified session wins over any token');
  const garbage = resolveSlotRateLimitKey(mockReq({ authorization: 'Bearer not-a-jwt' }));
  assert.equal(garbage, 'ip:10.0.0.1', 'garbage sessions stay pinned to IP');
  const anon = resolveSlotRateLimitKey(mockReq({}));
  assert.equal(anon, 'ip:10.0.0.1');
});

// ─── write limiter: 429 after N hits ─────────────────────────────────────────
test('POST /slots/:id/book returns 429 (RATE_LIMITED) after the write budget', async (t) => {
  const originals: Original[] = [];
  installBase(originals);
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withApp(async (baseUrl) => {
    const slotId = '12345678-1234-4234-8234-123456789012';
    const statuses: number[] = [];
    for (let i = 0; i <= SLOT_WRITE_LIMIT_MAX; i += 1) {
      const res = await fetch(`${baseUrl}/api/hiring/slots/${slotId}/book`, { method: 'POST' });
      statuses.push(res.status);
      if (i === SLOT_WRITE_LIMIT_MAX) {
        assert.equal(res.status, 429, 'hit after the budget → 429');
        const json = (await res.json()) as { success: boolean; error: { code: string } };
        assert.equal(json.success, false);
        assert.equal(json.error.code, 'RATE_LIMITED');
      }
    }
    assert.ok(
      statuses.slice(0, SLOT_WRITE_LIMIT_MAX).every((s) => s === 401),
      'pre-budget anonymous hits are 401 (auth), not 429',
    );
  });
});

// ─── read limiter: 429 after N hits ──────────────────────────────────────────
test('GET /slots/available returns 429 (RATE_LIMITED) after the read budget', async (t) => {
  const originals: Original[] = [];
  installBase(originals);
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withApp(async (baseUrl) => {
    let last = 0;
    for (let i = 0; i <= SLOT_READ_LIMIT_MAX; i += 1) {
      const res = await fetch(`${baseUrl}/api/hiring/slots/available`);
      last = res.status;
      await res.json().catch(() => null);
    }
    assert.equal(last, 429, 'hit after the budget → 429');
  });
});

// ─── reconcile ───────────────────────────────────────────────────────────────
test('POST /slots/reconcile fixes drifted counters and audits RECONCILE_SLOTS', async (t) => {
  const originals: Original[] = [];
  installBase(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  setMock(
    slotDelegate,
    'findMany',
    async () => [
      { id: 'slot-high', bookedCount: 2 },
      { id: 'slot-low', bookedCount: 1 },
      { id: 'slot-ok', bookedCount: 1 },
    ],
    originals,
  );
  setMock(
    bookingDelegate,
    'groupBy',
    async () => [
      { slotId: 'slot-high', _count: { _all: 3 } },
      { slotId: 'slot-ok', _count: { _all: 1 } },
    ],
    originals,
  );
  const updates: Array<{ id: string; now: number }> = [];
  setMock(
    slotDelegate,
    'update',
    async (args: { where: { id: string }; data: { bookedCount: number } }) => {
      updates.push({ id: args.where.id, now: args.data.bookedCount });
      return {};
    },
    originals,
  );
  const auditRows: Array<Record<string, unknown>> = [];
  const auditDelegate = (prisma as unknown as { auditLog: Record<string, unknown> }).auditLog as
    | Record<string, unknown>
    | undefined;
  if (auditDelegate) {
    setMock(
      auditDelegate,
      'create',
      async (args: { data: Record<string, unknown> }) => {
        auditRows.push(args.data);
        return { id: 'audit-r' };
      },
      originals,
    );
  }
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/reconcile?cycle=2026`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: { checked: number; fixed: Array<{ slotId: string; was: number; now: number }> };
    };
    assert.equal(json.data.checked, 3);
    assert.deepEqual(json.data.fixed, [
      { slotId: 'slot-high', was: 2, now: 3 },
      { slotId: 'slot-low', was: 1, now: 0 },
    ]);
    assert.deepEqual(
      updates,
      [
        { id: 'slot-high', now: 3 },
        { id: 'slot-low', now: 0 },
      ],
      'only drifted slots are rewritten',
    );
    assert.ok(
      auditRows.some((r) => r.action === 'RECONCILE_SLOTS'),
      'drifted reconcile writes an audit row',
    );
  });
});

test('POST /slots/reconcile is a read-only no-op when drift-free', async (t) => {
  const originals: Original[] = [];
  installBase(originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  setMock(slotDelegate, 'findMany', async () => [{ id: 's1', bookedCount: 2 }], originals);
  setMock(bookingDelegate, 'groupBy', async () => [{ slotId: 's1', _count: { _all: 2 } }], originals);
  let updated = false;
  setMock(
    slotDelegate,
    'update',
    async () => {
      updated = true;
      return {};
    },
    originals,
  );
  let audited = false;
  const auditDelegate = (prisma as unknown as { auditLog: Record<string, unknown> }).auditLog as
    | Record<string, unknown>
    | undefined;
  if (auditDelegate) {
    setMock(
      auditDelegate,
      'create',
      async () => {
        audited = true;
        return { id: 'audit-r' };
      },
      originals,
    );
  }
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/reconcile?cycle=2026`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { data: { checked: number; fixed: unknown[] } };
    assert.equal(json.data.checked, 1);
    assert.deepEqual(json.data.fixed, []);
    assert.equal(updated, false, 'no slot writes when drift-free');
    assert.equal(audited, false, 'no audit row when drift-free');
  });
});

test('POST /slots/reconcile requires ?cycle=', async (t) => {
  const originals: Original[] = [];
  installBase(originals);
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    assert.equal(res.status, 400);
  });
});

// ─── pickDeadline ────────────────────────────────────────────────────────────
function installPickDeadlineMocks(originals: Original[], expiresAt: Date | null) {
  const app = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'Cand',
    email: 'cand@example.com',
    applyingRole: 'TECHNICAL',
    status: 'INTERVIEW_SCHEDULED',
    cycle: '2026',
    userId: null,
  };
  const raw = generateRawSlotToken();
  const tokenDelegate = prisma.interviewSlotToken as unknown as Record<string, unknown>;
  setMock(
    tokenDelegate,
    'findUnique',
    async (args: { where: { tokenHash?: string; applicationId?: string } }) => {
      if (args.where.tokenHash) {
        return args.where.tokenHash === hashSlotToken(raw)
          ? { applicationId: app.id, tokenHash: hashSlotToken(raw), expiresAt: new Date(Date.now() + 3600_000) }
          : null;
      }
      if (args.where.applicationId) {
        return expiresAt ? { expiresAt } : null;
      }
      return null;
    },
    originals,
  );
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(appDelegate, 'findUnique', async () => app, originals);
  return { raw, app };
}

test('GET /slots/available exposes pickDeadline (ISO), null when no token', async (t) => {
  const deadline = new Date('2026-02-01T04:30:00.000Z');
  for (const [label, expiresAt, expected] of [
    ['present', deadline, deadline.toISOString()],
    ['absent', null, null],
  ] as const) {
    const originals: Original[] = [];
    installBase(originals);
    const { raw } = installPickDeadlineMocks(originals, expiresAt);
    const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
    setMock(slotDelegate, 'findMany', async () => [], originals);
    try {
      await withApp(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/hiring/slots/available?token=${raw}`);
        assert.equal(res.status, 200);
        const json = (await res.json()) as { data: { pickDeadline: string | null } };
        assert.equal(json.data.pickDeadline, expected, `pickDeadline ${label}`);
      });
    } finally {
      for (const [o, k, v] of originals) o[k] = v;
      invalidateCachedAuthUser(ADMIN.id);
      invalidateSettingsCache();
    }
  }
});

test('GET /my-booking carries pickDeadline on both booking and no-booking shapes', async (t) => {
  const deadline = new Date('2026-02-01T04:30:00.000Z');
  const originals: Original[] = [];
  installBase(originals);
  const { raw } = installPickDeadlineMocks(originals, deadline);
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  setMock(
    bookingDelegate,
    'findUnique',
    async () => ({
      id: 'booking-1',
      bookedAt: new Date('2026-01-20T00:00:00.000Z'),
      slot: { id: 's1', startsAt: new Date(), endsAt: new Date(), venue: null },
    }),
    originals,
  );
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/my-booking?token=${raw}`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: { hasBooking: boolean; pickDeadline: string | null };
    };
    assert.equal(json.data.hasBooking, true);
    assert.equal(json.data.pickDeadline, deadline.toISOString());
  });
});

// ─── cohort-notify audit ─────────────────────────────────────────────────────
test('POST /announcements (HIRING_COHORT) audits COHORT_NOTIFY with counts', async (t) => {
  const originals: Original[] = [];
  installBase(originals);
  const annDelegate = prisma.announcement as unknown as Record<string, unknown>;
  setMock(annDelegate, 'findMany', async () => [], originals);
  setMock(
    annDelegate,
    'create',
    async (args: { data: Record<string, unknown> }) => ({ id: 'ann-1', slug: 'x', ...args.data }),
    originals,
  );
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(
    appDelegate,
    'findMany',
    async () => [{ email: 'cand@example.com', status: 'INTERVIEW_SCHEDULED' }],
    originals,
  );
  const auditRows: Array<Record<string, unknown>> = [];
  const auditDelegate = (prisma as unknown as { auditLog: Record<string, unknown> }).auditLog as
    | Record<string, unknown>
    | undefined;
  if (auditDelegate) {
    setMock(
      auditDelegate,
      'create',
      async (args: { data: Record<string, unknown> }) => {
        auditRows.push(args.data);
        return { id: 'audit-c' };
      },
      originals,
    );
  }
  t.after(() => {
    for (const [o, k, v] of originals) o[k] = v;
    invalidateCachedAuthUser(ADMIN.id);
    invalidateSettingsCache();
  });

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/announcements/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Cohort news',
        body: 'Hello cohort, this is a longer body.',
        audience: 'HIRING_COHORT',
        audienceCycle: '2026',
        notifyCohort: true,
      }),
    });
    assert.equal(res.status, 201);
    const json = (await res.json()) as { notifiedCount: number };
    assert.equal(json.notifiedCount, 1);
    const notify = auditRows.find((r) => r.action === 'COHORT_NOTIFY');
    assert.ok(notify, 'cohort send writes a COHORT_NOTIFY audit row');
    assert.equal(
      (notify.metadata as { notifiedCount: number }).notifiedCount,
      1,
      'audit carries the send counts',
    );
  }, 'announcements');
});
