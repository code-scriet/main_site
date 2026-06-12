import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { initQuizSocket } from './quizSocket.js';
import { quizStore, type QuizQuestionData } from './quizStore.js';
import { prisma } from '../lib/prisma.js';
import { getJwtSecret } from '../utils/jwt.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'quiz-control-bugs-tests-secret';

// ─── Minimal socket harness (mirrors quizSocket.test.ts) ────────────────────

interface SocketEventRecord {
  event: string;
  data: unknown;
}

class FakeSocket {
  public userId?: string;
  public userDisplayName?: string;
  public userRole?: string;
  public currentQuizId?: string;

  private handlers = new Map<string, (payload: unknown) => unknown>();
  public emitted: SocketEventRecord[] = [];
  public received: SocketEventRecord[] = [];

  constructor(
    public id: string,
    userId: string,
    role: string,
    displayName: string,
  ) {
    this.userId = userId;
    this.userRole = role;
    this.userDisplayName = displayName;
  }

  on(event: string, handler: (payload: unknown) => unknown) {
    this.handlers.set(event, handler);
  }

  emit(event: string, data: unknown) {
    this.emitted.push({ event, data });
  }

  join(_roomId: string) {}
  leave(_roomId: string) {}

  to(_roomId: string) {
    return { emit: (_event: string, _data: unknown) => {} };
  }

  receive(event: string, data: unknown) {
    this.received.push({ event, data });
  }

  async trigger(event: string, payload: unknown) {
    const handler = this.handlers.get(event);
    assert.ok(handler, `Missing socket handler for ${event}`);
    await handler(payload);
  }
}

class FakeNamespace {
  public sockets = new Map<string, FakeSocket>();
  private connectionHandler: ((socket: FakeSocket) => void) | null = null;

  use(_handler: unknown) {}

  on(event: string, handler: (socket: FakeSocket) => void) {
    if (event === 'connection') {
      this.connectionHandler = handler;
    }
  }

  to(socketId: string) {
    return {
      emit: (event: string, data: unknown) => {
        const socket = this.sockets.get(socketId);
        if (socket) socket.receive(event, data);
      },
    };
  }

  connect(socket: FakeSocket) {
    this.sockets.set(socket.id, socket);
    assert.ok(this.connectionHandler, 'Expected connection handler to be registered');
    this.connectionHandler(socket);
  }
}

class FakeIo {
  public namespace = new FakeNamespace();
  public engine = { on: (_event: string, _handler: unknown) => {} };

  of(name: string) {
    assert.equal(name, '/quiz');
    return this.namespace;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sampleQuestions(): QuizQuestionData[] {
  return [
    {
      id: 'q1',
      position: 1,
      questionText: '2 + 2 = ?',
      questionType: 'MCQ',
      options: ['4', '5'],
      correctAnswer: '4',
      timeLimitSeconds: 20,
      points: 100,
      mediaUrl: null,
    },
    {
      id: 'q2',
      position: 2,
      questionText: '3 + 3 = ?',
      questionType: 'MCQ',
      options: ['6', '7'],
      correctAnswer: '6',
      timeLimitSeconds: 20,
      points: 100,
      mediaUrl: null,
    },
  ];
}

function stubPrisma(methods: Record<string, Record<string, unknown>>) {
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  for (const [delegateName, fns] of Object.entries(methods)) {
    const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[delegateName];
    for (const [fnName, impl] of Object.entries(fns)) {
      originals.push([delegate, fnName, delegate[fnName]]);
      delegate[fnName] = impl;
    }
  }
  return () => {
    for (const [target, key, value] of originals) {
      target[key] = value;
    }
  };
}

function signQuizAccessToken(payload: { userId: string; quizId: string; accessRole: 'participant' | 'host' }): string {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '20m' });
}

// ─── B1: start_quiz status guard ─────────────────────────────────────────────

test('double start_quiz keeps the quiz on question 0 and blocks the second emit', async (t) => {
  const quizId = `b1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminUserId = 'admin-b1';

  let dbStartCount = 0;
  const restore = stubPrisma({
    quiz: {
      update: async () => { dbStartCount += 1; return {}; },
    },
  });
  t.after(restore);
  t.after(() => quizStore.cleanupQuiz(quizId));

  quizStore.initQuiz(quizId, sampleQuestions(), adminUserId, 'admin-socket-b1', 'B1 Quiz');

  const io = new FakeIo();
  initQuizSocket(io as never);
  const adminSocket = new FakeSocket('admin-socket-b1', adminUserId, 'ADMIN', 'Host');
  io.namespace.connect(adminSocket);

  await adminSocket.trigger('start_quiz', { quizId });
  const room = quizStore.getRoom(quizId);
  assert.ok(room);
  assert.equal(room.status, 'active');
  assert.equal(room.currentQuestionIndex, 0, 'first start lands on question 0');
  assert.equal(dbStartCount, 1);

  await adminSocket.trigger('start_quiz', { quizId });
  assert.equal(room.currentQuestionIndex, 0, 'second start must not advance past question 0');
  assert.equal(dbStartCount, 1, 'second start must not re-run the DB update');
  const blocked = adminSocket.emitted.find((e) => e.event === 'control_action_blocked');
  assert.ok(blocked, 'second start emits control_action_blocked');
  assert.equal((blocked.data as { code: string }).code, 'ALREADY_STARTED');
});

// ─── B2: restart-hydration passes joinCode/pin ───────────────────────────────

test('start_quiz hydration from DB carries joinCode and pin into the room', async (t) => {
  const quizId = `b2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminUserId = 'admin-b2';

  const restore = stubPrisma({
    quiz: {
      findUnique: async () => ({
        id: quizId,
        status: 'WAITING',
        title: 'B2 Quiz',
        createdBy: adminUserId,
        joinCode: 'ABC123',
        pin: '654321',
        questions: sampleQuestions().map((q) => ({ ...q })),
      }),
      update: async () => ({}),
    },
  });
  t.after(restore);
  t.after(() => quizStore.cleanupQuiz(quizId));

  const io = new FakeIo();
  initQuizSocket(io as never);
  const adminSocket = new FakeSocket('admin-socket-b2', adminUserId, 'ADMIN', 'Host');
  io.namespace.connect(adminSocket);

  await adminSocket.trigger('start_quiz', { quizId });

  const room = quizStore.getRoom(quizId);
  assert.ok(room, 'room hydrated from DB');
  assert.equal(room.joinCode, 'ABC123');
  assert.equal(room.pin, '654321');
});

test('start_quiz refuses to resurrect a FINISHED quiz', async (t) => {
  const quizId = `b2f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminUserId = 'admin-b2f';

  const restore = stubPrisma({
    quiz: {
      findUnique: async () => ({
        id: quizId,
        status: 'FINISHED',
        title: 'Finished Quiz',
        createdBy: adminUserId,
        joinCode: null,
        pin: null,
        questions: sampleQuestions().map((q) => ({ ...q })),
      }),
      update: async () => { throw new Error('must not update a finished quiz'); },
    },
  });
  t.after(restore);

  const io = new FakeIo();
  initQuizSocket(io as never);
  const adminSocket = new FakeSocket('admin-socket-b2f', adminUserId, 'ADMIN', 'Host');
  io.namespace.connect(adminSocket);

  await adminSocket.trigger('start_quiz', { quizId });

  assert.equal(quizStore.getRoom(quizId), undefined, 'no room may be created');
  const blocked = adminSocket.emitted.find((e) => e.event === 'control_action_blocked');
  assert.ok(blocked, 'start on finished quiz is blocked');
  assert.equal((blocked.data as { code: string }).code, 'QUIZ_NOT_OPEN');
});

// ─── B3: kicked players cannot rejoin ────────────────────────────────────────

test('kicked player is rejected on rejoin even with a valid access token', async (t) => {
  const quizId = `b3-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminUserId = 'admin-b3';
  const playerUserId = 'player-b3';

  t.after(() => quizStore.cleanupQuiz(quizId));

  quizStore.initQuiz(quizId, sampleQuestions(), adminUserId, 'admin-socket-b3', 'B3 Quiz');
  quizStore.addPlayer(quizId, playerUserId, 'player-socket-b3', 'Player');

  const kicked = quizStore.kickPlayer(quizId, playerUserId);
  assert.ok(kicked, 'kick succeeds');

  const io = new FakeIo();
  initQuizSocket(io as never);
  const playerSocket = new FakeSocket('player-socket-b3-2', playerUserId, 'USER', 'Player');
  io.namespace.connect(playerSocket);

  await playerSocket.trigger('join_quiz', {
    quizId,
    quizAccessToken: signQuizAccessToken({ userId: playerUserId, quizId, accessRole: 'participant' }),
  });

  const error = playerSocket.emitted.find((e) => e.event === 'quiz_error');
  assert.ok(error, 'rejoin emits quiz_error');
  assert.equal((error.data as { code: string }).code, 'KICKED');
  assert.equal(quizStore.getRoom(quizId)?.players.has(playerUserId), false, 'player not re-added');
});

// ─── B5: persisted quiz returns its codes to the pool ────────────────────────

test('persistResultsAndCleanup nulls pin and joinCode', async (t) => {
  const quizId = `b5-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const captured: { update?: Record<string, unknown> } = {};
  const fakeTx = {
    quiz: {
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        return {};
      },
    },
    quizAnswer: { createMany: async () => ({ count: 0 }) },
    quizParticipant: { updateMany: async () => ({ count: 0 }) },
    $executeRaw: async () => 0,
  };
  const prismaAny = prisma as unknown as Record<string, unknown>;
  const originalTxn = prismaAny.$transaction;
  prismaAny.$transaction = async (cb: (tx: typeof fakeTx) => Promise<void>) => cb(fakeTx);
  t.after(() => { prismaAny.$transaction = originalTxn; });

  quizStore.initQuiz(quizId, sampleQuestions(), 'admin-b5', 'admin-socket-b5', 'B5 Quiz', 'XYZ789', '111222');

  await quizStore.persistResultsAndCleanup(quizId, 'FINISHED');

  assert.ok(captured.update, 'quiz.update ran inside the persist transaction');
  assert.equal(captured.update.pin, null, 'pin nulled on persist');
  assert.equal(captured.update.joinCode, null, 'joinCode nulled on persist');
  assert.equal(captured.update.pinActive, false, 'pinActive still flipped off');
  assert.equal(quizStore.getRoom(quizId), undefined, 'room cleaned up after persist');
});
