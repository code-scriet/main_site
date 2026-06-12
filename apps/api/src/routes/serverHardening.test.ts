import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import type { Router } from 'express';
import { Prisma } from '@prisma/client';
import { hiringRouter } from './hiring.js';
import { pollsRouter } from './polls.js';
import { settingsRouter } from './settings.js';
import { notificationsRouter } from './notifications.js';
import { usersRouter } from './users.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';
import { getClientIp, getSocketClientIp, isCloudflareIp } from '../utils/clientIp.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'server-hardening-tests-secret';
process.env.SUPER_ADMIN_EMAIL = 'root@example.com';

const PRESIDENT_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: null;
  phone: string | null;
  course: string | null;
  branch: string | null;
  year: string | null;
  profileCompleted: boolean;
  tokenVersion: number;
  isDeleted: boolean;
  password?: string | null;
}

function mockUser(id: string, role: string, email: string): MockUser {
  return {
    id, role, email,
    name: `User ${role}`,
    avatar: null, phone: null, course: null, branch: null, year: null,
    profileCompleted: true, tokenVersion: 0, isDeleted: false, password: null,
  };
}

function pickSelect(row: Record<string, unknown>, select?: Record<string, unknown>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) out[key] = row[key];
  return out;
}

function setMethods(methods: Array<[Record<string, unknown>, string, unknown]>) {
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  for (const [target, key, impl] of methods) {
    originals.push([target, key, target[key]]);
    target[key] = impl;
  }
  return () => {
    for (const [target, key, value] of originals) target[key] = value;
    for (const id of [PRESIDENT_ID, ADMIN_ID, TARGET_ID]) invalidateCachedAuthUser(id);
  };
}

function tokenFor(user: MockUser): string {
  return signAccessToken({
    userId: user.id, id: user.id, name: user.name,
    email: user.email, role: user.role, tokenVersion: user.tokenVersion,
  });
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

// ─── S2: client IP resolution ────────────────────────────────────────────────

test('isCloudflareIp recognizes CF ranges and rejects others', () => {
  assert.equal(isCloudflareIp('104.16.0.1'), true);
  assert.equal(isCloudflareIp('172.64.255.255'), true);
  assert.equal(isCloudflareIp('::ffff:104.16.0.1'), true, 'v4-mapped form normalized');
  assert.equal(isCloudflareIp('2606:4700::1'), true);
  assert.equal(isCloudflareIp('9.9.9.9'), false);
  assert.equal(isCloudflareIp('2001:db8::1'), false);
  assert.equal(isCloudflareIp(''), false);
  assert.equal(isCloudflareIp('not-an-ip'), false);
});

test('getClientIp trusts CF-Connecting-IP only from a Cloudflare peer', () => {
  const fromCf = {
    ip: '104.16.1.1',
    headers: { 'cf-connecting-ip': '203.0.113.7' },
    socket: { remoteAddress: '104.16.1.1' },
  } as never;
  assert.equal(getClientIp(fromCf), '203.0.113.7', 'CF peer → header honored');

  const direct = {
    ip: '198.51.100.9',
    headers: { 'cf-connecting-ip': '203.0.113.7' },
    socket: { remoteAddress: '198.51.100.9' },
  } as never;
  assert.equal(getClientIp(direct), '198.51.100.9', 'non-CF peer → spoofed header ignored');
});

test('getSocketClientIp keys on the right-most XFF entry, never the first', () => {
  const socket = {
    handshake: {
      address: '10.0.0.1',
      headers: { 'x-forwarded-for': 'attacker-controlled, 198.51.100.42' },
    },
  } as never;
  assert.equal(getSocketClientIp(socket), '198.51.100.42');

  const spoofedThroughDirect = {
    handshake: {
      address: '10.0.0.1',
      headers: {
        'x-forwarded-for': '1.1.1.1, 198.51.100.42',
        'cf-connecting-ip': '203.0.113.7',
      },
    },
  } as never;
  assert.equal(
    getSocketClientIp(spoofedThroughDirect),
    '198.51.100.42',
    'CF header ignored when the proxied peer is not a CF range',
  );

  const throughCf = {
    handshake: {
      address: '10.0.0.1',
      headers: {
        'x-forwarded-for': 'whatever, 104.16.9.9',
        'cf-connecting-ip': '203.0.113.7',
      },
    },
  } as never;
  assert.equal(getSocketClientIp(throughCf), '203.0.113.7', 'CF peer → real client IP from CF header');
});

// ─── S10: per-route rate limits ──────────────────────────────────────────────

test('POST /api/hiring/apply returns 429 after 15 attempts from one IP', async () => {
  await withApp((app) => app.use('/api/hiring', hiringRouter as Router), async (baseUrl) => {
    let lastStatus = 0;
    for (let i = 0; i < 16; i++) {
      const response = await fetch(`${baseUrl}/api/hiring/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // invalid payload → 400 pre-DB, still counted
      });
      lastStatus = response.status;
      if (i < 15) assert.equal(response.status, 400, `attempt ${i + 1} passes the limiter`);
    }
    assert.equal(lastStatus, 429, '16th attempt rate-limited');
  });
});

test('POST /api/polls/:id/vote returns 429 after 60 attempts from one IP', async () => {
  await withApp((app) => app.use('/api/polls', pollsRouter as Router), async (baseUrl) => {
    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const response = await fetch(`${baseUrl}/api/polls/some-poll/vote`, { method: 'POST' });
      lastStatus = response.status;
      if (i < 60) assert.equal(response.status, 401, `attempt ${i + 1} reaches auth (counted by limiter)`);
    }
    assert.equal(lastStatus, 429, '61st attempt rate-limited');
  });
});

// ─── S9: settings reset preserves the security env ───────────────────────────

test('POST /api/settings/reset carries attendanceJwtSecret + indexNowKey across', async (t) => {
  const president = mockUser(PRESIDENT_ID, 'PRESIDENT', 'president@example.com');
  let createdWith: Record<string, unknown> | null = null;

  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const settingsDelegate = prisma.settings as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === PRESIDENT_ID ? pickSelect(president as never, args.select) : null)],
    [settingsDelegate, 'findUnique', async () => ({
      attendanceJwtSecret: 'precious-runtime-secret',
      indexNowKey: 'indexnow-key-123',
    })],
    [settingsDelegate, 'delete', async () => ({})],
    [settingsDelegate, 'create', async (args: { data: Record<string, unknown> }) => {
      createdWith = args.data;
      return { id: 'default', ...args.data };
    }],
    [auditDelegate, 'create', async (args: { data: Record<string, unknown> }) => ({ id: 'a', ...args.data })],
  ]);
  t.after(restore);

  await withApp((app) => app.use('/api/settings', settingsRouter as Router), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/settings/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor(president)}` },
    });
    assert.equal(response.status, 200);
    assert.ok(createdWith, 'settings.create called');
    assert.equal(createdWith.attendanceJwtSecret, 'precious-runtime-secret');
    assert.equal(createdWith.indexNowKey, 'indexnow-key-123');
  });
});

// ─── Minor: broadcast delete 404s on already-deleted rows ────────────────────

test('DELETE /api/notifications/admin/broadcasts/:id returns 404 on P2025', async (t) => {
  const admin = mockUser(ADMIN_ID, 'ADMIN', 'admin@example.com');
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const feedDelegate = prisma.notificationFeed as unknown as Record<string, unknown>;
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === ADMIN_ID ? pickSelect(admin as never, args.select) : null)],
    [feedDelegate, 'delete', async () => {
      throw new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      });
    }],
  ]);
  t.after(restore);

  await withApp((app) => app.use('/api/notifications', notificationsRouter as Router), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications/admin/broadcasts/44444444-4444-4444-8444-444444444444`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenFor(admin)}` },
    });
    assert.equal(response.status, 404, 'already-deleted broadcast is a 404, not 500');
  });
});

// ─── S6 follow-up: admin-set password bumps the target's tokenVersion ────────

test('admin PUT /users/:id with a password increments the target tokenVersion', async (t) => {
  const president = mockUser(PRESIDENT_ID, 'PRESIDENT', 'president@example.com');
  const target = { ...mockUser(TARGET_ID, 'USER', 'target@example.com') };

  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
      const row = args.where.id === PRESIDENT_ID ? president : args.where.id === TARGET_ID ? target : null;
      return row ? pickSelect(row as never, args.select) : null;
    }],
    [userDelegate, 'update', async (args: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, unknown> }) => {
      assert.equal(args.where.id, TARGET_ID);
      for (const [key, value] of Object.entries(args.data)) {
        if (value && typeof value === 'object' && 'increment' in (value as object)) {
          (target as Record<string, unknown>)[key] =
            Number((target as Record<string, unknown>)[key] ?? 0) + Number((value as { increment: number }).increment);
        } else {
          (target as Record<string, unknown>)[key] = value;
        }
      }
      return pickSelect(target as never, args.select);
    }],
    [auditDelegate, 'create', async (args: { data: Record<string, unknown> }) => ({ id: 'a', ...args.data })],
  ]);
  t.after(restore);

  await withApp((app) => app.use('/api/users', usersRouter as Router), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/users/${TARGET_ID}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokenFor(president)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: 'admin-set-password-123' }),
    });
    assert.equal(response.status, 200, 'admin update succeeds');
    assert.equal(target.tokenVersion, 1, 'tokenVersion bumped — old sessions die');
    assert.ok(typeof target.password === 'string' && target.password.startsWith('$2'), 'password hashed');
  });
});
