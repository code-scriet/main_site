/**
 * PR-5 regression gate (§2.4 of the performance plan): drives ≥100 simulated
 * socket players through an MCQ + a POLL question against the REAL socket
 * handlers and store, asserting:
 *   - the O(1) room counters never drift from a full players-map rescan
 *     across join / duplicate-join / answer / disconnect / reconnect / kick /
 *     advance transitions;
 *   - `all_answered` semantics are unchanged (fires exactly when the last
 *     connected player answers);
 *   - `poll_results_update` is batched to ONE broadcast per throttle window
 *     (was one broadcast per submit — O(n²) messages per poll question) and
 *     the batched distribution equals the per-answer aggregate;
 *   - Hard Constraint #7 (top-10 leaderboard slice) and #9 (unicast
 *     answer_result / my_rank_update) hold at load.
 *
 * No DB is touched: players join via quizStore.addPlayer (the join_quiz DB
 * upsert path is covered by e2e), persistence parity for the §2.2 set-based
 * SQL is validated against a live schema in the PR protocol.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { initQuizSocket } from './quizSocket.js';
import { quizStore } from './quizStore.js';
import type { QuizQuestionData, QuizRoom } from './quizStore.js';
import { LEADERBOARD_BROADCAST_LIMIT } from './quizEmissionPlanner.js';

const PLAYER_COUNT = 150;
const POLL_OPTIONS = ['Red', 'Green', 'Blue'];

// ─── Counter-parity helpers ──────────────────────────────────────────────────

function recount(room: QuizRoom): { connected: number; answered: number; answeredConnected: number } {
  let connected = 0;
  let answered = 0;
  let answeredConnected = 0;
  for (const player of room.players.values()) {
    if (player.connected) connected += 1;
    if (player.answeredCurrentQuestion) answered += 1;
    if (player.connected && player.answeredCurrentQuestion) answeredConnected += 1;
  }
  return { connected, answered, answeredConnected };
}

function assertCountersMatch(room: QuizRoom, label: string): void {
  assert.deepEqual(
    {
      connected: room.connectedCount,
      answered: room.answeredCount,
      answeredConnected: room.answeredConnectedCount,
    },
    recount(room),
    `O(1) counters drifted from a full rescan after: ${label}`,
  );
}

// ─── Room-aware socket fakes (FakeNamespace in quizSocket.test.ts has no room
// membership, so broadcasts would be dropped; the load assertions need them) ──

interface SocketEventRecord {
  event: string;
  data: any;
}

class FakeSocket {
  public userId?: string;
  public userDisplayName?: string;
  public userRole?: string;
  public currentQuizId?: string;

  private handlers = new Map<string, (payload: any) => unknown>();
  public emitted: SocketEventRecord[] = [];
  public received: SocketEventRecord[] = [];

  constructor(
    public id: string,
    userId: string,
    role: string,
    displayName: string,
    private ns: FakeNamespace,
  ) {
    this.userId = userId;
    this.userRole = role;
    this.userDisplayName = displayName;
  }

  on(event: string, handler: (payload: any) => unknown) {
    this.handlers.set(event, handler);
  }

  emit(event: string, data: unknown) {
    this.emitted.push({ event, data });
  }

  join(roomId: string) {
    this.ns.addToRoom(roomId, this.id);
  }

  leave(roomId: string) {
    this.ns.removeFromRoom(roomId, this.id);
  }

  to(roomId: string) {
    return this.ns.to(roomId, this.id);
  }

  receive(event: string, data: unknown) {
    // Snapshot the payload — throttled broadcasts share one object reference
    // across recipients and a later mutation must not retro-edit assertions.
    this.received.push({ event, data: data === undefined ? undefined : JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) });
  }

  countReceived(event: string): number {
    return this.received.filter((record) => record.event === event).length;
  }

  lastReceived(event: string): SocketEventRecord | undefined {
    return [...this.received].reverse().find((record) => record.event === event);
  }

  async trigger(event: string, payload: unknown) {
    const handler = this.handlers.get(event);
    assert.ok(handler, `Missing socket handler for ${event}`);
    await handler(payload);
  }
}

class FakeNamespace {
  public sockets = new Map<string, FakeSocket>();
  private rooms = new Map<string, Set<string>>();
  private connectionHandler: ((socket: FakeSocket) => void) | null = null;

  use(_handler: unknown) {
    // Auth middleware is not executed in this mock setup.
  }

  on(event: string, handler: (socket: FakeSocket) => void) {
    if (event === 'connection') {
      this.connectionHandler = handler;
    }
  }

  addToRoom(roomId: string, socketId: string) {
    let members = this.rooms.get(roomId);
    if (!members) {
      members = new Set();
      this.rooms.set(roomId, members);
    }
    members.add(socketId);
  }

  removeFromRoom(roomId: string, socketId: string) {
    this.rooms.get(roomId)?.delete(socketId);
  }

  // Mirrors Socket.io routing: a room id fans out to members (minus the
  // sender for socket.to()), anything else is treated as a direct socket id.
  to(target: string, excludeSocketId?: string) {
    return {
      emit: (event: string, data: unknown) => {
        const members = this.rooms.get(target);
        if (members) {
          for (const socketId of members) {
            if (socketId === excludeSocketId) continue;
            this.sockets.get(socketId)?.receive(event, data);
          }
          return;
        }
        this.sockets.get(target)?.receive(event, data);
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
  public engine = {
    on: (_event: string, _handler: unknown) => {
      // No-op for test.
    },
  };

  of(name: string) {
    assert.equal(name, '/quiz');
    return this.namespace;
  }
}

function makeQuestions(): QuizQuestionData[] {
  return [
    {
      id: 'load-q1',
      position: 1,
      questionText: '2 + 2 = ?',
      questionType: 'MCQ',
      options: ['4', '5', '3'],
      correctAnswer: '4',
      timeLimitSeconds: 30,
      points: 100,
      mediaUrl: null,
    },
    {
      id: 'load-q2',
      position: 2,
      questionText: 'Favourite colour?',
      questionType: 'POLL',
      options: POLL_OPTIONS,
      correctAnswer: null,
      timeLimitSeconds: 30,
      points: 0,
      mediaUrl: null,
    },
    // q3 + q4 exist so an ACTIVE-stage skip mid-POLL lands on a next question
    // instead of finishing the quiz (which would hit the DB persistence path).
    {
      id: 'load-q3',
      position: 3,
      questionText: 'Second favourite colour?',
      questionType: 'POLL',
      options: POLL_OPTIONS,
      correctAnswer: null,
      timeLimitSeconds: 30,
      points: 0,
      mediaUrl: null,
    },
    {
      id: 'load-q4',
      position: 4,
      questionText: '3 + 3 = ?',
      questionType: 'MCQ',
      options: ['6', '7'],
      correctAnswer: '6',
      timeLimitSeconds: 30,
      points: 100,
      mediaUrl: null,
    },
  ];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Gate 1: counter parity under player churn (direct store transitions) ────

test('room counters survive join/answer/disconnect/reconnect/kick/advance churn without drifting', () => {
  const quizId = `churn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  quizStore.initQuiz(quizId, makeQuestions(), 'churn-admin', 'churn-admin-socket', 'Churn Quiz');
  const room = quizStore.getRoom(quizId);
  assert.ok(room);

  try {
    for (let i = 0; i < 40; i++) {
      quizStore.addPlayer(quizId, `churn-user-${i}`, `churn-sock-${i}`, `Player ${i}`);
    }
    assertCountersMatch(room, '40 joins');

    // Duplicate join from an already-connected socket must not drift counters.
    quizStore.addPlayer(quizId, 'churn-user-0', 'churn-sock-0b', 'Player 0');
    assertCountersMatch(room, 'duplicate join');

    const advance = quizStore.advanceQuestion(quizId);
    assert.equal(advance.done, false);
    room.currentQuestionStartTime = Date.now();
    assertCountersMatch(room, 'first advance');

    // 25 of 40 answer; one of them attempts a duplicate submit.
    for (let i = 0; i < 25; i++) {
      const result = quizStore.submitAnswer(quizId, `churn-user-${i}`, '4');
      assert.equal('error' in result, false, `submit ${i} should be accepted`);
    }
    const dup = quizStore.submitAnswer(quizId, 'churn-user-3', '4');
    assert.equal('error' in dup && dup.error, 'ALREADY_ANSWERED');
    assertCountersMatch(room, '25 answers + duplicate submit');

    // Disconnect 5 answered (20-24) + 5 unanswered (25-29) players.
    for (let i = 20; i < 30; i++) {
      quizStore.markPlayerDisconnected(quizId, `churn-user-${i}`, `churn-sock-${i}`);
    }
    assertCountersMatch(room, '10 disconnects');

    // A stale disconnect (old socket id after reconnect) must be ignored.
    quizStore.addPlayer(quizId, 'churn-user-20', 'churn-sock-20b', 'Player 20');
    quizStore.markPlayerDisconnected(quizId, 'churn-user-20', 'churn-sock-20');
    assert.equal(room.players.get('churn-user-20')?.connected, true, 'stale disconnect must be ignored');
    assertCountersMatch(room, 'reconnect + stale disconnect');

    // Kick one connected-answered, one disconnected-answered, one unanswered.
    quizStore.kickPlayer(quizId, 'churn-user-1');
    quizStore.kickPlayer(quizId, 'churn-user-21');
    quizStore.kickPlayer(quizId, 'churn-user-35');
    assertCountersMatch(room, 'kicks across all three player states');

    // allAnswered must fire exactly when the LAST connected player answers.
    const connectedUnanswered = [...room.players.entries()]
      .filter(([, p]) => p.connected && !p.answeredCurrentQuestion)
      .map(([userId]) => userId);
    assert.ok(connectedUnanswered.length > 1, 'churn setup should leave several connected unanswered players');
    for (let i = 0; i < connectedUnanswered.length; i++) {
      const result = quizStore.submitAnswer(quizId, connectedUnanswered[i], '4');
      assert.equal('error' in result, false);
      const expectLast = i === connectedUnanswered.length - 1;
      assert.equal(
        !('error' in result) && result.allAnswered,
        expectLast,
        `allAnswered must be ${expectLast} on submit ${i + 1}/${connectedUnanswered.length}`,
      );
    }
    assertCountersMatch(room, 'final connected player answering');

    // Advance resets the per-question counters.
    quizStore.advanceQuestion(quizId);
    assert.equal(room.answeredCount, 0);
    assert.equal(room.answeredConnectedCount, 0);
    assertCountersMatch(room, 'advance reset');

    assert.equal(quizStore.getConnectedPlayerCount(quizId), recount(room).connected);
  } finally {
    quizStore.cleanupQuiz(quizId);
  }
});

// ─── Gate 2: 150 players through the real socket handlers (MCQ + POLL) ──────

test('150-player MCQ + POLL flow: batched poll broadcasts, exact distribution, HC #7/#9 intact', async () => {
  const quizId = `load-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminUserId = 'load-admin';
  const adminSocketId = 'load-admin-socket';

  quizStore.initQuiz(quizId, makeQuestions(), adminUserId, adminSocketId, 'Load Quiz');
  const room = quizStore.getRoom(quizId);
  assert.ok(room);

  const io = new FakeIo();
  initQuizSocket(io as any);

  const adminSocket = new FakeSocket(adminSocketId, adminUserId, 'ADMIN', 'Host', io.namespace);
  io.namespace.connect(adminSocket);
  io.namespace.addToRoom(quizId, adminSocketId);

  const playerSockets: FakeSocket[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const socket = new FakeSocket(`load-sock-${i}`, `load-user-${i}`, 'USER', `Player ${i}`, io.namespace);
    io.namespace.connect(socket);
    io.namespace.addToRoom(quizId, socket.id);
    socket.currentQuizId = quizId;
    quizStore.addPlayer(quizId, socket.userId!, socket.id, socket.userDisplayName!);
    playerSockets.push(socket);
  }
  assertCountersMatch(room, `${PLAYER_COUNT} joins`);

  try {
    // ── MCQ question ──
    const firstAdvance = quizStore.advanceQuestion(quizId);
    assert.equal(firstAdvance.done, false);
    room.currentQuestionStartTime = Date.now();

    for (let i = 0; i < PLAYER_COUNT; i++) {
      // Half answer correctly to spread the leaderboard.
      await playerSockets[i].trigger('submit_answer', { quizId, answer: i % 2 === 0 ? '4' : '5' });
    }
    assertCountersMatch(room, `${PLAYER_COUNT} MCQ submits`);
    for (const socket of playerSockets) {
      assert.equal(socket.emitted.filter((e) => e.event === 'answer_received').length, 1);
    }

    // The answer-count throttle batches to ONE broadcast per window and the
    // tick reports the O(1) counters — also carrying all_answered to the host.
    await wait(1100);
    for (const socket of playerSockets) {
      assert.equal(socket.countReceived('answer_count_update'), 1, 'answer_count_update must be batched to 1 per window');
    }
    assert.deepEqual(
      playerSockets[0].lastReceived('answer_count_update')?.data,
      { answered: PLAYER_COUNT, total: PLAYER_COUNT },
    );
    assert.equal(adminSocket.countReceived('all_answered'), 1, 'host must get all_answered when every connected player has answered');

    // Reveal: HC #7 (top-10 slice broadcast) + HC #9 (unicast per-player results).
    await adminSocket.trigger('next_question', { quizId });
    for (const socket of playerSockets) {
      assert.equal(socket.countReceived('question_results'), 1);
      assert.equal(socket.countReceived('answer_result'), 1, 'answer_result must be unicast exactly once per player');
      assert.equal(socket.countReceived('my_rank_update'), 1, 'my_rank_update must be unicast exactly once per player');
      const reveal = socket.lastReceived('question_results')!.data;
      assert.ok(reveal.leaderboard.length <= LEADERBOARD_BROADCAST_LIMIT, 'HC #7: leaderboard broadcast must stay top-10');
    }

    // ── POLL question ──
    await adminSocket.trigger('next_question', { quizId });
    assert.equal(room.status, 'active');
    assertCountersMatch(room, 'advance to POLL');

    const expectedDistribution: Record<string, number> = {};
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const choice = POLL_OPTIONS[i % POLL_OPTIONS.length];
      expectedDistribution[choice] = (expectedDistribution[choice] || 0) + 1;
      await playerSockets[i].trigger('submit_answer', { quizId, answer: choice });
    }
    assertCountersMatch(room, `${PLAYER_COUNT} POLL submits`);

    // Pre-throttle: nothing has broadcast yet. (Pre-change this would already
    // be 150 broadcasts × 151 recipients.)
    for (const socket of playerSockets) {
      assert.equal(socket.countReceived('poll_results_update'), 0, 'poll_results_update must not fire before the throttle window');
    }

    await wait(1100);
    for (const socket of playerSockets) {
      assert.equal(socket.countReceived('poll_results_update'), 1, 'poll_results_update must be batched to 1 broadcast per window');
    }
    const pollPayload = playerSockets[0].lastReceived('poll_results_update')!.data;
    assert.deepEqual(pollPayload.distribution, expectedDistribution, 'batched poll distribution must equal the per-answer aggregate');
    assert.equal(pollPayload.totalResponses, PLAYER_COUNT);

    // Reveal cancels any pending poll tick — no stale post-reveal emit.
    await adminSocket.trigger('next_question', { quizId });
    const countsAfterReveal = playerSockets.map((s) => s.countReceived('poll_results_update'));
    await wait(1100);
    assert.deepEqual(
      playerSockets.map((s) => s.countReceived('poll_results_update')),
      countsAfterReveal,
      'no poll_results_update may fire after the reveal',
    );

    // ── ACTIVE-stage skip mid-POLL cancels pending throttle ticks ──
    // (skip bypasses the reveal, so emitQuestionResults never runs — the skip
    // handler must clear the throttles itself or a tick from the skipped
    // question fires into the next one.)
    await adminSocket.trigger('next_question', { quizId });
    assert.equal(room.status, 'active');
    assert.equal(room.currentQuestionIndex, 2, 'expected to be on the second POLL question');

    for (let i = 0; i < 10; i++) {
      await playerSockets[i].trigger('submit_answer', { quizId, answer: POLL_OPTIONS[0] });
    }
    await adminSocket.trigger('skip_question', { quizId });
    assert.equal(room.status, 'active');
    assert.equal(room.currentQuestionIndex, 3, 'skip must land on the MCQ filler question');

    const countsAfterSkip = playerSockets.map((s) => s.countReceived('poll_results_update'));
    await wait(1100);
    assert.deepEqual(
      playerSockets.map((s) => s.countReceived('poll_results_update')),
      countsAfterSkip,
      'a pending poll tick from a skipped question must not fire into the next question',
    );
  } finally {
    quizStore.cleanupQuiz(quizId);
  }
});
