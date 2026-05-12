import {
  Prisma,
  ProblemContextType,
  ProblemLanguage,
  SubmissionVerdict,
  type Problem,
  type ProblemSubmission,
} from '@prisma/client';
import { prisma, withRetry } from '../lib/prisma.js';
import { type AuthUser } from '../middleware/auth.js';
import { hasPermission } from '../middleware/role.js';
import { runJudge, type JudgeResult } from './codeJudge.js';
import { consumeDailyQuota, formatUsageDate, getIstDateKey } from './dailyLimit.js';
import { auditLog } from './audit.js';
import { sanitizeHtml, sanitizeText } from './sanitize.js';

export class ProblemHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly message: string,
    public readonly code = 'BAD_REQUEST',
  ) {
    super(message);
  }
}

export interface ProblemTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  label?: string;
  points?: number;
}

export interface ProblemInput {
  slug: string;
  title: string;
  body: string;
  difficulty: string;
  tags: string[];
  allowedLanguages: ProblemLanguage[];
  timeLimitMs: number;
  defaultSubmitCap: number;
  sampleTests: ProblemTestCase[];
  hiddenTests: ProblemTestCase[];
  referenceSolution?: string | null;
  referenceLanguage?: ProblemLanguage | null;
  isPublished: boolean;
}

export interface SubmitProblemParams {
  user: AuthUser;
  problemId: string;
  language: ProblemLanguage;
  code: string;
  contextType: ProblemContextType;
  contextKey: string;
}

export interface RunProblemParams {
  user: AuthUser;
  problemId: string;
  language: ProblemLanguage;
  code: string;
  contextType?: ProblemContextType;
  contextKey?: string;
}

export interface ProblemSubmissionResult {
  submissionId: string;
  verdict: SubmissionVerdict;
  score: number;
  passedCount: number;
  totalCount: number;
  perTestVerdicts: Array<{
    testId: string;
    isHidden: boolean;
    passed: boolean;
    runtimeMs?: number;
    actualOutput?: string;
    error?: string;
  }>;
  totalRuntimeMs: number;
  compilerOutput?: string;
  remainingSubmits: number;
  remainingDailyQuota: number;
}

export interface ProblemRunResult {
  perTestVerdicts: Array<{
    testId: string;
    passed: boolean;
    actualOutput: string;
    expectedOutput: string;
    runtimeMs?: number;
    error?: string;
  }>;
  totalRuntimeMs: number;
  compilerOutput?: string;
  remainingDailyQuota: number;
}

export function isAdminUser(user?: AuthUser | null): boolean {
  return Boolean(user && hasPermission(user.role, 'ADMIN'));
}

export function toIstDateKey(date: Date): string {
  return getIstDateKey(date);
}

export function normalizeProblemInput(input: ProblemInput): ProblemInput {
  return {
    ...input,
    slug: sanitizeText(input.slug).toLowerCase(),
    title: sanitizeText(input.title),
    body: sanitizeHtml(input.body),
    difficulty: sanitizeText(input.difficulty).toUpperCase(),
    tags: input.tags.map((tag) => sanitizeText(tag).toLowerCase()).filter(Boolean).slice(0, 20),
    referenceSolution: input.referenceSolution ?? null,
    referenceLanguage: input.referenceLanguage ?? null,
  };
}

function parseTests(value: Prisma.JsonValue, fallbackPrefix: string): ProblemTestCase[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `${fallbackPrefix}-${index + 1}`,
      input: typeof item.input === 'string' ? item.input : '',
      expectedOutput: typeof item.expectedOutput === 'string' ? item.expectedOutput : '',
      label: typeof item.label === 'string' ? item.label : undefined,
      points: typeof item.points === 'number' && Number.isFinite(item.points) ? item.points : undefined,
    };
  });
}

export function getProblemTests(problem: Pick<Problem, 'sampleTests' | 'hiddenTests'>): {
  sampleTests: ProblemTestCase[];
  hiddenTests: ProblemTestCase[];
} {
  return {
    sampleTests: parseTests(problem.sampleTests, 'sample'),
    hiddenTests: parseTests(problem.hiddenTests, 'hidden'),
  };
}

export async function createProblemFromInput(input: ProblemInput, createdBy: string): Promise<Problem> {
  const data = normalizeProblemInput(input);
  return withRetry(() => prisma.problem.create({
    data: {
      ...data,
      createdBy,
      sampleTests: data.sampleTests as unknown as Prisma.InputJsonValue,
      hiddenTests: data.hiddenTests as unknown as Prisma.InputJsonValue,
    },
  }));
}

export async function updateProblemFromInput(problemId: string, input: ProblemInput): Promise<Problem> {
  const data = normalizeProblemInput(input);
  return withRetry(() => prisma.problem.update({
    where: { id: problemId },
    data: {
      ...data,
      sampleTests: data.sampleTests as unknown as Prisma.InputJsonValue,
      hiddenTests: data.hiddenTests as unknown as Prisma.InputJsonValue,
      testCasesUpdatedAt: new Date(),
    },
  }));
}

export async function serializeProblemDetail(
  problem: Problem & { _count?: { submissions: number } },
  user?: AuthUser | null,
  contextType?: ProblemContextType,
  contextKey?: string,
): Promise<Record<string, unknown>> {
  const admin = isAdminUser(user);
  const { sampleTests, hiddenTests } = getProblemTests(problem);
  const canViewSolution = admin || await canUnlockSolution(problem.id, user, contextType, contextKey);

  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    tags: problem.tags,
    allowedLanguages: problem.allowedLanguages,
    isPublished: problem.isPublished,
    createdAt: problem.createdAt.toISOString(),
    submissionCount: problem._count?.submissions,
    body: problem.body,
    timeLimitMs: problem.timeLimitMs,
    defaultSubmitCap: problem.defaultSubmitCap,
    sampleTests,
    ...(admin ? { hiddenTests } : {}),
    ...(canViewSolution ? {
      referenceSolution: problem.referenceSolution ?? undefined,
      referenceLanguage: problem.referenceLanguage ?? undefined,
    } : {}),
  };
}

export function serializeProblemSummary(problem: Problem & { _count?: { submissions: number } }): Record<string, unknown> {
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    tags: problem.tags,
    allowedLanguages: problem.allowedLanguages,
    isPublished: problem.isPublished,
    createdAt: problem.createdAt.toISOString(),
    submissionCount: problem._count?.submissions,
  };
}

async function canUnlockSolution(
  problemId: string,
  user?: AuthUser | null,
  contextType?: ProblemContextType,
  contextKey?: string,
): Promise<boolean> {
  if (!user || !contextType || !contextKey) return false;

  let concluded = false;
  if (contextType === 'PRACTICE') {
    concluded = true;
  } else if (contextType === 'QOTD') {
    const qotd = await prisma.qOTD.findUnique({ where: { id: contextKey }, select: { date: true } });
    concluded = Boolean(qotd && toIstDateKey(qotd.date) < formatUsageDate());
  } else if (contextType === 'CONTEST') {
    const round = await prisma.competitionRound.findUnique({ where: { id: contextKey }, select: { status: true } });
    concluded = Boolean(round && ['LOCKED', 'JUDGING', 'FINISHED'].includes(round.status));
  }
  if (!concluded) return false;

  const attempts = await prisma.problemSubmissionCounter.aggregate({
    where: { userId: user.id, problemId },
    _sum: { count: true },
  });
  return (attempts._sum.count ?? 0) >= 2;
}

async function validateProblemAccess(problemId: string, user: AuthUser | undefined, requirePublished = true) {
  const problem = await withRetry(() => prisma.problem.findUnique({
    where: { id: problemId },
  }));
  if (!problem) throw new ProblemHttpError(404, 'Problem not found', 'NOT_FOUND');
  if (requirePublished && !problem.isPublished && !isAdminUser(user)) {
    throw new ProblemHttpError(404, 'Problem not found', 'NOT_FOUND');
  }
  return problem;
}

async function getMyTeamInEvent(eventId: string, userId: string) {
  const membership = await prisma.eventTeamMember.findFirst({
    where: { userId, team: { eventId } },
    select: {
      team: {
        select: {
          id: true,
          leaderId: true,
        },
      },
    },
  });
  if (!membership) return null;
  return {
    id: membership.team.id,
    isLeader: membership.team.leaderId === userId,
  };
}

export async function validateProblemContext(
  problem: Problem,
  user: AuthUser,
  contextType: ProblemContextType,
  contextKey: string,
  options: { requireActiveContest?: boolean; requireTodayQotd?: boolean } = {},
): Promise<void> {
  const requireActiveContest = options.requireActiveContest ?? true;
  const requireTodayQotd = options.requireTodayQotd ?? true;
  const todayKey = formatUsageDate();

  if (contextType === 'QOTD') {
    const qotd = await prisma.qOTD.findUnique({
      where: { id: contextKey },
      select: { id: true, date: true, problemId: true },
    });
    if (!qotd || qotd.problemId !== problem.id) {
      throw new ProblemHttpError(400, 'Invalid QOTD context');
    }
    if (requireTodayQotd && toIstDateKey(qotd.date) !== todayKey) {
      throw new ProblemHttpError(400, 'QOTD submissions are only scored on the active day');
    }
    return;
  }

  if (contextType === 'CONTEST') {
    const round = await prisma.competitionRound.findUnique({
      where: { id: contextKey },
      select: {
        id: true,
        eventId: true,
        status: true,
        roundType: true,
        participantScope: true,
        leadersOnly: true,
        allowedTeamIds: true,
        event: { select: { teamRegistration: true } },
        problems: { where: { problemId: problem.id }, select: { problemId: true } },
      },
    });
    if (!round || round.roundType !== 'DSA' || round.problems.length === 0) {
      throw new ProblemHttpError(400, 'Problem is not part of this contest round');
    }
    if (requireActiveContest && round.status !== 'ACTIVE') {
      throw new ProblemHttpError(400, 'This contest round is not accepting submissions');
    }
    const registration = await prisma.eventRegistration.findUnique({
      where: { userId_eventId: { userId: user.id, eventId: round.eventId } },
      select: { id: true },
    });
    if (!registration) {
      throw new ProblemHttpError(403, 'You must register for this event to participate', 'FORBIDDEN');
    }
    if (round.event.teamRegistration) {
      const myTeam = await getMyTeamInEvent(round.eventId, user.id);
      if (!myTeam) {
        throw new ProblemHttpError(403, 'You must join a team for this competition event', 'FORBIDDEN');
      }
      if (round.participantScope === 'SELECTED_TEAMS' && !round.allowedTeamIds.includes(myTeam.id)) {
        throw new ProblemHttpError(403, 'Your team is not selected for this round', 'FORBIDDEN');
      }
      if (round.leadersOnly && !myTeam.isLeader) {
        throw new ProblemHttpError(403, 'Only the team leader can submit for this round', 'FORBIDDEN');
      }
    }
    return;
  }

  if (contextType === 'PRACTICE') {
    if (contextKey !== todayKey) {
      throw new ProblemHttpError(400, 'Practice context must use today in IST');
    }
    if (problem.isPublished) return;

    const pastQotd = await prisma.qOTD.findFirst({
      where: {
        problemId: problem.id,
        date: { lt: new Date(`${todayKey}T00:00:00.000Z`) },
      },
      select: { id: true },
    });
    if (pastQotd) return;

    throw new ProblemHttpError(400, 'This problem is not available for practice');
  }
}

async function reserveSubmitCap(problem: Problem, userId: string, contextType: ProblemContextType, contextKey: string) {
  const counter = await prisma.problemSubmissionCounter.upsert({
    where: {
      userId_problemId_contextType_contextKey: {
        userId,
        problemId: problem.id,
        contextType,
        contextKey,
      },
    },
    create: {
      userId,
      problemId: problem.id,
      contextType,
      contextKey,
      count: 0,
    },
    update: {},
    select: { id: true, capOverride: true, count: true },
  });
  const cap = counter.capOverride ?? problem.defaultSubmitCap;
  const updated = await prisma.problemSubmissionCounter.updateMany({
    where: { id: counter.id, count: { lt: cap } },
    data: { count: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ProblemHttpError(429, 'Submit cap reached for this problem', 'RATE_LIMITED');
  }
  const latest = await prisma.problemSubmissionCounter.findUnique({
    where: { id: counter.id },
    select: { count: true, capOverride: true },
  });
  return {
    counterId: counter.id,
    cap,
    remaining: Math.max(0, cap - (latest?.count ?? counter.count + 1)),
  };
}

async function releaseSubmitCap(counterId: string): Promise<void> {
  await prisma.problemSubmissionCounter.updateMany({
    where: { id: counterId, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}

function calculateScore(
  judge: JudgeResult,
  sampleTests: ProblemTestCase[],
  hiddenTests: ProblemTestCase[],
): { score: number; passedCount: number; totalCount: number; perTestVerdicts: ProblemSubmissionResult['perTestVerdicts'] } {
  const weightedCases = [
    ...sampleTests.map((test) => ({ ...test, isHidden: false, weight: 1 })),
    ...hiddenTests.map((test) => ({ ...test, isHidden: true, weight: Math.max(1, Math.round(test.points ?? 1)) })),
  ];
  const verdictById = new Map(judge.perTestVerdicts.map((verdict) => [verdict.testId, verdict]));
  let earned = 0;
  let total = 0;

  const perTestVerdicts = weightedCases.map((test) => {
    const verdict = verdictById.get(test.id);
    total += test.weight;
    if (verdict?.passed) earned += test.weight;
    return {
      testId: test.id,
      isHidden: test.isHidden,
      passed: Boolean(verdict?.passed),
      runtimeMs: verdict?.runtimeMs,
      actualOutput: test.isHidden ? undefined : verdict?.actualOutput,
      error: verdict?.error,
    };
  });

  return {
    score: total > 0 ? Math.round((earned / total) * 100) : 0,
    passedCount: perTestVerdicts.filter((test) => test.passed).length,
    totalCount: perTestVerdicts.length,
    perTestVerdicts,
  };
}

export async function runProblemTests(params: RunProblemParams): Promise<ProblemRunResult> {
  const problem = await validateProblemAccess(params.problemId, params.user, false);
  if (!problem.isPublished && !isAdminUser(params.user)) {
    if (!params.contextType || !params.contextKey) {
      throw new ProblemHttpError(404, 'Problem not found', 'NOT_FOUND');
    }
    await validateProblemContext(problem, params.user, params.contextType, params.contextKey);
  }
  if (!problem.allowedLanguages.includes(params.language)) {
    throw new ProblemHttpError(400, 'Language is not allowed for this problem');
  }

  const daily = await consumeDailyQuota(params.user.id, 1);
  if (!daily.allowed) {
    throw new ProblemHttpError(429, 'Daily playground limit reached', 'RATE_LIMITED');
  }

  const { sampleTests } = getProblemTests(problem);
  const judge = await runJudge({
    language: params.language,
    userCode: params.code,
    testCases: sampleTests,
    timeLimitMs: problem.timeLimitMs,
    mode: 'testrun',
  });

  if (judge.verdict === 'JUDGE_ERROR') {
    throw new ProblemHttpError(503, 'Judge error, try again', 'SERVICE_UNAVAILABLE');
  }

  return {
    perTestVerdicts: sampleTests.map((test) => {
      const verdict = judge.perTestVerdicts.find((item) => item.testId === test.id);
      return {
        testId: test.id,
        passed: Boolean(verdict?.passed),
        actualOutput: verdict?.actualOutput ?? '',
        expectedOutput: test.expectedOutput,
        runtimeMs: verdict?.runtimeMs,
        error: verdict?.error,
      };
    }),
    totalRuntimeMs: judge.totalRuntimeMs,
    compilerOutput: judge.compilerOutput,
    remainingDailyQuota: daily.remaining,
  };
}

export async function submitProblemForUser(params: SubmitProblemParams): Promise<ProblemSubmissionResult> {
  const problem = await validateProblemAccess(params.problemId, params.user, false);
  if (!problem.allowedLanguages.includes(params.language)) {
    throw new ProblemHttpError(400, 'Language is not allowed for this problem');
  }

  await validateProblemContext(problem, params.user, params.contextType, params.contextKey);

  const capReservation = await reserveSubmitCap(problem, params.user.id, params.contextType, params.contextKey);
  const daily = await consumeDailyQuota(params.user.id, 1);
  if (!daily.allowed) {
    await releaseSubmitCap(capReservation.counterId);
    throw new ProblemHttpError(429, 'Daily playground limit reached', 'RATE_LIMITED');
  }

  const { sampleTests, hiddenTests } = getProblemTests(problem);
  const allTests = [...sampleTests, ...hiddenTests];
  const judge = await runJudge({
    language: params.language,
    userCode: params.code,
    testCases: allTests,
    timeLimitMs: problem.timeLimitMs,
    mode: 'submit',
  });

  if (judge.verdict === 'JUDGE_ERROR') {
    await releaseSubmitCap(capReservation.counterId);
    throw new ProblemHttpError(503, 'Judge error, try again', 'SERVICE_UNAVAILABLE');
  }

  const scored = calculateScore(judge, sampleTests, hiddenTests);
  const submission = await prisma.problemSubmission.upsert({
    where: {
      userId_problemId_contextType_contextKey: {
        userId: params.user.id,
        problemId: problem.id,
        contextType: params.contextType,
        contextKey: params.contextKey,
      },
    },
    create: {
      userId: params.user.id,
      problemId: problem.id,
      contextType: params.contextType,
      contextKey: params.contextKey,
      language: params.language,
      code: params.code,
      verdict: judge.verdict,
      score: scored.score,
      passedCount: scored.passedCount,
      totalCount: scored.totalCount,
      perTestVerdicts: scored.perTestVerdicts as unknown as Prisma.InputJsonValue,
      runtimeMs: judge.totalRuntimeMs,
      compilerOutput: judge.compilerOutput,
    },
    update: {
      language: params.language,
      code: params.code,
      verdict: judge.verdict,
      score: scored.score,
      passedCount: scored.passedCount,
      totalCount: scored.totalCount,
      perTestVerdicts: scored.perTestVerdicts as unknown as Prisma.InputJsonValue,
      runtimeMs: judge.totalRuntimeMs,
      compilerOutput: judge.compilerOutput,
      manualOverride: false,
      overrideNotes: null,
    },
  });

  await auditLog(params.user.id, 'PROBLEM_SUBMITTED', 'ProblemSubmission', submission.id, {
    problemId: problem.id,
    verdict: judge.verdict,
    score: scored.score,
    contextType: params.contextType,
    contextKey: params.contextKey,
  });

  return {
    submissionId: submission.id,
    verdict: judge.verdict,
    score: scored.score,
    passedCount: scored.passedCount,
    totalCount: scored.totalCount,
    perTestVerdicts: scored.perTestVerdicts,
    totalRuntimeMs: judge.totalRuntimeMs,
    compilerOutput: judge.compilerOutput,
    remainingSubmits: capReservation.remaining,
    remainingDailyQuota: daily.remaining,
  };
}

export async function rejudgeSubmission(
  submission: ProblemSubmission,
  problem: Problem,
): Promise<void> {
  if (submission.manualOverride) return;
  const { sampleTests, hiddenTests } = getProblemTests(problem);
  const allTests = [...sampleTests, ...hiddenTests];
  const judge = await runJudge({
    language: submission.language,
    userCode: submission.code,
    testCases: allTests,
    timeLimitMs: problem.timeLimitMs,
    mode: 'submit',
  });
  if (judge.verdict === 'JUDGE_ERROR') {
    throw new Error(`Judge error while rejudging submission ${submission.id}`);
  }
  const scored = calculateScore(judge, sampleTests, hiddenTests);
  await prisma.problemSubmission.update({
    where: { id: submission.id },
    data: {
      verdict: judge.verdict,
      score: scored.score,
      passedCount: scored.passedCount,
      totalCount: scored.totalCount,
      perTestVerdicts: scored.perTestVerdicts as unknown as Prisma.InputJsonValue,
      runtimeMs: judge.totalRuntimeMs,
      compilerOutput: judge.compilerOutput,
    },
  });
}
