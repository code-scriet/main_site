import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { usersRouter } from './users.js';
import { authRouter } from './auth.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { hashPasswordResetToken } from '../utils/passwordReset.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'route-lifecycle-tests-secret';
process.env.SUPER_ADMIN_EMAIL = 'root@example.com';

type Role = 'USER' | 'MEMBER' | 'CORE_MEMBER' | 'ADMIN' | 'PRESIDENT' | 'NETWORK';

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string | null;
  phone: string | null;
  course: string | null;
  branch: string | null;
  year: string | null;
  profileCompleted: boolean;
  tokenVersion: number;
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  password?: string | null;
  passwordResetToken?: string | null;
  passwordResetExpiresAt?: Date | null;
}

interface MockBlock {
  userId: string;
  feature: string;
  reason: string | null;
  expiresAt: Date | null;
  blockedBy: string | null;
  blockedAt?: Date;
}

interface MockInstallOptions {
  users: MockUser[];
  blocks?: MockBlock[];
  blockers?: {
    ledTeams?: number;
    announcements?: number;
    events?: number;
    invitations?: number;
    polls?: number;
    problems?: number;
    ledTeamsSample?: Array<{ teamName: string; event: { title: string } }>;
  };
}

function mockUser(overrides: Partial<MockUser>): MockUser {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'user@example.com',
    role: 'USER',
    avatar: null,
    phone: null,
    course: null,
    branch: null,
    year: null,
    profileCompleted: true,
    tokenVersion: 0,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    password: null,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
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

function installPrismaMock(options: MockInstallOptions) {
  const users = new Map(options.users.map((user) => [user.id, { ...user }]));
  const blocks = [...(options.blocks ?? [])];
  const auditRows: Array<Record<string, unknown>> = [];
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];

  const setMethod = (target: Record<string, unknown>, key: string, value: unknown) => {
    originals.push([target, key, target[key]]);
    target[key] = value;
  };

  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const userBlockDelegate = prisma.userBlock as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;
  const blockers = options.blockers ?? {};

  const tx = {
    user: {
      update: async (args: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, unknown> }) => {
        const row = users.get(args.where.id);
        assert.ok(row, `Missing mocked user ${args.where.id}`);
        applyData(row, args.data);
        return pickSelect(row, args.select);
      },
    },
    userBlock: {
      upsert: async (args: {
        where: { userId_feature: { userId: string; feature: string } };
        create: MockBlock;
        update: Partial<MockBlock>;
      }) => {
        const { userId, feature } = args.where.userId_feature;
        const existing = blocks.find((block) => block.userId === userId && block.feature === feature);
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        blocks.push({ ...args.create, blockedAt: new Date() });
        return args.create;
      },
      deleteMany: async (args: { where: { userId: string; reason?: string } }) => {
        const before = blocks.length;
        for (let index = blocks.length - 1; index >= 0; index -= 1) {
          const block = blocks[index];
          if (block.userId === args.where.userId && (args.where.reason === undefined || block.reason === args.where.reason)) {
            blocks.splice(index, 1);
          }
        }
        return { count: before - blocks.length };
      },
    },
  };

  setMethod(userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
    const row = users.get(args.where.id);
    return row ? pickSelect(row, args.select) : null;
  });
  setMethod(userDelegate, 'findFirst', async (args: { where: { email?: { equals: string; mode?: string } }; select?: Record<string, unknown> }) => {
    const email = args.where.email?.equals;
    const row = [...users.values()].find((user) => user.email.toLowerCase() === email?.toLowerCase());
    return row ? pickSelect(row, args.select) : null;
  });
  setMethod(userDelegate, 'update', tx.user.update);
  setMethod(userDelegate, 'delete', async (args: { where: { id: string } }) => {
    const row = users.get(args.where.id);
    users.delete(args.where.id);
    return row ?? null;
  });
  setMethod(userDelegate, 'updateMany', async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const id = args.where.id as string;
    const row = users.get(id);
    const expectedToken = args.where.passwordResetToken as string | undefined;
    const expiresAt = row?.passwordResetExpiresAt;
    const minExpiry = (args.where.passwordResetExpiresAt as { gte?: Date } | undefined)?.gte;
    const matches =
      row &&
      row.passwordResetToken === expectedToken &&
      expiresAt &&
      minExpiry &&
      expiresAt.getTime() >= minExpiry.getTime();

    if (!matches) return { count: 0 };
    applyData(row, args.data);
    return { count: 1 };
  });
  setMethod(userBlockDelegate, 'findMany', async (args: { where: { userId: string }; select?: Record<string, unknown> }) =>
    blocks
      .filter((block) => block.userId === args.where.userId)
      .map((block) => {
        if (!args.select) return { ...block };
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(args.select)) selected[key] = (block as unknown as Record<string, unknown>)[key];
        return selected;
      }),
  );
  setMethod(userBlockDelegate, 'upsert', tx.userBlock.upsert);
  setMethod(userBlockDelegate, 'deleteMany', tx.userBlock.deleteMany);
  setMethod(auditDelegate, 'create', async (args: { data: Record<string, unknown> }) => {
    auditRows.push(args.data);
    return args.data;
  });

  const countDelegate = (count: number) => ({ count: async () => count });
  setMethod(prisma.eventTeam as unknown as Record<string, unknown>, 'count', async () => blockers.ledTeams ?? 0);
  setMethod(prisma.announcement as unknown as Record<string, unknown>, 'count', async () => blockers.announcements ?? 0);
  setMethod(prisma.event as unknown as Record<string, unknown>, 'count', async () => blockers.events ?? 0);
  setMethod(prisma.eventInvitation as unknown as Record<string, unknown>, 'count', async () => blockers.invitations ?? 0);
  setMethod(prisma.poll as unknown as Record<string, unknown>, 'count', async () => blockers.polls ?? 0);
  setMethod(prisma.problem as unknown as Record<string, unknown>, 'count', countDelegate(blockers.problems ?? 0).count);
  setMethod(prisma.eventTeam as unknown as Record<string, unknown>, 'findMany', async () => blockers.ledTeamsSample ?? []);
  setMethod(prisma as unknown as Record<string, unknown>, '$transaction', async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    assert.equal(typeof arg, 'function');
    return (arg as (delegate: typeof tx) => unknown)(tx);
  });

  return {
    users,
    blocks,
    auditRows,
    restore: () => {
      for (const [target, key, value] of originals.reverse()) {
        target[key] = value;
      }
    },
  };
}

function authToken(user: MockUser) {
  return signAccessToken({
    id: user.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
}

async function withApp(router: 'users' | 'auth', run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(router === 'users' ? '/users' : '/auth', router === 'users' ? usersRouter : authRouter);
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
  options: { method: string; token?: string; body?: Record<string, unknown> },
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, json };
}

test('soft-delete disables a user and restore removes the auto-blocks', async (t) => {
  const actor = mockUser({ id: 'admin-1', name: 'Root Admin', email: 'root@example.com', role: 'PRESIDENT' });
  const target = mockUser({ id: 'user-1', role: 'USER' });
  const mock = installPrismaMock({
    users: [actor, target],
    blocks: [{ userId: target.id, feature: 'QUIZ', reason: 'Manual quiz block', expiresAt: null, blockedBy: actor.id }],
  });
  t.after(mock.restore);

  await withApp('users', async (baseUrl) => {
    const token = authToken(actor);
    const deleted = await requestJson(baseUrl, `/users/${target.id}`, { method: 'DELETE', token });
    assert.equal(deleted.status, 200);
    assert.equal(mock.users.get(target.id)?.isDeleted, true);
    assert.equal(mock.users.get(target.id)?.tokenVersion, 1);
    assert.equal(mock.blocks.filter((block) => block.userId === target.id && block.reason === 'Auto-block on soft-delete').length, 5);

    const restored = await requestJson(baseUrl, `/users/${target.id}/restore`, { method: 'POST', token });
    assert.equal(restored.status, 200);
    assert.equal(mock.users.get(target.id)?.isDeleted, false);
    assert.equal(mock.blocks.some((block) => block.userId === target.id && block.reason === 'Auto-block on soft-delete'), false);
  });
});

test('force-logout increments tokenVersion and audits the action', async (t) => {
  const actor = mockUser({ id: 'admin-1', name: 'Root Admin', email: 'root@example.com', role: 'PRESIDENT' });
  const target = mockUser({ id: 'user-1', role: 'USER', tokenVersion: 4 });
  const mock = installPrismaMock({ users: [actor, target] });
  t.after(mock.restore);

  await withApp('users', async (baseUrl) => {
    const result = await requestJson(baseUrl, `/users/${target.id}/force-logout`, { method: 'POST', token: authToken(actor) });
    assert.equal(result.status, 200);
    assert.equal(mock.users.get(target.id)?.tokenVersion, 5);
    assert.equal(mock.auditRows.some((row) => row.action === 'FORCE_LOGOUT'), true);
  });
});

test('hard-delete returns a blocker report before touching FK-owned users', async (t) => {
  const actor = mockUser({ id: 'admin-1', name: 'Root Admin', email: 'root@example.com', role: 'PRESIDENT' });
  const target = mockUser({ id: 'user-1', role: 'USER' });
  const mock = installPrismaMock({
    users: [actor, target],
    blockers: {
      ledTeams: 1,
      events: 1,
      ledTeamsSample: [{ teamName: 'Algo Leads', event: { title: 'Code Sprint' } }],
    },
  });
  t.after(mock.restore);

  await withApp('users', async (baseUrl) => {
    const result = await requestJson(baseUrl, `/users/${target.id}?hard=true`, { method: 'DELETE', token: authToken(actor) });
    assert.equal(result.status, 409);
    assert.equal(result.json.error.code, 'HARD_DELETE_BLOCKED');
    assert.equal(result.json.error.blockers.ledTeams, 1);
    assert.equal(result.json.error.blockers.events, 1);
    assert.equal(mock.users.has(target.id), true);
  });
});

test('password reset token can be consumed only once under a race', async (t) => {
  const rawToken = 'a'.repeat(64);
  const target = mockUser({
    id: 'user-1',
    email: 'reset@example.com',
    password: 'old-password-hash',
    passwordResetToken: hashPasswordResetToken(rawToken),
    passwordResetExpiresAt: new Date(Date.now() + 60_000),
    tokenVersion: 2,
  });
  const mock = installPrismaMock({ users: [target] });
  t.after(mock.restore);

  await withApp('auth', async (baseUrl) => {
    const body = { email: 'RESET@example.com', token: rawToken, newPassword: 'new-password-123' };
    const results = await Promise.all([
      requestJson(baseUrl, '/auth/reset-password', { method: 'POST', body }),
      requestJson(baseUrl, '/auth/reset-password', { method: 'POST', body }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
    assert.equal(mock.users.get(target.id)?.passwordResetToken, null);
    assert.equal(mock.users.get(target.id)?.passwordResetExpiresAt, null);
    assert.equal(mock.users.get(target.id)?.tokenVersion, 3);
    assert.notEqual(mock.users.get(target.id)?.password, 'old-password-hash');
  });
});
