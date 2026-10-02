import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { usersRouter } from './users.js';
import { authRouter } from './auth.js';
import { prisma } from '../lib/prisma.js';
import {
  consumeOAuthExchangeJti,
  getJwtSecret,
  signAccessToken,
  signOAuthExchangeCode,
  signInvitationClaimToken,
  verifyToken,
} from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'token-partitioning-tests-secret';

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
  lastLoginAt?: Date | null;
  lastLoginIp?: string | null;
}

function mockUser(overrides: Partial<MockUser>): MockUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Partition Test User',
    email: 'partition@example.com',
    role: 'USER',
    avatar: null,
    phone: null,
    course: null,
    branch: null,
    year: null,
    profileCompleted: true,
    tokenVersion: 0,
    isDeleted: false,
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

function installPrismaMock(users: MockUser[]) {
  const byId = new Map(users.map((user) => [user.id, { ...user }]));
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  const userDelegate = prisma.user as unknown as Record<string, unknown>;

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
    Object.assign(row, args.data);
    return pickSelect(row, args.select);
  });

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
  app.use('/api/auth', authRouter);
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

async function requestJson(
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
  return { status: response.status, json };
}

function signPurposeToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '20m' });
}

// ─── verifyToken purpose allowlist (S1) ─────────────────────────────────────

test('verifyToken rejects every purpose-carrying token type', () => {
  const purposes = ['attendance', 'oauth_exchange', 'invitation_claim', 'quiz_access', 'anything_future'];
  for (const purpose of purposes) {
    const token = signPurposeToken({
      userId: '00000000-0000-4000-8000-00000000000a',
      email: 'x@example.com',
      role: 'USER',
      purpose,
    });
    assert.throws(() => verifyToken(token), /cannot be used for authentication/, `purpose=${purpose} must be rejected`);
  }
});

test('verifyToken still accepts plain access tokens', () => {
  const token = signAccessToken({
    userId: '00000000-0000-4000-8000-00000000000b',
    id: '00000000-0000-4000-8000-00000000000b',
    email: 'ok@example.com',
    role: 'USER',
    tokenVersion: 0,
  });
  const decoded = verifyToken(token);
  assert.equal(decoded.userId, '00000000-0000-4000-8000-00000000000b');
});

// ─── HTTP middleware allowlist (S1) ──────────────────────────────────────────

test('special-purpose tokens get 401 from /api/users/me; access tokens pass', async (t) => {
  const user = mockUser({ id: '00000000-0000-4000-8000-000000000101', email: 'me@example.com' });
  const mock = installPrismaMock([user]);
  t.after(mock.restore);

  await withApp(async (baseUrl) => {
    const oauthCode = signOAuthExchangeCode({ userId: user.id });
    const oauthAttempt = await requestJson(baseUrl, '/api/users/me', { token: oauthCode });
    assert.equal(oauthAttempt.status, 401, 'oauth_exchange code must not work as a session token');

    const claimToken = signInvitationClaimToken({ invitationId: 'inv-1', email: user.email });
    const claimAttempt = await requestJson(baseUrl, '/api/users/me', { token: claimToken });
    assert.equal(claimAttempt.status, 401, 'invitation_claim token must not work as a session token');

    const attendanceLike = signPurposeToken({ userId: user.id, eventId: 'e', registrationId: 'r', purpose: 'attendance' });
    const attendanceAttempt = await requestJson(baseUrl, '/api/users/me', { token: attendanceLike });
    assert.equal(attendanceAttempt.status, 401, 'attendance token must not work as a session token');

    const quizAccessLike = signPurposeToken({ userId: user.id, quizId: 'q', accessRole: 'participant', purpose: 'quiz_access' });
    const quizAttempt = await requestJson(baseUrl, '/api/users/me', { token: quizAccessLike });
    assert.equal(quizAttempt.status, 401, 'quiz access token must not work as a session token');

    const accessToken = signAccessToken({
      userId: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tokenVersion: 0,
    });
    const ok = await requestJson(baseUrl, '/api/users/me', { token: accessToken });
    assert.equal(ok.status, 200, 'plain access token must keep working');
  });
});

// ─── Exchange-code single-use (S4) ───────────────────────────────────────────

test('consumeOAuthExchangeJti accepts a jti once and rejects the replay', () => {
  const jti = `test-jti-${Date.now()}`;
  assert.equal(consumeOAuthExchangeJti(jti), true);
  assert.equal(consumeOAuthExchangeJti(jti), false);
});

test('POST /api/auth/exchange-code succeeds once and 400s on replay', async (t) => {
  const user = mockUser({ id: '00000000-0000-4000-8000-000000000201', email: 'oauth@example.com' });
  const mock = installPrismaMock([user]);
  t.after(mock.restore);

  await withApp(async (baseUrl) => {
    const code = signOAuthExchangeCode({ userId: user.id });

    const first = await requestJson(baseUrl, '/api/auth/exchange-code', { method: 'POST', body: { code } });
    assert.equal(first.status, 200, `first exchange should succeed: ${JSON.stringify(first.json)}`);
    assert.ok(typeof first.json?.token === 'string', 'first exchange returns a session token');
    const sessionPayload = verifyToken(first.json.token);
    assert.equal(sessionPayload.userId, user.id);

    const replay = await requestJson(baseUrl, '/api/auth/exchange-code', { method: 'POST', body: { code } });
    assert.equal(replay.status, 400, 'replaying the same code must be rejected');
  });
});

test('exchange codes without a jti (legacy shape) are rejected', async (t) => {
  const user = mockUser({ id: '00000000-0000-4000-8000-000000000301', email: 'legacy@example.com' });
  const mock = installPrismaMock([user]);
  t.after(mock.restore);

  await withApp(async (baseUrl) => {
    const legacyCode = jwt.sign(
      { userId: user.id, purpose: 'oauth_exchange' },
      getJwtSecret(),
      { algorithm: 'HS256', expiresIn: '30s' },
    );
    const attempt = await requestJson(baseUrl, '/api/auth/exchange-code', { method: 'POST', body: { code: legacyCode } });
    assert.equal(attempt.status, 400);
  });
});
