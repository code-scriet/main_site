import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { hiringRouter } from './hiring.js';
import { settingsRouter } from './settings.js';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { invalidateSettingsCache } from '../utils/settingsCache.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hiring-cycles-tests-secret';
process.env.SUPER_ADMIN_EMAIL = 'root@example.com';

process.env.NODE_ENV = 'test';

interface StoredApp {
  id: string;
  email: string;
  cycle: string;
  applyingRole: string;
  status: string;
  name: string;
}

function installMock(currentCycle: string) {
  const rows: StoredApp[] = [];
  const settingsDelegate = prisma.settings as unknown as Record<string, unknown>;
  const hiringDelegate = prisma.hiringApplication as unknown as Record<string, unknown>;
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  const set = (t: Record<string, unknown>, k: string, v: unknown) => { originals.push([t, k, t[k]]); t[k] = v; };

  set(settingsDelegate, 'findUnique', async () => ({ id: 'default', hiringCycle: currentCycle }));

  set(hiringDelegate, 'findFirst', async (args: { where: { email?: { equals: string }; cycle?: string } }) => {
    const email = args.where.email?.equals?.toLowerCase();
    const cycle = args.where.cycle;
    return rows.find((r) => r.email.toLowerCase() === email && r.cycle === cycle) ?? null;
  });
  set(hiringDelegate, 'create', async (args: { data: StoredApp }) => {
    // Enforce the composite unique like Postgres would.
    if (rows.some((r) => r.email.toLowerCase() === args.data.email.toLowerCase() && r.cycle === args.data.cycle)) {
      const err = new Error('Unique constraint failed') as Error & { code?: string };
      err.name = 'PrismaClientKnownRequestError';
      (err as { code?: string }).code = 'P2002';
      throw err;
    }
    const row = { ...args.data, id: `app-${rows.length + 1}`, status: 'PENDING' };
    rows.push(row);
    return row;
  });

  // Keep email hermetic.
  set(emailService as unknown as Record<string, unknown>, 'sendHiringApplication', async () => true);

  return {
    rows,
    restore() {
      for (const [t, k, v] of originals) t[k] = v;
      invalidateSettingsCache();
    },
  };
}

async function withApp(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/hiring', hiringRouter);
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

function applyBody(email: string) {
  return {
    name: 'Cycle Tester',
    email,
    department: 'CSE',
    year: '2',
    applyingRole: 'TECHNICAL',
  };
}

async function postApply(baseUrl: string, email: string) {
  const res = await fetch(`${baseUrl}/api/hiring/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(applyBody(email)),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test('same email may apply once per cycle, blocked twice in the same cycle', async (t) => {
  const mock = installMock('2026');
  t.after(mock.restore);
  invalidateSettingsCache();

  await withApp(async (baseUrl) => {
    const first = await postApply(baseUrl, 'cycler@example.com');
    assert.equal(first.status, 201, `first apply should succeed: ${JSON.stringify(first.json)}`);

    const dup = await postApply(baseUrl, 'cycler@example.com');
    assert.equal(dup.status, 409, 'second apply in the SAME cycle is blocked');
    assert.match(String(dup.json?.error?.message ?? dup.json?.message ?? ''), /2026 hiring cycle/i);
  });
});

test('PUT /api/settings persists hiringCycle (regression: was accepted then discarded)', async (t) => {
  const PRESIDENT = {
    id: '77777777-7777-4777-8777-777777777777',
    name: 'Prez', email: 'root@example.com', role: 'PRESIDENT',
    avatar: null, phone: null, course: null, branch: null, year: null,
    profileCompleted: true, tokenVersion: 0, isDeleted: false,
  };
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const settingsDelegate = prisma.settings as unknown as Record<string, unknown>;
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  const set = (tt: Record<string, unknown>, k: string, v: unknown) => { originals.push([tt, k, tt[k]]); tt[k] = v; };

  set(userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
    if (args.where.id !== PRESIDENT.id) return null;
    if (!args.select) return { ...PRESIDENT };
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(args.select)) out[k] = (PRESIDENT as Record<string, unknown>)[k];
    return out;
  });
  let upsertData: Record<string, unknown> | null = null;
  set(settingsDelegate, 'upsert', async (args: { update: Record<string, unknown> }) => {
    upsertData = args.update;
    return { id: 'default', ...args.update };
  });
  t.after(() => { for (const [tt, k, v] of originals) tt[k] = v; invalidateCachedAuthUser(PRESIDENT.id); invalidateSettingsCache(); });

  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  const token = signAccessToken({ userId: PRESIDENT.id, id: PRESIDENT.id, name: PRESIDENT.name, email: PRESIDENT.email, role: 'PRESIDENT', tokenVersion: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiringCycle: '2027-spring' }),
    });
    assert.equal(res.status, 200, 'settings update succeeds');
    const captured = upsertData as Record<string, unknown> | null;
    assert.ok(captured, 'settings.upsert called');
    assert.equal(captured.hiringCycle, '2027-spring', 'hiringCycle must reach the DB write — not silently dropped');
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});

test('same email applies again once the cycle is bumped', async (t) => {
  const mock = installMock('2026');
  t.after(mock.restore);
  invalidateSettingsCache();

  await withApp(async (baseUrl) => {
    const first = await postApply(baseUrl, 'returning@example.com');
    assert.equal(first.status, 201);
    assert.equal(mock.rows[0].cycle, '2026', 'stamped with the current cycle');
  });

  // Admin bumps the hiring cycle → previous applicant can apply again.
  mock.restore();
  const mock2 = installMock('2026-autumn');
  // carry over the prior row so the unique check sees history
  mock2.rows.push({ id: 'app-prior', email: 'returning@example.com', cycle: '2026', applyingRole: 'TECHNICAL', status: 'PENDING', name: 'x' });
  t.after(mock2.restore);
  invalidateSettingsCache();

  await withApp(async (baseUrl) => {
    const second = await postApply(baseUrl, 'returning@example.com');
    assert.equal(second.status, 201, 'a new cycle lets the same email apply again');
    const fresh = mock2.rows.find((r) => r.cycle === '2026-autumn');
    assert.ok(fresh, 'new application stamped with the bumped cycle');
  });
});
