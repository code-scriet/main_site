export type QuestionType =
  | 'MCQ'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'POLL'
  | 'RATING'
  | 'MULTI_SELECT'
  | 'OPEN_ENDED';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ: 'Multiple Choice',
  TRUE_FALSE: 'True / False',
  SHORT_ANSWER: 'Short Answer',
  POLL: 'Poll',
  RATING: 'Rating',
  MULTI_SELECT: 'Multi-Select',
  OPEN_ENDED: 'Open Ended',
};

// Collision-free local id for draft questions. crypto.randomUUID exists in every
// browser we target; fall back only if it's somehow unavailable (e.g. insecure ctx).
function genDraftId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `q-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export const isUnscoredQuestion = (type: QuestionType) =>
  type === 'POLL' || type === 'RATING' || type === 'OPEN_ENDED';

export const usesOptions = (type: QuestionType) =>
  type === 'MCQ' || type === 'POLL' || type === 'MULTI_SELECT';

export interface QuestionDraft {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  timeLimitSeconds: number;
  points: number;
  mediaUrl: string;
}

export function createEmptyQuestion(): QuestionDraft {
  return {
    id: genDraftId(),
    questionText: '',
    questionType: 'MCQ',
    options: ['', '', '', ''],
    correctAnswer: '',
    correctAnswers: [],
    timeLimitSeconds: 20,
    points: 100,
    mediaUrl: '',
  };
}

// S-13 — "Session feedback" starter. The live-quiz engine already runs rating,
// open-ended and poll questions; this pre-fills the three-question feedback set
// (rate it · one word · what next) so hosts can collect feedback at peak energy
// in the last five minutes of a session. All three are unscored question types.
export function createFeedbackTemplate(): QuestionDraft[] {
  const base = (): Omit<QuestionDraft, 'questionType' | 'questionText' | 'options'> => ({
    id: genDraftId(),
    correctAnswer: '',
    correctAnswers: [],
    timeLimitSeconds: 30,
    points: 0,
    mediaUrl: '',
  });
  return [
    { ...base(), questionType: 'RATING', questionText: 'How would you rate this session overall?', options: [] },
    { ...base(), questionType: 'OPEN_ENDED', questionText: 'In one word, how did this session feel?', options: [] },
    {
      ...base(),
      questionType: 'POLL',
      questionText: 'What would you like more of next time?',
      options: ['More hands-on labs', 'Deeper theory deep-dives', 'Guest / industry talks', 'More contests & challenges'],
    },
  ];
}

export const STEP_LABELS = ['Details', 'Questions', 'Review'];

export const QUIZ_IMPORT_TEMPLATE_FILENAME = 'quiz-import-template.csv';
export const QUIZ_IMPORT_TEMPLATE_HEADERS = [
  'questionText',
  'questionType',
  'option1',
  'option2',
  'option3',
  'option4',
  'option5',
  'option6',
  'correctAnswer',
  'timeLimitSeconds',
  'points',
  'mediaUrl',
];
export const QUIZ_IMPORT_TEMPLATE_EXAMPLE = [
  'What is 2+2?',
  'MCQ',
  '1',
  '2',
  '3',
  '4',
  '',
  '',
  '4',
  '20',
  '100',
  '',
];
