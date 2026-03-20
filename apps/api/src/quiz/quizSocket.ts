/**
 * Socket.io quiz event handler.
 * All quiz real-time events are handled here.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import { quizStore } from './quizStore.js';
import type { QuizQuestionData } from './quizStore.js';
import type { QuizRoom } from './quizStore.js';

// ─── Throttle map for answer_count_update broadcasts ─────────────────────────
const answerCountThrottles = new Map<string, NodeJS.Timeout>();

function scheduleAnswerCountBroadcast(quizId: string, ns: { to: (room: string) => { emit: (ev: string, data: any) => void } }): void {
  if (answerCountThrottles.has(quizId)) return;

  answerCountThrottles.set(quizId, setTimeout(() => {
    answerCountThrottles.delete(quizId);
    const room = quizStore.getRoom(quizId);
    if (!room || room.status !== 'active') return;

    const players = Array.from(room.players.values());
    const answered = players.filter(p => p.answeredCurrentQuestion).length;
    const total = players.filter(p => p.connected).length;

    ns.to(quizId).emit('answer_count_update', { answered, total });

    // Host-only unicast — per-player answered + connected status
    if (room.adminSocketId) {
      const playerStatuses = [...room.players.entries()].map(([userId, player]) => ({
        userId,
        answered: player.answeredCurrentQuestion,
        connected: player.connected,
      }));
      ns.to(room.adminSocketId).emit('player_status_update', playerStatuses);
    }

    if (answered >= total && total > 0 && room.adminSocketId) {
      ns.to(room.adminSocketId).emit('all_answered', {});
    }
  }, 1000));
}

function clearAnswerCountThrottle(quizId: string): void {
  const timer = answerCountThrottles.get(quizId);
  if (timer) {
    clearTimeout(timer);
    answerCountThrottles.delete(quizId);
  }
}

// Extend socket type to include our custom properties
interface QuizSocket extends Socket {
  userId?: string;
  userDisplayName?: string;
  userRole?: string;
  currentQuizId?: string;
}

interface QuizAccessTokenPayload {
  userId: string;
  quizId: string;
  accessRole: 'participant' | 'host';
}

// ─── Helper to strip correctAnswer from question data sent to players ─────
function sanitizeQuestionForClient(q: QuizQuestionData, questionIndex: number, totalQuestions: number) {
  return {
    questionIndex,
    totalQuestions,
    questionText: q.questionText,
    questionType: q.questionType,
    options: q.options,
    timeLimitSeconds: q.timeLimitSeconds,
    points: q.points,
    mediaUrl: q.mediaUrl,
    questionId: q.id,
    // NEVER include correctAnswer
  };
}

function verifyQuizAccessToken(
  token: string,
  expectedQuizId: string,
  expectedUserId: string,
): QuizAccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<QuizAccessTokenPayload>;
    if (!decoded || decoded.quizId !== expectedQuizId || decoded.userId !== expectedUserId) {
      return null;
    }
    if (decoded.accessRole !== 'participant' && decoded.accessRole !== 'host') {
      return null;
    }
    return decoded as QuizAccessTokenPayload;
  } catch {
    return null;
  }
}

export function initQuizSocket(io: SocketIOServer) {
  // ─── Authentication middleware ──────────────────────────────────────────
  const quizNamespace = io.of('/quiz');

  // ─── Feature-enabled gate (fail-open on DB error) ───────────────────────
  quizNamespace.use(async (_socket, next) => {
    try {
      const settings = await prisma.settings.findUnique({
        where: { id: 'default' },
        select: { quizEnabled: true },
      });
      if (settings?.quizEnabled === false) {
        return next(new Error('QUIZ_DISABLED'));
      }
    } catch {
      // Fail-open: allow connection if DB is unavailable
    }
    next();
  });

  quizNamespace.use((socket: QuizSocket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
      const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as {
        userId?: string;
        id?: string;
        email?: string;
        role?: string;
        name?: string;
      };
      socket.userId = decoded.userId || decoded.id;
      socket.userDisplayName = decoded.name || decoded.email || 'Anonymous';
      socket.userRole = decoded.role;
      if (!socket.userId) return next(new Error('AUTH_INVALID'));
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  // ─── Performance: discard raw HTTP request reference ────────────────────
  io.engine.on('connection', (rawSocket: any) => {
    rawSocket.request = null;
  });

  // ─── Connection handler ────────────────────────────────────────────────
  const canControlQuiz = (room: { adminUserId: string }, socket: QuizSocket) =>
    socket.userId === room.adminUserId || ['ADMIN', 'PRESIDENT'].includes(socket.userRole || '');

  const getCurrentQuestionRemainingMs = (room: QuizRoom): number => {
    const currentQ = room.questions[room.currentQuestionIndex];
    if (!currentQ || room.currentQuestionIndex < 0) return 0;

    if (room.status === 'paused' && room.pausedTimeRemaining !== null) {
      return Math.max(0, room.pausedTimeRemaining);
    }

    const elapsed = Date.now() - room.currentQuestionStartTime;
    return Math.max(0, (currentQ.timeLimitSeconds * 1000) - elapsed);
  };

  const canRevealCurrentQuestion = (room: QuizRoom): boolean => {
    return getCurrentQuestionRemainingMs(room) <= 0;
  };

  const emitQuestionResults = (quizId: string, room: QuizRoom): void => {
    const currentQ = room.questions[room.currentQuestionIndex];
    if (!currentQ || room.currentQuestionIndex < 0) return;

    clearAnswerCountThrottle(quizId);

    const fullLeaderboard = quizStore.getLeaderboard(quizId);
    const answerDistribution = quizStore.getAnswerDistribution(quizId);

    // Broadcast top-10 leaderboard to all (slim payload)
    quizNamespace.to(quizId).emit('question_results', {
      correctAnswer: currentQ.correctAnswer,
      leaderboard: fullLeaderboard.slice(0, 10),
      answerDistribution,
      questionIndex: room.currentQuestionIndex,
    });

    // Send each player their personal rank (targeted, not broadcast)
    for (let i = 0; i < fullLeaderboard.length; i++) {
      const entry = fullLeaderboard[i];
      const player = room.players.get(entry.userId);
      if (player?.socketId && player.connected) {
        quizNamespace.to(player.socketId).emit('my_rank_update', {
          rank: i + 1,
          totalPlayers: fullLeaderboard.length,
          score: entry.score,
        });
      }
    }
  };

  quizNamespace.on('connection', (socket: QuizSocket) => {
    logger.debug('Quiz socket connected', { socketId: socket.id, userId: socket.userId });

    // ─── join_quiz ────────────────────────────────────────────────────────
    socket.on('join_quiz', async ({ quizId, quizAccessToken }: { quizId: string; quizAccessToken?: string }) => {
      if (!socket.userId || !quizId || !quizAccessToken) {
        socket.emit('quiz_error', { code: 'INVALID_INPUT', message: 'Missing quizId or access token' });
        return;
      }

      const tokenPayload = verifyQuizAccessToken(quizAccessToken, quizId, socket.userId);
      if (!tokenPayload) {
        socket.emit('quiz_error', { code: 'ACCESS_DENIED', message: 'Invalid or expired quiz access token' });
        return;
      }

      const hostJoin = tokenPayload.accessRole === 'host';

      try {
        let room = quizStore.getRoom(quizId);

        // If not in memory, check DB
        if (!room) {
          // Single query: quiz + questions together
          const quiz = await prisma.quiz.findUnique({
            where: { id: quizId },
            select: {
              id: true, status: true, title: true, createdBy: true,
              questionCount: true, joinCode: true, pin: true,
              questions: { orderBy: { position: 'asc' } },
            },
          });

          if (!quiz) {
            socket.emit('quiz_error', { code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
            return;
          }

          if (quiz.status === 'FINISHED' || quiz.status === 'ABANDONED') {
            socket.emit('quiz_error', { code: 'QUIZ_ENDED', message: 'This quiz has ended' });
            return;
          }

          if (quiz.status === 'DRAFT') {
            socket.emit('quiz_error', { code: 'QUIZ_NOT_STARTED', message: 'This quiz has not been opened yet' });
            return;
          }

          // Quiz exists and is WAITING/ACTIVE but not in memory (server restarted)
          // Questions were already fetched in the same query; use them directly
          if (quiz.status === 'WAITING' || quiz.status === 'ACTIVE') {
            room = quizStore.initQuiz(
              quizId,
              quiz.questions.map((q) => ({
                id: q.id,
                position: q.position,
                questionText: q.questionText,
                questionType: q.questionType as QuizQuestionData['questionType'],
                options: q.options as string[] | null,
                correctAnswer: q.correctAnswer,
                timeLimitSeconds: q.timeLimitSeconds,
                points: q.points,
                mediaUrl: q.mediaUrl,
              })),
              quiz.createdBy,
              '', // No admin socket yet
              quiz.title,
              quiz.joinCode,
              (quiz as any).pin,
            );
          }
        }

        if (!room) {
          socket.emit('quiz_error', { code: 'QUIZ_NOT_AVAILABLE', message: 'Quiz is not available to join' });
          return;
        }
        if (room.status === 'finished') {
          socket.emit('quiz_error', { code: 'QUIZ_ENDED', message: 'This quiz has ended' });
          return;
        }

        // Join socket room
        socket.join(quizId);
        socket.currentQuizId = quizId;

        // Add participant state only for participant joins.
        // Also skip adding the quiz creator as a player even if they join with a participant token.
        const isCreator = socket.userId === room.adminUserId;
        const result = (hostJoin || isCreator)
          ? null
          : quizStore.addPlayer(quizId, socket.userId, socket.id, socket.userDisplayName || 'Player');

        // Track current host socket for admin notifications.
        if (hostJoin || isCreator) {
          if (socket.userId === room.adminUserId) {
            quizStore.updateAdminSocket(quizId, socket.userId, socket.id);
          } else {
            room.adminSocketId = socket.id;
          }
        }

        // Cancel empty room cleanup since someone joined
        quizStore.cancelEmptyRoomCleanup(quizId);

        if (!hostJoin && !isCreator) {
          // Upsert participant in DB (async, non-blocking)
          prisma.quizParticipant.upsert({
            where: { quizId_userId: { quizId, userId: socket.userId } },
            create: {
              quizId,
              userId: socket.userId,
              displayName: socket.userDisplayName || 'Player',
            },
            update: {
              displayName: socket.userDisplayName || 'Player',
            },
          }).catch((err) => {
            logger.error('Failed to upsert quiz participant', { error: err.message });
          });
        }

        // Build player list for response
        const players = quizStore.getPlayersArray(quizId);
        const playerState = hostJoin ? null : room.players.get(socket.userId);

        // Build response
        const isAdmin = hostJoin || socket.userId === room.adminUserId;
        const confirmPayload: Record<string, any> = {
          quizId,
          title: room.meta.title,
          status: room.status,
          players,
          totalQuestions: room.meta.totalQuestions,
          yourScore: playerState?.score ?? 0,
          yourRank: null,
          isAdmin,
          joinCode: isAdmin ? room.joinCode : undefined,
          pin: isAdmin ? room.pin : undefined,
        };

        // If quiz is active (mid-question on rejoin), include current question
        if (room.status === 'active' && room.currentQuestionIndex >= 0) {
          const currentQ = room.questions[room.currentQuestionIndex];
          if (currentQ) {
            const timeElapsedMs = Date.now() - room.currentQuestionStartTime;
            confirmPayload.currentQuestion = {
              ...sanitizeQuestionForClient(currentQ, room.currentQuestionIndex, room.meta.totalQuestions),
              timeElapsedMs,
            };
          }
        }

        socket.emit('join_confirmed', confirmPayload);

        // Notify others if new player
        if (!hostJoin && result?.isNew) {
          socket.to(quizId).emit('player_joined', {
            userId: socket.userId,
            displayName: socket.userDisplayName,
            totalPlayers: players.length,
          });

          // Host-only: refresh player status list
          if (room.adminSocketId && room.status === 'active') {
            const playerStatuses = [...room.players.entries()].map(([userId, player]) => ({
              userId,
              answered: player.answeredCurrentQuestion,
              connected: player.connected,
            }));
            quizNamespace.to(room.adminSocketId).emit('player_status_update', playerStatuses);
          }
        }
      } catch (error) {
        logger.error('join_quiz error', { error: error instanceof Error ? error.message : String(error) });
        socket.emit('quiz_error', { code: 'SERVER_ERROR', message: 'Failed to join quiz' });
      }
    });

    // ─── start_quiz ──────────────────────────────────────────────────────
    socket.on('start_quiz', async ({ quizId }: { quizId: string }) => {
      if (!socket.userId || !quizId) return;

      try {
        let room = quizStore.getRoom(quizId);

        // If room not in memory yet, load from DB (admin opening the quiz)
        if (!room) {
          const quiz = await prisma.quiz.findUnique({
            where: { id: quizId },
            include: {
              questions: { orderBy: { position: 'asc' } },
            },
          });

          if (!quiz) {
            socket.emit('quiz_error', { code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
            return;
          }

          const isPrivilegedAdmin = ['ADMIN', 'PRESIDENT'].includes(socket.userRole || '');
          if (quiz.createdBy !== socket.userId && !isPrivilegedAdmin) {
            socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only quiz hosts can start it' });
            return;
          }

          const questions: QuizQuestionData[] = quiz.questions.map((q) => ({
            id: q.id,
            position: q.position,
            questionText: q.questionText,
            questionType: q.questionType as QuizQuestionData['questionType'],
            options: q.options as string[] | null,
            correctAnswer: q.correctAnswer,
            timeLimitSeconds: q.timeLimitSeconds,
            points: q.points,
            mediaUrl: q.mediaUrl,
          }));

          room = quizStore.initQuiz(quizId, questions, socket.userId, socket.id, quiz.title);
        } else {
          // Verify admin
          if (!canControlQuiz(room, socket)) {
            socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only quiz hosts can start it' });
            return;
          }
        }

        // Update DB status
        await prisma.quiz.update({
          where: { id: quizId },
          data: { status: 'ACTIVE', startedAt: new Date() },
        });

        room.status = 'active';

        // Emit quiz_started to room
        quizNamespace.to(quizId).emit('quiz_started', {
          quizId,
          title: room.meta.title,
          totalQuestions: room.meta.totalQuestions,
          playerCount: room.players.size,
        });

        // Immediately advance to first question
        const advancement = quizStore.advanceQuestion(quizId);
        if (!advancement.done && advancement.question) {
          const q = advancement.question;
          room.currentQuestionStartTime = Date.now();

          quizNamespace.to(quizId).emit('show_question', sanitizeQuestionForClient(
            q, advancement.questionIndex!, room.meta.totalQuestions,
          ));

          // Host-only: reset status — everyone is ⏳ at question start
          if (room.adminSocketId) {
            const playerStatuses = [...room.players.entries()].map(([userId, player]) => ({
              userId,
              answered: false,
              connected: player.connected,
            }));
            quizNamespace.to(room.adminSocketId).emit('player_status_update', playerStatuses);
          }

          // Auto-advance timer
          room.autoAdvanceTimer = setTimeout(() => {
            handleAutoAdvance(quizId);
          }, (q.timeLimitSeconds + 3) * 1000);
        }
      } catch (error) {
        logger.error('start_quiz error', { error: error instanceof Error ? error.message : String(error) });
        socket.emit('quiz_error', { code: 'SERVER_ERROR', message: 'Failed to start quiz' });
      }
    });

    // ─── next_question ───────────────────────────────────────────────────
    socket.on('next_question', async ({ quizId }: { quizId: string }) => {
      if (!socket.userId || !quizId) return;

      const room = quizStore.getRoom(quizId);
      if (!room) {
        socket.emit('quiz_error', { code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
        return;
      }

      if (!canControlQuiz(room, socket)) {
        socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only quiz hosts can advance questions' });
        return;
      }

      const shouldRevealCurrentQuestion = canRevealCurrentQuestion(room);
      const currentQ = room.questions[room.currentQuestionIndex];
      const isUnscoredType = currentQ && ['POLL', 'RATING', 'OPEN_ENDED'].includes(currentQ.questionType);

      // Clear auto-advance timer
      if (room.autoAdvanceTimer) {
        clearTimeout(room.autoAdvanceTimer);
        room.autoAdvanceTimer = null;
      }

      // Emit results when timer has completed, OR always for unscored types
      // (POLL/RATING/OPEN_ENDED have no correct answer to leak on early advance).
      if (shouldRevealCurrentQuestion || isUnscoredType) {
        emitQuestionResults(quizId, room);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const advancement = quizStore.advanceQuestion(quizId);

      if (advancement.done) {
        const leaderboard = quizStore.getLeaderboard(quizId);
        const totalQuestions = room.meta.totalQuestions;

        quizNamespace.to(quizId).emit('quiz_finishing', {});
        quizNamespace.to(quizId).emit('final_leaderboard', {
          leaderboard,
          totalQuestions,
        });
        await quizStore.persistResultsAndCleanup(quizId, 'FINISHED');
      } else if (advancement.question) {
        const q = advancement.question;
        room.currentQuestionStartTime = Date.now();

        quizNamespace.to(quizId).emit('show_question', sanitizeQuestionForClient(
          q, advancement.questionIndex!, room.meta.totalQuestions,
        ));

        // Host-only: reset status
        if (room.adminSocketId) {
          const playerStatuses = [...room.players.entries()].map(([userId, player]) => ({
            userId,
            answered: false,
            connected: player.connected,
          }));
          quizNamespace.to(room.adminSocketId).emit('player_status_update', playerStatuses);
        }

        room.autoAdvanceTimer = setTimeout(() => {
          handleAutoAdvance(quizId);
        }, (q.timeLimitSeconds + 3) * 1000);
      }
    });

    // ─── submit_answer ───────────────────────────────────────────────────
    socket.on('submit_answer', ({ quizId, answer, questionId }: { quizId: string; answer: string; questionId: string }) => {
      if (!socket.userId || !quizId) return;

      // Rate limit
      if (!quizStore.checkRateLimit(socket.userId)) {
        socket.emit('quiz_error', { code: 'RATE_LIMITED', message: 'Too fast, slow down' });
        return;
      }

      const result = quizStore.submitAnswer(quizId, socket.userId, answer);

      if ('error' in result) {
        socket.emit('quiz_error', { code: 'ANSWER_REJECTED', message: result.error });
        return;
      }

      // Respond to submitter
      socket.emit('answer_received', {
        accepted: true,
      });

      // Unicast per-player scoring feedback
      socket.emit('answer_result', {
        isCorrect: result.isCorrect,
        isPoll: result.isPoll,
        pointsAwarded: result.pointsAwarded,
        timeMs: result.timeMs,
        newScore: result.newScore,
        newStreak: result.newStreak,
      });

      // Throttled broadcast of answer count to room
      const room = quizStore.getRoom(quizId);
      if (room) {
        const currentQ = room.questions[room.currentQuestionIndex];
        const isPollOrRating = currentQ && (currentQ.questionType === 'POLL' || currentQ.questionType === 'RATING');

        // Throttled: batches updates to max ~1.3×/sec
        scheduleAnswerCountBroadcast(quizId, quizNamespace);

        // For POLL/RATING: broadcast live results to everyone as votes come in
        if (isPollOrRating) {
          quizNamespace.to(quizId).emit('poll_results_update', {
            distribution: quizStore.getAnswerDistribution(quizId),
            totalResponses: room.currentAnswers.size,
          });
        }
      }
    });

    // ─── end_quiz ────────────────────────────────────────────────────────
    socket.on('end_quiz', async ({ quizId }: { quizId: string }) => {
      if (!socket.userId || !quizId) return;

      const room = quizStore.getRoom(quizId);
      if (!room) {
        socket.emit('quiz_error', { code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
        return;
      }

      if (!canControlQuiz(room, socket)) {
        socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only quiz hosts can end the quiz' });
        return;
      }

      if (room.autoAdvanceTimer) {
        clearTimeout(room.autoAdvanceTimer);
        room.autoAdvanceTimer = null;
      }

      const leaderboard = quizStore.getLeaderboard(quizId);
      const totalQuestions = room.meta.totalQuestions;

      quizNamespace.to(quizId).emit('final_leaderboard', {
        leaderboard,
        totalQuestions,
      });

      await quizStore.persistResultsAndCleanup(quizId, 'FINISHED');
    });

    // ─── kick_player ───────────────────────────────────────────────────
    socket.on('kick_player', ({ quizId, userId: targetUserId }: { quizId: string; userId: string }) => {
      if (!socket.userId || !quizId) return;

      const room = quizStore.getRoom(quizId);
      if (!room || !canControlQuiz(room, socket)) {
        socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only admin can kick players' });
        return;
      }

      const result = quizStore.kickPlayer(quizId, targetUserId);
      if (!result) return;

      // Notify the kicked player
      quizNamespace.to(result.socketId).emit('player_kicked', { reason: 'Removed by host' });

      // Force disconnect from room
      const kickedSocket = quizNamespace.sockets.get(result.socketId);
      if (kickedSocket) {
        kickedSocket.leave(quizId);
      }

      // Notify room
      quizNamespace.to(quizId).emit('player_left', {
        userId: targetUserId,
        displayName: result.displayName,
        totalPlayers: quizStore.getConnectedPlayerCount(quizId),
      });
    });

    // ─── pause_quiz ──────────────────────────────────────────────────────
    socket.on('pause_quiz', ({ quizId }: { quizId: string }) => {
      if (!socket.userId || !quizId) return;

      const room = quizStore.getRoom(quizId);
      if (!room || !canControlQuiz(room, socket)) {
        socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only admin can pause' });
        return;
      }

      if (quizStore.pauseQuiz(quizId)) {
        quizNamespace.to(quizId).emit('quiz_paused', {});
      }
    });

    // ─── resume_quiz ─────────────────────────────────────────────────────
    socket.on('resume_quiz', ({ quizId }: { quizId: string }) => {
      if (!socket.userId || !quizId) return;

      const room = quizStore.getRoom(quizId);
      if (!room || !canControlQuiz(room, socket)) {
        socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only admin can resume' });
        return;
      }

      const result = quizStore.resumeQuiz(quizId);
      if (result) {
        quizNamespace.to(quizId).emit('quiz_resumed', { remainingMs: result.remainingMs });

        // Restart auto-advance timer with remaining time
        const question = room.questions[room.currentQuestionIndex];
        if (question) {
          room.autoAdvanceTimer = setTimeout(() => {
            handleAutoAdvance(quizId);
          }, result.remainingMs + 3000);
        }
      }
    });

    // ─── extend_time ─────────────────────────────────────────────────────
    socket.on('extend_time', ({ quizId, extraSeconds = 15 }: { quizId: string; extraSeconds?: number }) => {
      if (!socket.userId || !quizId) return;

      const room = quizStore.getRoom(quizId);
      if (!room || !canControlQuiz(room, socket)) {
        socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only admin can extend time' });
        return;
      }

      // Clear existing auto-advance timer
      if (room.autoAdvanceTimer) {
        clearTimeout(room.autoAdvanceTimer);
      }

      // Extend the start time backwards to give more time
      room.currentQuestionStartTime -= extraSeconds * 1000;

      // Set new auto-advance timer
      const question = room.questions[room.currentQuestionIndex];
      if (question) {
        const elapsed = Date.now() - room.currentQuestionStartTime;
        const remaining = (question.timeLimitSeconds * 1000) - elapsed + 3000;
        room.autoAdvanceTimer = setTimeout(() => {
          handleAutoAdvance(quizId);
        }, Math.max(remaining, 3000));
      }

      quizNamespace.to(quizId).emit('timer_extended', { extraSeconds });
    });

    // ─── skip_question ───────────────────────────────────────────────────
    socket.on('skip_question', async ({ quizId }: { quizId: string }) => {
      if (!socket.userId || !quizId) return;

      const room = quizStore.getRoom(quizId);
      if (!room || !canControlQuiz(room, socket)) {
        socket.emit('quiz_error', { code: 'FORBIDDEN', message: 'Only admin can skip questions' });
        return;
      }

      const shouldRevealCurrentQuestion = canRevealCurrentQuestion(room);
      const currentQ = room.questions[room.currentQuestionIndex];
      const isUnscoredType = currentQ && ['POLL', 'RATING', 'OPEN_ENDED'].includes(currentQ.questionType);

      // Clear auto-advance timer
      if (room.autoAdvanceTimer) {
        clearTimeout(room.autoAdvanceTimer);
        room.autoAdvanceTimer = null;
      }

      // Emit results when timer completed, OR always for unscored types
      // (POLL/RATING/OPEN_ENDED have no correct answer to leak on early skip).
      if (shouldRevealCurrentQuestion || isUnscoredType) {
        emitQuestionResults(quizId, room);
      }

      // Immediately advance (no 3s delay for skip)
      const advancement = quizStore.advanceQuestion(quizId);
      if (advancement.done) {
        const leaderboard = quizStore.getLeaderboard(quizId);
        quizNamespace.to(quizId).emit('quiz_finishing', {});
        quizNamespace.to(quizId).emit('final_leaderboard', { leaderboard, totalQuestions: room.meta.totalQuestions });
        await quizStore.persistResultsAndCleanup(quizId, 'FINISHED');
      } else if (advancement.question) {
        const q = advancement.question;
        room.currentQuestionStartTime = Date.now();
        quizNamespace.to(quizId).emit('show_question', sanitizeQuestionForClient(
          q, advancement.questionIndex!, room.meta.totalQuestions,
        ));

        // Host-only: reset status
        if (room.adminSocketId) {
          const playerStatuses = [...room.players.entries()].map(([userId, player]) => ({
            userId,
            answered: false,
            connected: player.connected,
          }));
          quizNamespace.to(room.adminSocketId).emit('player_status_update', playerStatuses);
        }
        room.autoAdvanceTimer = setTimeout(() => {
          handleAutoAdvance(quizId);
        }, (q.timeLimitSeconds + 3) * 1000);
      }
    });

    // ─── disconnect ──────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const quizId = socket.currentQuizId;
      if (!quizId || !socket.userId) return;

      const room = quizStore.getRoom(quizId);
      if (!room) return;

      const result = quizStore.markPlayerDisconnected(quizId, socket.userId);
      if (socket.userId === room.adminUserId) {
        if (room.adminSocketId === socket.id) {
          room.adminSocketId = null;
        }
        quizNamespace.to(quizId).emit('admin_disconnected', {});
      }

      if (result) {
        // Notify room
        quizNamespace.to(quizId).emit('player_disconnected', {
          userId: socket.userId,
          displayName: result.displayName,
          connectedPlayers: result.connectedPlayers,
        });

        // Host-only: refresh player status to show 🔴 immediately
        if (room.adminSocketId) {
          const playerStatuses = [...room.players.entries()].map(([userId, player]) => ({
            userId,
            answered: player.answeredCurrentQuestion,
            connected: player.connected,
          }));
          quizNamespace.to(room.adminSocketId).emit('player_status_update', playerStatuses);
        }
      }

      // Schedule cleanup if no participants are connected
      if (quizStore.getConnectedPlayerCount(quizId) === 0) {
        quizStore.scheduleEmptyRoomCleanup(quizId, io);
      }
    });
  });

  // ─── Auto-advance handler ──────────────────────────────────────────────
  async function handleAutoAdvance(quizId: string) {
    const room = quizStore.getRoom(quizId);
    if (!room) return;

    // Emit results for current question
    if (canRevealCurrentQuestion(room)) {
      emitQuestionResults(quizId, room);
    }

    // Wait 3 seconds before advancing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const advancement = quizStore.advanceQuestion(quizId);

    if (advancement.done) {
      const leaderboard = quizStore.getLeaderboard(quizId);
      const totalQuestions = room.meta.totalQuestions;

      quizNamespace.to(quizId).emit('quiz_finishing', {});
      quizNamespace.to(quizId).emit('final_leaderboard', { leaderboard, totalQuestions });

      await quizStore.persistResultsAndCleanup(quizId, 'FINISHED');
    } else if (advancement.question) {
      const q = advancement.question;
      // We need room reference again since advanceQuestion mutates
      const updatedRoom = quizStore.getRoom(quizId);
      if (updatedRoom) {
        updatedRoom.currentQuestionStartTime = Date.now();

        quizNamespace.to(quizId).emit('show_question', sanitizeQuestionForClient(
          q, advancement.questionIndex!, updatedRoom.meta.totalQuestions,
        ));

        // Host-only: reset status
        if (updatedRoom.adminSocketId) {
          const playerStatuses = [...updatedRoom.players.entries()].map(([userId, player]) => ({
            userId,
            answered: false,
            connected: player.connected,
          }));
          quizNamespace.to(updatedRoom.adminSocketId).emit('player_status_update', playerStatuses);
        }

        updatedRoom.autoAdvanceTimer = setTimeout(() => {
          handleAutoAdvance(quizId);
        }, (q.timeLimitSeconds + 3) * 1000);
      }
    }
  }

  return quizNamespace;
}
