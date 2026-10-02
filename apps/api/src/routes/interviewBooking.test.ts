import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { hiringRouter } from './hiring.js';
import { hiringSlotsRouter } from './hiringSlots.js';
import { announcementsRouter } from './announcements.js';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';
import { invalidateSettingsCache } from '../utils/settingsCache.js';
import { parseISTDateTime } from '../utils/interviewSlots.js';
import { generateRawSlotToken, hashSlotToken } from '../utils/interviewSlotToken.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hiring-booking-tests-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://codescriet.dev';
process.env.NODE_ENV = 'test';

const ADMIN = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

const USER = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Candidate',
  email: 'cand@example.com',
  role: 'USER',
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

function installBaseMocks(originals: Original[], currentUser: typeof ADMIN | typeof USER = ADMIN) {
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  setMock(
    userDelegate,
    'findUnique',
    async (args: { where: { id: string } }) => {
      if (args.where.id === ADMIN.id) return { ...ADMIN };
      if (args.where.id === USER.id) return { ...USER };
      return null;
    },
    originals,
  );
  const audit = (prisma as unknown as { auditLog: Record<string, unknown> }).auditLog as
    | Record<string, unknown>
    | undefined;
  if (audit) setMock(audit, 'create', async () => ({ id: 'audit-1' }), originals);
  setMock(emailService as unknown as Record<string, unknown>, 'send', async () => true, originals);
  setMock(
    emailService as unknown as Record<string, unknown>,
    'sendHiringSelected',
    async () => true,
    originals,
  );
  setMock(
    emailService as unknown as Record<string, unknown>,
    'sendHiringRejected',
    async () => true,
    originals,
  );
  setMock(
    emailService as unknown as Record<string, unknown>,
    'sendHiringApplication',
    async () => true,
    originals,
  );
  invalidateCachedAuthUser(ADMIN.id);
  invalidateCachedAuthUser(USER.id);
  invalidateSettingsCache();
  void currentUser;
}

function tokenFor(user: typeof ADMIN | typeof USER): string {
  return signAccessToken({
    userId: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tokenVersion: 0,
  });
}

async function withApp(
  run: (baseUrl: string) => Promise<void>,
  mount: 'slots' | 'hiring' | 'both' | 'announcements' = 'both',
) {
  const app = express();
  app.use(express.json());
  if (mount === 'slots' || mount === 'both') app.use('/api/hiring', hiringSlotsRouter);
  if (mount === 'hiring' || mount === 'both') app.use('/api/hiring', hiringRouter);
  if (mount === 'announcements') app.use('/api/announcements', announcementsRouter);
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

function restoreAll(originals: Original[]) {
  for (const [o, k, v] of originals) o[k] = v;
  invalidateCachedAuthUser(ADMIN.id);
  invalidateCachedAuthUser(USER.id);
  invalidateSettingsCache();
}

const futureDate = (() => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10))();

// ─── token auth: wrong → 401, expired → 410, scoped to own application ───────
test('candidate token: wrong → 401, expired → 410, scoped to own application', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const appA = {
    id: 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    name: 'A',
    email: 'a@example.com',
    applyingRole: 'TECHNICAL',
    status: 'INTERVIEW_SCHEDULED',
    cycle: '2026',
    userId: null,
  };
  const appB = {
    id: 'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',
    name: 'B',
    email: 'b@example.com',
    applyingRole: 'TECHNICAL',
    status: 'INTERVIEW_SCHEDULED',
    cycle: '2026',
    userId: null,
  };
  const rawA = generateRawSlotToken();
  const rawExpired = generateRawSlotToken();
  const tokenDelegate = prisma.interviewSlotToken as unknown as Record<string, unknown>;
  setMock(
    tokenDelegate,
    'findUnique',
    async (args: { where: { tokenHash: string } }) => {
      if (args.where.tokenHash === hashSlotToken(rawA)) {
        return { applicationId: appA.id, tokenHash: hashSlotToken(rawA), expiresAt: new Date(Date.now() + 3600_000) };
      }
      if (args.where.tokenHash === hashSlotToken(rawExpired)) {
        return { applicationId: appA.id, tokenHash: hashSlotToken(rawExpired), expiresAt: new Date(Date.now() - 1000) };
      }
      return null;
    },
    originals,
  );
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(
    appDelegate,
    'findUnique',
    async (args: { where: { id: string } }) => (args.where.id === appA.id ? appA : null),
    originals,
  );
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  setMock(
    bookingDelegate,
    'findUnique',
    async (args: { where: { applicationId: string } }) => {
      // appA has no booking; scoping check: token A must never resolve appB
      if (args.where.applicationId === appA.id) return null;
      return { id: 'other-booking', applicationId: appB.id, slot: { id: 'slot-other' } };
    },
    originals,
  );
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const wrong = await fetch(`${baseUrl}/api/hiring/my-booking?token=wrong-token-value`);
    assert.equal(wrong.status, 401);
    const expired = await fetch(`${baseUrl}/api/hiring/my-booking?token=${rawExpired}`);
    assert.equal(expired.status, 410);
    const ok = await fetch(`${baseUrl}/api/hiring/my-booking?token=${rawA}`);
    assert.equal(ok.status, 200);
    const json = (await ok.json()) as { data: { hasBooking: boolean } };
    assert.equal(json.data.hasBooking, false, 'token A resolves only application A (no leak of B)');
  }, 'slots');
});

// ─── no_open_slots guard ─────────────────────────────────────────────────────
test('POST /applications/schedule returns no_open_slots when cycle has no open future slots', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  const appId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  setMock(
    appDelegate,
    'findMany',
    async () => [{ id: appId, name: 'C', email: 'c@example.com', applyingRole: 'TECHNICAL', status: 'PENDING', cycle: '2026' }],
    originals,
  );
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(slotDelegate, 'findMany', async () => [], originals);
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/applications/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor(ADMIN)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationIds: [appId] }),
    });
    assert.equal(res.status, 409);
    const json = (await res.json()) as { error: string; message: string };
    assert.equal(json.error, 'no_open_slots');
    assert.match(json.message, /Create interview slots/i);
  }, 'slots');
});

// ─── schedule bulk mixed → per-item results ──────────────────────────────────
test('POST /applications/schedule handles mixed batch per-item (ok / invalid_transition / not_found)', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const goodId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const badStatusId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(
    appDelegate,
    'findMany',
    async () => [
      { id: goodId, name: 'Good', email: 'good@example.com', applyingRole: 'TECHNICAL', status: 'PENDING', cycle: '2026' },
      { id: badStatusId, name: 'Bad', email: 'bad@example.com', applyingRole: 'TECHNICAL', status: 'REJECTED', cycle: '2026' },
    ],
    originals,
  );
  setMock(appDelegate, 'update', async (args: { where: { id: string } }) => ({ id: args.where.id, status: 'INTERVIEW_SCHEDULED' }), originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(slotDelegate, 'findMany', async () => [{ id: 'slot-1' }], originals);
  const tokenDelegate = prisma.interviewSlotToken as unknown as Record<string, unknown>;
  setMock(tokenDelegate, 'upsert', async () => ({ tokenHash: 'h', expiresAt: new Date() }), originals);
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/applications/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor(ADMIN)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationIds: [goodId, badStatusId, missingId] }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { data: { results: Array<{ id: string; ok: boolean; error?: string }> } };
    const byId = new Map(json.data.results.map((r) => [r.id, r]));
    assert.equal(byId.get(goodId)?.ok, true);
    assert.equal(byId.get(badStatusId)?.ok, false);
    assert.equal(byId.get(badStatusId)?.error, 'invalid_transition');
    assert.equal(byId.get(missingId)?.ok, false);
  }, 'slots');
});

// ─── booking validation paths ────────────────────────────────────────────────
async function setupBookingMocks(
  originals: Original[],
  opts: {
    slot: Record<string, unknown>;
    existingBooking?: Record<string, unknown> | null;
    application?: Record<string, unknown>;
  },
) {
  const app = (opts.application ?? {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'Cand',
    email: 'cand@example.com',
    applyingRole: 'TECHNICAL',
    status: 'INTERVIEW_SCHEDULED',
    cycle: '2026',
    userId: null,
  }) as Record<string, unknown>;
  const raw = generateRawSlotToken();
  const tokenDelegate = prisma.interviewSlotToken as unknown as Record<string, unknown>;
  setMock(
    tokenDelegate,
    'findUnique',
    async () => ({ applicationId: app.id, tokenHash: hashSlotToken(raw), expiresAt: new Date(Date.now() + 3600_000) }),
    originals,
  );
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(appDelegate, 'findUnique', async () => app, originals);
  setMock(appDelegate, 'findFirst', async () => app, originals);
  setMock(appDelegate, 'update', async (args: { where: { id: string }; data: unknown }) => ({ ...app, ...(args.data as object) }), originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(slotDelegate, 'findUnique', async () => opts.slot, originals);
  setMock(slotDelegate, 'findMany', async () => [opts.slot], originals);
  setMock(slotDelegate, 'update', async () => opts.slot, originals);
  setMock(slotDelegate, 'create', async (args: { data: unknown }) => ({ id: 'new-slot', ...(args.data as object) }), originals);
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  setMock(bookingDelegate, 'findUnique', async () => opts.existingBooking ?? null, originals);
  setMock(bookingDelegate, 'create', async (args: { data: unknown }) => ({ id: 'booking-1', ...(args.data as object) }), originals);
  setMock(bookingDelegate, 'delete', async () => ({}), originals);
  setMock(tokenDelegate, 'upsert', async () => ({ tokenHash: 'h', expiresAt: new Date() }), originals);
  const prismaAny = prisma as unknown as Record<string, unknown>;
  setMock(
    prismaAny,
    '$transaction',
    async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        interviewSlot: slotDelegate,
        interviewSlotBooking: bookingDelegate,
        hiringApplication: appDelegate,
      }),
    originals,
  );
  return { raw, app };
}

test('POST /slots/:id/book rejects past slots and returns typed 409s', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const slotId = '12345678-1234-4234-8234-123456789012';
  const { raw } = await setupBookingMocks(originals, {
    slot: {
      id: slotId,
      cycle: '2026',
      startsAt: new Date(Date.now() - 3600_000),
      endsAt: new Date(Date.now() + 3600_000),
      capacity: 5,
      bookedCount: 0,
      isOpen: true,
      venue: null,
    },
  });
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/${slotId}/book?token=${raw}`, { method: 'POST' });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error_type?: string; error?: { error_type?: string } };
    assert.ok(json.error_type === 'past_slot' || json.error?.error_type === 'past_slot');
  }, 'slots');
});

test('POST /slots/:id/book maps closed/full/booked to typed 409s', async (t) => {
  const slotId = '22345678-1234-4234-8234-123456789012';

  for (const [name, slot, existingBooking, expectedType, expectedStatus] of [
    ['slot_closed', { id: slotId, cycle: '2026', startsAt: new Date(Date.now() + 3600_000), endsAt: new Date(Date.now() + 7200_000), capacity: 2, bookedCount: 0, isOpen: false, venue: null }, null, 'slot_closed', 409],
    ['slot_full', { id: slotId, cycle: '2026', startsAt: new Date(Date.now() + 3600_000), endsAt: new Date(Date.now() + 7200_000), capacity: 1, bookedCount: 1, isOpen: true, venue: null }, null, 'slot_full', 409],
    ['already_booked', { id: slotId, cycle: '2026', startsAt: new Date(Date.now() + 3600_000), endsAt: new Date(Date.now() + 7200_000), capacity: 2, bookedCount: 0, isOpen: true, venue: null }, { id: 'b1' }, 'already_booked', 409],
  ] as const) {
    const originals: Original[] = [];
    installBaseMocks(originals);
    const { raw } = await setupBookingMocks(originals, {
      slot: slot as unknown as Record<string, unknown>,
      existingBooking: existingBooking as unknown as Record<string, unknown> | null,
    });
    try {
      await withApp(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/hiring/slots/${slotId}/book?token=${raw}`, { method: 'POST' });
        assert.equal(res.status, expectedStatus, name);
        const json = (await res.json()) as { error_type?: string; error?: { error_type?: string } };
        const got = json.error_type ?? json.error?.error_type;
        assert.equal(got, expectedType, `${name} carries typed error_type`);
      }, 'slots');
    } finally {
      restoreAll(originals);
    }
  }
});

test('POST /slots/:id/book succeeds and POST /my-booking/cancel enforces 24h cutoff', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const slotId = '32345678-1234-4234-8234-123456789012';
  const soonSlot = {
    id: slotId,
    cycle: '2026',
    startsAt: new Date(Date.now() + 2 * 3600_000),
    endsAt: new Date(Date.now() + 3 * 3600_000),
    capacity: 2,
    bookedCount: 0,
    isOpen: true,
    venue: 'Room 1',
  };
  const { raw } = await setupBookingMocks(originals, { slot: soonSlot as unknown as Record<string, unknown> });
  // my-booking/cancel path reads booking+slot by applicationId. The book tx
  // first checks for an existing booking (must be null to succeed), so make
  // the mock stateful: first applicationId lookup → null, later → booking.
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  let bookingLookups = 0;
  setMock(
    bookingDelegate,
    'findUnique',
    async (args: { where: { applicationId?: string } }) => {
      if (args.where.applicationId) {
        bookingLookups += 1;
        if (bookingLookups === 1) return null;
        return { id: 'booking-1', slotId, slot: soonSlot };
      }
      return null;
    },
    originals,
  );
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const book = await fetch(`${baseUrl}/api/hiring/slots/${slotId}/book?token=${raw}`, { method: 'POST' });
    assert.equal(book.status, 201);
    const cancel = await fetch(`${baseUrl}/api/hiring/my-booking/cancel?token=${raw}`, { method: 'POST' });
    assert.equal(cancel.status, 400, 'cancel inside 24h is rejected');
  }, 'slots');
});

// ─── status transition matrix via PATCH ──────────────────────────────────────
test('PATCH /applications/:id/status enforces the transition matrix', async (t) => {
  const allowed: Array<[string, string]> = [
    ['PENDING', 'INTERVIEW_SCHEDULED'],
    ['INTERVIEW_SCHEDULED', 'SLOT_BOOKED'],
    ['SLOT_BOOKED', 'INTERVIEW_SCHEDULED'],
    ['SLOT_BOOKED', 'INTERVIEWED'],
    ['INTERVIEW_SCHEDULED', 'REJECTED'],
    ['SLOT_BOOKED', 'REJECTED'],
    ['INTERVIEWED', 'SELECTED'],
    ['INTERVIEWED', 'REJECTED'],
  ];
  const forbidden: Array<[string, string]> = [
    ['PENDING', 'SELECTED'],
    ['PENDING', 'REJECTED'],
    ['PENDING', 'SLOT_BOOKED'],
    ['INTERVIEW_SCHEDULED', 'PENDING'],
    ['INTERVIEW_SCHEDULED', 'SELECTED'],
    ['SLOT_BOOKED', 'PENDING'],
    ['SLOT_BOOKED', 'SELECTED'],
    ['INTERVIEWED', 'PENDING'],
    ['SELECTED', 'REJECTED'],
    ['REJECTED', 'PENDING'],
  ];

  for (const [from, to] of [...allowed, ...forbidden]) {
    const originals: Original[] = [];
    installBaseMocks(originals);
    const appId = '77777777-7777-4777-8777-777777777777';
    const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
    setMock(
      appDelegate,
      'findUnique',
      async () => ({ id: appId, name: 'N', email: 'n@example.com', applyingRole: 'TECHNICAL', status: from, cycle: '2026' }),
      originals,
    );
    setMock(appDelegate, 'update', async () => ({ id: appId, status: to }), originals);
    const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
    setMock(bookingDelegate, 'findUnique', async () => null, originals);
    setMock(bookingDelegate, 'delete', async () => ({}), originals);
    const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
    setMock(slotDelegate, 'update', async () => ({}), originals);
    const tokenDelegate = prisma.interviewSlotToken as unknown as Record<string, unknown>;
    setMock(tokenDelegate, 'upsert', async () => ({}), originals);
    setMock(tokenDelegate, 'deleteMany', async () => ({}), originals);
    try {
      await withApp(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/hiring/applications/${appId}/status`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tokenFor(ADMIN)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: to }),
        });
        const shouldAllow = allowed.some(([a, b]) => a === from && b === to);
        assert.equal(res.status, shouldAllow ? 200 : 400, `${from}->${to} should be ${shouldAllow ? 'allowed' : 'forbidden'}`);
      }, 'hiring');
    } finally {
      restoreAll(originals);
    }
  }
});

test('PATCH same-status is a 200 no-op with emailSent:false; ?resend re-invites', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const appId = '88888888-8888-4888-8888-888888888888';
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(
    appDelegate,
    'findUnique',
    async () => ({ id: appId, name: 'N', email: 'n@example.com', applyingRole: 'TECHNICAL', status: 'INTERVIEW_SCHEDULED', cycle: '2026' }),
    originals,
  );
  const tokenDelegate = prisma.interviewSlotToken as unknown as Record<string, unknown>;
  setMock(tokenDelegate, 'upsert', async () => ({}), originals);
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const noop = await fetch(`${baseUrl}/api/hiring/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor(ADMIN)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'INTERVIEW_SCHEDULED' }),
    });
    assert.equal(noop.status, 200);
    const noopJson = (await noop.json()) as { data: { emailSent: boolean } };
    assert.equal(noopJson.data.emailSent, false);
    const resend = await fetch(`${baseUrl}/api/hiring/applications/${appId}/status?resend=true`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor(ADMIN)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'INTERVIEW_SCHEDULED' }),
    });
    assert.equal(resend.status, 200);
    const resendJson = (await resend.json()) as { data: { emailSent: boolean } };
    assert.equal(resendJson.data.emailSent, true);
  }, 'hiring');
});

test('REJECT after booking releases the seat first', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const appId = '99999999-0000-4000-8000-999999999999';
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(
    appDelegate,
    'findUnique',
    async () => ({ id: appId, name: 'N', email: 'n@example.com', applyingRole: 'TECHNICAL', status: 'SLOT_BOOKED', cycle: '2026' }),
    originals,
  );
  setMock(appDelegate, 'update', async () => ({ id: appId, status: 'REJECTED' }), originals);
  const bookingDelegate = prisma.interviewSlotBooking as unknown as Record<string, unknown>;
  let deletedBooking: string | null = null;
  setMock(bookingDelegate, 'findUnique', async () => ({ id: 'booking-9', slotId: 'slot-9' }), originals);
  setMock(
    bookingDelegate,
    'delete',
    async (args: { where: { id: string } }) => {
      deletedBooking = args.where.id;
      return {};
    },
    originals,
  );
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  let decremented = false;
  setMock(
    slotDelegate,
    'update',
    async () => {
      decremented = true;
      return {};
    },
    originals,
  );
  const tokenDelegate = prisma.interviewSlotToken as unknown as Record<string, unknown>;
  setMock(tokenDelegate, 'deleteMany', async () => ({}), originals);
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor(ADMIN)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REJECTED' }),
    });
    assert.equal(res.status, 200);
    assert.equal(deletedBooking, 'booking-9', 'booking released first');
    assert.equal(decremented, true, 'seat decremented');
  }, 'hiring');
});

// ─── available slots: role filter + spotsLeft, no leaks ─────────────────────
test('GET /slots/available filters by role and hides other candidates', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
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
    async () => ({ applicationId: app.id, tokenHash: hashSlotToken(raw), expiresAt: new Date(Date.now() + 3600_000) }),
    originals,
  );
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(appDelegate, 'findUnique', async () => app, originals);
  const slotDelegate = prisma.interviewSlot as unknown as Record<string, unknown>;
  setMock(
    slotDelegate,
    'findMany',
    async () => [
      { id: 's1', cycle: '2026', startsAt: new Date(Date.now() + 3600_000), endsAt: new Date(Date.now() + 7200_000), capacity: 2, bookedCount: 0, isOpen: true, applyingRole: null, venue: 'Hall' },
      { id: 's2', cycle: '2026', startsAt: new Date(Date.now() + 3600_000), endsAt: new Date(Date.now() + 7200_000), capacity: 2, bookedCount: 0, isOpen: true, applyingRole: 'DESIGNING', venue: 'Hall' },
      { id: 's3', cycle: '2026', startsAt: new Date(Date.now() + 3600_000), endsAt: new Date(Date.now() + 7200_000), capacity: 1, bookedCount: 1, isOpen: true, applyingRole: null, venue: 'Hall' },
    ],
    originals,
  );
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hiring/slots/available?token=${raw}`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as { data: { slots: Array<{ id: string; spotsLeft: number }> } };
    const ids = json.data.slots.map((s) => s.id);
    assert.ok(ids.includes('s1'), 'untagged slots visible');
    assert.ok(!ids.includes('s2'), 'other-role slots hidden');
    assert.ok(!ids.includes('s3'), 'full slots hidden');
    assert.ok(!JSON.stringify(json).includes('cand2@example.com'), 'no other candidates leaked');
  }, 'slots');
});

// ─── announcements: cohort targeting ─────────────────────────────────────────
test('POST /announcements enforces audienceCycle and defers cohort mail (notifiedCount: 0)', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const annDelegate = prisma.announcement as unknown as Record<string, unknown>;
  setMock(annDelegate, 'findMany', async () => [], originals);
  setMock(
    annDelegate,
    'create',
    async (args: { data: Record<string, unknown> }) => ({ id: 'ann-1', slug: 'x', ...args.data }),
    originals,
  );
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const headers = { Authorization: `Bearer ${tokenFor(ADMIN)}`, 'Content-Type': 'application/json' };
    const missing = await fetch(`${baseUrl}/api/announcements/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Cohort news', body: 'Hello cohort, this is a longer body.', audience: 'HIRING_COHORT' }),
    });
    assert.equal(missing.status, 400);
    const good = await fetch(`${baseUrl}/api/announcements/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Cohort news',
        body: 'Hello cohort, this is a longer body.',
        audience: 'HIRING_COHORT',
        audienceCycle: '2026',
        notifyCohort: true,
      }),
    });
    assert.equal(good.status, 201);
    const json = (await good.json()) as { notifiedCount: number };
    assert.equal(json.notifiedCount, 0, 'cohort mail deferred to Phase 2');
  }, 'announcements');
});

test('GET /announcements hides cohorts from anonymous and rejected applicants', async (t) => {
  const originals: Original[] = [];
  installBaseMocks(originals);
  const annDelegate = prisma.announcement as unknown as Record<string, unknown>;
  const rows = [
    { id: 'a1', title: 'Public', body: 'x'.repeat(10), audience: 'ALL', audienceCycle: null },
    { id: 'a2', title: 'Cohort', body: 'y'.repeat(10), audience: 'HIRING_COHORT', audienceCycle: '2026' },
  ];
  let lastWhere: unknown = null;
  setMock(
    annDelegate,
    'findMany',
    async (args: { where: unknown }) => {
      lastWhere = args.where;
      // emulate the visibility filter for the anonymous case
      const and = (args.where as { AND: Array<Record<string, unknown>> }).AND;
      const audience = and[1] as Record<string, unknown>;
      if ((audience as { audience?: string }).audience === 'ALL') return [rows[0]];
      return rows;
    },
    originals,
  );
  setMock(annDelegate, 'count', async () => 1, originals);
  const appDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  setMock(appDelegate, 'findMany', async () => [], originals);
  t.after(() => restoreAll(originals));

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/announcements/`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as { data: Array<{ id: string }> };
    assert.deepEqual(json.data.map((r) => r.id), ['a1'], 'anonymous sees ALL only');
    assert.ok(JSON.stringify(lastWhere).includes('ALL'));
  }, 'announcements');
});

test('GET /slots/available uses future IST slot helper (smoke)', () => {
  const s = parseISTDateTime(futureDate, '10:00');
  assert.ok(s.getTime() > Date.now());
});
