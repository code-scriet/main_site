import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUnscoredQuestionType,
  LEADERBOARD_BROADCAST_LIMIT,
  planQuestionResults,
  sanitizeQuestionForClient,
} from './quizEmissionPlanner.js';
import { quizStore } from './quizStore.js';
import type { QuizQuestionData } from './quizStore.js';

const baseQuestion: QuizQuestionData = {
  id: 'q-1',
  position: 0,
  questionText: 'What is 2 + 2?',
  questionType: 'MCQ',
  options: ['3', '4', '5'],
  correctAnswer: '4',
  timeLimitSeconds: 30,
  points: 1000,
  mediaUrl: null,
};

test('Hard Constraint #7: leaderboard broadcast cap is 10', () => {
  assert.equal(LEADERBOARD_BROADCAST_LIMIT, 10);
});

test('sanitizeQuestionForClient never includes correctAnswer', () => {
  const payload = sanitizeQuestionForClient(baseQuestion, 0, 5);
  assert.equal('correctAnswer' in payload, false);
  assert.equal(payload.questionText, 'What is 2 + 2?');
  assert.equal(payload.questionType, 'MCQ');
  assert.deepEqual(payload.options, ['3', '4', '5']);
  assert.equal(payload.totalQuestions, 5);
  assert.equal(payload.questionIndex, 0);
  assert.equal(payload.questionId, 'q-1');
});

test('isUnscoredQuestionType matches POLL/RATING/OPEN_ENDED only', () => {
  assert.equal(isUnscoredQuestionType('POLL'), true);
  assert.equal(isUnscoredQuestionType('RATING'), true);
  assert.equal(isUnscoredQuestionType('OPEN_ENDED'), true);
  assert.equal(isUnscoredQuestionType('MCQ'), false);
  assert.equal(isUnscoredQuestionType('TRUE_FALSE'), false);
  assert.equal(isUnscoredQuestionType('SHORT_ANSWER'), false);
  assert.equal(isUnscoredQuestionType('MULTI_SELECT'), false);
});

// S4: rank-fold. Three players; A and B answer, C does not. Every player is
// "ranked" (getLeaderboard returns all players), so C is a ranked non-answerer.
test('S4: planQuestionResults folds rank into answer_result only when enabled', () => {
  const quizId = 's4-fold-quiz';
  quizStore.initQuiz(quizId, [{ ...baseQuestion }], 'admin-u', 'admin-sock', 'S4 Quiz');
  quizStore.addPlayer(quizId, 'user-A', 'sock-A', 'Player A');
  quizStore.addPlayer(quizId, 'user-B', 'sock-B', 'Player B');
  quizStore.addPlayer(quizId, 'user-C', 'sock-C', 'Player C');
  quizStore.advanceQuestion(quizId);
  quizStore.submitAnswer(quizId, 'user-A', '4'); // correct
  quizStore.submitAnswer(quizId, 'user-B', '4'); // correct
  // user-C deliberately does not answer.

  const room = quizStore.getRoom(quizId)!;

  // Flag OFF ⇒ legacy shape: answer_result carries NO rank; every ranked player
  // (A, B, C) receives a my_rank_update.
  const off = planQuestionResults(quizId, room, { foldRankInResult: false })!;
  assert.equal(off.perPlayerResults.length, 2);
  for (const r of off.perPlayerResults) assert.equal('rank' in r.payload, false);
  assert.equal(off.myRankUpdates.length, 3);

  // Flag ON ⇒ A and B carry their rank inline; only the non-answerer C gets a
  // residual my_rank_update. No answered player is double-pushed (HC#9).
  const on = planQuestionResults(quizId, room, { foldRankInResult: true })!;
  assert.equal(on.perPlayerResults.length, 2);
  assert.deepEqual(
    new Set(on.perPlayerResults.map((r) => r.socketId)),
    new Set(['sock-A', 'sock-B']),
  );
  for (const r of on.perPlayerResults) {
    assert.equal(typeof r.payload.rank, 'number');
    assert.equal(r.payload.totalPlayers, 3);
  }
  assert.equal(on.myRankUpdates.length, 1);
  assert.equal(on.myRankUpdates[0].socketId, 'sock-C');

  // Capability gate: sock-B's client never advertised foldedRankOk (an old
  // cached bundle) ⇒ B's answer_result carries NO rank and B keeps receiving
  // my_rank_update; capable A still gets the folded shape.
  const gated = planQuestionResults(quizId, room, {
    foldRankInResult: true,
    canFold: (socketId) => socketId === 'sock-A',
  })!;
  const aResult = gated.perPlayerResults.find((r) => r.socketId === 'sock-A')!;
  const bResult = gated.perPlayerResults.find((r) => r.socketId === 'sock-B')!;
  assert.equal(typeof aResult.payload.rank, 'number');
  assert.equal('rank' in bResult.payload, false);
  assert.deepEqual(
    new Set(gated.myRankUpdates.map((u) => u.socketId)),
    new Set(['sock-B', 'sock-C']),
  );

  quizStore.cleanupQuiz(quizId);
});
