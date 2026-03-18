/**
 * Zustand quiz store — THE source of truth for all quiz state on frontend.
 * Components use selective subscriptions to avoid unnecessary re-renders.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface QuizPlayer {
  userId: string;
  displayName: string;
  answered?: boolean;
  connected?: boolean;
}

export type QuizQuestionType = 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'POLL' | 'RATING' | 'MULTI_SELECT' | 'OPEN_ENDED';

export interface QuizQuestion {
  questionIndex: number;
  totalQuestions: number;
  questionText: string;
  questionType: QuizQuestionType;
  options: string[] | null;
  timeLimitSeconds: number;
  points: number;
  mediaUrl: string | null;
  questionId: string;
  timeElapsedMs?: number;
}

export interface AnswerResult {
  isCorrect: boolean | null;
  isPoll?: boolean;
  pointsAwarded: number;
  timeMs: number;
  newScore: number;
  newStreak: number;
}

export interface AnswerReceipt {
  accepted?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  correctCount: number;
  totalAnswerTimeMs: number;
}

export interface QuestionReveal {
  correctAnswer: string | null;
  leaderboard: LeaderboardEntry[];
  answerDistribution: Record<string, number>;
  questionIndex: number;
}

export type QuizStatus = 'idle' | 'joining' | 'lobby' | 'question' | 'revealing' | 'paused' | 'finished';

interface QuizState {
  // Connection
  socketStatus: 'disconnected' | 'connecting' | 'connected';

  // Quiz meta
  quizId: string | null;
  quizAccessToken: string | null;
  title: string;
  totalQuestions: number;
  isAdmin: boolean;
  joinCode: string | null;
  pin: string | null;

  // Session state
  quizStatus: QuizStatus;

  // Players
  players: QuizPlayer[];
  connectedCount: number;

  // Current question
  currentQuestion: QuizQuestion | null;
  questionIndex: number;
  questionStartTime: number | null;
  hasAnswered: boolean;
  myAnswer: string | null;

  // Post-answer feedback
  lastAnswerResult: AnswerResult | null;

  // Post-question reveal
  questionReveal: QuestionReveal | null;

  // Live poll results (streaming as votes come in)
  pollResults: { distribution: Record<string, number>; totalResponses: number } | null;

  // Scores
  myScore: number;
  myStreak: number;
  myRank: number | null;
  myUserId: string | null;
  leaderboard: LeaderboardEntry[];

  // Answer count live update
  answeredCount: number;
  totalPlayers: number;

  // Admin-only
  allAnswered: boolean;

  // Error / kicked
  quizError: { code: string; message: string } | null;
  kicked: boolean;

  // Pause state
  pausedTimeRemaining: number | null;

  // Actions
  setSocketStatus: (s: 'disconnected' | 'connecting' | 'connected') => void;
  setMyUserId: (userId: string) => void;
  setQuizId: (quizId: string) => void;
  setQuizAccessToken: (token: string | null) => void;
  setJoining: () => void;

  joinedQuiz: (data: {
    quizId: string;
    title: string;
    status: string;
    players: QuizPlayer[];
    totalQuestions: number;
    yourScore?: number;
    yourRank?: number | null;
    isAdmin: boolean;
    joinCode?: string | null;
    pin?: string | null;
    currentQuestion?: QuizQuestion;
  }) => void;

  playerJoined: (data: { userId: string; displayName: string; totalPlayers: number }) => void;
  playerLeft: (data: { userId: string; displayName: string; connectedPlayers: number }) => void;

  quizStarted: (data: { quizId: string; title: string; totalQuestions: number; playerCount: number }) => void;

  showQuestion: (q: QuizQuestion) => void;
  setMyAnswer: (answer: string) => void;

  answerReceived: (data: AnswerReceipt) => void;
  answerResultReceived: (data: AnswerResult) => void;
  answerCountUpdate: (data: { answered: number; total?: number }) => void;
  allAnsweredReceived: () => void;

  pollResultsUpdate: (data: { distribution: Record<string, number>; totalResponses: number }) => void;

  questionResultsReceived: (data: QuestionReveal) => void;
  finalLeaderboardReceived: (data: { leaderboard: LeaderboardEntry[]; totalQuestions: number }) => void;

  quizPaused: () => void;
  quizResumed: (data: { remainingMs: number }) => void;
  timerExtended: (data: { extraSeconds: number }) => void;
  playerKicked: () => void;

  myRankUpdated: (data: { rank: number; totalPlayers: number; score: number }) => void;

  playerStatusUpdated: (statuses: Array<{ userId: string; answered: boolean; connected: boolean }>) => void;

  setQuizError: (err: { code: string; message: string } | null) => void;

  reset: () => void;
}

const initialState = {
  socketStatus: 'disconnected' as const,
  quizId: null,
  quizAccessToken: null,
  title: '',
  totalQuestions: 0,
  isAdmin: false,
  joinCode: null,
  pin: null,
  quizStatus: 'idle' as QuizStatus,
  players: [],
  connectedCount: 0,
  currentQuestion: null,
  questionIndex: 0,
  questionStartTime: null,
  hasAnswered: false,
  myAnswer: null,
  lastAnswerResult: null,
  questionReveal: null,
  pollResults: null,
  myScore: 0,
  myStreak: 0,
  myRank: null,
  myUserId: null,
  leaderboard: [],
  answeredCount: 0,
  totalPlayers: 0,
  allAnswered: false,
  quizError: null,
  kicked: false,
  pausedTimeRemaining: null,
};

export const useQuizStore = create<QuizState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setSocketStatus: (s) => set({ socketStatus: s }),
    setMyUserId: (userId) => set({ myUserId: userId }),
    setQuizId: (quizId) => set({ quizId }),
    setQuizAccessToken: (token) => set({ quizAccessToken: token }),
    setJoining: () => set({ quizStatus: 'joining' }),

    joinedQuiz: (data) => {
      const status = data.status === 'active' ? (data.currentQuestion ? 'question' : 'lobby') : 'lobby';
      set({
        quizId: data.quizId,
        title: data.title,
        quizStatus: status,
        players: data.players,
        totalQuestions: data.totalQuestions,
        myScore: data.yourScore ?? 0,
        isAdmin: data.isAdmin,
        joinCode: data.joinCode || null,
        pin: data.pin || null,
        currentQuestion: data.currentQuestion || null,
        questionStartTime: data.currentQuestion
          ? Date.now() - (data.currentQuestion.timeElapsedMs || 0)
          : null,
        questionIndex: data.currentQuestion?.questionIndex ?? 0,
      });
    },

    playerJoined: (data) =>
      set((s) => ({
        players: [...s.players.filter((p) => p.userId !== data.userId), { userId: data.userId, displayName: data.displayName }],
        connectedCount: data.totalPlayers,
      })),

    playerLeft: (data) =>
      set((s) => ({
        players: s.players, // Keep player in list (they may reconnect)
        connectedCount: data.connectedPlayers,
      })),

    quizStarted: (data) =>
      set({
        quizStatus: 'lobby',
        totalQuestions: data.totalQuestions,
        title: data.title,
      }),

    showQuestion: (q) =>
      set((state) => ({
        currentQuestion: q,
        questionIndex: q.questionIndex,
        questionStartTime: q.timeElapsedMs ? Date.now() - q.timeElapsedMs : Date.now(),
        hasAnswered: false,
        myAnswer: null,
        lastAnswerResult: null,
        questionReveal: null,
        pollResults: null,
        answeredCount: 0,
        allAnswered: false,
        quizStatus: 'question' as const,
        players: state.players.map(p => ({ ...p, answered: false })),
      })),

    setMyAnswer: (answer) => set({ myAnswer: answer, hasAnswered: true }),

    answerReceived: (_data) =>
      set({
        hasAnswered: true,
        lastAnswerResult: null,
      }),

    answerResultReceived: (data) =>
      set({
        lastAnswerResult: data,
        myScore: data.newScore,
        myStreak: data.newStreak,
      }),

    answerCountUpdate: (data) => set({ answeredCount: data.answered }),
    allAnsweredReceived: () => set({ allAnswered: true }),

    pollResultsUpdate: (data) => set({ pollResults: data }),

    questionResultsReceived: (data) =>
      set((s) => {
        const myEntry = s.myUserId ? data.leaderboard.find(e => e.userId === s.myUserId) : null;
        return {
          questionReveal: data,
          leaderboard: data.leaderboard,
          quizStatus: 'revealing' as const,
          myRank: myEntry?.rank ?? s.myRank,
          myScore: myEntry?.score ?? s.myScore,
        };
      }),

    finalLeaderboardReceived: (data) =>
      set((s) => {
        const myEntry = s.myUserId ? data.leaderboard.find(e => e.userId === s.myUserId) : null;
        return {
          leaderboard: data.leaderboard,
          totalQuestions: data.totalQuestions,
          quizStatus: 'finished' as const,
          myRank: myEntry?.rank ?? s.myRank,
          myScore: myEntry?.score ?? s.myScore,
        };
      }),

    quizPaused: () =>
      set((s) => ({
        quizStatus: 'paused',
        pausedTimeRemaining: s.questionStartTime && s.currentQuestion
          ? Math.max(0, (s.currentQuestion.timeLimitSeconds * 1000) - (Date.now() - s.questionStartTime))
          : null,
      })),

    quizResumed: (data) =>
      set((s) => ({
        quizStatus: 'question',
        questionStartTime: s.currentQuestion
          ? Date.now() - ((s.currentQuestion.timeLimitSeconds * 1000) - data.remainingMs)
          : Date.now(),
        pausedTimeRemaining: null,
      })),

    timerExtended: (data) =>
      set((s) => ({
        questionStartTime: s.questionStartTime
          ? s.questionStartTime - (data.extraSeconds * 1000)
          : s.questionStartTime,
      })),

    playerKicked: () =>
      set({
        kicked: true,
        quizStatus: 'idle',
      }),

    setQuizError: (err) => set({ quizError: err, quizStatus: err ? 'idle' : 'idle' }),

    myRankUpdated: (data) => set({ myRank: data.rank, totalPlayers: data.totalPlayers, myScore: data.score }),

    playerStatusUpdated: (statuses) =>
      set((state) => ({
        players: state.players.map(p => {
          const status = statuses.find(s => s.userId === p.userId);
          if (!status) return p;
          return { ...p, answered: status.answered, connected: status.connected };
        }),
      })),

    reset: () => set(initialState),
  })),
);
