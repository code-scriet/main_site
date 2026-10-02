import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import ExcelJS from 'exceljs';
import { usersRouter } from './users.js';
import { quizRouter } from '../quiz/quizRouter.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'exports-hardening-tests-secret';

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const QUIZ_ID = '88888888-8888-4888-8888-888888888888';

const ADMIN_ROW = {
  id: ADMIN_ID,
  name: 'Export Admin',
  email: 'export-admin@example.com',
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

function adminToken(): string {
  return signAccessToken({
    userId: ADMIN_ID,
    id: ADMIN_ID,
    name: ADMIN_ROW.name,
    email: ADMIN_ROW.email,
    role: 'ADMIN',
    tokenVersion: 0,
  });
}

function setMethods(
  methods: Array<[Record<string, unknown>, string, unknown]>,
): () => void {
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  for (const [target, key, impl] of methods) {
    originals.push([target, key, target[key]]);
    target[key] = impl;
  }
  return () => {
    for (const [target, key, value] of originals) target[key] = value;
    invalidateCachedAuthUser(ADMIN_ID);
  };
}

async function withApp(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
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

async function downloadWorkbook(baseUrl: string, path: string): Promise<ExcelJS.Workbook> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  assert.equal(response.status, 200, `expected 200 from ${path}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.ok(buffer.length > 0, 'response body must not be empty');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

// ─── C1: users export must contain EVERY user, not the 100 newest ───────────

test('users export cursor-batches the whole table (1234 users, 3 batches)', async (t) => {
  const TOTAL_USERS = 1234;
  const allUsers = Array.from({ length: TOTAL_USERS }, (_, i) => ({
    id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    role: i === 0 ? 'ADMIN' : i % 7 === 0 ? 'CORE_MEMBER' : 'USER',
    phone: null,
    course: null,
    branch: null,
    year: null,
    profileCompleted: i % 2 === 0,
    oauthProvider: null,
    githubUrl: null,
    linkedinUrl: null,
    // Groups of 100 share a createdAt (bulk-import shape) so pagination must
    // lean on the id tiebreaker — ties straddle batch boundaries at 500/1000.
    createdAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 100) * 60_000),
  }));
  // Newest-first like the handler's orderBy: [createdAt desc, id desc]
  const sorted = [...allUsers].sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

  let findManyCalls = 0;
  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string } }) =>
      (args.where.id === ADMIN_ID ? { ...ADMIN_ROW } : null)],
    [userDelegate, 'findMany', async (args: { take: number; cursor?: { id: string }; skip?: number }) => {
      findManyCalls += 1;
      let start = 0;
      if (args.cursor) {
        const at = sorted.findIndex((u) => u.id === args.cursor!.id);
        assert.ok(at >= 0, 'cursor must reference a previously returned row');
        start = at + (args.skip ?? 0);
      }
      return sorted.slice(start, start + args.take).map((u) => ({
        ...u,
        _count: { registrations: 0, qotdSubmissions: 0 },
      }));
    }],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const workbook = await downloadWorkbook(baseUrl, '/api/users/export');
    const usersSheet = workbook.getWorksheet('Users');
    assert.ok(usersSheet, 'Users sheet exists');
    assert.equal(usersSheet.rowCount - 1, TOTAL_USERS, 'every user row exported (header excluded)');
    assert.ok(findManyCalls >= 3, `expected >= 3 cursor batches, saw ${findManyCalls}`);
    // No row skipped or duplicated across batch boundaries despite createdAt ties
    const exportedEmails = new Set<string>();
    usersSheet.eachRow((row, n) => {
      if (n > 1) exportedEmails.add(String(row.getCell(3).value));
    });
    assert.equal(exportedEmails.size, TOTAL_USERS, 'all emails distinct — no duplicates from cursor ties');

    const summary = workbook.getWorksheet('Summary');
    assert.ok(summary, 'Summary sheet exists');
    assert.equal(summary.getRow(1).getCell(2).value, TOTAL_USERS, 'summary Total Users covers the full table');
  });
});

// ─── B6: streamed quiz export is a valid workbook with equivalent content ────

test('quiz export streams a valid 5-sheet workbook equivalent to the buffered one', async (t) => {
  const questions = [
    {
      id: 'q-1',
      position: 0,
      questionText: 'What is 2+2?',
      questionType: 'MCQ',
      options: ['3', '4'],
      correctAnswer: '4',
      timeLimitSeconds: 20,
      points: 100,
      totalAnswers: 3,
      correctCount: 2,
      avgAnswerTimeMs: 4200,
      answerDistribution: { '4': 2, '3': 1 },
    },
    {
      id: 'q-2',
      position: 1,
      questionText: 'Rate the event',
      questionType: 'RATING',
      options: null,
      correctAnswer: null,
      timeLimitSeconds: 15,
      points: 0,
      totalAnswers: 2,
      correctCount: 0,
      avgAnswerTimeMs: 3000,
      answerDistribution: { '5': 1, '4': 1 },
    },
  ];
  const participants = [
    { userId: 'u-1', displayName: 'Alpha', finalScore: 230, finalRank: 1, correctCount: 1, totalAnswerTimeMs: BigInt(5000), questionsAnswered: 2, joinedMidQuiz: false, joinedAt: new Date() },
    { userId: 'u-2', displayName: 'Beta', finalScore: 120, finalRank: 2, correctCount: 1, totalAnswerTimeMs: BigInt(7000), questionsAnswered: 2, joinedMidQuiz: false, joinedAt: new Date() },
    { userId: 'u-3', displayName: 'Gamma', finalScore: 0, finalRank: 3, correctCount: 0, totalAnswerTimeMs: BigInt(2500), questionsAnswered: 1, joinedMidQuiz: true, joinedAt: new Date() },
  ];
  const answers = [
    { userId: 'u-1', questionId: 'q-1', answerSubmitted: '4', isCorrect: true, pointsAwarded: 130, answerTimeMs: 2500 },
    { userId: 'u-2', questionId: 'q-1', answerSubmitted: '4', isCorrect: true, pointsAwarded: 120, answerTimeMs: 4000 },
    { userId: 'u-3', questionId: 'q-1', answerSubmitted: '3', isCorrect: false, pointsAwarded: 0, answerTimeMs: 2500 },
    { userId: 'u-1', questionId: 'q-2', answerSubmitted: '5', isCorrect: null, pointsAwarded: 0, answerTimeMs: 2500 },
    { userId: 'u-2', questionId: 'q-2', answerSubmitted: '4', isCorrect: null, pointsAwarded: 0, answerTimeMs: 3000 },
  ];

  const userDelegate = prisma.user as unknown as Record<string, unknown>;
  const quizDelegate = prisma.quiz as unknown as Record<string, unknown>;
  const quizAnswerDelegate = prisma.quizAnswer as unknown as Record<string, unknown>;
  const restore = setMethods([
    [userDelegate, 'findUnique', async (args: { where: { id: string } }) =>
      (args.where.id === ADMIN_ID ? { ...ADMIN_ROW } : null)],
    [quizDelegate, 'findUnique', async () => ({
      id: QUIZ_ID,
      title: 'Equivalence Quiz',
      description: 'streamed',
      status: 'FINISHED',
      questionCount: questions.length,
      createdAt: new Date(),
      startedAt: new Date(Date.now() - 600_000),
      endedAt: new Date(),
      createdBy: ADMIN_ID,
      totalParticipants: participants.length,
      questions,
      participants,
    })],
    [quizAnswerDelegate, 'findMany', async () => answers],
  ]);
  t.after(restore);

  await withApp(async (baseUrl) => {
    const workbook = await downloadWorkbook(baseUrl, `/api/quiz/${QUIZ_ID}/export`);

    assert.deepEqual(
      workbook.worksheets.map((ws) => ws.name),
      ['Leaderboard', 'Question Analytics', 'Detailed Answers', 'All Responses', 'Quiz Summary'],
      'all five sheets present, in order',
    );

    const lb = workbook.getWorksheet('Leaderboard')!;
    assert.equal(lb.rowCount - 1, participants.length, 'one leaderboard row per participant');
    assert.equal(lb.getRow(2).getCell(1).value, 1, 'rank 1 first');
    assert.equal(lb.getRow(2).getCell(2).value, 'Alpha');
    assert.equal(lb.getRow(2).getCell(3).value, 230);
    // Styling survives the streaming writer (catches a useStyles drop):
    const headerFill = lb.getRow(1).getCell(1).fill as { fgColor?: { argb?: string } };
    assert.equal(headerFill?.fgColor?.argb, 'FFD97706', 'amber header fill present');
    const rowFill = lb.getRow(2).getCell(1).fill as { fgColor?: { argb?: string } };
    assert.equal(rowFill?.fgColor?.argb, 'FFFEF3C7', 'alternating row tint present');

    const qa = workbook.getWorksheet('Question Analytics')!;
    assert.equal(qa.rowCount - 1, questions.length);
    assert.equal(qa.getRow(2).getCell(2).value, 'What is 2+2?');
    assert.equal(qa.getRow(3).getCell(7).value, 'N/A', 'unscored RATING accuracy is N/A');

    const detail = workbook.getWorksheet('Detailed Answers')!;
    assert.equal(detail.rowCount - 1, participants.length);
    assert.equal(detail.getRow(1).cellCount, 2 + questions.length * 4, 'rank+name + 4 columns per question');

    const responses = workbook.getWorksheet('All Responses')!;
    assert.equal(responses.rowCount - 1, answers.length, 'one row per submitted answer');

    const summary = workbook.getWorksheet('Quiz Summary')!;
    assert.equal(summary.getRow(1).getCell(1).value, 'Quiz Title');
    assert.equal(summary.getRow(1).getCell(2).value, 'Equivalence Quiz');
    assert.equal(summary.getRow(5).getCell(2).value, participants.length, 'Total Participants row');
  });
});
