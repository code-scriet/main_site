import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import type { Prisma } from '@prisma/client';
import { authRouter } from './auth.js';
import { registrationsRouter } from './registrations.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';
import { invalidateSettingsCache } from '../utils/settingsCache.js';
import { emailService } from '../utils/email.js';
import {
  assertWithinActiveEventLimitInTx,
  EventLimitExceededError,
} from '../utils/registrationIntake.js';
import { shouldBlockImplicitOAuthSignup } from '../config/passport.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'registration-settings-tests-secret';

const USER_ID = '55555555-5555-4555-8555-555555555555';
const EVENT_ID = '66666666-6666-4666-8666-666666666666';

const USER_ROW = {
  id: USER_ID,
  name: 'Reg Test User',
  email: 'reg@example.com',
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

function setMethods(methods: Array<[Record<string, unknown>, string, unknown]>) {
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  for (const [target, key, impl] of methods) {
    originals.push([target, key, target[key]]);
    target[key] = impl;
  }
  return () => {
    for (const [target, key, value] of originals) target[key] = value;
    invalidateCachedAuthUser(USER_ID);
    invalidateSettingsCache();
  };
}

async function withApp(mount: (app: express.Express) => void, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  mount(app);
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

// ─── L1: registrationOpen enforced server-side ───────────────────────────────

test('POST /api/auth/register returns 403 when registrationOpen=false', async (t) => {
  const settingsDelegate = prisma.settings as unknown as Record<string, unknown>;
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const restore = setMethods([
    [settingsDelegate, 'findUnique', async () => ({ id: 'default', registrationOpen: false })],
    [userDelegate, 'findFirst', async () => { throw new Error('must not reach user lookup'); }],
  ]);
  t.after(restore);
  invalidateSettingsCache();

  await withApp((app) => app.use('/api/auth', authRouter), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked User', email: 'blocked@example.com', password: 'a-valid-password-123' }),
    });
    assert.equal(response.status, 403);
    const json = await response.json();
    assert.match(String(json.error), /Registration is currently closed/);
  });
});

test('OAuth signup gate blocks routine signups but exempts network-intent invites when closed', async (t) => {
  const settingsDelegate = prisma.settings as unknown as Record<string, unknown>;
  const restore = setMethods([
    [settingsDelegate, 'findUnique', async () => ({ id: 'default', registrationOpen: false })],
  ]);
  t.after(restore);
  invalidateSettingsCache();

  // Routine (non-network) OAuth first sign-in is blocked while closed.
  assert.equal(await shouldBlockImplicitOAuthSignup(false), true, 'routine signup blocked when closed');
  // Invited guest/speaker/alumni (network intent) may still create the account
  // their invitation needs — registrationOpen governs member signups only.
  assert.equal(await shouldBlockImplicitOAuthSignup(true), false, 'network-intent signup exempt');
});

test('OAuth signup gate allows everyone when registration is open', async (t) => {
  const settingsDelegate = prisma.settings as unknown as Record<string, unknown>;
  const restore = setMethods([
    [settingsDelegate, 'findUnique', async () => ({ id: 'default', registrationOpen: true })],
  ]);
  t.after(restore);
  invalidateSettingsCache();

  assert.equal(await shouldBlockImplicitOAuthSignup(false), false, 'routine signup allowed when open');
  assert.equal(await shouldBlockImplicitOAuthSignup(true), false, 'network-intent allowed when open');
});

test('POST /api/auth/register succeeds when registrationOpen=true', async (t) => {
  const settingsDelegate = prisma.settings as unknown as Record<string, unknown>;
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  let created: Record<string, unknown> | null = null;
  const restore = setMethods([
    [settingsDelegate, 'findUnique', async () => ({ id: 'default', registrationOpen: true })],
    [userDelegate, 'findFirst', async () => null],
    [userDelegate, 'create', async (args: { data: Record<string, unknown> }) => {
      created = { id: USER_ID, avatar: null, ...args.data };
      return created;
    }],
    [userDelegate, 'update', async () => ({})], // recordLogin fire-and-forget
    // Keep the test hermetic — the welcome email is fire-and-forget but must
    // not hit the real Brevo API from CI.
    [emailService as unknown as Record<string, unknown>, 'sendWelcome', async () => true],
  ]);
  t.after(restore);
  invalidateSettingsCache();

  await withApp((app) => app.use('/api/auth', authRouter), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Open User', email: 'open@example.com', password: 'a-valid-password-123' }),
    });
    assert.equal(response.status, 201, 'registration proceeds when open');
    assert.ok(created, 'user created');
  });
});

// ─── L2: maxEventsPerUser guard (unit) ───────────────────────────────────────

function fakeTx(options: { limit: number | null; activeCount: number }) {
  const calls = { counted: false };
  const tx = {
    settings: {
      findUnique: async () => (options.limit === null ? null : { maxEventsPerUser: options.limit }),
    },
    eventRegistration: {
      count: async (args: { where: Record<string, unknown> }) => {
        calls.counted = true;
        assert.equal((args.where as { registrationType?: string }).registrationType, 'PARTICIPANT', 'guests never count');
        return options.activeCount;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

test('limit guard throws at the cap, passes under it, defaults to 5, skips on <1', async () => {
  await assert.rejects(
    () => assertWithinActiveEventLimitInTx(fakeTx({ limit: 5, activeCount: 5 }).tx, USER_ID),
    EventLimitExceededError,
    'at the cap → blocked',
  );
  await assert.rejects(
    () => assertWithinActiveEventLimitInTx(fakeTx({ limit: 3, activeCount: 7 }).tx, USER_ID),
    EventLimitExceededError,
    'over the cap → blocked',
  );
  await assertWithinActiveEventLimitInTx(fakeTx({ limit: 5, activeCount: 4 }).tx, USER_ID);

  // settings row missing → schema default 5 applies
  await assert.rejects(
    () => assertWithinActiveEventLimitInTx(fakeTx({ limit: null, activeCount: 5 }).tx, USER_ID),
    EventLimitExceededError,
  );

  // nonsense limit (<1) disables the check without counting
  const zero = fakeTx({ limit: 0, activeCount: 99 });
  await assertWithinActiveEventLimitInTx(zero.tx, USER_ID);
  assert.equal(zero.calls.counted, false, 'no count query when disabled');
});

// ─── L2: wired into the solo-registration transaction ────────────────────────

test('solo registration 400s with the limit message when at maxEventsPerUser', async (t) => {
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const userBlockDelegate = prisma.userBlock as unknown as Record<string, unknown>;
  const eventDelegate = prisma.event as unknown as Record<string, unknown>;
  const prismaAny = prisma as unknown as Record<string, unknown>;

  const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const openEvent = {
    id: EVENT_ID,
    title: 'Limit Event',
    slug: 'limit-event',
    status: 'UPCOMING',
    startDate: futureStart,
    endDate: null,
    registrationStartDate: null,
    registrationEndDate: null,
    allowLateRegistration: false,
    capacity: null,
    eventDays: 1,
    registrationFields: null,
    teamRegistration: false,
    location: null,
    imageUrl: null,
    _count: { registrations: 0 },
  };

  const tx = {
    event: { findUnique: async () => openEvent },
    eventRegistration: {
      findUnique: async () => null,
      count: async () => 5, // already at the cap
    },
    settings: { findUnique: async () => ({ maxEventsPerUser: 5 }) },
  };

  const originalTxn = prismaAny.$transaction;
  prismaAny.$transaction = async (work: (tx: unknown) => Promise<unknown>) => work(tx);
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
      if (args.where.id !== USER_ID) return null;
      if (!args.select) return { ...USER_ROW };
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(args.select)) out[key] = (USER_ROW as Record<string, unknown>)[key];
      return out;
    }],
    [userBlockDelegate, 'findUnique', async () => null],
    [eventDelegate, 'findUnique', async () => ({ teamRegistration: false })],
  ]);
  t.after(() => {
    prismaAny.$transaction = originalTxn;
    restore();
  });

  await withApp((app) => app.use('/api/registrations', registrationsRouter), async (baseUrl) => {
    const token = signAccessToken({
      userId: USER_ID, id: USER_ID, name: USER_ROW.name,
      email: USER_ROW.email, role: 'USER', tokenVersion: 0,
    });
    const response = await fetch(`${baseUrl}/api/registrations/events/${EVENT_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await response.json();
    assert.equal(response.status, 400, `expected limit rejection: ${JSON.stringify(json)}`);
    assert.match(String(json.error?.message), /at most 5 upcoming events/);
  });
});
