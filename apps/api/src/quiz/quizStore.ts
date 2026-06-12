/**
 * In-memory quiz store — the central state manager for live quizzes.
 * The database is NEVER touched during an active quiz.
 * Only at quiz load (read questions) and quiz end (write results).
 */

import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import type { Server as SocketIOServer } from 'socket.io';

// ───  ────────────────────────────────────────────────────────────────

export interface QuizQuestionData {
  id: string;
  position: number;
  questionText: string;
  questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'POLL' | 'RATING' | 'MULTI_SELECT' | 'OPEN_ENDED';
  options: string[] | null;
  correctAnswer: string | null;
  timeLimitSeconds: number;
  points: number;
  mediaUrl: string | null;
}

export interface PlayerState {
  socketId: string;
  displayName: string;
  score: number;
  correctCount: number;
  totalAnswerTimeMs: number;
  streak: number;
  answeredCurrentQuestion: boolean;
  connected: boolean;
}

export interface AnswerRecord {
  answer: string;
  timeMs: number;
  isCorrect: boolean | null;
  pointsAwarded: number;
  questionId: string;
}

export interface QuizRoom {
  quizId: string;
  meta: {
    title: string;
    totalQuestions: number;
    createdBy: string;
  };
  joinCode: string | null;
  pin: string | null;
  status: 'waiting' | 'active' | 'revealing' | 'paused' | 'finished';
  currentQuestionIndex: number;
  currentQuestionStartTime: number;
  pausedTimeRemaining: number | null; // ms remaining when paused
  questions: QuizQuestionData[];
  players: Map<string, PlayerState>;
  // B3: kick is final for this room. A kicked player's 20-min quiz access
  // token stays valid, so join_quiz checks this set to stop instant rejoins.
  // Bytes per kick; freed with the room.
  kickedUserIds: Set<string>;
  // O(1) counters maintained at every connect/disconnect/answer/kick/advance
  // transition — they replace per-submit scans over the players map (the
  // all-answered check was O(n) per submit ⇒ O(n²) per question at scale).
  // answeredCount counts ALL players who answered the current question
  // (including ones who disconnected after answering — matching the old
  // answer_count_update scan); answeredConnectedCount counts only connected
  // answered players (matching the old all-answered `every` over connected).
  connectedCount: number;
  answeredCount: number;
  answeredConnectedCount: number;
  answerSubmissionLocks: Set<string>;
  currentAnswers: Map<string, AnswerRecord>;
  // All answers accumulated across all questions for final persistence
  allAnswers: (AnswerRecord & { userId: string })[];
  // Per-question analytics accumulated during quiz
  questionAnalytics: Map<string, { totalAnswers: number; correctCount: number; totalTimeMs: number; distribution: Record<string, number> }>;
  autoAdvanceTimer: ReturnType<typeof setTimeout> | null;
  adminUserId: string;
  adminSocketId: string | null;
  emptyRoomTimer: ReturnType<typeof setTimeout> | null;
  persistenceRetryTimer: ReturnType<typeof setTimeout> | null;
  persistenceRetryCount: number;
  pendingFinalStatus: 'FINISHED' | 'ABANDONED' | null;
  isPersisting: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  correctCount: number;
  totalAnswerTimeMs: number;
}

// ─── Scoring ──────────────────────────────────────────────────────────────

export function calculatePoints(
  question: QuizQuestionData,
  timeMs: number,
  streak: number,
  isCorrect: boolean,
): number {
  if (!isCorrect) return 0;
  const timeLimitMs = question.timeLimitSeconds * 1000;
  const timeRatio = Math.max(0, (timeLimitMs - timeMs) / timeLimitMs);
  const basePoints = question.points;
  const timeBonus = Math.floor(timeRatio * 50);
  const streakBonus = Math.min(Math.max(streak - 1, 0) * 10, 50);
  return basePoints + timeBonus + streakBonus;
}

// ─── Store ────────────────────────────────────────────────────────────────

const quizRooms = new Map<string, QuizRoom>();

// Rate limiter for submit_answer. The 500 ms check (line ~313) is the real
// throttle; entries older than 5 min can never block a future submit so they
// are safe to evict. A lazy sweep keeps the map bounded across long-lived
// quiz sessions and abandoned participants.
const answerRateLimit = new Map<string, number>();
const ANSWER_RATE_LIMIT_STALE_MS = 5 * 60 * 1000;
let answerRateLimitSweep: ReturnType<typeof setInterval> | null = null;
function ensureAnswerRateLimitSweep(): void {
  if (answerRateLimitSweep) return;
  answerRateLimitSweep = setInterval(() => {
    const cutoff = Date.now() - ANSWER_RATE_LIMIT_STALE_MS;
    for (const [key, ts] of answerRateLimit) {
      if (ts < cutoff) answerRateLimit.delete(key);
    }
  }, ANSWER_RATE_LIMIT_STALE_MS);
  // Don't keep the process alive solely for this sweep.
  if (typeof answerRateLimitSweep.unref === 'function') answerRateLimitSweep.unref();
}
const MAX_ANSWER_LENGTH = 200;
const MAX_OPEN_ENDED_LENGTH = 1000;
const MAX_ANALYTICS_KEY_LENGTH = 80;
const NETWORK_GRACE_PERIOD_MS = 500;
const MAX_PERSIST_SYNC_ATTEMPTS = 3;
const MAX_PERSIST_RETRY_ATTEMPTS = 5;
const PERSIST_RETRY_BASE_DELAY_MS = 5000;
const UNSCORED_QUESTION_TYPES = new Set<QuizQuestionData['questionType']>(['POLL', 'RATING', 'OPEN_ENDED']);

function getAnswerRateLimitKey(quizId: string, userId: string): string {
  return `${quizId}:${userId}`;
}

function clearAnswerRateLimitForQuiz(quizId: string): void {
  const prefix = `${quizId}:`;
  for (const key of answerRateLimit.keys()) {
    if (key.startsWith(prefix)) {
      answerRateLimit.delete(key);
    }
  }
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeAnswerInput(rawAnswer: string): string {
  return normalizeWhitespace(rawAnswer);
}

function normalizeForDistribution(value: string): string {
  return value.slice(0, MAX_ANALYTICS_KEY_LENGTH);
}

function parseJsonStringArray(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const values = parsed.map((item) => {
      if (typeof item !== 'string') return null;
      const normalized = normalizeWhitespace(item);
      return normalized || null;
    });

    if (values.some((value) => value === null)) {
      return null;
    }

    const deduped = Array.from(new Set(values as string[]));
    return deduped.length > 0 ? deduped : null;
  } catch {
    return null;
  }
}

function normalizeMultiSelectSubmission(raw: string, allowedOptions: string[]): string[] | null {
  const parsed = parseJsonStringArray(raw);
  if (!parsed) return null;

  const selected = new Set(parsed);
  const normalized = allowedOptions.filter((option) => selected.has(option));

  if (normalized.length !== selected.size) {
    return null;
  }

  return normalized;
}

// Hard Constraint #1 in CLAUDE.md: 512 MB ceiling on the Render free tier.
// One in-memory QuizRoom is ~50 KB; 60 simultaneous rooms ≈ 3 MB, which is the
// safe upper bound before per-room player Maps start pushing us toward OOM.
// Beyond this we refuse new rooms rather than risk an OOM-kill that would
// drop every live game.
const MAX_ACTIVE_ROOMS = Number.parseInt(process.env.QUIZ_MAX_ACTIVE_ROOMS || '60', 10);

export class QuizCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuizCapacityError';
  }
}

export const quizStore = {
  // ---------- Room management ----------

  initQuiz(
    quizId: string,
    questions: QuizQuestionData[],
    adminUserId: string,
    adminSocketId: string,
    title: string,
    joinCode?: string | null,
    pin?: string | null,
  ): QuizRoom {
    if (questions.length === 0) {
      throw new Error('Cannot initialize quiz with 0 questions');
    }
    // Re-opening an already-active quiz is fine (replaces the existing room);
    // only refuse when adding a NEW quiz would exceed the ceiling.
    if (!quizRooms.has(quizId) && quizRooms.size >= MAX_ACTIVE_ROOMS) {
      throw new QuizCapacityError(
        `Quiz platform is at capacity (${MAX_ACTIVE_ROOMS} concurrent live quizzes). Please try again in a few minutes.`,
      );
    }

    const room: QuizRoom = {
      quizId,
      meta: {
        title,
        totalQuestions: questions.length,
        createdBy: adminUserId,
      },
      joinCode: joinCode || null,
      pin: pin || null,
      status: 'waiting',
      currentQuestionIndex: -1,
      currentQuestionStartTime: 0,
      pausedTimeRemaining: null,
      questions,
      players: new Map(),
      kickedUserIds: new Set(),
      connectedCount: 0,
      answeredCount: 0,
      answeredConnectedCount: 0,
      answerSubmissionLocks: new Set(),
      currentAnswers: new Map(),
      allAnswers: [] as (AnswerRecord & { userId: string })[],
      questionAnalytics: new Map(),
      autoAdvanceTimer: null,
      adminUserId,
      adminSocketId,
      emptyRoomTimer: null,
      persistenceRetryTimer: null,
      persistenceRetryCount: 0,
      pendingFinalStatus: null,
      isPersisting: false,
    };

    quizRooms.set(quizId, room);
    ensureAnswerRateLimitSweep();
    return room;
  },

  getRoom(quizId: string): QuizRoom | undefined {
    return quizRooms.get(quizId);
  },

  // ---------- Player management ----------

  addPlayer(
    quizId: string,
    userId: string,
    socketId: string,
    displayName: string,
  ): { isNew: boolean; currentState: Partial<QuizRoom> } | null {
    const room = quizRooms.get(quizId);
    if (!room) return null;

    const existing = room.players.get(userId);
    if (existing) {
      // Reconnect — counters only move on a real false→true transition so a
      // duplicate join from an already-connected socket can't drift them.
      existing.socketId = socketId;
      if (!existing.connected) {
        existing.connected = true;
        room.connectedCount += 1;
        if (existing.answeredCurrentQuestion) room.answeredConnectedCount += 1;
      }
      return {
        isNew: false,
        currentState: {
          status: room.status,
          currentQuestionIndex: room.currentQuestionIndex,
        },
      };
    }

    // New player
    room.players.set(userId, {
      socketId,
      displayName,
      score: 0,
      correctCount: 0,
      totalAnswerTimeMs: 0,
      streak: 0,
      answeredCurrentQuestion: false,
      connected: true,
    });
    room.connectedCount += 1;

    return {
      isNew: true,
      currentState: {
        status: room.status,
        currentQuestionIndex: room.currentQuestionIndex,
      },
    };
  },

  updateAdminSocket(quizId: string, userId: string, newSocketId: string): boolean {
    const room = quizRooms.get(quizId);
    if (!room || room.adminUserId !== userId) return false;
    room.adminSocketId = newSocketId;
    return true;
  },

  // ---------- Answer submission ----------

  checkRateLimit(quizId: string, userId: string): boolean {
    const key = getAnswerRateLimitKey(quizId, userId);
    const last = answerRateLimit.get(key) || 0;
    if (Date.now() - last < 500) return false;
    answerRateLimit.set(key, Date.now());
    return true;
  },

  submitAnswer(
    quizId: string,
    userId: string,
    answerText: string,
  ): {
    isCorrect: boolean | null;
    isPoll: boolean;
    pointsAwarded: number;
    timeMs: number;
    allAnswered: boolean;
    newScore: number;
    newStreak: number;
  } | { error: string } {
    const room = quizRooms.get(quizId);
    if (!room) return { error: 'QUIZ_NOT_FOUND' };
    if (room.status !== 'active') return { error: 'QUIZ_NOT_ACTIVE' };
    if (room.currentQuestionIndex < 0) return { error: 'NO_QUESTION' };

    const player = room.players.get(userId);
    if (!player) return { error: 'NOT_A_PARTICIPANT' };

    // Reservation lock makes the "check + record" path atomic per user/question.
    if (room.answerSubmissionLocks.has(userId)) return { error: 'ALREADY_ANSWERED' };
    room.answerSubmissionLocks.add(userId);
    let keepSubmissionLock = false;

    try {
      if (player.answeredCurrentQuestion) return { error: 'ALREADY_ANSWERED' };
      if (room.currentAnswers.has(userId)) return { error: 'ALREADY_ANSWERED' };

      const question = room.questions[room.currentQuestionIndex];
      if (!question) return { error: 'INVALID_QUESTION' };

      const maxAnswerLength = question.questionType === 'OPEN_ENDED' ? MAX_OPEN_ENDED_LENGTH : MAX_ANSWER_LENGTH;
      const sanitizedAnswer = question.questionType === 'OPEN_ENDED'
        ? answerText.trim()
        : sanitizeAnswerInput(answerText);
      if (!sanitizedAnswer) return { error: 'INVALID_ANSWER' };
      if (sanitizedAnswer.length > maxAnswerLength) return { error: 'ANSWER_TOO_LONG' };
      let boundedAnswer = sanitizedAnswer.slice(0, maxAnswerLength);
      let normalizedSelections: string[] | null = null;

      // Strict answer-shape checks to prevent malformed payload abuse.
      if (question.questionType === 'MULTI_SELECT') {
        const allowedOptions = question.options || [];
        normalizedSelections = normalizeMultiSelectSubmission(boundedAnswer, allowedOptions);
        if (!normalizedSelections) {
          return { error: 'INVALID_ANSWER' };
        }
        boundedAnswer = JSON.stringify(normalizedSelections);
      } else if (question.questionType !== 'SHORT_ANSWER' && question.questionType !== 'OPEN_ENDED') {
        const allowedOptions = question.options || (question.questionType === 'TRUE_FALSE' ? ['True', 'False'] : []);
        if (!allowedOptions.includes(boundedAnswer)) {
          return { error: 'INVALID_OPTION' };
        }
      }

      const timeMs = Date.now() - room.currentQuestionStartTime;
      const timeLimitMs = question.timeLimitSeconds * 1000;

      if (timeMs > timeLimitMs + NETWORK_GRACE_PERIOD_MS) {
        // Small grace window for network jitter
        return { error: 'TIME_EXPIRED' };
      }

      // POLL, RATING, and OPEN_ENDED questions have no correct answer — skip scoring entirely
      const isUnscoredType = UNSCORED_QUESTION_TYPES.has(question.questionType);

      // Determine correctness
      let isCorrect = false;
      let partialRatio = 1;
      if (!isUnscoredType && question.correctAnswer !== null) {
        if (question.questionType === 'MULTI_SELECT') {
          const correctSelections = normalizeMultiSelectSubmission(question.correctAnswer, question.options || []);
          if (!normalizedSelections || !correctSelections || correctSelections.length === 0) {
            partialRatio = 0;
            isCorrect = false;
          } else {
            const correctSet = new Set(correctSelections);
            const hasWrong = normalizedSelections.some((selection) => !correctSet.has(selection));
            if (hasWrong) {
              partialRatio = 0;
              isCorrect = false;
            } else {
              partialRatio = normalizedSelections.length / correctSelections.length;
              isCorrect = partialRatio === 1;
            }
          }
        } else if (question.questionType === 'SHORT_ANSWER') {
          isCorrect = boundedAnswer.toLowerCase() === question.correctAnswer.trim().toLowerCase();
        } else {
          isCorrect = boundedAnswer === question.correctAnswer;
        }
      }

      const nextStreak = isUnscoredType
        ? player.streak
        : isCorrect
          ? player.streak + 1
          : 0;

      let pointsAwarded = 0;
      if (!isUnscoredType) {
        if (question.questionType === 'MULTI_SELECT' && partialRatio > 0 && partialRatio < 1) {
          const partialPoints = calculatePoints(question, timeMs, 1, true);
          pointsAwarded = Math.floor(partialPoints * partialRatio);
        } else {
          pointsAwarded = calculatePoints(question, timeMs, nextStreak, isCorrect);
        }
      }

      // Lock now remains for this question after a successful submit.
      keepSubmissionLock = true;

      // Update player
      player.streak = nextStreak;
      player.score += pointsAwarded;
      player.correctCount += (isCorrect && !isUnscoredType) ? 1 : 0;
      player.totalAnswerTimeMs += timeMs;
      if (!player.answeredCurrentQuestion) {
        player.answeredCurrentQuestion = true;
        room.answeredCount += 1;
        if (player.connected) room.answeredConnectedCount += 1;
      }

      // Store in current answers
      room.currentAnswers.set(userId, {
        answer: boundedAnswer,
        timeMs,
        isCorrect: isUnscoredType ? null : isCorrect,
        pointsAwarded,
        questionId: question.id,
      });

      // Accumulate for final persistence
      room.allAnswers.push({
        answer: boundedAnswer,
        timeMs,
        isCorrect: isUnscoredType ? null : isCorrect,
        pointsAwarded,
        questionId: question.id,
        userId,
      });

      // Update per-question analytics
      const analytics = room.questionAnalytics.get(question.id) || { totalAnswers: 0, correctCount: 0, totalTimeMs: 0, distribution: {} };
      analytics.totalAnswers += 1;
      if (isCorrect && !isUnscoredType) analytics.correctCount += 1;
      analytics.totalTimeMs += timeMs;
      if (question.questionType === 'MULTI_SELECT') {
        for (const selection of normalizedSelections || []) {
          const key = normalizeForDistribution(selection);
          analytics.distribution[key] = (analytics.distribution[key] || 0) + 1;
        }
      } else {
        const analyticsKey = normalizeForDistribution(boundedAnswer);
        analytics.distribution[analyticsKey] = (analytics.distribution[analyticsKey] || 0) + 1;
      }
      room.questionAnalytics.set(question.id, analytics);

      // O(1) integer compare — was a per-submit materialize + scan of the
      // players map (O(n) per submit ⇒ O(n²) per question at 900 players).
      // Same semantics as `every(connected ⇒ answered)`: the submitter is
      // connected, so connectedCount ≥ 1 here.
      const allAnswered = room.connectedCount > 0 && room.answeredConnectedCount >= room.connectedCount;

      return {
        isCorrect: isUnscoredType ? null : isCorrect,
        isPoll: isUnscoredType,
        pointsAwarded,
        timeMs,
        allAnswered,
        newScore: player.score,
        newStreak: nextStreak,
      };
    } finally {
      if (!keepSubmissionLock) {
        room.answerSubmissionLocks.delete(userId);
      }
    }
  },

  // ---------- Question advancement ----------

  advanceQuestion(quizId: string): { done: boolean; question?: QuizQuestionData; questionIndex?: number } {
    const room = quizRooms.get(quizId);
    if (!room) return { done: true };

    // Clear auto-advance timer
    if (room.autoAdvanceTimer) {
      clearTimeout(room.autoAdvanceTimer);
      room.autoAdvanceTimer = null;
    }

    // Clear current answers
    room.currentAnswers.clear();
    room.answerSubmissionLocks.clear();

    // Clear answer rate limits between questions
    clearAnswerRateLimitForQuiz(quizId);

    // Reset all players' answered flag (+ the O(1) counters that mirror it)
    for (const player of room.players.values()) {
      player.answeredCurrentQuestion = false;
    }
    room.answeredCount = 0;
    room.answeredConnectedCount = 0;

    room.currentQuestionIndex += 1;

    if (room.currentQuestionIndex >= room.meta.totalQuestions) {
      room.status = 'finished';
      return { done: true };
    }

    room.currentQuestionStartTime = Date.now();
    room.status = 'active';

    const question = room.questions[room.currentQuestionIndex];
    return { done: false, question, questionIndex: room.currentQuestionIndex };
  },

  // ---------- Leaderboard ----------

  getLeaderboard(quizId: string): LeaderboardEntry[] {
    const room = quizRooms.get(quizId);
    if (!room) return [];

    const entries = Array.from(room.players.entries()).map(([userId, player]) => ({
      userId,
      displayName: player.displayName,
      score: player.score,
      correctCount: player.correctCount,
      totalAnswerTimeMs: player.totalAnswerTimeMs,
      rank: 0,
    }));

    // Sort by score desc, then totalAnswerTimeMs asc (fastest finger tiebreaker)
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalAnswerTimeMs - b.totalAnswerTimeMs;
    });

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  },

  // ---------- Answer distribution ----------

  getAnswerDistribution(quizId: string): Record<string, number> {
    const room = quizRooms.get(quizId);
    if (!room) return {};

    const distribution: Record<string, number> = {};
    const currentQuestion = room.questions[room.currentQuestionIndex];

    for (const answer of room.currentAnswers.values()) {
      if (currentQuestion?.questionType === 'MULTI_SELECT') {
        const selections = parseJsonStringArray(answer.answer) || [];
        for (const selection of selections) {
          distribution[selection] = (distribution[selection] || 0) + 1;
        }
        continue;
      }

      distribution[answer.answer] = (distribution[answer.answer] || 0) + 1;
    }
    return distribution;
  },

  // ---------- Persistence ----------

  async persistResultsAndCleanup(quizId: string, finalStatus: 'FINISHED' | 'ABANDONED' = 'FINISHED'): Promise<void> {
    const room = quizRooms.get(quizId);
    if (!room) return;

    if (room.isPersisting) return;
    room.isPersisting = true;
    room.pendingFinalStatus = finalStatus;

    if (room.persistenceRetryTimer) {
      clearTimeout(room.persistenceRetryTimer);
      room.persistenceRetryTimer = null;
    }

    const leaderboard = this.getLeaderboard(quizId);
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_PERSIST_SYNC_ATTEMPTS; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          // Update quiz status + total participants
          await tx.quiz.update({
            where: { id: quizId },
            data: {
              status: finalStatus,
              endedAt: new Date(),
              currentQuestionIndex: room.currentQuestionIndex,
              totalParticipants: room.players.size,
              pinActive: false, // Deactivate PIN after quiz ends
              // B5: pin/joinCode are globally @unique and meaningless once the
              // quiz ends, but retired rows kept them forever — every new open
              // then collided with history at ~N/900000 per attempt (P2002 →
              // 500). Null them so the codes return to the pool.
              pin: null,
              joinCode: null,
            },
          });

          // Bulk insert all answers (isCorrect is nullable now)
          if (room.allAnswers.length > 0) {
            await tx.quizAnswer.createMany({
              data: room.allAnswers.map((a) => ({
                quizId,
                questionId: a.questionId,
                userId: a.userId,
                answerSubmitted: a.answer,
                isCorrect: a.isCorrect ?? null,
                pointsAwarded: a.pointsAwarded,
                answerTimeMs: a.timeMs,
              })),
              skipDuplicates: true,
            });
          }

          // Update all participants with final scores/ranks in ONE statement.
          // The previous per-entry updateMany loop issued ~n sequential
          // statements over a single pooled Neon connection (est. 30-90s at
          // the 900-player ceiling, blocking the pool for the whole window).
          if (leaderboard.length > 0) {
            const participantRows = Prisma.join(leaderboard.map((entry) => Prisma.sql`(
              ${entry.userId}::text,
              ${entry.score}::int,
              ${entry.rank}::int,
              ${entry.correctCount}::int,
              ${entry.totalAnswerTimeMs}::bigint
            )`));
            await tx.$executeRaw`
              UPDATE quiz_participants AS p
              SET final_score = v.final_score,
                  final_rank = v.final_rank,
                  correct_count = v.correct_count,
                  total_answer_time_ms = v.total_answer_time_ms
              FROM (VALUES ${participantRows})
                AS v(user_id, final_score, final_rank, correct_count, total_answer_time_ms)
              WHERE p.quiz_id = ${quizId} AND p.user_id = v.user_id
            `;
          }

          // Per-question analytics: same VALUES-join shape (one statement
          // instead of one update per question).
          if (room.questionAnalytics.size > 0) {
            const analyticsRows = Prisma.join(Array.from(room.questionAnalytics.entries()).map(([questionId, analytics]) => {
              const avgTime = analytics.totalAnswers > 0 ? Math.round(analytics.totalTimeMs / analytics.totalAnswers) : 0;
              return Prisma.sql`(
                ${questionId}::text,
                ${analytics.totalAnswers}::int,
                ${analytics.correctCount}::int,
                ${avgTime}::int,
                ${JSON.stringify(analytics.distribution)}::jsonb
              )`;
            }));
            await tx.$executeRaw`
              UPDATE quiz_questions AS q
              SET total_answers = v.total_answers,
                  correct_count = v.correct_count,
                  avg_answer_time_ms = v.avg_answer_time_ms,
                  answer_distribution = v.answer_distribution
              FROM (VALUES ${analyticsRows})
                AS v(question_id, total_answers, correct_count, avg_answer_time_ms, answer_distribution)
              WHERE q.id = v.question_id AND q.quiz_id = ${quizId}
            `;
          }
        });

        logger.info(`Quiz ${quizId} results persisted successfully`, { status: finalStatus, attempt });
        this.cleanupQuiz(quizId);
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`Quiz ${quizId} persistence attempt failed`, {
          status: finalStatus,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        if (attempt < MAX_PERSIST_SYNC_ATTEMPTS) {
          await wait(300 * (2 ** (attempt - 1)));
        }
      }
    }

    room.isPersisting = false;
    room.status = 'finished';
    room.pendingFinalStatus = finalStatus;
    logger.error(`Failed to persist quiz ${quizId} results after sync retries`, {
      status: finalStatus,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    this.schedulePersistenceRetry(quizId);
  },

  schedulePersistenceRetry(quizId: string): void {
    const room = quizRooms.get(quizId);
    if (!room) return;
    if (room.persistenceRetryTimer || room.isPersisting) return;
    if (!room.pendingFinalStatus) return;

    if (room.persistenceRetryCount >= MAX_PERSIST_RETRY_ATTEMPTS) {
      logger.error(`Quiz ${quizId} persistence retry limit reached; keeping room in memory for manual recovery`, {
        status: room.pendingFinalStatus,
        retries: room.persistenceRetryCount,
      });
      return;
    }

    const attempt = room.persistenceRetryCount + 1;
    const delayMs = Math.min(PERSIST_RETRY_BASE_DELAY_MS * (2 ** room.persistenceRetryCount), 120000);
    room.persistenceRetryCount = attempt;

    room.persistenceRetryTimer = setTimeout(() => {
      const latestRoom = quizRooms.get(quizId);
      if (!latestRoom) return;
      latestRoom.persistenceRetryTimer = null;

      logger.warn(`Retrying quiz result persistence`, {
        quizId,
        status: latestRoom.pendingFinalStatus,
        attempt,
      });

      const statusToPersist = latestRoom.pendingFinalStatus || 'FINISHED';
      void this.persistResultsAndCleanup(quizId, statusToPersist);
    }, delayMs);
    room.persistenceRetryTimer.unref?.();
  },

  cleanupQuiz(quizId: string): void {
    const room = quizRooms.get(quizId);
    if (!room) return;

    if (room.autoAdvanceTimer) {
      clearTimeout(room.autoAdvanceTimer);
    }
    if (room.emptyRoomTimer) {
      clearTimeout(room.emptyRoomTimer);
    }
    if (room.persistenceRetryTimer) {
      clearTimeout(room.persistenceRetryTimer);
    }

    clearAnswerRateLimitForQuiz(quizId);
    room.answerSubmissionLocks.clear();

    quizRooms.delete(quizId);
    logger.info(`Quiz ${quizId} cleaned up from memory`);
  },

  // ---------- Disconnect handling ----------

  markPlayerDisconnected(quizId: string, userId: string, socketId: string): { connectedPlayers: number; displayName: string } | null {
    const room = quizRooms.get(quizId);
    if (!room) return null;

    const player = room.players.get(userId);
    if (!player) return null;

    // Ignore stale disconnect events from an older socket after a reconnect.
    if (player.socketId !== socketId) return null;

    if (player.connected) {
      player.connected = false;
      room.connectedCount = Math.max(0, room.connectedCount - 1);
      if (player.answeredCurrentQuestion) {
        room.answeredConnectedCount = Math.max(0, room.answeredConnectedCount - 1);
      }
    }

    return { connectedPlayers: room.connectedCount, displayName: player.displayName };
  },

  scheduleEmptyRoomCleanup(quizId: string, _io: SocketIOServer): void {
    const room = quizRooms.get(quizId);
    if (!room) return;

    if (room.connectedCount > 0) return;

    room.emptyRoomTimer = setTimeout(async () => {
      const currentRoom = quizRooms.get(quizId);
      if (!currentRoom) return;

      if (currentRoom.connectedCount === 0) {
        logger.info(`Quiz ${quizId} abandoned — persisting and cleaning up`);
        await this.persistResultsAndCleanup(quizId, 'ABANDONED');
      }
    }, 10 * 60 * 1000); // 10 minutes
  },

  cancelEmptyRoomCleanup(quizId: string): void {
    const room = quizRooms.get(quizId);
    if (!room || !room.emptyRoomTimer) return;
    clearTimeout(room.emptyRoomTimer);
    room.emptyRoomTimer = null;
  },

  // ---------- Pause/Resume ----------

  pauseQuiz(quizId: string): boolean {
    const room = quizRooms.get(quizId);
    if (!room || room.status !== 'active') return false;

    // Clear auto-advance timer
    if (room.autoAdvanceTimer) {
      clearTimeout(room.autoAdvanceTimer);
      room.autoAdvanceTimer = null;
    }

    // Calculate remaining time
    const elapsed = Date.now() - room.currentQuestionStartTime;
    const question = room.questions[room.currentQuestionIndex];
    if (question) {
      const totalMs = question.timeLimitSeconds * 1000;
      room.pausedTimeRemaining = Math.max(0, totalMs - elapsed);
    }

    room.status = 'paused';
    return true;
  },

  resumeQuiz(quizId: string): { remainingMs: number } | null {
    const room = quizRooms.get(quizId);
    if (!room || room.status !== 'paused') return null;

    const remaining = room.pausedTimeRemaining || 0;
    room.currentQuestionStartTime = Date.now() - ((room.questions[room.currentQuestionIndex]?.timeLimitSeconds || 20) * 1000 - remaining);
    room.pausedTimeRemaining = null;
    room.status = 'active';

    return { remainingMs: remaining };
  },

  // ---------- Admin: kick player ----------

  kickPlayer(quizId: string, userId: string): { socketId: string; displayName: string } | null {
    const room = quizRooms.get(quizId);
    if (!room) return null;

    const player = room.players.get(userId);
    if (!player) return null;

    const socketId = player.socketId;
    const displayName = player.displayName;
    room.players.delete(userId);
    room.kickedUserIds.add(userId);
    // Removal takes the player out of every counter a rescan would produce
    // (their answer records in currentAnswers/allAnswers stay, matching the
    // pre-counter behavior where kicked players vanished from scans only).
    if (player.connected) {
      room.connectedCount = Math.max(0, room.connectedCount - 1);
      if (player.answeredCurrentQuestion) {
        room.answeredConnectedCount = Math.max(0, room.answeredConnectedCount - 1);
      }
    }
    if (player.answeredCurrentQuestion) {
      room.answeredCount = Math.max(0, room.answeredCount - 1);
    }
    return { socketId, displayName };
  },

  // ---------- Utilities ----------

  getAllActiveQuizIds(): string[] {
    return Array.from(quizRooms.keys());
  },

  getPlayerSocketId(quizId: string, userId: string): string | null {
    const room = quizRooms.get(quizId);
    if (!room) return null;
    return room.players.get(userId)?.socketId ?? null;
  },

  getPlayersArray(quizId: string): { userId: string; displayName: string }[] {
    const room = quizRooms.get(quizId);
    if (!room) return [];
    return Array.from(room.players.entries()).map(([userId, p]) => ({
      userId,
      displayName: p.displayName,
    }));
  },

  getConnectedPlayerCount(quizId: string): number {
    return quizRooms.get(quizId)?.connectedCount ?? 0;
  },

  /** Find which quiz room a user is currently in */
  findUserQuizId(userId: string): string | null {
    for (const [quizId, room] of quizRooms.entries()) {
      if (room.players.has(userId) || room.adminUserId === userId) {
        return quizId;
      }
    }
    return null;
  },
};
