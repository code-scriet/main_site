import { Router, Request, Response } from 'express';
import { Prisma, ProblemContextType, ProblemLanguage, SubmissionVerdict } from '@prisma/client';
import { z } from 'zod';
import { prisma, withRetry } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/audit.js';
import {
  ProblemHttpError,
  createProblemFromInput,
  isAdminUser,
  runProblemTests,
  serializeProblemDetail,
  serializeProblemSummary,
  submitProblemForUser,
  updateProblemFromInput,
  validateProblemContext,
  type ProblemInput,
} from '../utils/problemsCore.js';
import { enqueueRejudgeJob, getRejudgeJob } from '../utils/rejudgeJobs.js';

export const problemsRouter = Router();

const testCaseSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  input: z.string().max(20_000),
  expectedOutput: z.string().max(20_000),
  label: z.string().trim().max(80).optional(),
  points: z.coerce.number().int().min(1).max(1000).optional(),
}).superRefine((test, ctx) => {
  if (!test.expectedOutput.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedOutput'],
      message: 'Test case expected output is required',
    });
  }
  if (!test.input.trim() && !test.expectedOutput.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Test case input or expected output is required',
    });
  }
});

const problemInputSchema = z.object({
  slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(3).max(200),
  body: z.string().min(1).max(60_000),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  allowedLanguages: z.array(z.nativeEnum(ProblemLanguage)).min(1).max(4),
  timeLimitMs: z.coerce.number().int().min(500).max(10_000).default(2000),
  defaultSubmitCap: z.coerce.number().int().min(1).max(100).default(5),
  sampleTests: z.array(testCaseSchema).min(1).max(20),
  hiddenTests: z.array(testCaseSchema).min(1).max(100),
  referenceSolution: z.string().max(100_000).optional().nullable(),
  referenceLanguage: z.nativeEnum(ProblemLanguage).optional().nullable(),
  isPublished: z.boolean().default(false),
});

const runSchema = z.object({
  language: z.nativeEnum(ProblemLanguage),
  code: z.string().min(1).max(100_000),
  contextType: z.nativeEnum(ProblemContextType).optional(),
  contextKey: z.string().min(1).max(120).optional(),
});

const submitSchema = runSchema.extend({
  contextType: z.nativeEnum(ProblemContextType),
  contextKey: z.string().min(1).max(120),
});

function toProblemInput(raw: z.infer<typeof problemInputSchema>): ProblemInput {
  return raw;
}

function handleProblemError(res: Response, error: unknown, fallback: string) {
  if (error instanceof ProblemHttpError) {
    return ApiResponse.error(res, {
      code: error.code,
      message: error.message,
      status: error.status,
    });
  }
  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });
  return ApiResponse.internal(res, fallback);
}

async function resolveProblem(idOrSlug: string) {
  return prisma.problem.findFirst({
    where: {
      OR: [
        { id: idOrSlug },
        { slug: idOrSlug },
      ],
    },
  });
}

async function resolveProblemId(idOrSlug: string): Promise<string> {
  const problem = await resolveProblem(idOrSlug);
  if (!problem) throw new ProblemHttpError(404, 'Problem not found', 'NOT_FOUND');
  return problem.id;
}

problemsRouter.use(optionalAuthMiddleware);

problemsRouter.use(async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    if (isAdminUser(user)) return next();
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { problemsEnabled: true },
    });
    if (settings?.problemsEnabled !== true) {
      return ApiResponse.notFound(res, 'Problems are not available');
    }
    return next();
  } catch {
    return next();
  }
});

problemsRouter.get('/', async (req, res) => {
  try {
    const user = getAuthUser(req);
    const admin = isAdminUser(user);
    const published = req.query.published === 'true' ? true : req.query.published === 'false' ? false : undefined;
    const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty.toUpperCase() : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag.toLowerCase() : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const problems = await withRetry(() => prisma.problem.findMany({
      where: {
        ...(admin
          ? (published !== undefined ? { isPublished: published } : {})
          : { isPublished: true }),
        ...(difficulty ? { difficulty } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(search ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { _count: { select: { submissions: true } } },
    }));

    return ApiResponse.success(res, { problems: problems.map(serializeProblemSummary) });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to list problems');
  }
});

problemsRouter.get('/admin/all', authMiddleware, requireRole('ADMIN'), async (_req, res) => {
  try {
    const problems = await prisma.problem.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { submissions: true } } },
    });
    return ApiResponse.success(res, { problems: problems.map(serializeProblemSummary) });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to list admin problems');
  }
});

problemsRouter.post('/admin/reset-cap', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return ApiResponse.unauthorized(res);
    const schema = z.object({
      userId: z.string().uuid(),
      problemId: z.string().uuid(),
      contextType: z.nativeEnum(ProblemContextType),
      contextKey: z.string().min(1).max(120),
      newCap: z.coerce.number().int().min(1).max(100).optional(),
      deltaSubmits: z.coerce.number().int().min(1).max(50).optional(),
      clearRequest: z.boolean().optional(),
      resetCount: z.boolean().optional(),
    }).refine((value) => value.newCap !== undefined || value.deltaSubmits !== undefined || value.resetCount === true, {
      message: 'Provide newCap, deltaSubmits, or resetCount=true',
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid reset payload');
    const { userId, problemId, contextType, contextKey, newCap, deltaSubmits, clearRequest, resetCount } = parsed.data;

    const existing = await prisma.problemSubmissionCounter.findUnique({
      where: { userId_problemId_contextType_contextKey: { userId, problemId, contextType, contextKey } },
      select: { id: true, count: true, capOverride: true },
    });
    const problem = await prisma.problem.findUnique({ where: { id: problemId }, select: { defaultSubmitCap: true } });
    if (!problem) return ApiResponse.notFound(res, 'Problem not found');
    const baseCap = existing?.capOverride ?? problem.defaultSubmitCap;
    const targetCap = newCap !== undefined ? newCap : deltaSubmits !== undefined ? baseCap + deltaSubmits : (existing?.capOverride ?? null);

    await prisma.problemSubmissionCounter.upsert({
      where: { userId_problemId_contextType_contextKey: { userId, problemId, contextType, contextKey } },
      create: {
        userId,
        problemId,
        contextType,
        contextKey,
        count: resetCount ? 0 : 0,
        capOverride: targetCap ?? undefined,
        lastResetAt: resetCount ? new Date() : undefined,
        ...(clearRequest !== false ? { pendingRequest: false, lastGrantedBy: admin.id, lastGrantedAt: new Date() } : {}),
      },
      update: {
        ...(resetCount ? { count: 0, lastResetAt: new Date() } : {}),
        ...(targetCap !== null && targetCap !== undefined ? { capOverride: targetCap } : {}),
        ...(clearRequest !== false ? { pendingRequest: false, lastGrantedBy: admin.id, lastGrantedAt: new Date() } : {}),
      },
    });
    await auditLog(admin.id, 'PROBLEM_CAP_RESET', 'Problem', problemId, { userId, contextType, contextKey, newCap, deltaSubmits, resetCount });
    return ApiResponse.success(res, { success: true, capOverride: targetCap });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to reset submit cap');
  }
});

// In-memory per-user/context throttle for cap-request spam (small bounded map)
const capRequestThrottle = new Map<string, number>();
const CAP_REQUEST_MIN_INTERVAL_MS = 60_000;
function pruneCapRequestThrottle() {
  if (capRequestThrottle.size < 5_000) return;
  const cutoff = Date.now() - CAP_REQUEST_MIN_INTERVAL_MS;
  for (const [key, ts] of capRequestThrottle) {
    if (ts < cutoff) capRequestThrottle.delete(key);
  }
}

problemsRouter.post('/:id/request-cap', authMiddleware, async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);
    const schema = z.object({
      contextType: z.nativeEnum(ProblemContextType),
      contextKey: z.string().min(1).max(120),
      note: z.string().trim().max(280).optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid request-cap payload');
    const problemId = await resolveProblemId(req.params.id);
    const throttleKey = `${user.id}:${problemId}:${parsed.data.contextType}:${parsed.data.contextKey}`;
    const lastRequest = capRequestThrottle.get(throttleKey);
    const now = Date.now();
    if (lastRequest && now - lastRequest < CAP_REQUEST_MIN_INTERVAL_MS) {
      return ApiResponse.error(res, {
        code: 'RATE_LIMITED',
        message: 'You can request again in a moment.',
        status: 429,
      });
    }
    capRequestThrottle.set(throttleKey, now);
    pruneCapRequestThrottle();

    await prisma.problemSubmissionCounter.upsert({
      where: {
        userId_problemId_contextType_contextKey: {
          userId: user.id,
          problemId,
          contextType: parsed.data.contextType,
          contextKey: parsed.data.contextKey,
        },
      },
      create: {
        userId: user.id,
        problemId,
        contextType: parsed.data.contextType,
        contextKey: parsed.data.contextKey,
        count: 0,
        pendingRequest: true,
        requestedAt: new Date(),
        requestNote: parsed.data.note ?? null,
      },
      update: {
        pendingRequest: true,
        requestedAt: new Date(),
        requestNote: parsed.data.note ?? null,
      },
    });
    return ApiResponse.success(res, { success: true });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to request more submits');
  }
});

problemsRouter.get('/admin/pending-cap-requests', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const contextType = req.query.contextType as ProblemContextType | undefined;
    const contextKey = typeof req.query.contextKey === 'string' ? req.query.contextKey : undefined;
    const counters = await prisma.problemSubmissionCounter.findMany({
      where: {
        pendingRequest: true,
        ...(contextType ? { contextType } : {}),
        ...(contextKey ? { contextKey } : {}),
      },
      orderBy: { requestedAt: 'asc' },
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        problem: { select: { id: true, title: true, slug: true, defaultSubmitCap: true } },
      },
    });

    // Resolve human-readable context labels (best effort)
    const qotdKeys = counters.filter((c) => c.contextType === 'QOTD').map((c) => c.contextKey);
    const contestKeys = counters.filter((c) => c.contextType === 'CONTEST').map((c) => c.contextKey);
    const [qotds, rounds] = await Promise.all([
      qotdKeys.length ? prisma.qOTD.findMany({ where: { id: { in: qotdKeys } }, select: { id: true, date: true } }) : Promise.resolve([]),
      contestKeys.length ? prisma.competitionRound.findMany({ where: { id: { in: contestKeys } }, select: { id: true, title: true, eventId: true } }) : Promise.resolve([]),
    ]);
    const qotdById = new Map(qotds.map((q) => [q.id, q]));
    const roundById = new Map(rounds.map((r) => [r.id, r]));

    return ApiResponse.success(res, {
      requests: counters.map((counter) => ({
        id: counter.id,
        userId: counter.userId,
        user: counter.user,
        problem: counter.problem,
        contextType: counter.contextType,
        contextKey: counter.contextKey,
        contextLabel:
          counter.contextType === 'QOTD'
            ? qotdById.get(counter.contextKey)?.date.toISOString().slice(0, 10) ?? counter.contextKey
            : counter.contextType === 'CONTEST'
              ? roundById.get(counter.contextKey)?.title ?? counter.contextKey
              : counter.contextKey,
        currentCap: counter.capOverride ?? counter.problem.defaultSubmitCap,
        used: counter.count,
        note: counter.requestNote,
        requestedAt: counter.requestedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to fetch pending cap requests');
  }
});

problemsRouter.post('/', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return ApiResponse.unauthorized(res);
    const parsed = problemInputSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid problem payload');
    const problem = await createProblemFromInput(toProblemInput(parsed.data), admin.id);
    await auditLog(admin.id, 'PROBLEM_CREATED', 'Problem', problem.id, { slug: problem.slug, title: problem.title });
    return ApiResponse.created(res, { problem: await serializeProblemDetail(problem, admin) }, 'Problem created');
  } catch (error) {
    return handleProblemError(res, error, 'Failed to create problem');
  }
});

problemsRouter.put('/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return ApiResponse.unauthorized(res);
    const parsed = problemInputSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid problem payload');
    const problem = await updateProblemFromInput(req.params.id, toProblemInput(parsed.data));
    await auditLog(admin.id, 'PROBLEM_UPDATED', 'Problem', problem.id, { slug: problem.slug, title: problem.title });
    return ApiResponse.success(res, { problem: await serializeProblemDetail(problem, admin) }, 'Problem updated');
  } catch (error) {
    return handleProblemError(res, error, 'Failed to update problem');
  }
});

problemsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return ApiResponse.unauthorized(res);
    await prisma.problem.delete({ where: { id: req.params.id } });
    await auditLog(admin.id, 'PROBLEM_DELETED', 'Problem', req.params.id);
    return ApiResponse.success(res, { success: true });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2003') {
      return ApiResponse.conflict(res, 'Problem is linked to a contest round and cannot be deleted');
    }
    return handleProblemError(res, error, 'Failed to delete problem');
  }
});

problemsRouter.post('/:id/run', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid run payload');
    const problemId = await resolveProblemId(req.params.id);
    const result = await runProblemTests({ user, problemId, ...parsed.data });
    return ApiResponse.success(res, result);
  } catch (error) {
    return handleProblemError(res, error, 'Failed to run problem tests');
  }
});

problemsRouter.post('/:id/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid submit payload');
    const problemId = await resolveProblemId(req.params.id);
    const result = await submitProblemForUser({ user, problemId, ...parsed.data });
    return ApiResponse.success(res, result);
  } catch (error) {
    return handleProblemError(res, error, 'Failed to submit problem');
  }
});

problemsRouter.get('/:id/my-submission', authMiddleware, async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);
    const contextType = req.query.contextType as ProblemContextType | undefined;
    const contextKey = typeof req.query.contextKey === 'string' ? req.query.contextKey : undefined;
    if (!contextType || !contextKey) return ApiResponse.badRequest(res, 'contextType and contextKey are required');
    const problemId = await resolveProblemId(req.params.id);
    const [submission, counter, problem] = await Promise.all([
      prisma.problemSubmission.findUnique({
        where: {
          userId_problemId_contextType_contextKey: { userId: user.id, problemId, contextType, contextKey },
        },
      }),
      prisma.problemSubmissionCounter.findUnique({
        where: {
          userId_problemId_contextType_contextKey: { userId: user.id, problemId, contextType, contextKey },
        },
        select: { count: true, capOverride: true, pendingRequest: true, lastGrantedAt: true },
      }),
      prisma.problem.findUnique({ where: { id: problemId }, select: { defaultSubmitCap: true } }),
    ]);
    const cap = counter?.capOverride ?? problem?.defaultSubmitCap ?? 5;
    const used = counter?.count ?? 0;
    return ApiResponse.success(res, {
      submission,
      counter: {
        used,
        cap,
        remaining: Math.max(0, cap - used),
        pendingRequest: counter?.pendingRequest ?? false,
        lastGrantedAt: counter?.lastGrantedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to fetch submission');
  }
});

problemsRouter.get('/:id/leaderboard', async (req, res) => {
  try {
    const contextType = req.query.contextType as ProblemContextType | undefined;
    const contextKey = typeof req.query.contextKey === 'string' ? req.query.contextKey : undefined;
    if (!contextType || !contextKey) return ApiResponse.badRequest(res, 'contextType and contextKey are required');
    const problemId = await resolveProblemId(req.params.id);
    const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 10));
    const submissions = await prisma.problemSubmission.findMany({
      where: { problemId, contextType, contextKey },
      orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
      take: limit,
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    return ApiResponse.success(res, {
      entries: submissions.map((submission, index) => ({
        rank: index + 1,
        userId: submission.userId,
        name: submission.user.name,
        avatar: submission.user.avatar,
        score: submission.score,
        verdict: submission.verdict,
        submittedAt: submission.submittedAt.toISOString(),
        runtimeMs: submission.runtimeMs,
      })),
    });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to fetch leaderboard');
  }
});

problemsRouter.get('/:id/all-submissions', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const contextType = req.query.contextType as ProblemContextType | undefined;
    const contextKey = typeof req.query.contextKey === 'string' ? req.query.contextKey : undefined;
    const problemId = await resolveProblemId(req.params.id);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const submissions = await prisma.problemSubmission.findMany({
      where: {
        problemId,
        ...(contextType ? { contextType } : {}),
        ...(contextKey ? { contextKey } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    return ApiResponse.success(res, { submissions });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to fetch all submissions');
  }
});

problemsRouter.patch('/:id/override/:submissionId', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return ApiResponse.unauthorized(res);
    const schema = z.object({
      verdict: z.nativeEnum(SubmissionVerdict).optional(),
      score: z.coerce.number().int().min(0).max(100).optional(),
      notes: z.string().max(5_000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid override payload');
    const problemId = await resolveProblemId(req.params.id);
    const existing = await prisma.problemSubmission.findUnique({
      where: { id: req.params.submissionId },
      select: { id: true, problemId: true },
    });
    if (!existing || existing.problemId !== problemId) {
      return ApiResponse.notFound(res, 'Submission not found for this problem');
    }
    const submission = await prisma.problemSubmission.update({
      where: { id: req.params.submissionId },
      data: {
        ...(parsed.data.verdict ? { verdict: parsed.data.verdict } : {}),
        ...(parsed.data.score !== undefined ? { score: parsed.data.score } : {}),
        overrideNotes: parsed.data.notes ?? null,
        manualOverride: true,
      },
    });
    await auditLog(admin.id, 'PROBLEM_SUBMISSION_OVERRIDDEN', 'ProblemSubmission', submission.id, {
      problemId,
      verdict: parsed.data.verdict,
      score: parsed.data.score,
    });
    return ApiResponse.success(res, { submission });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to override submission');
  }
});

problemsRouter.post('/:id/rejudge', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return ApiResponse.unauthorized(res);
    const schema = z.object({
      contextType: z.nativeEnum(ProblemContextType).optional(),
      contextKey: z.string().min(1).max(120).optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid rejudge payload');
    const problemId = await resolveProblemId(req.params.id);
    const job = enqueueRejudgeJob({ problemId, requestedBy: admin.id, ...parsed.data });
    await auditLog(admin.id, 'PROBLEM_REJUDGE_QUEUED', 'Problem', problemId, { jobId: job.id, ...parsed.data });
    return ApiResponse.success(res, { jobId: job.id });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to queue rejudge');
  }
});

problemsRouter.get('/:id/rejudge-status/:jobId', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const problemId = await resolveProblemId(req.params.id);
    const job = getRejudgeJob(req.params.jobId);
    if (!job || job.problemId !== problemId) return ApiResponse.notFound(res, 'Rejudge job not found');
    return ApiResponse.success(res, job);
  } catch (error) {
    return handleProblemError(res, error, 'Failed to fetch rejudge status');
  }
});

problemsRouter.get('/:idOrSlug', async (req, res) => {
  try {
    const user = getAuthUser(req);
    const problem = await resolveProblem(req.params.idOrSlug);
    const contextType = req.query.contextType as ProblemContextType | undefined;
    const contextKey = typeof req.query.contextKey === 'string' ? req.query.contextKey : undefined;
    if (!problem) {
      return ApiResponse.notFound(res, 'Problem not found');
    }
    if (!problem.isPublished && !isAdminUser(user)) {
      if (!user || !contextType || !contextKey) {
        return ApiResponse.notFound(res, 'Problem not found');
      }
      await validateProblemContext(problem, user, contextType, contextKey, {
        requireActiveContest: false,
        requireTodayQotd: false,
      });
    }
    return ApiResponse.success(res, {
      problem: await serializeProblemDetail(problem, user, contextType, contextKey),
    });
  } catch (error) {
    return handleProblemError(res, error, 'Failed to fetch problem');
  }
});
