import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { Prisma } from '@prisma/client';
import { qotdRouter } from './qotd.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'qotd-create-tests-secret';
process.env.SUPER_ADMIN_EMAIL = 'root@example.com';

const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const CORE_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const PROBLEM_UUID = '123e4567-e89b-12d3-a456-426614174000';

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

function tokenFor(user: MockUser): string {
  return signAccessToken({
    userId: user.id, id: user.id, name: user.name,
    email: user.email, role: user.role, tokenVersion: user.tokenVersion,
  });
}

function setMethods(methods: Array<[Record<string, unknown>, string, unknown]>) {
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  for (const [target, key, impl] of methods) {
    originals.push([target, key, target[key]]);
    target[key] = impl;
  }
  return () => {
    for (const [target, key, value] of originals) target[key] = value;
    invalidateCachedAuthUser(ADMIN_ID);
    invalidateCachedAuthUser(CORE_MEMBER_ID);
  };
}

async function withApp(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/qotd', qotdRouter);
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

const adminUser = mockUser(ADMIN_ID, 'ADMIN', 'admin@example.com');
const coreMemberUser = mockUser(CORE_MEMBER_ID, 'CORE_MEMBER', 'core@example.com');

const mockProblem = {
  id: PROBLEM_UUID,
  slug: 'evaluate-reverse-polish-notation',
  title: 'Evaluate Reverse Polish Notation',
  difficulty: 'MEDIUM',
  isPublished: true,
};

const mockUnpublishedProblem = {
  id: PROBLEM_UUID,
  slug: 'evaluate-reverse-polish-notation',
  title: 'Evaluate Reverse Polish Notation',
  difficulty: 'MEDIUM',
  isPublished: false,
};

const futureDate = (offsetDays: number): string => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// ── Helpers to call /api/qotd POST

async function createQotd(baseUrl: string, token: string, body: object): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/api/qotd`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsedBody: unknown;
  try { parsedBody = await response.json(); } catch { parsedBody = null; }
  return { status: response.status, body: parsedBody };
}

// ─── Tests

test('POST /api/qotd rejects ambiguous slash-format date with 400', async (t) => {
  const adminToken = tokenFor(adminUser);
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === ADMIN_ID ? pickSelect(adminUser as never, args.select) : null)],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const { status, body } = await createQotd(baseUrl, adminToken, {
      date: '01/10/2026', // ambiguous MM/DD vs DD/MM — must be rejected
      problemId: PROBLEM_UUID,
      publishTime: '00:00',
    });
    assert.equal(status, 400, 'slash-format date → 400 (not 500)');
    const err = body as { error?: { message?: string } };
    assert.ok(err.error?.message?.includes('date must be YYYY-MM-DD'), `expected YYYY-MM-DD hint, got: ${err.error?.message}`);
  });
});

test('POST /api/qotd returns 409 when a QOTD already exists for that date', async (t) => {
  const adminToken = tokenFor(adminUser);
  const date = futureDate(30);
  const problemDelegate = prisma.problem as unknown as Record<string, unknown>;
  const qotdDelegate = prisma.qOTD as unknown as Record<string, unknown>;
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;

  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === ADMIN_ID ? pickSelect(adminUser as never, args.select) : null)],
    [problemDelegate, 'findUnique', async () => ({ ...mockProblem })],
    // Simulate existing QOTD for this date → duplicate check finds it
    [qotdDelegate, 'findUnique', async ({ where: { date } }: { where: { date: Date } }) => ({
      id: 'existing-qotd-id',
      date,
    })],
    [auditDelegate, 'create', async () => ({ id: 'audit-1' })],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const { status, body } = await createQotd(baseUrl, adminToken, {
      date,
      problemId: PROBLEM_UUID,
      publishTime: '00:00',
    });
    assert.equal(status, 409, 'duplicate date → 409 Conflict');
    const err = body as { error?: { message?: string } };
    assert.ok(err.error?.message?.includes('already exists'), `expected "already exists" message, got: ${err.error?.message}`);
  });
});

test('POST /api/qotd returns 400 when the problem is not published', async (t) => {
  const adminToken = tokenFor(adminUser);
  const date = futureDate(30);
  const problemDelegate = prisma.problem as unknown as Record<string, unknown>;
  const userDelegate = prisma.user as unknown as Record<string, unknown>;

  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === ADMIN_ID ? pickSelect(adminUser as never, args.select) : null)],
    [problemDelegate, 'findUnique', async () => ({ ...mockUnpublishedProblem })],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const { status, body } = await createQotd(baseUrl, adminToken, {
      date,
      problemId: PROBLEM_UUID,
      publishTime: '00:00',
    });
    assert.equal(status, 400, 'unpublished problem → 400');
    const err = body as { error?: { message?: string } };
    assert.ok(err.error?.message?.includes('not published'), `expected "not published" message, got: ${err.error?.message}`);
  });
});

test('POST /api/qotd returns 404 when the problem does not exist', async (t) => {
  const adminToken = tokenFor(adminUser);
  const date = futureDate(30);
  const problemDelegate = prisma.problem as unknown as Record<string, unknown>;
  const userDelegate = prisma.user as unknown as Record<string, unknown>;

  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === ADMIN_ID ? pickSelect(adminUser as never, args.select) : null)],
    [problemDelegate, 'findUnique', async () => null],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const { status, body } = await createQotd(baseUrl, adminToken, {
      date,
      problemId: PROBLEM_UUID,
      publishTime: '00:00',
    });
    assert.equal(status, 404, 'non-existent problem → 404');
    const err = body as { error?: { message?: string } };
    assert.ok(err.error?.message?.includes('not found'), `expected "not found" message, got: ${err.error?.message}`);
  });
});

test('POST /api/qotd creates a scheduled QOTD (201) for a future date with valid inputs', async (t) => {
  const adminToken = tokenFor(adminUser);
  const date = futureDate(30);
  const createdQotd = {
    id: 'new-qotd-id-0000-0000-0000-000000000001',
    question: 'Evaluate Reverse Polish Notation',
    difficulty: 'MEDIUM',
    problemLink: `https://codescriet.dev/qotd/${date}`,
    problemId: PROBLEM_UUID,
    date: new Date(`${date}T00:00:00.000Z`),
    createdById: ADMIN_ID,
    isPublished: false,
    publishAt: new Date(`${date}T00:00:00+05:30`),
    publishedAt: null,
    problem: { ...mockProblem },
  };

  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const problemDelegate = prisma.problem as unknown as Record<string, unknown>;
  const qotdDelegate = prisma.qOTD as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;

  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === ADMIN_ID ? pickSelect(adminUser as never, args.select) : null)],
    [problemDelegate, 'findUnique', async () => ({ ...mockProblem })],
    [qotdDelegate, 'findUnique', async () => null], // no existing QOTD for this date
    [qotdDelegate, 'create', async () => ({ ...createdQotd })],
    [auditDelegate, 'create', async () => ({ id: 'audit-1' })],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const { status, body } = await createQotd(baseUrl, adminToken, {
      date,
      problemId: PROBLEM_UUID,
      publishTime: '00:00',
    });
    assert.equal(status, 201, 'scheduled QOTD → 201');
    const resp = body as { success?: boolean; data?: { isPublished: boolean; publishAt: string } };
    assert.equal(resp.success, true);
    assert.equal(resp.data?.isPublished, false, 'QOTD should be scheduled, not published');
  });
});

test('POST /api/qotd lets a CORE_MEMBER propose (not publish) with a valid future date', async (t) => {
  const coreToken = tokenFor(coreMemberUser);
  const date = futureDate(30);
  const createdQotd = {
    id: 'proposed-qotd-id-0000-0000-0000-000000000002',
    question: 'Evaluate Reverse Polish Notation',
    difficulty: 'MEDIUM',
    problemLink: `https://codescriet.dev/qotd/${date}`,
    problemId: PROBLEM_UUID,
    date: new Date(`${date}T00:00:00.000Z`),
    createdById: CORE_MEMBER_ID,
    isPublished: false,
    publishAt: null, // CORE_MEMBER proposals are unscheduled drafts
    publishedAt: null,
    problem: { ...mockProblem },
  };

  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const problemDelegate = prisma.problem as unknown as Record<string, unknown>;
  const qotdDelegate = prisma.qOTD as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;

  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === CORE_MEMBER_ID ? pickSelect(coreMemberUser as never, args.select) : null)],
    [problemDelegate, 'findUnique', async () => ({ ...mockProblem })],
    [qotdDelegate, 'findUnique', async () => null],
    [qotdDelegate, 'create', async () => ({ ...createdQotd })],
    [auditDelegate, 'create', async () => ({ id: 'audit-2' })],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const { status, body } = await createQotd(baseUrl, coreToken, {
      date,
      problemId: PROBLEM_UUID,
      publishTime: '00:00',
    });
    assert.equal(status, 201, 'CORE_MEMBER proposal → 201');
    const resp = body as { success?: boolean; data?: { isPublished: boolean; publishAt: string | null }; message?: string };
    assert.equal(resp.success, true);
    assert.equal(resp.data?.isPublished, false, 'CORE_MEMBER proposal is never published');
  });
});

test('POST /api/qotd surface P2002 race as 409 even if pre-check was bypassed', async (t) => {
  const adminToken = tokenFor(adminUser);
  const date = futureDate(30);
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const problemDelegate = prisma.problem as unknown as Record<string, unknown>;
  const qotdDelegate = prisma.qOTD as unknown as Record<string, unknown>;
  const auditDelegate = prisma.auditLog as unknown as Record<string, unknown>;

  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
      (args.where.id === ADMIN_ID ? pickSelect(adminUser as never, args.select) : null)],
    [problemDelegate, 'findUnique', async () => ({ ...mockProblem })],
    // Pre-check returns null (no existing), simulating a race where another
    // request inserts the same date between the check and the create.
    [qotdDelegate, 'findUnique', async () => null],
    [qotdDelegate, 'create', async () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    }],
    [auditDelegate, 'create', async () => ({ id: 'audit-3' })],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const { status, body } = await createQotd(baseUrl, adminToken, {
      date,
      problemId: PROBLEM_UUID,
      publishTime: '00:00',
    });
    assert.equal(status, 409, 'P2002 race → 409 Conflict (not 500)');
    const err = body as { error?: { message?: string } };
    assert.ok(err.error?.message?.includes('already exists'), `expected "already exists" message, got: ${err.error?.message}`);
  });
});
