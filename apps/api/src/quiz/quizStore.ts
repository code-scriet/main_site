/**
 * In-memory quiz store — the central state manager for live quizzes.
 * The database is NEVER touched during an active quiz.
 * Only at quiz load (read questions) and quiz end (write results).
 */

import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import type { Server as SocketIOServer } from 'socket.io';

// ─── Types ────────────────────────────────────────────────────────────────

export interface QuizQuestionData {
  id: string;
  position: number;
  questionText: string;
  questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'POLL' | 'RATING';
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
  status: 'waiting' | 'active' | 'paused' | 'finished';
  currentQuestionIndex: number;
  currentQuestionStartTime: number;
  pausedTimeRemaining: number | null; // ms remaining when paused
  questions: QuizQuestionData[];
  players: Map<string, PlayerState>;
  currentAnswers: Map<string, AnswerRecord>;
  // All answers accumulated across all questions for final persistence
  allAnswers: (AnswerRecord & { userId: string })[];
  // Per-question analytics accumulated during quiz
  questionAnalytics: Map<string, { totalAnswers: number; correctCount: number; totalTimeMs: number; distribution: Record<string, number> }>;
  autoAdvanceTimer: ReturnType<typeof setTimeout> | null;
  adminUserId: string;
  adminSocketId: string | null;
  emptyRoomTimer: ReturnType<typeof setTimeout> | null;
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
  const streakBonus = Math.min((streak - 1) * 10, 50);
  return basePoints + timeBonus + streakBonus;
}

// ─── Store ────────────────────────────────────────────────────────────────

const quizRooms = new Map<string, QuizRoom>();

// Rate limiter for submit_answer
const answerRateLimit = new Map<string, number>();
const MAX_ANSWER_LENGTH = 200;
const MAX_ANALYTICS_KEY_LENGTH = 80;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeAnswerInput(rawAnswer: string): string {
  return normalizeWhitespace(rawAnswer);
}

function normalizeForDistribution(value: string): string {
  return value.slice(0, MAX_ANALYTICS_KEY_LENGTH);
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
      currentAnswers: new Map(),
      allAnswers: [] as (AnswerRecord & { userId: string })[],
      questionAnalytics: new Map(),
      autoAdvanceTimer: null,
      adminUserId,
      adminSocketId,
      emptyRoomTimer: null,
    };

    quizRooms.set(quizId, room);
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
      // Reconnect
      existing.socketId = socketId;
      existing.connected = true;
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

  checkRateLimit(userId: string): boolean {
    const last = answerRateLimit.get(userId) || 0;
    if (Date.now() - last < 500) return false;
    answerRateLimit.set(userId, Date.now());
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
    if (player.answeredCurrentQuestion) return { error: 'ALREADY_ANSWERED' };

    const question = room.questions[room.currentQuestionIndex];
    if (!question) return { error: 'INVALID_QUESTION' };

    const sanitizedAnswer = sanitizeAnswerInput(answerText);
    if (!sanitizedAnswer) return { error: 'INVALID_ANSWER' };
    if (sanitizedAnswer.length > MAX_ANSWER_LENGTH) return { error: 'ANSWER_TOO_LONG' };
    const boundedAnswer = sanitizedAnswer.slice(0, MAX_ANSWER_LENGTH);

    // Strict answer-shape checks to prevent malformed payload abuse.
    if (question.questionType !== 'SHORT_ANSWER') {
      const allowedOptions = question.options || (question.questionType === 'TRUE_FALSE' ? ['True', 'False'] : []);
      if (!allowedOptions.includes(boundedAnswer)) {
        return { error: 'INVALID_OPTION' };
      }
    }

    const timeMs = Date.now() - room.currentQuestionStartTime;
    const timeLimitMs = question.timeLimitSeconds * 1000;

    if (timeMs > timeLimitMs + 3000) {
      // +3s grace period for network latency
      return { error: 'TIME_EXPIRED' };
    }

    // POLL and RATING questions have no correct answer — skip scoring entirely
    const isPollOrRating = question.questionType === 'POLL' || question.questionType === 'RATING';

    // Determine correctness
    let isCorrect = false;
    if (!isPollOrRating && question.correctAnswer !== null) {
      if (question.questionType === 'SHORT_ANSWER') {
        isCorrect = boundedAnswer.toLowerCase() === question.correctAnswer.trim().toLowerCase();
      } else {
        isCorrect = boundedAnswer === question.correctAnswer;
      }
    }

    // Update streak (only for scored questions)
    if (!isPollOrRating) {
      if (isCorrect) {
        player.streak += 1;
      } else {
        player.streak = 0;
      }
    }

    const pointsAwarded = isPollOrRating ? 0 : calculatePoints(question, timeMs, player.streak, isCorrect);

    // Update player
    player.score += pointsAwarded;
    player.correctCount += (isCorrect && !isPollOrRating) ? 1 : 0;
    player.totalAnswerTimeMs += timeMs;
    player.answeredCurrentQuestion = true;

    // Store in current answers
    room.currentAnswers.set(userId, {
      answer: boundedAnswer,
      timeMs,
      isCorrect: isPollOrRating ? null : isCorrect,
      pointsAwarded,
      questionId: question.id,
    });

    // Accumulate for final persistence
    room.allAnswers.push({
      answer: boundedAnswer,
      timeMs,
      isCorrect: isPollOrRating ? null : isCorrect,
      pointsAwarded,
      questionId: question.id,
      userId,
    });

    // Update per-question analytics
    const analytics = room.questionAnalytics.get(question.id) || { totalAnswers: 0, correctCount: 0, totalTimeMs: 0, distribution: {} };
    analytics.totalAnswers += 1;
    if (isCorrect && !isPollOrRating) analytics.correctCount += 1;
    analytics.totalTimeMs += timeMs;
    const analyticsKey = normalizeForDistribution(boundedAnswer);
    analytics.distribution[analyticsKey] = (analytics.distribution[analyticsKey] || 0) + 1;
    room.questionAnalytics.set(question.id, analytics);

    const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected);
    const allAnswered = connectedPlayers.every(p => p.answeredCurrentQuestion);

    return {
      isCorrect: isPollOrRating ? null : isCorrect,
      isPoll: isPollOrRating,
      pointsAwarded,
      timeMs,
      allAnswered,
      newScore: player.score,
      newStreak: player.streak,
    };
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

    // Clear answer rate limits between questions
    answerRateLimit.clear();

    // Reset all players' answered flag
    for (const player of room.players.values()) {
      player.answeredCurrentQuestion = false;
    }

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
    for (const answer of room.currentAnswers.values()) {
      distribution[answer.answer] = (distribution[answer.answer] || 0) + 1;
    }
    return distribution;
  },

  // ---------- Persistence ----------

  async persistResultsAndCleanup(quizId: string, finalStatus: 'FINISHED' | 'ABANDONED' = 'FINISHED'): Promise<void> {
    const room = quizRooms.get(quizId);
    if (!room) return;

    try {
      const leaderboard = this.getLeaderboard(quizId);

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

        // Update all participants with final scores/ranks
        for (const entry of leaderboard) {
          await tx.quizParticipant.updateMany({
            where: { quizId, userId: entry.userId },
            data: {
              finalScore: entry.score,
              finalRank: entry.rank,
              correctCount: entry.correctCount,
              totalAnswerTimeMs: BigInt(entry.totalAnswerTimeMs),
            },
          });
        }

        // Update per-question analytics
        for (const [questionId, analytics] of room.questionAnalytics.entries()) {
          const avgTime = analytics.totalAnswers > 0 ? Math.round(analytics.totalTimeMs / analytics.totalAnswers) : 0;
          await tx.quizQuestion.update({
            where: { id: questionId },
            data: {
              totalAnswers: analytics.totalAnswers,
              correctCount: analytics.correctCount,
              avgAnswerTimeMs: avgTime,
              answerDistribution: analytics.distribution,
            },
          });
        }
      });

      logger.info(`Quiz ${quizId} results persisted successfully`, { status: finalStatus });
    } catch (error) {
      logger.error(`Failed to persist quiz ${quizId} results`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Do NOT crash — quiz data is still in memory for retry
    }

    this.cleanupQuiz(quizId);
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

    quizRooms.delete(quizId);
    logger.info(`Quiz ${quizId} cleaned up from memory`);
  },

  // ---------- Disconnect handling ----------

  markPlayerDisconnected(quizId: string, userId: string): { connectedPlayers: number; displayName: string } | null {
    const room = quizRooms.get(quizId);
    if (!room) return null;

    const player = room.players.get(userId);
    if (!player) return null;

    player.connected = false;

    const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected).length;
    return { connectedPlayers, displayName: player.displayName };
  },

  scheduleEmptyRoomCleanup(quizId: string, _io: SocketIOServer): void {
    const room = quizRooms.get(quizId);
    if (!room) return;

    const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected).length;
    if (connectedPlayers > 0) return;

    room.emptyRoomTimer = setTimeout(async () => {
      const currentRoom = quizRooms.get(quizId);
      if (!currentRoom) return;

      const stillConnected = Array.from(currentRoom.players.values()).filter(p => p.connected).length;
      if (stillConnected === 0) {
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
    const room = quizRooms.get(quizId);
    if (!room) return 0;
    return Array.from(room.players.values()).filter(p => p.connected).length;
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
