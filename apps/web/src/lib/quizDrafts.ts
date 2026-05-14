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
    id: crypto.randomUUID(),
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
