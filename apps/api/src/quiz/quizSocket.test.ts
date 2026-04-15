import assert from 'node:assert/strict';
import test from 'node:test';
import { quizSocketTestUtils } from './quizSocket.js';

test('extendQuestionStartTime moves the question start forward', () => {
  const startTime = 1_000_000;
  const updatedStartTime = quizSocketTestUtils.extendQuestionStartTime(startTime, 15);

  assert.equal(updatedStartTime, startTime + 15_000);
});
