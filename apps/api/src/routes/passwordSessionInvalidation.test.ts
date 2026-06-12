import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import bcrypt from 'bcryptjs';
import { usersRouter } from './users.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, verifyToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'password-session-tests-secret';

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  phone: string | null;
  course: string | null;
  branch: string | null;
  year: string | null;
  profileCompleted: boolean;
  tokenVersion: number;
  isDeleted: boolean;
  password: string | null;
}

function mockUser(overrides: Partial<MockUser>): MockUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Session Test User',
    email: 'session@example.com',
    role: 'USER',
    avatar: null,
    phone: null,
    course: null,
    branch: null,
    year: null,
    profileCompleted: true,
    tokenVersion: 0,
    isDeleted: false,
    password: null,
    ...overrides,
  };
}

function pickSelect(row: MockUser, select?: Record<string, unknown>): Record<string, unknown> {
  if (!select) return { ...row };
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    result[key] = (row as unknown as Record<string, unknown>)[key];
  }
  return result;
}

function applyData(row: MockUser, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      const increment = Number((value as { increment: number }).increment);
      (row as unknown as Record<string, unknown>)[key] = Number((row as unknown as Record<string, unknown>)[key] ?? 0) + increment;
    } else {
      (row as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

function installPrismaMock(users: MockUser[]) {
  const byId = new Map(users.map((user) => [user.id, { ...user }]));
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;

  const setMethod = (target: Record<string, unknown>, key: string, value: unknown) => {
    originals.push([target, key, target[key]]);
    target[key] = value;
  };

  setMethod(userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
    const row = byId.get(args.where.id);
    return row ? pickSelect(row, args.select) : null;
  });
  setMethod(userDelegate, 'update', async (args: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, unknown> }) => {
    const row = byId.get(args.where.id);
    assert.ok(row, `Missing mocked user ${args.where.id}`);
    applyData(row, args.data);
    return pickSelect(row, args.select);
  });
  setMethod(auditDelegate, 'create', async (args: { data: Record<string, unknown> }) => ({ id: 'audit-1', ...args.data }));

  return {
    users: byId,
    restore() {
      for (const [target, key, value] of originals) {
        target[key] = value;
      }
      for (const id of byId.keys()) invalidateCachedAuthUser(id);
    },
  };
}

async function withApp(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
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

async function requestRaw(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: Record<string, unknown> } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, headers: response.headers };
}

function tokenFor(user: MockUser): string {
  return signAccessToken({
    userId: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
}

test('change-password kills the old session and hands back a working fresh token', async (t) => {
  const currentPassword = 'old-password-123';
  const user = mockUser({
    id: '00000000-0000-4000-8000-000000000111',
    email: 'change@example.com',
    password: await bcrypt.hash(currentPassword, 12),
  });
  const mock = installPrismaMock([user]);
  t.after(mock.restore);

  await withApp(async (baseUrl) => {
    const oldToken = tokenFor(user);

    const before = await requestRaw(baseUrl, '/api/users/me', { token: oldToken });
    assert.equal(before.status, 200, 'old token works before the change');

    const change = await requestRaw(baseUrl, '/api/users/me/change-password', {
      method: 'POST',
      token: oldToken,
      body: { currentPassword, newPassword: 'brand-new-password-456' },
    });
    assert.equal(change.status, 200, `change-password should succeed: ${JSON.stringify(change.json)}`);
    assert.equal(mock.users.get(user.id)?.tokenVersion, 1, 'tokenVersion bumped');

    // Fresh token returned, carries the new watermark, and is set as the session cookie.
    const freshToken = change.json?.token;
    assert.ok(typeof freshToken === 'string', 'response carries a fresh token');
    assert.equal(verifyToken(freshToken).tokenVersion, 1);
    const setCookie = change.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /scriet_session=/, 'fresh session cookie is set');

    // S6 acceptance: the old token (an attacker's stolen session) dies immediately —
    // not after the 30s auth-cache TTL.
    const stale = await requestRaw(baseUrl, '/api/users/me', { token: oldToken });
    assert.equal(stale.status, 401, 'old token must be rejected after password change');

    const fresh = await requestRaw(baseUrl, '/api/users/me', { token: freshToken });
    assert.equal(fresh.status, 200, 'fresh token keeps the current session alive');
  });
});

test('change-password with a wrong current password bumps nothing', async (t) => {
  const user = mockUser({
    id: '00000000-0000-4000-8000-000000000222',
    email: 'wrongpw@example.com',
    password: await bcrypt.hash('real-password-123', 12),
  });
  const mock = installPrismaMock([user]);
  t.after(mock.restore);

  await withApp(async (baseUrl) => {
    const token = tokenFor(user);
    const attempt = await requestRaw(baseUrl, '/api/users/me/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: 'not-the-password', newPassword: 'whatever-password-789' },
    });
    assert.equal(attempt.status, 401);
    assert.equal(mock.users.get(user.id)?.tokenVersion, 0, 'tokenVersion untouched on failure');

    const still = await requestRaw(baseUrl, '/api/users/me', { token });
    assert.equal(still.status, 200, 'session unaffected by the failed attempt');
  });
});

test('add-password (OAuth-only account) rotates the session the same way', async (t) => {
  const user = mockUser({
    id: '00000000-0000-4000-8000-000000000333',
    email: 'oauth-only@example.com',
    password: null,
  });
  const mock = installPrismaMock([user]);
  t.after(mock.restore);

  await withApp(async (baseUrl) => {
    const oldToken = tokenFor(user);

    const add = await requestRaw(baseUrl, '/api/users/me/add-password', {
      method: 'POST',
      token: oldToken,
      body: { newPassword: 'first-ever-password-123' },
    });
    assert.equal(add.status, 200, `add-password should succeed: ${JSON.stringify(add.json)}`);
    assert.equal(mock.users.get(user.id)?.tokenVersion, 1);
    assert.ok(typeof mock.users.get(user.id)?.password === 'string', 'password stored');

    const stale = await requestRaw(baseUrl, '/api/users/me', { token: oldToken });
    assert.equal(stale.status, 401, 'pre-change token rejected');

    const fresh = await requestRaw(baseUrl, '/api/users/me', { token: add.json?.token });
    assert.equal(fresh.status, 200, 'returned token authenticates');
  });
});
