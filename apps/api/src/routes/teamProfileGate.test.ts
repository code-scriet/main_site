import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';
import { teamsRouter } from './teams.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'team-profile-gate-tests-secret';

const USER_ID = '77777777-7777-4777-8777-777777777777';
const EVENT_ID = '66666666-6666-4666-8666-666666666666';

// Fresh-OAuth shape: no academic fields.
const INCOMPLETE_USER_ROW = {
  id: USER_ID,
  name: 'Team Test User',
  email: 'team@example.com',
  role: 'USER',
  avatar: null,
  phone: null,
  course: null,
  branch: null,
  year: null,
  profileCompleted: false,
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

function mockIncompleteUser(t: { after: (fn: () => void) => void }) {
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
      if (args.where.id !== USER_ID) return null;
      if (!args.select) return { ...INCOMPLETE_USER_ROW };
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(args.select)) out[key] = (INCOMPLETE_USER_ROW as Record<string, unknown>)[key];
      return out;
    }],
  ]);
  t.after(() => {
    restore();
  });
}

function userToken() {
  return signAccessToken({
    userId: USER_ID, id: USER_ID, name: INCOMPLETE_USER_ROW.name,
    email: INCOMPLETE_USER_ROW.email, role: 'USER', tokenVersion: 0,
  });
}

test('POST /api/teams/create 400s with the profile message when academic fields are missing', async (t) => {
  mockIncompleteUser(t);
  await withApp((app) => app.use('/api/teams', teamsRouter), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teams/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: EVENT_ID, teamName: 'Alpha Team' }),
    });
    const json = await response.json();
    assert.equal(response.status, 400, `expected profile rejection: ${JSON.stringify(json)}`);
    assert.match(String(json.error?.message), /complete your profile/);
  });
});

test('POST /api/teams/join 400s with the profile message when academic fields are missing', async (t) => {
  mockIncompleteUser(t);
  await withApp((app) => app.use('/api/teams', teamsRouter), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teams/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: 'ABCDEFGH' }),
    });
    const json = await response.json();
    assert.equal(response.status, 400, `expected profile rejection: ${JSON.stringify(json)}`);
    assert.match(String(json.error?.message), /complete your profile/);
  });
});
