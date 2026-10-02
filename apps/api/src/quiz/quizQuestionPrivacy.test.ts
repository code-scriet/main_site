import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { quizRouter } from './quizRouter.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'quiz-question-privacy-tests-secret';

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = '22222222-2222-4222-8222-222222222222';
const PLAYER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: null;
  phone: null;
  course: null;
  branch: null;
  year: null;
  profileCompleted: boolean;
  tokenVersion: number;
  isDeleted: boolean;
}

function mockUser(id: string, role: string, email: string): MockUser {
  return {
    id,
    name: `User ${role}`,
    email,
    role,
    avatar: null,
    phone: null,
    course: null,
    branch: null,
    year: null,
    profileCompleted: true,
    tokenVersion: 0,
    isDeleted: false,
  };
}

const USERS = new Map<string, MockUser>([
  [CREATOR_ID, mockUser(CREATOR_ID, 'MEMBER', 'creator@example.com')],
  [PLAYER_ID, mockUser(PLAYER_ID, 'USER', 'player@example.com')],
  [ADMIN_ID, mockUser(ADMIN_ID, 'ADMIN', 'admin@example.com')],
]);

function quizRow(status: string) {
  return {
    id: QUIZ_ID,
    title: 'Privacy Quiz',
    description: null,
    status,
    questionCount: 2,
    createdBy: CREATOR_ID,
    createdAt: new Date(),
    startedAt: null,
    endedAt: null,
    creator: { id: CREATOR_ID, name: 'Creator' },
    _count: { participants: 5 },
    questions: [
      {
        id: 'q1',
        position: 1,
        questionText: 'Secret question one?',
        questionType: 'MCQ',
        options: ['a', 'b'],
        correctAnswer: 'a',
        timeLimitSeconds: 20,
        points: 100,
        mediaUrl: null,
      },
      {
        id: 'q2',
        position: 2,
        questionText: 'Secret question two?',
        questionType: 'MCQ',
        options: ['c', 'd'],
        correctAnswer: 'd',
        timeLimitSeconds: 20,
        points: 100,
        mediaUrl: null,
      },
    ],
  };
}

function installMocks(status: string) {
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const quizDelegate = prisma.quiz as unknown as Record<string, unknown>;
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  const setMethod = (target: Record<string, unknown>, key: string, value: unknown) => {
    originals.push([target, key, target[key]]);
    target[key] = value;
  };

  setMethod(userDelegate, 'findUnique', async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
    const row = USERS.get(args.where.id);
    if (!row) return null;
    if (!args.select) return { ...row };
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(args.select)) out[key] = (row as unknown as Record<string, unknown>)[key];
    return out;
  });
  setMethod(quizDelegate, 'findUnique', async () => quizRow(status));

  return () => {
    for (const [target, key, value] of originals) target[key] = value;
    for (const id of USERS.keys()) invalidateCachedAuthUser(id);
  };
}

async function withApp(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/quiz', quizRouter);
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

function tokenFor(id: string): string {
  const user = USERS.get(id)!;
  return signAccessToken({
    userId: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tokenVersion: 0,
  });
}

async function fetchQuiz(baseUrl: string, asUserId: string) {
  const response = await fetch(`${baseUrl}/api/quiz/${QUIZ_ID}`, {
    headers: { Authorization: `Bearer ${tokenFor(asUserId)}` },
  });
  const json = await response.json();
  return { status: response.status, data: json.data };
}

for (const liveStatus of ['WAITING', 'ACTIVE', 'DRAFT']) {
  test(`participant gets questions: [] while quiz is ${liveStatus}`, async (t) => {
    const restore = installMocks(liveStatus);
    t.after(restore);

    await withApp(async (baseUrl) => {
      const result = await fetchQuiz(baseUrl, PLAYER_ID);
      assert.equal(result.status, 200);
      assert.deepEqual(result.data.questions, [], `questions must be hidden during ${liveStatus}`);
      assert.equal(result.data.questionCount, 2, 'count metadata stays visible');
      assert.equal(result.data.title, 'Privacy Quiz');
    });
  });
}

test('creator sees full questions (with answers) while quiz is ACTIVE', async (t) => {
  const restore = installMocks('ACTIVE');
  t.after(restore);

  await withApp(async (baseUrl) => {
    const result = await fetchQuiz(baseUrl, CREATOR_ID);
    assert.equal(result.status, 200);
    assert.equal(result.data.questions.length, 2);
    assert.equal(result.data.questions[0].correctAnswer, 'a');
  });
});

test('platform admin (non-creator) sees full questions while quiz is ACTIVE', async (t) => {
  const restore = installMocks('ACTIVE');
  t.after(restore);

  await withApp(async (baseUrl) => {
    const result = await fetchQuiz(baseUrl, ADMIN_ID);
    assert.equal(result.status, 200);
    assert.equal(result.data.questions.length, 2);
    assert.equal(result.data.questions[1].correctAnswer, 'd');
  });
});

test('participant sees questions with answers once FINISHED', async (t) => {
  const restore = installMocks('FINISHED');
  t.after(restore);

  await withApp(async (baseUrl) => {
    const result = await fetchQuiz(baseUrl, PLAYER_ID);
    assert.equal(result.status, 200);
    assert.equal(result.data.questions.length, 2);
    assert.equal(result.data.questions[0].correctAnswer, 'a', 'FINISHED quizzes reveal answers (review mode)');
  });
});

test('participant sees questions without answers when ABANDONED', async (t) => {
  const restore = installMocks('ABANDONED');
  t.after(restore);

  await withApp(async (baseUrl) => {
    const result = await fetchQuiz(baseUrl, PLAYER_ID);
    assert.equal(result.status, 200);
    assert.equal(result.data.questions.length, 2);
    assert.equal(result.data.questions[0].correctAnswer, undefined, 'ABANDONED keeps answers redacted');
  });
});
