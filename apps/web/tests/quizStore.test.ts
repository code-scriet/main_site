import assert from 'node:assert/strict';
import test from 'node:test';
import { quizStoreTestUtils, useQuizStore } from '../src/lib/quizStore.ts';

const sampleQuestion = {
  questionIndex: 1,
  totalQuestions: 10,
  questionText: 'What is 2 + 2?',
  questionType: 'MCQ' as const,
  options: ['3', '4'],
  timeLimitSeconds: 30,
  points: 100,
  mediaUrl: null,
  questionId: 'question-1',
};

test('frontend timer extension shifts start time for signed adjustments', () => {
  const currentStartTime = 1_000_000;

  assert.equal(quizStoreTestUtils.extendQuestionStartTime(currentStartTime, 15), currentStartTime + 15_000);
  assert.equal(quizStoreTestUtils.extendQuestionStartTime(currentStartTime, -10), currentStartTime - 10_000);
  assert.equal(quizStoreTestUtils.extendQuestionStartTime(null, 15), null);
});

test('setQuizError clears stale quiz state but preserves reconnect context', () => {
  useQuizStore.getState().reset();
  useQuizStore.setState({
    socketStatus: 'connected',
    quizId: 'quiz-1',
    quizAccessToken: 'quiz-access-token',
    myUserId: 'user-1',
    title: 'Weekly Quiz',
    currentQuestion: sampleQuestion,
    questionStartTime: 1_000_000,
    leaderboard: [{ rank: 1, userId: 'user-1', displayName: 'Lakshya', score: 100, correctCount: 1, totalAnswerTimeMs: 500 }],
    players: [{ userId: 'user-1', displayName: 'Lakshya', answered: true, connected: true }],
    questionReveal: {
      correctAnswer: '4',
      leaderboard: [{ rank: 1, userId: 'user-1', displayName: 'Lakshya', score: 100, correctCount: 1, totalAnswerTimeMs: 500 }],
      answerDistribution: { '4': 1 },
      questionIndex: 1,
    },
    pollResults: { distribution: { '4': 1 }, totalResponses: 1 },
    quizStatus: 'question',
    hasAnswered: true,
    myAnswer: '4',
    myScore: 100,
    myStreak: 2,
    myRank: 1,
    answeredCount: 1,
    totalPlayers: 1,
    allAnswered: true,
    kicked: false,
    pausedTimeRemaining: 5_000,
  });

  useQuizStore.getState().setQuizError({ code: 'QUIZ_ERROR', message: 'Something went wrong' });

  const state = useQuizStore.getState();

  assert.equal(state.socketStatus, 'connected');
  assert.equal(state.quizId, 'quiz-1');
  assert.equal(state.quizAccessToken, 'quiz-access-token');
  assert.equal(state.myUserId, 'user-1');
  assert.equal(state.quizStatus, 'idle');
  assert.deepEqual(state.quizError, { code: 'QUIZ_ERROR', message: 'Something went wrong' });
  assert.equal(state.currentQuestion, null);
  assert.deepEqual(state.leaderboard, []);
  assert.deepEqual(state.players, []);
  assert.equal(state.questionReveal, null);
  assert.equal(state.pollResults, null);
  assert.equal(state.hasAnswered, false);
});
