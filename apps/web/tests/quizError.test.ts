import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldTreatQuizErrorAsFatal } from '../src/lib/quizErrors.ts';

test('quiz control and answer errors stay non-fatal during an active session', () => {
  assert.equal(shouldTreatQuizErrorAsFatal('FORBIDDEN', 'question'), false);
  assert.equal(shouldTreatQuizErrorAsFatal('QUIZ_NOT_ACTIVE', 'revealing'), false);
  assert.equal(shouldTreatQuizErrorAsFatal('RATE_LIMITED', 'question'), false);
  assert.equal(shouldTreatQuizErrorAsFatal('ANSWER_REJECTED', 'question'), false);
});

test('join and access failures stay fatal', () => {
  assert.equal(shouldTreatQuizErrorAsFatal('ACCESS_DENIED', 'joining'), true);
  assert.equal(shouldTreatQuizErrorAsFatal('QUIZ_NOT_FOUND', 'idle'), true);
  assert.equal(shouldTreatQuizErrorAsFatal('QUIZ_ENDED', 'lobby'), true);
});

test('generic server errors are only fatal before the quiz session is established', () => {
  assert.equal(shouldTreatQuizErrorAsFatal('SERVER_ERROR', 'joining'), true);
  assert.equal(shouldTreatQuizErrorAsFatal('SERVER_ERROR', 'question'), false);
  assert.equal(shouldTreatQuizErrorAsFatal('QUIZ_ERROR', 'idle'), true);
  assert.equal(shouldTreatQuizErrorAsFatal('QUIZ_ERROR', 'question'), false);
});

test('any quiz error is fatal while a join confirmation is still pending', () => {
  assert.equal(
    shouldTreatQuizErrorAsFatal('SERVER_ERROR', 'question', { awaitingJoinConfirmation: true }),
    true,
  );
  assert.equal(
    shouldTreatQuizErrorAsFatal('QUIZ_ERROR', 'lobby', { awaitingJoinConfirmation: true }),
    true,
  );
});
