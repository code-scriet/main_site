// S6: crash-snapshot round-trip. Exercises the PURE conversion functions only
// (roomToSnapshot / applySnapshotToRoom) — no better-sqlite3 needed, so the test
// runs even where the optional native dep didn't build.
import assert from 'node:assert/strict';
import test from 'node:test';
import { quizStore } from './quizStore.js';
import type { QuizQuestionData } from './quizStore.js';
import { applySnapshotToRoom, roomToSnapshot } from './quizSnapshot.js';

const questions: QuizQuestionData[] = [
  {
    id: 'q-1',
    position: 0,
    questionText: 'What is 2 + 2?',
    questionType: 'MCQ',
    options: ['3', '4', '5'],
    correctAnswer: '4',
    timeLimitSeconds: 30,
    points: 1000,
    mediaUrl: null,
  },
  {
    id: 'q-2',
    position: 1,
    questionText: 'True or false: 1 < 2',
    questionType: 'TRUE_FALSE',
    options: ['True', 'False'],
    correctAnswer: 'True',
    timeLimitSeconds: 20,
    points: 1000,
    mediaUrl: null,
  },
];

test('S6: snapshot round-trip restores an active room as paused with state intact', () => {
  const quizId = 's6-roundtrip-quiz';
  quizStore.initQuiz(quizId, questions.map((q) => ({ ...q })), 'admin-u', 'admin-sock', 'S6 Quiz', 'JOINCODE', '654321');
  quizStore.addPlayer(quizId, 'user-A', 'sock-A', 'Player A');
  quizStore.addPlayer(quizId, 'user-B', 'sock-B', 'Player B');
  quizStore.addPlayer(quizId, 'user-C', 'sock-C', 'Player C');
  quizStore.kickPlayer(quizId, 'user-C');
  quizStore.advanceQuestion(quizId);
  const submit = quizStore.submitAnswer(quizId, 'user-A', '4');
  assert.equal('error' in submit, false, 'submit must be accepted');

  const source = quizStore.getRoom(quizId)!;
  const scoreA = source.players.get('user-A')!.score;
  assert.ok(scoreA > 0, 'correct answer must have scored');

  // Snapshot taken 10s into the 30s question → restore should have ~20s left.
  const savedAt = source.currentQuestionStartTime + 10_000;
  const snap = roomToSnapshot(source, savedAt)!;
  assert.ok(snap, 'active room must be snapshottable');

  // Simulate the crash: drop the room, then rebuild exactly like recovery does.
  quizStore.cleanupQuiz(quizId);
  assert.equal(quizStore.getRoom(quizId), undefined);
  const restored = quizStore.initQuiz(
    snap.quizId,
    snap.questions,
    snap.adminUserId,
    '',
    snap.meta.title,
    snap.joinCode,
    snap.pin,
  );
  applySnapshotToRoom(restored, snap);

  // active → paused with the remaining clock preserved (host resumes; the
  // existing resume path re-arms the auto-advance timer — no timer state here).
  assert.equal(restored.status, 'paused');
  assert.equal(restored.pausedTimeRemaining, 20_000);
  assert.equal(restored.currentQuestionIndex, 0);

  // Scores/answers/kicks survive; connection state does not.
  assert.equal(restored.players.get('user-A')!.score, scoreA);
  assert.equal(restored.players.get('user-A')!.connected, false);
  assert.equal(restored.players.get('user-B')!.connected, false);
  assert.equal(restored.kickedUserIds.has('user-C'), true);
  assert.equal(restored.currentAnswers.get('user-A')!.answer, '4');
  assert.equal(restored.allAnswers.length, 1);
  assert.equal(restored.joinCode, 'JOINCODE');
  assert.equal(restored.pin, '654321');
  assert.equal(restored.adminSocketId, null);

  // O(1) counters recomputed for the all-disconnected reality.
  assert.equal(restored.connectedCount, 0);
  assert.equal(restored.answeredCount, 1);
  assert.equal(restored.answeredConnectedCount, 0);

  quizStore.cleanupQuiz(quizId);
});

test('S6: a host time-extension survives crash-restore (not capped at the base limit)', () => {
  const quizId = 's6-extend-quiz';
  quizStore.initQuiz(quizId, questions.map((q) => ({ ...q })), 'admin-u', 'admin-sock', 'S6 Extend');
  quizStore.addPlayer(quizId, 'user-A', 'sock-A', 'Player A');
  quizStore.advanceQuestion(quizId);
  const room = quizStore.getRoom(quizId)!; // question 1 is a 30s question

  // extend_time grants time by shifting the anchor forward (never the limit).
  // Simulate +15s on a 30s question, snapshotting 10s of real wall-clock in.
  const originalStart = room.currentQuestionStartTime;
  room.currentQuestionStartTime = originalStart + 15_000; // +15s extension
  const snap = roomToSnapshot(room, originalStart + 10_000)!;

  const rebuilt = { ...room, players: new Map(room.players), kickedUserIds: new Set<string>() };
  applySnapshotToRoom(rebuilt as typeof room, snap);
  assert.equal(rebuilt.status, 'paused');
  // 30s base − 10s elapsed + 15s extension = 35s. The old Math.min(timeLimitMs)
  // clamp would have (wrongly) capped this at 30_000.
  assert.equal(rebuilt.pausedTimeRemaining, 35_000);

  quizStore.cleanupQuiz(quizId);
});

test('S6: finished/persisting rooms are never snapshotted; expired clocks clamp to 0', () => {
  const quizId = 's6-guard-quiz';
  quizStore.initQuiz(quizId, questions.map((q) => ({ ...q })), 'admin-u', 'admin-sock', 'S6 Guard');
  quizStore.addPlayer(quizId, 'user-A', 'sock-A', 'Player A');
  quizStore.advanceQuestion(quizId);
  const room = quizStore.getRoom(quizId)!;

  // Snapshot taken AFTER the 30s limit already elapsed → paused at 0 remaining
  // (host resume reveals almost immediately instead of accepting late answers).
  const lateSnap = roomToSnapshot(room, room.currentQuestionStartTime + 45_000)!;
  const rebuilt = { ...room, players: new Map(room.players), kickedUserIds: new Set<string>() };
  applySnapshotToRoom(rebuilt as typeof room, lateSnap);
  assert.equal(rebuilt.status, 'paused');
  assert.equal(rebuilt.pausedTimeRemaining, 0);

  // Persistence guard: a room mid-flush must not be captured.
  room.isPersisting = true;
  assert.equal(roomToSnapshot(room, Date.now()), null);
  room.isPersisting = false;
  room.status = 'finished';
  assert.equal(roomToSnapshot(room, Date.now()), null);

  quizStore.cleanupQuiz(quizId);
});
