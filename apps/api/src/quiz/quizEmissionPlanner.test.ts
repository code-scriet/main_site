import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUnscoredQuestionType,
  LEADERBOARD_BROADCAST_LIMIT,
  sanitizeQuestionForClient,
} from './quizEmissionPlanner.js';
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
