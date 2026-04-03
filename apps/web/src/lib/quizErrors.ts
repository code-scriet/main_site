import type { QuizStatus } from './quizStore';

const ALWAYS_FATAL_CODES = new Set([
  'ACCESS_DENIED',
  'INVALID_INPUT',
  'QUIZ_ENDED',
  'QUIZ_NOT_AVAILABLE',
  'QUIZ_NOT_FOUND',
  'QUIZ_NOT_STARTED',
]);

const NON_FATAL_CODES = new Set([
  'ANSWER_REJECTED',
  'FORBIDDEN',
  'QUIZ_NOT_ACTIVE',
  'RATE_LIMITED',
]);

interface QuizErrorSeverityOptions {
  awaitingJoinConfirmation?: boolean;
}

export function shouldTreatQuizErrorAsFatal(
  code: string,
  quizStatus: QuizStatus,
  options: QuizErrorSeverityOptions = {},
): boolean {
  if (ALWAYS_FATAL_CODES.has(code)) {
    return true;
  }

  if (options.awaitingJoinConfirmation) {
    return true;
  }

  if (NON_FATAL_CODES.has(code)) {
    return false;
  }

  return quizStatus === 'idle' || quizStatus === 'joining';
}
