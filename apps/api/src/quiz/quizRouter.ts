/**
 * Quiz REST API routes.
 * All quiz create/read/edit/delete operations.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { getJwtSecret } from '../utils/jwt.js';
import { quizStore } from './quizStore.js';
import rateLimit from 'express-rate-limit';

export const quizRouter = Router();

// ---------------------------------------------------------------------------
// Quiz feature-enabled gate (1-minute cache, fail-open to avoid blocking on
// DB cold-start)
// ---------------------------------------------------------------------------
const QUIZ_SETTINGS_CACHE_TTL_MS = 60 * 1000;
const quizSettingsCache: { expiresAt: number; enabled: boolean } = {
  expiresAt: 0,
  enabled: true,
};

const getCachedQuizEnabled = async (): Promise<boolean> => {
  const now = Date.now();
  if (now < quizSettingsCache.expiresAt) return quizSettingsCache.enabled;
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { quizEnabled: true },
    });
    quizSettingsCache.enabled = settings?.quizEnabled !== false;
  } catch {
    // On DB error leave cached value unchanged; fail-open
  }
  quizSettingsCache.expiresAt = now + QUIZ_SETTINGS_CACHE_TTL_MS;
  return quizSettingsCache.enabled;
};

// Apply gate to all quiz REST routes
quizRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enabled = await getCachedQuizEnabled();
    if (!enabled) {
      return res.status(403).json({
        success: false,
        error: { message: 'Live Quiz is currently disabled' },
      });
    }
    next();
  } catch (err) {
    logger.error('Quiz feature-gate check failed', { error: err });
    next();
  }
});

// Rate limit quiz creation: max 10 per hour per IP
const quizCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many quiz creations, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit join-code lookups and PIN joins to reduce brute-force attempts
const quizLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many join-code lookups, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const quizJoinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many PIN attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

type QuizAccessRole = 'participant' | 'host';

interface QuizAccessTokenPayload {
  userId: string;
  quizId: string;
  accessRole: QuizAccessRole;
}

type SupportedQuestionType = 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'POLL' | 'RATING' | 'MULTI_SELECT' | 'OPEN_ENDED';

function signQuizAccessToken(payload: QuizAccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '20m' });
}

// ─── Validation schemas ──────────────────────────────────────────────────

const questionSchema = z.object({
  position: z.number().int().min(0),
  questionText: z.string().min(1, 'Question text is required'),
  questionType: z.enum(['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'POLL', 'RATING', 'MULTI_SELECT', 'OPEN_ENDED']),
  options: z.array(z.string()).nullable().optional(),
  correctAnswer: z.string().nullable().optional(),
  timeLimitSeconds: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(0).default(100),
  mediaUrl: z.string().url().nullable().optional(),
});

const createQuizSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().nullable().optional(),
  questions: z.array(questionSchema).min(1, 'At least 1 question required').max(50, 'Maximum 50 questions'),
});

const updateQuizSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  questions: z.array(questionSchema).min(1).max(50).optional(),
});

const UNSCORED_QUESTION_TYPES = new Set<SupportedQuestionType>(['POLL', 'RATING', 'OPEN_ENDED']);

function parseJsonArrayString(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const values = parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);

    if (values.length === 0) return null;
    return Array.from(new Set(values));
  } catch {
    return null;
  }
}

function validateQuizQuestions(questions: z.infer<typeof questionSchema>[]): string | null {
  for (const q of questions) {
    const normalizedOptions = (q.options || []).map((option) => option.trim()).filter(Boolean);

    if (normalizedOptions.length > 0 && new Set(normalizedOptions).size !== normalizedOptions.length) {
      return `Question "${q.questionText.substring(0, 50)}..." has duplicate options`;
    }

    if ((q.questionType === 'MCQ' || q.questionType === 'TRUE_FALSE' || q.questionType === 'MULTI_SELECT' || q.questionType === 'POLL') && (!q.options || q.options.length < 2)) {
      return `Question "${q.questionText.substring(0, 50)}..." must have at least 2 options`;
    }

    if (q.questionType === 'MCQ' && !q.correctAnswer) {
      return 'MCQ question must have a correct answer marked';
    }

    if (q.questionType === 'TRUE_FALSE' && !q.correctAnswer) {
      return 'True/False question must have a correct answer';
    }

    if (q.questionType === 'SHORT_ANSWER' && !q.correctAnswer) {
      return 'Short answer question must have a correct answer';
    }

    if (q.questionType === 'MULTI_SELECT') {
      if (!q.correctAnswer) {
        return 'Multi-select question must have at least one correct answer marked';
      }

      const options = normalizedOptions;
      const correctAnswers = parseJsonArrayString(q.correctAnswer);

      if (options.length < 2) {
        return `Question "${q.questionText.substring(0, 50)}..." must have at least 2 options`;
      }

      if (!correctAnswers) {
        return 'Multi-select correct answers must be a JSON array of option labels';
      }

      const invalidCorrectAnswer = correctAnswers.find((answer) => !options.includes(answer));
      if (invalidCorrectAnswer) {
        return `Multi-select correct answer "${invalidCorrectAnswer}" must match one of the configured options`;
      }
    }

    if (q.questionType === 'OPEN_ENDED' && q.correctAnswer && q.correctAnswer.trim()) {
      return 'Open-ended questions cannot have a correct answer';
    }
  }

  return null;
}

function formatAnswerDisplay(
  raw: string | null | undefined,
  questionType: SupportedQuestionType,
): string {
  if (!raw) return '-';
  if (questionType !== 'MULTI_SELECT') return raw;

  const values = parseJsonArrayString(raw);
  return values ? values.join(', ') : raw;
}

function formatOptionsDisplay(
  options: string[] | null | undefined,
  questionType: SupportedQuestionType,
): string {
  if (questionType === 'OPEN_ENDED') return 'Free text response';
  if (!options?.length) return '-';
  return options.join(', ');
}

// ─── POST /api/quiz — Create quiz + questions (CORE_MEMBER+) ────────────

quizRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), quizCreateLimiter, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const parsed = createQuizSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.validationError(
        res,
        parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }

    const { title, description, questions } = parsed.data;

    const validationError = validateQuizQuestions(questions);
    if (validationError) {
      return ApiResponse.badRequest(res, validationError);
    }

    const quiz = await prisma.$transaction(async (tx) => {
      const createdQuiz = await tx.quiz.create({
        data: {
          title,
          description: description || null,
          createdBy: user.id,
          questionCount: questions.length,
          status: 'DRAFT',
        },
      });

      await tx.quizQuestion.createMany({
        data: questions.map((q) => ({
          quizId: createdQuiz.id,
          position: q.position,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options ? q.options : Prisma.JsonNull,
          correctAnswer: q.correctAnswer || null,
          timeLimitSeconds: q.timeLimitSeconds,
          points: q.points,
          mediaUrl: q.mediaUrl || null,
        })),
      });

      return createdQuiz;
    });

    return ApiResponse.created(res, { id: quiz.id, title: quiz.title }, 'Quiz created');
  } catch (error) {
    logger.error('POST /api/quiz error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/active — List active/waiting quizzes (auth users) ────

quizRouter.get('/active', authMiddleware, async (_req: Request, res: Response) => {
  try {
    // Check in-memory store first
    const activeIds = quizStore.getAllActiveQuizIds();

    if (activeIds.length > 0) {
      // Build response from RAM
      const quizzes = activeIds.map((id) => {
        const room = quizStore.getRoom(id);
        if (!room) return null;
        return {
          id,
          title: room.meta.title,
          status: room.status.toUpperCase(),
          questionCount: room.meta.totalQuestions,
          participantCount: room.players.size,
        };
      }).filter(Boolean);

      return ApiResponse.success(res, quizzes);
    }

    // Fallback to DB
    const quizzes = await prisma.quiz.findMany({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      select: {
        id: true,
        title: true,
        status: true,
        questionCount: true,
        createdAt: true,
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return ApiResponse.success(res, quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      questionCount: q.questionCount,
      participantCount: q._count.participants,
      createdAt: q.createdAt,
    })));
  } catch (error) {
    logger.error('GET /api/quiz/active error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/history/me — User's quiz history ─────────────────────

quizRouter.get('/history/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const participations = await prisma.quizParticipant.findMany({
      where: { userId: user.id, quiz: { status: 'FINISHED' } },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            endedAt: true,
            questionCount: true,
            _count: { select: { participants: true } },
          },
        },
      },
      orderBy: { quiz: { endedAt: 'desc' } },
      take: 20,
    });

    return ApiResponse.success(res, participations.map((p) => ({
      quizId: p.quiz.id,
      title: p.quiz.title,
      endedAt: p.quiz.endedAt,
      questionCount: p.quiz.questionCount,
      finalScore: p.finalScore,
      finalRank: p.finalRank,
      correctCount: p.correctCount,
      totalParticipants: p.quiz._count.participants,
      joinedMidQuiz: p.joinedMidQuiz ?? false,
    })));
  } catch (error) {
    logger.error('GET /api/quiz/history/me error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/my-history — Alias for /history/me (frontend compat) ──

quizRouter.get('/my-history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const participations = await prisma.quizParticipant.findMany({
      where: { userId: user.id, quiz: { status: 'FINISHED' } },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            endedAt: true,
            questionCount: true,
            _count: { select: { participants: true } },
          },
        },
      },
      orderBy: { quiz: { endedAt: 'desc' } },
      take: 20,
    });

    return ApiResponse.success(res, participations.map((p) => ({
      quizId: p.quiz.id,
      title: p.quiz.title,
      endedAt: p.quiz.endedAt,
      questionCount: p.quiz.questionCount,
      finalScore: p.finalScore,
      finalRank: p.finalRank,
      correctCount: p.correctCount,
      totalParticipants: p.quiz._count.participants,
      joinedMidQuiz: p.joinedMidQuiz ?? false,
    })));
  } catch (error) {
    logger.error('GET /api/quiz/my-history error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/lookup/:code — Find quiz by join code (alphanumeric) ──

quizRouter.get('/lookup/:code', authMiddleware, quizLookupLimiter, async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const normalizedCode = code.toUpperCase().trim();

    if (!/^[A-Z0-9]{4}$/.test(normalizedCode)) {
      return ApiResponse.badRequest(res, 'Invalid code format. Must be 4 characters.');
    }

    const quiz = await prisma.quiz.findUnique({
      where: { joinCode: normalizedCode },
      select: { id: true, title: true, status: true, questionCount: true },
    });

    if (!quiz) {
      return ApiResponse.notFound(res, 'No quiz found with that code');
    }

    if (quiz.status === 'FINISHED' || quiz.status === 'ABANDONED') {
      return ApiResponse.badRequest(res, 'This quiz has already ended');
    }

    if (quiz.status === 'DRAFT') {
      return ApiResponse.badRequest(res, 'This quiz has not been opened yet');
    }

    return ApiResponse.success(res, {
      quizId: quiz.id,
      title: quiz.title,
      status: quiz.status,
      questionCount: quiz.questionCount,
    });
  } catch (error) {
    logger.error('GET /api/quiz/lookup/:code error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── POST /api/quiz/join — Find quiz by 6-digit PIN ────────────────────

quizRouter.post('/join', authMiddleware, quizJoinLimiter, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const { pin } = req.body;
    if (!pin || typeof pin !== 'string') {
      return ApiResponse.badRequest(res, 'PIN is required');
    }

    const normalizedPin = pin.trim();
    if (!/^\d{6}$/.test(normalizedPin)) {
      return ApiResponse.badRequest(res, 'Invalid PIN format. Must be 6 digits.');
    }

    // Check in-memory store first for speed
    for (const quizId of quizStore.getAllActiveQuizIds()) {
      const room = quizStore.getRoom(quizId);
      if (room && room.pin === normalizedPin && (room.status === 'waiting' || room.status === 'active' || room.status === 'paused')) {
        const quizAccessToken = signQuizAccessToken({
          userId: user.id,
          quizId: room.quizId,
          accessRole: 'participant',
        });
        return ApiResponse.success(res, {
          quizId: room.quizId,
          title: room.meta.title,
          status: room.status.toUpperCase(),
          questionCount: room.meta.totalQuestions,
          quizAccessToken,
        });
      }
    }

    // Fallback to DB
    const quiz = await prisma.quiz.findFirst({
      where: { pin: normalizedPin, pinActive: true, status: { in: ['WAITING', 'ACTIVE'] } },
      select: { id: true, title: true, status: true, questionCount: true },
    });

    if (!quiz) {
      return ApiResponse.notFound(res, 'No active quiz found with that PIN');
    }

    const quizAccessToken = signQuizAccessToken({
      userId: user.id,
      quizId: quiz.id,
      accessRole: 'participant',
    });

    return ApiResponse.success(res, {
      quizId: quiz.id,
      title: quiz.title,
      status: quiz.status,
      questionCount: quiz.questionCount,
      quizAccessToken,
    });
  } catch (error) {
    logger.error('POST /api/quiz/join error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/my-dashboard — User's live + history quizzes ─────────

quizRouter.get('/my-dashboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    // Live quizzes: WAITING or ACTIVE where user is a participant
    const liveParticipations = await prisma.quizParticipant.findMany({
      where: {
        userId: user.id,
        quiz: { status: { in: ['WAITING', 'ACTIVE'] } },
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            status: true,
            questionCount: true,
            _count: { select: { participants: true } },
          },
        },
      },
    });

    // Also check in-memory store for live quizzes where user is a player
    // (they might not be in DB yet if they just joined)
    const activeIds = quizStore.getAllActiveQuizIds();
    const inMemoryLive: Array<{
      id: string;
      title: string;
      status: string;
      questionCount: number;
      participantCount: number;
    }> = [];

    for (const qid of activeIds) {
      const room = quizStore.getRoom(qid);
      if (room && room.players.has(user.id)) {
        const alreadyInList = liveParticipations.some((p) => p.quiz.id === qid);
        if (!alreadyInList) {
          inMemoryLive.push({
            id: qid,
            title: room.meta.title,
            status: room.status.toUpperCase(),
            questionCount: room.meta.totalQuestions,
            participantCount: room.players.size,
          });
        }
      }
    }

    const liveQuizzes = [
      ...liveParticipations.map((p) => ({
        id: p.quiz.id,
        title: p.quiz.title,
        status: p.quiz.status,
        questionCount: p.quiz.questionCount,
        participantCount: p.quiz._count.participants,
      })),
      ...inMemoryLive,
    ];

    // History: finished quizzes the user participated in
    const historyParticipations = await prisma.quizParticipant.findMany({
      where: {
        userId: user.id,
        quiz: { status: 'FINISHED' },
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            endedAt: true,
            questionCount: true,
            _count: { select: { participants: true } },
          },
        },
      },
      orderBy: { quiz: { endedAt: 'desc' } },
      take: 20,
    });

    const history = historyParticipations.map((p) => ({
      quizId: p.quiz.id,
      title: p.quiz.title,
      endedAt: p.quiz.endedAt,
      questionCount: p.quiz.questionCount,
      finalScore: p.finalScore,
      finalRank: p.finalRank,
      correctCount: p.correctCount,
      totalParticipants: p.quiz._count.participants,
    }));

    return ApiResponse.success(res, { liveQuizzes, history });
  } catch (error) {
    logger.error('GET /api/quiz/my-dashboard error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/:quizId/check-host — Check if user is quiz host ──────
// OPTIMIZED: Checks in-memory store first, only falls back to DB if not loaded

quizRouter.get('/:quizId/check-host', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    // FAST PATH: Check in-memory store first (no DB query)
    const room = quizStore.getRoom(quizId);
    if (room) {
      const isCreator = user.id === room.meta.createdBy;
      const isAdminRole = ['ADMIN', 'PRESIDENT'].includes(user.role || '');
      const isHost = isCreator || isAdminRole;
      return ApiResponse.success(res, {
        isHost,
        isCreator,
        quizStatus: room.status.toUpperCase(),
        quizAccessToken: isHost ? signQuizAccessToken({
          userId: user.id,
          quizId,
          accessRole: 'host',
        }) : null,
      });
    }

    // SLOW PATH: Quiz not in memory, check DB (only happens for non-active quizzes)
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: { createdBy: true, status: true },
    });

    if (!quiz) return ApiResponse.notFound(res, 'Quiz not found');

    const isCreator = user.id === quiz.createdBy;
    const isAdminRole = ['ADMIN', 'PRESIDENT'].includes(user.role || '');
    const isHost = isCreator || isAdminRole;

    return ApiResponse.success(res, {
      isHost,
      isCreator,
      quizStatus: quiz.status,
      quizAccessToken: isHost ? signQuizAccessToken({
        userId: user.id,
        quizId,
        accessRole: 'host',
      }) : null,
    });
  } catch (error) {
    logger.error('GET /api/quiz/:quizId/check-host error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/:quizId — Quiz details (no correct answers) ──────────

quizRouter.get('/:quizId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            questionText: true,
            questionType: true,
            options: true,
            timeLimitSeconds: true,
            points: true,
            mediaUrl: true,
            // NO correctAnswer for non-finished quizzes
          },
        },
        creator: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    });

    if (!quiz) return ApiResponse.notFound(res, 'Quiz not found');

    const user = getAuthUser(req);
    const isCreator = user?.id === quiz.createdBy;

    // Include correct answers only if quiz is finished or user is the creator
    let questions;
    if (quiz.status === 'FINISHED' || isCreator) {
      const fullQuestions = await prisma.quizQuestion.findMany({
        where: { quizId },
        orderBy: { position: 'asc' },
      });
      questions = fullQuestions;
    } else {
      questions = quiz.questions;
    }

    return ApiResponse.success(res, {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      questionCount: quiz.questionCount,
      createdBy: quiz.creator,
      participantCount: quiz._count.participants,
      createdAt: quiz.createdAt,
      startedAt: quiz.startedAt,
      endedAt: quiz.endedAt,
      questions,
    });
  } catch (error) {
    logger.error('GET /api/quiz/:quizId error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/:quizId/results — Final leaderboard + analytics (finished) ───────

quizRouter.get('/:quizId/results', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        questionCount: true,
        createdAt: true,
        startedAt: true,
        endedAt: true,
        createdBy: true,
      },
    });

    if (!quiz) return ApiResponse.notFound(res, 'Quiz not found');
    if (quiz.status !== 'FINISHED' && quiz.status !== 'ABANDONED') {
      return ApiResponse.badRequest(res, 'Quiz has not finished yet');
    }

    // Fetch participants (leaderboard)
    const participants = await prisma.quizParticipant.findMany({
      where: { quizId },
      orderBy: [{ finalScore: 'desc' }, { totalAnswerTimeMs: 'asc' }],
      select: {
        userId: true,
        displayName: true,
        finalScore: true,
        finalRank: true,
        correctCount: true,
        totalAnswerTimeMs: true,
        questionsAnswered: true,
        joinedMidQuiz: true,
      },
    });

    const leaderboard = participants.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      score: p.finalScore,
      rank: p.finalRank,
      correctCount: p.correctCount,
      totalAnswerTimeMs: Number(p.totalAnswerTimeMs),
      questionsAnswered: p.questionsAnswered,
      joinedMidQuiz: p.joinedMidQuiz,
    }));

    const myResult = participants.find((p) => p.userId === user.id);
    const isCreator = quiz.createdBy === user.id || user.role === 'ADMIN' || user.role === 'PRESIDENT';

    // Fetch per-question analytics — stored during persistResultsAndCleanup
    const questions = await prisma.quizQuestion.findMany({
      where: { quizId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        questionText: true,
        questionType: true,
        options: true,
        correctAnswer: true,
        timeLimitSeconds: true,
        points: true,
        totalAnswers: true,
        correctCount: true,
        avgAnswerTimeMs: true,
        answerDistribution: true,
      },
    });
    const rawAnswersForCreator = isCreator
      ? await prisma.quizAnswer.findMany({
          where: { quizId },
          select: {
            userId: true,
            questionId: true,
            answerSubmitted: true,
            isCorrect: true,
            answerTimeMs: true,
          },
        })
      : [];
    const openEndedQuestionIds = new Set(
      questions
        .filter((question) => question.questionType === 'OPEN_ENDED')
        .map((question) => question.id),
    );
    const openEndedSamples = new Map<string, string[]>();

    for (const answer of rawAnswersForCreator) {
      if (!openEndedQuestionIds.has(answer.questionId) || !answer.answerSubmitted?.trim()) {
        continue;
      }

      const existing = openEndedSamples.get(answer.questionId) ?? [];
      if (existing.length < 8) {
        existing.push(answer.answerSubmitted.trim());
        openEndedSamples.set(answer.questionId, existing);
      }
    }

    // Build per-question analytics with computed inferences
    const questionAnalytics = questions.map((q) => {
      const accuracy = q.totalAnswers > 0 ? Math.round((q.correctCount / q.totalAnswers) * 100) : 0;
      const isUnscoredType = UNSCORED_QUESTION_TYPES.has(q.questionType as SupportedQuestionType);
      const distribution = (q.answerDistribution as Record<string, number> | null) ?? {};
      const correctAnswers = q.questionType === 'MULTI_SELECT' ? parseJsonArrayString(q.correctAnswer || '') || [] : [];

      // For rating questions: compute average rating
      let avgRating: number | null = null;
      if (q.questionType === 'RATING' && q.totalAnswers > 0) {
        const totalRating = Object.entries(distribution).reduce(
          (sum, [key, count]) => sum + (parseFloat(key) || 0) * count, 0
        );
        avgRating = Math.round((totalRating / q.totalAnswers) * 10) / 10;
      }

      // Find most common wrong answer (for scored questions)
      let mostCommonWrongAnswer: string | null = null;
      if (!isUnscoredType && q.correctAnswer) {
        let maxWrong = 0;
        for (const [answer, count] of Object.entries(distribution)) {
          const isWrongAnswer = q.questionType === 'MULTI_SELECT'
            ? !correctAnswers.includes(answer)
            : answer !== q.correctAnswer;

          if (isWrongAnswer && count > maxWrong) {
            maxWrong = count;
            mostCommonWrongAnswer = answer;
          }
        }
      }

      return {
        id: q.id,
        position: q.position,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        correctAnswer: isUnscoredType ? null : q.correctAnswer,
        timeLimitSeconds: q.timeLimitSeconds,
        points: q.points,
        totalAnswers: q.totalAnswers,
        correctCount: q.correctCount,
        accuracy,
        avgAnswerTimeMs: q.avgAnswerTimeMs,
        answerDistribution: q.questionType === 'OPEN_ENDED' && !isCreator ? {} : distribution,
        avgRating,
        mostCommonWrongAnswer,
        sampleResponses: q.questionType === 'OPEN_ENDED' && isCreator ? (openEndedSamples.get(q.id) ?? []) : [],
        // Unanswered = participants who didn't answer this question
        unansweredCount: Math.max(0, participants.length - q.totalAnswers),
      };
    });

    // Compute aggregate inferences
    const totalParticipants = participants.length;
    const avgScore = totalParticipants > 0
      ? Math.round(participants.reduce((s, p) => s + p.finalScore, 0) / totalParticipants)
      : 0;
    const maxPossibleScore = questions.reduce(
      (sum, question) => sum + (UNSCORED_QUESTION_TYPES.has(question.questionType as SupportedQuestionType) ? 0 : question.points),
      0,
    );
    const avgAccuracy = questions.length > 0
      ? Math.round(
          questionAnalytics
            .filter((q) => !UNSCORED_QUESTION_TYPES.has(q.questionType as SupportedQuestionType))
            .reduce((s, q) => s + q.accuracy, 0) /
          Math.max(1, questionAnalytics.filter((q) => !UNSCORED_QUESTION_TYPES.has(q.questionType as SupportedQuestionType)).length)
        )
      : 0;
    const scoredQuestions = questionAnalytics.filter(
      (q) => !UNSCORED_QUESTION_TYPES.has(q.questionType as SupportedQuestionType),
    );
    const hardestQuestion = scoredQuestions.length > 0
      ? scoredQuestions.reduce((h, q) => (q.accuracy < h.accuracy ? q : h))
      : null;
    const easiestQuestion = scoredQuestions.length > 0
      ? scoredQuestions.reduce((e, q) => (q.accuracy > e.accuracy ? q : e))
      : null;
    const fastestAvgTimeQ = scoredQuestions.length > 0
      ? scoredQuestions.reduce((f, q) =>
          q.avgAnswerTimeMs > 0 && (f.avgAnswerTimeMs === 0 || q.avgAnswerTimeMs < f.avgAnswerTimeMs) ? q : f,
        )
      : null;
    const slowestAvgTimeQ = scoredQuestions.length > 0
      ? scoredQuestions.reduce((s, q) =>
          q.avgAnswerTimeMs > s.avgAnswerTimeMs ? q : s,
        )
      : null;

    // Duration
    const durationMs = quiz.startedAt && quiz.endedAt
      ? new Date(quiz.endedAt).getTime() - new Date(quiz.startedAt).getTime()
      : null;

    // Per-player per-question answer data for heatmap (creator/admin only)
    let participantAnswers: {
      userId: string;
      questionId: string;
      isCorrect: boolean | null;
      answerTimeMs: number;
    }[] = [];

    if (isCreator) {
      participantAnswers = rawAnswersForCreator.map((a) => ({
        userId: a.userId,
        questionId: a.questionId,
        isCorrect: a.isCorrect,
        answerTimeMs: a.answerTimeMs,
      }));
    }

    return ApiResponse.success(res, {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        status: quiz.status,
        questionCount: quiz.questionCount,
        createdAt: quiz.createdAt,
        startedAt: quiz.startedAt,
        finishedAt: quiz.endedAt,
        endedAt: quiz.endedAt,
        durationMs,
      },
      leaderboard,
      myResult: myResult ? {
        rank: myResult.finalRank,
        score: myResult.finalScore,
        correctCount: myResult.correctCount,
        totalAnswerTimeMs: Number(myResult.totalAnswerTimeMs),
        questionsAnswered: myResult.questionsAnswered,
      } : null,
      // Per-question breakdown with analytics
      questionAnalytics,
      // Aggregate insights
      insights: {
        totalParticipants,
        avgScore,
        maxPossibleScore,
        avgAccuracy,
        hardestQuestion: hardestQuestion ? {
          position: hardestQuestion.position + 1,
          questionText: hardestQuestion.questionText.slice(0, 80),
          accuracy: hardestQuestion.accuracy,
        } : null,
        easiestQuestion: easiestQuestion ? {
          position: easiestQuestion.position + 1,
          questionText: easiestQuestion.questionText.slice(0, 80),
          accuracy: easiestQuestion.accuracy,
        } : null,
        fastestQuestion: fastestAvgTimeQ ? {
          position: fastestAvgTimeQ.position + 1,
          avgTimeMs: fastestAvgTimeQ.avgAnswerTimeMs,
        } : null,
        slowestQuestion: slowestAvgTimeQ ? {
          position: slowestAvgTimeQ.position + 1,
          avgTimeMs: slowestAvgTimeQ.avgAnswerTimeMs,
        } : null,
        durationMs,
      },
      isCreator,
      participantAnswers,
    });
  } catch (error) {
    logger.error('GET /api/quiz/:quizId/results error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/:quizId/export — Excel export of quiz results (CORE_MEMBER+) ───

quizRouter.get('/:quizId/export', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        questionCount: true,
        createdAt: true,
        startedAt: true,
        endedAt: true,
        createdBy: true,
        totalParticipants: true,
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            questionText: true,
            questionType: true,
            options: true,
            correctAnswer: true,
            timeLimitSeconds: true,
            points: true,
            totalAnswers: true,
            correctCount: true,
            avgAnswerTimeMs: true,
            answerDistribution: true,
          },
        },
        participants: {
          orderBy: [{ finalScore: 'desc' }, { totalAnswerTimeMs: 'asc' }],
          select: {
            userId: true,
            displayName: true,
            finalScore: true,
            finalRank: true,
            correctCount: true,
            totalAnswerTimeMs: true,
            questionsAnswered: true,
            joinedMidQuiz: true,
            joinedAt: true,
          },
        },
      },
    });

    if (!quiz) return ApiResponse.notFound(res, 'Quiz not found');
    if (quiz.status !== 'FINISHED' && quiz.status !== 'ABANDONED') {
      return ApiResponse.badRequest(res, 'Quiz has not finished yet');
    }
    if (quiz.createdBy !== user.id && user.role !== 'ADMIN' && user.role !== 'PRESIDENT') {
      return ApiResponse.forbidden(res);
    }

    // Fetch all individual answers for detailed breakdown
    const allAnswers = await prisma.quizAnswer.findMany({
      where: { quizId },
      select: {
        userId: true,
        questionId: true,
        answerSubmitted: true,
        isCorrect: true,
        pointsAwarded: true,
        answerTimeMs: true,
      },
    });

    // Build answer lookup: userId -> questionId -> answer
    const answerMap = new Map<string, Map<string, typeof allAnswers[0]>>();
    for (const a of allAnswers) {
      if (!answerMap.has(a.userId)) answerMap.set(a.userId, new Map());
      answerMap.get(a.userId)!.set(a.questionId, a);
    }
    const questionMap = new Map(quiz.questions.map((question) => [question.id, question]));
    const participantMap = new Map(quiz.participants.map((participant) => [participant.userId, participant]));

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    // Amber header style
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };

    // ── Sheet 1: Leaderboard ──
    const lbSheet = workbook.addWorksheet('Leaderboard');
    lbSheet.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Score', key: 'score', width: 12 },
      { header: 'Correct', key: 'correct', width: 10 },
      { header: 'Questions Answered', key: 'answered', width: 20 },
      { header: 'Accuracy %', key: 'accuracy', width: 12 },
      { header: 'Total Time (s)', key: 'time', width: 15 },
      { header: 'Avg Time (s)', key: 'avgTime', width: 14 },
      { header: 'Joined Mid-Quiz', key: 'midJoin', width: 16 },
    ];
    lbSheet.getRow(1).eachCell((cell) => { Object.assign(cell, { style: headerStyle }); });
    lbSheet.getRow(1).height = 25;

    for (const p of quiz.participants) {
      const accuracy = p.questionsAnswered > 0
        ? Math.round((p.correctCount / p.questionsAnswered) * 100)
        : 0;
      lbSheet.addRow({
        rank: p.finalRank ?? '-',
        name: p.displayName,
        score: p.finalScore,
        correct: p.correctCount,
        answered: p.questionsAnswered,
        accuracy,
        time: (Number(p.totalAnswerTimeMs) / 1000).toFixed(1),
        avgTime: p.questionsAnswered > 0
          ? (Number(p.totalAnswerTimeMs) / p.questionsAnswered / 1000).toFixed(2)
          : '-',
        midJoin: p.joinedMidQuiz ? 'Yes' : 'No',
      });
    }
    // Alternate row colors
    lbSheet.eachRow((row, n) => {
      if (n > 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: n % 2 === 0 ? 'FFFEF3C7' : 'FFFFFFFF' } };
      }
      row.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });

    // ── Sheet 2: Question Analytics ──
    const qaSheet = workbook.addWorksheet('Question Analytics');
    qaSheet.columns = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Question', key: 'question', width: 50 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Correct Answer', key: 'correctAns', width: 20 },
      { header: 'Total Answers', key: 'totalAns', width: 14 },
      { header: 'Correct Count', key: 'correctCnt', width: 14 },
      { header: 'Accuracy %', key: 'accuracy', width: 12 },
      { header: 'Avg Time (s)', key: 'avgTime', width: 14 },
      { header: 'Time Limit (s)', key: 'timeLimit', width: 14 },
      { header: 'Points', key: 'points', width: 10 },
      { header: 'Unanswered', key: 'unanswered', width: 12 },
      { header: 'Most Common Wrong Answer', key: 'commonWrong', width: 28 },
    ];
    qaSheet.getRow(1).eachCell((cell) => { Object.assign(cell, { style: headerStyle }); });
    qaSheet.getRow(1).height = 25;

    for (const q of quiz.questions) {
      const isUnscoredType = UNSCORED_QUESTION_TYPES.has(q.questionType as SupportedQuestionType);
      const accuracy = q.totalAnswers > 0 ? Math.round((q.correctCount / q.totalAnswers) * 100) : 0;
      const dist = (q.answerDistribution as Record<string, number> | null) ?? {};
      const multiCorrectAnswers = q.questionType === 'MULTI_SELECT' ? parseJsonArrayString(q.correctAnswer || '') || [] : [];

      let commonWrong = '-';
      if (!isUnscoredType && q.correctAnswer) {
        let maxW = 0;
        for (const [a, c] of Object.entries(dist)) {
          const isWrongAnswer = q.questionType === 'MULTI_SELECT'
            ? !multiCorrectAnswers.includes(a)
            : a !== q.correctAnswer;
          if (isWrongAnswer && c > maxW) { maxW = c; commonWrong = a; }
        }
      }

      // Avg rating for rating type
      let correctAns = isUnscoredType
        ? 'N/A'
        : formatAnswerDisplay(q.correctAnswer, q.questionType as SupportedQuestionType);
      if (q.questionType === 'RATING' && q.totalAnswers > 0) {
        const total = Object.entries(dist).reduce((s, [k, v]) => s + parseFloat(k) * v, 0);
        correctAns = `Avg: ${(total / q.totalAnswers).toFixed(1)} ★`;
      }

      qaSheet.addRow({
        num: q.position + 1,
        question: q.questionText,
        type: q.questionType,
        correctAns,
        totalAns: q.totalAnswers,
        correctCnt: isUnscoredType ? 'N/A' : q.correctCount,
        accuracy: isUnscoredType ? 'N/A' : accuracy,
        avgTime: q.avgAnswerTimeMs > 0 ? (q.avgAnswerTimeMs / 1000).toFixed(2) : '-',
        timeLimit: q.timeLimitSeconds,
        points: q.points,
        unanswered: Math.max(0, quiz.participants.length - q.totalAnswers),
        commonWrong: isUnscoredType ? 'N/A' : commonWrong,
      });
    }
    // Color: low accuracy = red tint, high = green tint
    qaSheet.eachRow((row, n) => {
      if (n > 1) {
        const accuracyCell = row.getCell('accuracy');
        const val = typeof accuracyCell.value === 'number' ? accuracyCell.value : -1;
        if (val >= 0 && val < 40) {
          accuracyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
        } else if (val >= 80) {
          accuracyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBF7D0' } };
        }
        row.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      }
    });

    // ── Sheet 3: Per-Participant Answers (detailed breakdown) ──
    const detailSheet = workbook.addWorksheet('Detailed Answers');
    const detailCols: { header: string; key: string; width: number }[] = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Name', key: 'name', width: 25 },
    ];
    for (const q of quiz.questions) {
      detailCols.push({
        header: `Q${q.position + 1} Answer`,
        key: `q${q.position}_ans`,
        width: 20,
      });
      detailCols.push({
        header: `Q${q.position + 1} Correct?`,
        key: `q${q.position}_correct`,
        width: 12,
      });
      detailCols.push({
        header: `Q${q.position + 1} Points`,
        key: `q${q.position}_pts`,
        width: 10,
      });
      detailCols.push({
        header: `Q${q.position + 1} Time (s)`,
        key: `q${q.position}_time`,
        width: 12,
      });
    }
    detailSheet.columns = detailCols;
    detailSheet.getRow(1).eachCell((cell) => { Object.assign(cell, { style: headerStyle }); });
    detailSheet.getRow(1).height = 25;

    for (const p of quiz.participants) {
      const rowData: Record<string, unknown> = {
        rank: p.finalRank ?? '-',
        name: p.displayName,
      };
      for (const q of quiz.questions) {
        const ans = answerMap.get(p.userId)?.get(q.id);
        const isUnscoredType = UNSCORED_QUESTION_TYPES.has(q.questionType as SupportedQuestionType);
        rowData[`q${q.position}_ans`] = ans?.answerSubmitted
          ? formatAnswerDisplay(ans.answerSubmitted, q.questionType as SupportedQuestionType)
          : '(no answer)';
        rowData[`q${q.position}_correct`] = !ans ? '-' : isUnscoredType ? 'N/A' : ans.isCorrect ? '✓' : '✗';
        rowData[`q${q.position}_pts`] = ans?.pointsAwarded ?? 0;
        rowData[`q${q.position}_time`] = ans ? (ans.answerTimeMs / 1000).toFixed(2) : '-';
      }
      detailSheet.addRow(rowData);
    }
    detailSheet.eachRow((row, n) => {
      if (n > 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: n % 2 === 0 ? 'FFFEF3C7' : 'FFFFFFFF' } };
      }
      row.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });

    // ── Sheet 4: All Responses (one row per submitted answer) ──
    const responsesSheet = workbook.addWorksheet('All Responses');
    responsesSheet.columns = [
      { header: 'Participant', key: 'participant', width: 28 },
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'User ID', key: 'userId', width: 30 },
      { header: 'Final Score', key: 'finalScore', width: 12 },
      { header: 'Question #', key: 'questionNumber', width: 10 },
      { header: 'Question ID', key: 'questionId', width: 30 },
      { header: 'Question Type', key: 'questionType', width: 16 },
      { header: 'Question', key: 'questionText', width: 48 },
      { header: 'Available Options', key: 'availableOptions', width: 36 },
      { header: 'Submitted Answer', key: 'submittedAnswer', width: 38 },
      { header: 'Submitted Answer (Raw)', key: 'submittedAnswerRaw', width: 38 },
      { header: 'Correct Answer', key: 'correctAnswer', width: 28 },
      { header: 'Correct Answer (Raw)', key: 'correctAnswerRaw', width: 28 },
      { header: 'Result', key: 'result', width: 14 },
      { header: 'Points Awarded', key: 'pointsAwarded', width: 14 },
      { header: 'Answer Time (s)', key: 'answerTimeSeconds', width: 16 },
    ];
    responsesSheet.getRow(1).eachCell((cell) => { Object.assign(cell, { style: headerStyle }); });
    responsesSheet.getRow(1).height = 25;
    responsesSheet.getColumn('questionText').alignment = { vertical: 'top', wrapText: true };
    responsesSheet.getColumn('availableOptions').alignment = { vertical: 'top', wrapText: true };
    responsesSheet.getColumn('submittedAnswer').alignment = { vertical: 'top', wrapText: true };
    responsesSheet.getColumn('submittedAnswerRaw').alignment = { vertical: 'top', wrapText: true };
    responsesSheet.getColumn('correctAnswer').alignment = { vertical: 'top', wrapText: true };
    responsesSheet.getColumn('correctAnswerRaw').alignment = { vertical: 'top', wrapText: true };

    const sortedAnswers = [...allAnswers].sort((left, right) => {
      const leftQuestion = questionMap.get(left.questionId);
      const rightQuestion = questionMap.get(right.questionId);
      if ((leftQuestion?.position ?? 0) !== (rightQuestion?.position ?? 0)) {
        return (leftQuestion?.position ?? 0) - (rightQuestion?.position ?? 0);
      }
      const leftParticipant = participantMap.get(left.userId);
      const rightParticipant = participantMap.get(right.userId);
      return (leftParticipant?.finalRank ?? Number.MAX_SAFE_INTEGER) - (rightParticipant?.finalRank ?? Number.MAX_SAFE_INTEGER);
    });

    for (const answer of sortedAnswers) {
      const question = questionMap.get(answer.questionId);
      const participant = participantMap.get(answer.userId);
      if (!question || !participant) continue;

      const isUnscoredType = UNSCORED_QUESTION_TYPES.has(question.questionType as SupportedQuestionType);
      responsesSheet.addRow({
        participant: participant.displayName,
        rank: participant.finalRank ?? '-',
        userId: answer.userId,
        finalScore: participant.finalScore,
        questionNumber: question.position + 1,
        questionId: question.id,
        questionType: question.questionType,
        questionText: question.questionText,
        availableOptions: formatOptionsDisplay(
          question.options as string[] | null,
          question.questionType as SupportedQuestionType,
        ),
        submittedAnswer: formatAnswerDisplay(
          answer.answerSubmitted,
          question.questionType as SupportedQuestionType,
        ),
        submittedAnswerRaw: answer.answerSubmitted || '-',
        correctAnswer: isUnscoredType
          ? 'N/A'
          : formatAnswerDisplay(question.correctAnswer, question.questionType as SupportedQuestionType),
        correctAnswerRaw: isUnscoredType ? 'N/A' : question.correctAnswer || '-',
        result: isUnscoredType ? 'N/A' : answer.isCorrect ? 'Correct' : 'Incorrect',
        pointsAwarded: answer.pointsAwarded,
        answerTimeSeconds: (answer.answerTimeMs / 1000).toFixed(2),
      });
    }

    responsesSheet.eachRow((row, index) => {
      if (index > 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
      }
      row.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });

    // ── Sheet 5: Quiz Summary ──
    const summarySheet = workbook.addWorksheet('Quiz Summary');
    const totalScored = quiz.questions.filter(
      (q) => !UNSCORED_QUESTION_TYPES.has(q.questionType as SupportedQuestionType),
    );
    const avgAccuracy = totalScored.length > 0
      ? Math.round(totalScored.reduce((s, q) => s + (q.totalAnswers > 0 ? (q.correctCount / q.totalAnswers) * 100 : 0), 0) / totalScored.length)
      : 0;
    const avgScore = quiz.participants.length > 0
      ? Math.round(quiz.participants.reduce((s, p) => s + p.finalScore, 0) / quiz.participants.length)
      : 0;
    const maxScore = totalScored.reduce((sum, question) => sum + question.points, 0);
    const duration = quiz.startedAt && quiz.endedAt
      ? Math.round((new Date(quiz.endedAt).getTime() - new Date(quiz.startedAt).getTime()) / 1000)
      : null;

    const summaryData: [string, string | number][] = [
      ['Quiz Title', quiz.title],
      ['Description', quiz.description || 'N/A'],
      ['Status', quiz.status],
      ['Total Questions', quiz.questionCount],
      ['Total Participants', quiz.participants.length],
      ['Average Score', `${avgScore} / ${maxScore}`],
      ['Average Accuracy', `${avgAccuracy}%`],
      ['Duration', duration ? `${Math.floor(duration / 60)}m ${duration % 60}s` : 'N/A'],
      ['Started At', quiz.startedAt?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || 'N/A'],
      ['Ended At', quiz.endedAt?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || 'N/A'],
      ['Export Date', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
    ];
    for (const [label, value] of summaryData) {
      summarySheet.addRow([label, value]);
    }
    summarySheet.getColumn(1).width = 22;
    summarySheet.getColumn(1).font = { bold: true };
    summarySheet.getColumn(2).width = 45;

    // Send
    const filename = `${quiz.title.replace(/[^a-z0-9]/gi, '_')}_results.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('GET /api/quiz/:quizId/export error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── PATCH /api/quiz/:quizId — Edit quiz (CORE_MEMBER+, draft only) ─────

quizRouter.patch('/:quizId', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const { quizId } = req.params;
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });

    if (!quiz) return ApiResponse.notFound(res, 'Quiz not found');
    if (quiz.createdBy !== user.id && user.role !== 'ADMIN' && user.role !== 'PRESIDENT') {
      return ApiResponse.forbidden(res);
    }
    if (quiz.status !== 'DRAFT') {
      return ApiResponse.badRequest(res, 'Can only edit quizzes in draft status');
    }

    const parsed = updateQuizSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.validationError(
        res,
        parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      );
    }

    const { title, description, questions } = parsed.data;
    if (questions) {
      const validationError = validateQuizQuestions(questions);
      if (validationError) {
        return ApiResponse.badRequest(res, validationError);
      }
    }

    await prisma.$transaction(async (tx) => {
      if (title || description !== undefined) {
        await tx.quiz.update({
          where: { id: quizId },
          data: {
            ...(title && { title }),
            ...(description !== undefined && { description }),
            ...(questions && { questionCount: questions.length }),
          },
        });
      }

      if (questions) {
        // Delete old questions and re-create
        await tx.quizQuestion.deleteMany({ where: { quizId } });
        await tx.quizQuestion.createMany({
          data: questions.map((q) => ({
            quizId,
            position: q.position,
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options ? q.options : Prisma.JsonNull,
            correctAnswer: q.correctAnswer || null,
            timeLimitSeconds: q.timeLimitSeconds,
            points: q.points,
            mediaUrl: q.mediaUrl || null,
          })),
        });
      }
    });

    return ApiResponse.success(res, { id: quizId }, 'Quiz updated');
  } catch (error) {
    logger.error('PATCH /api/quiz/:quizId error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── DELETE /api/quiz/:quizId — Delete quiz (CORE_MEMBER+, draft/finished) ──

quizRouter.delete('/:quizId', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const { quizId } = req.params;
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });

    if (!quiz) return ApiResponse.notFound(res, 'Quiz not found');
    if (quiz.createdBy !== user.id && user.role !== 'ADMIN' && user.role !== 'PRESIDENT') {
      return ApiResponse.forbidden(res);
    }
    if (quiz.status !== 'DRAFT' && quiz.status !== 'FINISHED' && quiz.status !== 'ABANDONED') {
      return ApiResponse.badRequest(res, 'Can only delete draft or finished quizzes');
    }

    await prisma.quiz.delete({ where: { id: quizId } });
    return ApiResponse.success(res, null, 'Quiz deleted');
  } catch (error) {
    logger.error('DELETE /api/quiz/:quizId error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── POST /api/quiz/:quizId/warmup — Wake server endpoint ──────────────

quizRouter.post('/:quizId/warmup', authMiddleware, async (_req: Request, res: Response) => {
  return ApiResponse.success(res, { ready: true }, 'Server is awake');
});

// ─── Helper: generate unique 4-digit alphanumeric join code ────────────

async function generateUniqueJoinCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/1/I to avoid confusion
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await prisma.quiz.findUnique({ where: { joinCode: code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique join code after 10 attempts');
}

// ─── Helper: generate unique 6-digit numeric PIN ───────────────────────

async function generateUniquePin(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    // Generate 6-digit number between 100000-999999
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await prisma.quiz.findFirst({ where: { pin, pinActive: true } });
    if (!existing) return pin;
  }
  throw new Error('Failed to generate unique PIN after 20 attempts');
}

// ─── POST /api/quiz/:quizId/open — Open quiz for joining (set to WAITING) ──

quizRouter.post('/:quizId/open', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const { quizId } = req.params;

    // Load quiz + questions in one query
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { position: 'asc' } } },
    });

    if (!quiz) return ApiResponse.notFound(res, 'Quiz not found');
    if (quiz.createdBy !== user.id && user.role !== 'ADMIN' && user.role !== 'PRESIDENT') {
      return ApiResponse.forbidden(res);
    }
    if (quiz.status !== 'DRAFT') {
      // If already waiting return existing code
      if (quiz.status === 'WAITING' && quiz.joinCode) {
        return ApiResponse.success(res, { id: quizId, status: 'WAITING', joinCode: quiz.joinCode, pin: quiz.pin }, 'Quiz is already open');
      }
      return ApiResponse.badRequest(res, 'Quiz can only be opened from draft status');
    }

    if (quiz.questions.length === 0) {
      return ApiResponse.badRequest(res, 'Quiz must have at least one question before opening');
    }

    const joinCode = await generateUniqueJoinCode();
    const pin = await generateUniquePin();

    await prisma.quiz.update({
      where: { id: quizId },
      data: { status: 'WAITING', joinCode, pin, pinActive: true },
    });

    // Pre-load into memory so first join is instant (no DB round-trip)
    if (!quizStore.getRoom(quizId)) {
      quizStore.initQuiz(
        quizId,
        quiz.questions.map((q) => ({
          id: q.id,
          position: q.position,
          questionText: q.questionText,
          questionType: q.questionType as SupportedQuestionType,
          options: q.options as string[] | null,
          correctAnswer: q.correctAnswer,
          timeLimitSeconds: q.timeLimitSeconds,
          points: q.points,
          mediaUrl: q.mediaUrl,
        })),
        user.id,
        '', // no admin socket yet
        quiz.title,
        joinCode,
        pin,
      );
    }

    return ApiResponse.success(res, { id: quizId, status: 'WAITING', joinCode, pin }, 'Quiz is now open for joining');
  } catch (error) {
    logger.error('POST /api/quiz/:quizId/open error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});

// ─── GET /api/quiz/admin/list — All quizzes for admin (CORE_MEMBER+) ────

quizRouter.get('/admin/list', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);

    const isAdmin = user.role === 'ADMIN' || user.role === 'PRESIDENT';

    const quizzes = await prisma.quiz.findMany({
      where: isAdmin ? {} : { createdBy: user.id },
      select: {
        id: true,
        title: true,
        status: true,
        questionCount: true,
        createdAt: true,
        startedAt: true,
        endedAt: true,
        creator: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return ApiResponse.success(res, quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      questionCount: q.questionCount,
      participantCount: q._count.participants,
      createdBy: q.creator,
      createdAt: q.createdAt,
      startedAt: q.startedAt,
      endedAt: q.endedAt,
    })));
  } catch (error) {
    logger.error('GET /api/quiz/admin/list error', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res);
  }
});
