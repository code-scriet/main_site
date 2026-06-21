import {
  Prisma,
  ProblemContextType,
  ProblemLanguage,
  SubmissionVerdict,
  Difficulty,
  type Problem,
  type ProblemSubmission,
} from '@prisma/client';
import { prisma, withRetry } from '../lib/prisma.js';
import { type AuthUser } from '../middleware/auth.js';
import { hasPermission } from '../middleware/role.js';
import { runJudge, type JudgeResult } from './codeJudge.js';
import { consumeDailyQuota, refundDailyQuota, formatUsageDate, getIstDateKey } from './dailyLimit.js';
import { auditLog } from './audit.js';
import { sanitizeHtml, sanitizeText } from './sanitize.js';
import { recomputeUserStreakSafe } from './qotdStreak.js';
import { isUserBlocked } from '../middleware/blocks.js';
import { verifyQotdReopenToken } from './jwt.js';
// Lazy import (function reference only, called at request time) avoids a
// module-load cycle with routes/qotd.ts which also imports from this file.
import { invalidateQotdLeaderboardCaches } from '../routes/qotd.js';
import { onContestSubmission } from '../competition/competitionRealtime.js';

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
  difficulty: Difficulty;
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
  // Client-reported active-tab solve time in ms. Optional; clients that don't
  // run a timer simply omit it. Persisted as-is and surfaced on the QOTD
  // daily leaderboard as "time taken".
  activeMs?: number;
  // Signed 'qotd_reopen' link token — lets a past, admin-reopened QOTD be submitted.
  reopenToken?: string;
}

export interface RunProblemParams {
  user: AuthUser;
  problemId: string;
  language: ProblemLanguage;
  code: string;
  contextType?: ProblemContextType;
  contextKey?: string;
  reopenToken?: string;
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
  /**
   * True when judging itself failed (upstream outage) and the submission was
   * captured for manual review instead of graded. The attempt + daily quota are
   * refunded; the user can retry or appeal. Frontends should show a
   * "judging unavailable — saved for review" state, not a code-error state.
   */
  needsReview: boolean;
  /**
   * True when this was a reopened-past-QOTD solve that judged ACCEPTED but is held
   * for admin acceptance: the verdict is stored as PENDING and nothing (streak,
   * marks, leaderboard) counts until an admin approves it from the review queue.
   * Frontends should show an "awaiting admin acceptance" state, not a solved state.
   */
  pendingAcceptance?: boolean;
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
    difficulty: sanitizeText(input.difficulty).toUpperCase() as Difficulty,
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

// Solution unlock policy (strict — matches the product constraint):
//   1. The context must be "concluded":
//      - QOTD     → its IST date is strictly before today (i.e. the QOTD has expired)
//      - CONTEST  → round status is LOCKED, JUDGING, or FINISHED
//      - PRACTICE → always concluded
//   2. The viewer must have made at least 2 submissions IN THIS SPECIFIC CONTEXT
//      (i.e. same problemId, contextType, AND contextKey). Submissions on the
//      same problem under a different context do NOT count — keeps the gate
//      from leaking solutions to drive-by readers who happened to attempt the
//      problem elsewhere.
// Admins bypass this entirely (handled by the caller).
async function canUnlockSolution(
  problemId: string,
  user?: AuthUser | null,
  contextType?: ProblemContextType,
  contextKey?: string,
): Promise<boolean> {
  if (!user || !contextType || !contextKey) return false;

  let concluded = false;
  // A reopened QOTD is "live again" — the engagement-based reveal must stay shut so
  // a late solver can't submit twice, read the official solution, and copy it.
  let reopenActive = false;
  if (contextType === 'PRACTICE') {
    concluded = true;
  } else if (contextType === 'QOTD') {
    const qotd = await prisma.qOTD.findUnique({ where: { id: contextKey }, select: { date: true, reopenedAt: true } });
    concluded = Boolean(qotd && toIstDateKey(qotd.date) < formatUsageDate());
    reopenActive = Boolean(qotd?.reopenedAt);
  } else if (contextType === 'CONTEST') {
    const round = await prisma.competitionRound.findUnique({ where: { id: contextKey }, select: { status: true } });
    concluded = Boolean(round && ['LOCKED', 'JUDGING', 'FINISHED'].includes(round.status));
  }
  if (!concluded) return false;

  // S-07: a solver has earned the official solution even on a first-try AC (their
  // submission count may be 1, below the engagement gate below). "Concluded" is
  // still required above, so this never leaks during an active QOTD/contest window.
  // PRACTICE is keyed by the IST day, so an AC from a PRIOR day lives under a
  // different contextKey — match ANY practice day so a returning solver doesn't see
  // the solution re-lock. QOTD/CONTEST stay keyed to the exact context.
  const solved = contextType === 'PRACTICE'
    ? await prisma.problemSubmission.findFirst({
        where: { userId: user.id, problemId, contextType: 'PRACTICE', verdict: 'ACCEPTED' },
        select: { verdict: true },
      })
    : await prisma.problemSubmission.findUnique({
        where: {
          userId_problemId_contextType_contextKey: {
            userId: user.id,
            problemId,
            contextType,
            contextKey,
          },
        },
        select: { verdict: true },
      });
  if (solved?.verdict === 'ACCEPTED') return true;

  // While reopened, only an ACCEPTED solver (above) sees the solution — the
  // count-based reveal would otherwise hand the answer to non-solvers mid-reopen.
  if (reopenActive) return false;

  const counter = await prisma.problemSubmissionCounter.findUnique({
    where: {
      userId_problemId_contextType_contextKey: {
        userId: user.id,
        problemId,
        contextType,
        contextKey,
      },
    },
    select: { count: true },
  });
  return (counter?.count ?? 0) >= 2;
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

// A past, admin-reopened QOTD is submittable only by a holder of the matching
// private link token AND while it is still open (reopenedAt set). Closing the QOTD
// (reopenedAt → null) revokes every outstanding link immediately.
// Exported for unit testing (the token/nonce gate is security-sensitive).
export function isQotdReopenAllowed(reopenToken: string | undefined, qotdId: string, reopenedAt: Date | null): boolean {
  if (!reopenToken || !reopenedAt) return false;
  try {
    const payload = verifyQotdReopenToken(reopenToken);
    // The token must match this QOTD AND the current reopen session: a close→reopen
    // mints a new reopenedAt, so links issued before the close stop verifying.
    // Compare by millisecond instant (not raw ISO string) so the match survives any
    // future change to how reopenedAt is stored/serialized, e.g. a Timestamptz(6)
    // migration where the column carries microseconds the JS ISO string drops.
    if (payload.qotdId !== qotdId) return false;
    const nonceMs = new Date(payload.nonce).getTime();
    return Number.isFinite(nonceMs) && nonceMs === reopenedAt.getTime();
  } catch {
    return false;
  }
}

export async function validateProblemContext(
  problem: Problem,
  user: AuthUser,
  contextType: ProblemContextType,
  contextKey: string,
  options: { requireActiveContest?: boolean; requireTodayQotd?: boolean; reopenToken?: string } = {},
): Promise<{ viaReopen: boolean }> {
  const requireActiveContest = options.requireActiveContest ?? true;
  const requireTodayQotd = options.requireTodayQotd ?? true;
  const todayKey = formatUsageDate();

  if (contextType === 'QOTD') {
    const qotd = await prisma.qOTD.findUnique({
      where: { id: contextKey },
      select: { id: true, date: true, problemId: true, reopenedAt: true },
    });
    if (!qotd || qotd.problemId !== problem.id) {
      throw new ProblemHttpError(400, 'Invalid QOTD context');
    }
    let viaReopen = false;
    if (requireTodayQotd && toIstDateKey(qotd.date) !== todayKey) {
      // Reopen escape hatch: a valid private link token for THIS QOTD while it is
      // open (reopenedAt set) lets a past day be submitted again. The solve is then
      // judged but held for admin acceptance (see submitProblemForUser).
      if (!isQotdReopenAllowed(options.reopenToken, qotd.id, qotd.reopenedAt)) {
        throw new ProblemHttpError(400, 'QOTD submissions are only scored on the active day');
      }
      viaReopen = true;
    }
    return { viaReopen };
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
    // Proctor lock: gated on requireActiveContest so it blocks run/submit (an action)
    // but never the read-only problem view (GET passes requireActiveContest:false), so
    // a locked contestant still sees the problem behind the arena's locked overlay.
    if (requireActiveContest) {
      const lockState = await prisma.competitionParticipantState.findUnique({
        where: { roundId_userId: { roundId: round.id, userId: user.id } },
        select: { locked: true },
      });
      if (lockState?.locked) {
        throw new ProblemHttpError(403, 'You are locked by the proctor. Contact an invigilator to unlock.', 'FORBIDDEN');
      }
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
    return { viaReopen: false };
  }

  if (contextType === 'PRACTICE') {
    if (contextKey !== todayKey) {
      throw new ProblemHttpError(400, 'Practice context must use today in IST');
    }
    if (problem.isPublished) return { viaReopen: false };

    const pastQotd = await prisma.qOTD.findFirst({
      where: {
        problemId: problem.id,
        date: { lt: new Date(`${todayKey}T00:00:00.000Z`) },
      },
      select: { id: true },
    });
    if (pastQotd) return { viaReopen: false };

    throw new ProblemHttpError(400, 'This problem is not available for practice');
  }

  return { viaReopen: false };
}

async function reserveSubmitCap(problem: Problem, userId: string, contextType: ProblemContextType, contextKey: string) {
  // Single atomic INSERT … ON CONFLICT replaces the old upsert + guarded
  // updateMany + findUnique re-read (3 round-trips → 1). A fresh row inserts
  // directly at count=1 — equivalent to the old create(0)+increment because
  // defaultSubmitCap is zod-enforced ≥ 1. On conflict the UPDATE only fires
  // while count < COALESCE(cap_override, defaultSubmitCap); no row returned ⇒
  // cap reached. id (client-side uuid in Prisma) and updated_at (@updatedAt)
  // have no DB defaults, so raw SQL supplies both.
  const rows = await prisma.$queryRaw<Array<{ id: string; count: number; cap_override: number | null }>>`
    INSERT INTO problem_submission_counters (id, user_id, problem_id, context_type, context_key, count, updated_at)
    VALUES (gen_random_uuid()::text, ${userId}, ${problem.id}, ${contextType}::"ProblemContextType", ${contextKey}, 1, now())
    ON CONFLICT (user_id, problem_id, context_type, context_key)
    DO UPDATE SET count = problem_submission_counters.count + 1, updated_at = now()
    WHERE problem_submission_counters.count < COALESCE(problem_submission_counters.cap_override, ${problem.defaultSubmitCap})
    RETURNING id, count, cap_override;
  `;
  if (rows.length === 0) {
    throw new ProblemHttpError(429, 'Submit cap reached for this problem', 'RATE_LIMITED');
  }
  const row = rows[0];
  const cap = row.cap_override ?? problem.defaultSubmitCap;
  return {
    counterId: row.id,
    cap,
    remaining: Math.max(0, cap - Number(row.count)),
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
  options: { privateOnly?: boolean } = {},
): { score: number; passedCount: number; totalCount: number; perTestVerdicts: ProblemSubmissionResult['perTestVerdicts'] } {
  // CONTEST scoring is private-only: sample/public tests carry 0 weight (they exist
  // for the contestant to self-test), and the problem's weight is distributed across
  // its hidden tests (by per-test points, default equal). QOTD/Practice keep sample
  // weight 1 (unchanged). passedCount/totalCount stay informational across all tests.
  const sampleWeight = options.privateOnly ? 0 : 1;
  const weightedCases = [
    ...sampleTests.map((test) => ({ ...test, isHidden: false, weight: sampleWeight })),
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
  // PRACTICE is bucketed by IST day — stamp the key server-side so a client whose
  // clock straddles the IST midnight boundary can't send a key the server rejects
  // (and so the read/write day always agree). QOTD/CONTEST keys are ids, untouched.
  if (params.contextType === 'PRACTICE') params.contextKey = formatUsageDate();
  const problem = await validateProblemAccess(params.problemId, params.user, false);
  if (!problem.isPublished && !isAdminUser(params.user)) {
    if (!params.contextType || !params.contextKey) {
      throw new ProblemHttpError(404, 'Problem not found', 'NOT_FOUND');
    }
    await validateProblemContext(problem, params.user, params.contextType, params.contextKey, { reopenToken: params.reopenToken });
  }
  if (!problem.allowedLanguages.includes(params.language)) {
    throw new ProblemHttpError(400, 'Language is not allowed for this problem');
  }

  // Feature blocks apply to a Test Run too (it executes user code): QOTD context →
  // QOTD block, PRACTICE context → PLAYGROUND block. Mirrors the submit gate.
  if (params.contextType === 'QOTD' && await isUserBlocked(params.user.id, 'QOTD')) {
    throw new ProblemHttpError(403, 'Your account has been blocked from QOTD submissions.', 'FORBIDDEN');
  }
  if (params.contextType === 'PRACTICE' && await isUserBlocked(params.user.id, 'PLAYGROUND')) {
    throw new ProblemHttpError(403, 'Your account has been blocked from the playground.', 'FORBIDDEN');
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
    // Judge/infra outage is not the user's fault — give back the quota unit we
    // consumed above (mirrors the submit path's refund) so a Test Run during an
    // upstream outage never burns the student's daily allowance.
    await refundDailyQuota(params.user.id, 1);
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
  // Server-stamp the PRACTICE day key (see runProblemTests) so validate/cap/store
  // all key off the server's IST today — race-free at the midnight boundary.
  if (params.contextType === 'PRACTICE') params.contextKey = formatUsageDate();
  const problem = await validateProblemAccess(params.problemId, params.user, false);
  if (!problem.allowedLanguages.includes(params.language)) {
    throw new ProblemHttpError(400, 'Language is not allowed for this problem');
  }

  // admin-deep-control: QOTD block applies to problem-backed QOTD submissions too.
  // The legacy /api/qotd/:id/submit path is gated by requireNotBlocked middleware;
  // this is the parallel gate for problem-backed QOTDs. Practice solving IS the
  // playground (it executes user code), so a PLAYGROUND block gates it too — closing
  // the gap where a PLAYGROUND-blocked user could still run/submit practice problems.
  if (params.contextType === 'QOTD' && await isUserBlocked(params.user.id, 'QOTD')) {
    throw new ProblemHttpError(403, 'Your account has been blocked from QOTD submissions.', 'FORBIDDEN');
  }
  if (params.contextType === 'PRACTICE' && await isUserBlocked(params.user.id, 'PLAYGROUND')) {
    throw new ProblemHttpError(403, 'Your account has been blocked from the playground.', 'FORBIDDEN');
  }

  const { viaReopen } = await validateProblemContext(problem, params.user, params.contextType, params.contextKey, { reopenToken: params.reopenToken });

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

  // Judge/infra failure (every execution provider down) is never the
  // user's fault. Refund the attempt + daily quota so an upstream outage doesn't
  // burn their allowance — but STILL persist the submission below with
  // needs_review=true so their code is captured and an admin can grade it
  // manually (or the student can appeal). This restores the pre-outage behaviour
  // where a failed submit was recorded and manually gradable.
  const isJudgeFailure = judge.verdict === 'JUDGE_ERROR';
  if (isJudgeFailure) {
    await releaseSubmitCap(capReservation.counterId);
    await refundDailyQuota(params.user.id, 1);
  }

  const scored = calculateScore(judge, sampleTests, hiddenTests, {
    privateOnly: params.contextType === 'CONTEST',
  });

  const submissionKey = {
    userId: params.user.id,
    problemId: problem.id,
    contextType: params.contextType,
    contextKey: params.contextKey,
  };

  // Solved status is monotonic: a later non-accepted attempt — including an
  // upstream judge hiccup that surfaced as a failure — must never un-solve a
  // problem the user already cleared. If a prior ACCEPTED row exists and this
  // attempt isn't ACCEPTED, keep the accepted record as the canonical row; the
  // user still sees their real latest result in the response below.
  const existingSubmission = await prisma.problemSubmission.findUnique({
    where: { userId_problemId_contextType_contextKey: submissionKey },
    select: { id: true, verdict: true, reopenPending: true, contestWrongAttempts: true, contestSolvedAt: true },
  });

  // Reopened-past-QOTD acceptance hold: a solve that judged ACCEPTED via a reopen
  // link is NOT counted immediately. It is stored with verdict PENDING + a
  // reopen_pending flag and surfaced in the admin review queue; only when an admin
  // accepts it does verdict flip to ACCEPTED and streak/leaderboard recompute. We
  // never downgrade a row the user already cleared on the live day.
  const alreadyAccepted = existingSubmission?.verdict === 'ACCEPTED';
  // Note: a held reopen solve still consumes its submit-cap + daily-quota unit (it
  // is NOT refunded). This is deliberate and consistent — every real, judged submit
  // spends quota regardless of verdict (only a judge/infra failure is refunded
  // above). A reopen solve really ran the judge, and an eventual admin *reject* is
  // no different from a same-day WRONG_ANSWER, which also costs a unit. Refunding
  // here would instead hand reopen-link holders unlimited free, uncapped submits.
  const reopenPendingAccept = viaReopen && judge.verdict === 'ACCEPTED' && !alreadyAccepted;
  // Stored verdict: held at PENDING while awaiting acceptance so no ACCEPTED-filtered
  // query (streak, every QOTD leaderboard) ever counts it; the real (passed) result
  // still rides back to the user in the response below.
  const storedVerdict = reopenPendingAccept ? 'PENDING' : judge.verdict;
  const flagNeedsReview = isJudgeFailure || reopenPendingAccept;

  // CONTEST ICPC penalty bookkeeping: count non-ACCEPTED *judged* attempts before the
  // first AC, and stamp the first AC time. Once solved, stop counting (attempts after
  // an AC carry no penalty in ICPC). Judge/infra failures are not the user's fault, so
  // they never add a wrong attempt. Untouched (0/null) for non-contest contexts.
  const isContest = params.contextType === 'CONTEST';
  const prevContestWrong = existingSubmission?.contestWrongAttempts ?? 0;
  const prevContestSolvedAt = existingSubmission?.contestSolvedAt ?? null;
  const contestAlreadySolved = Boolean(prevContestSolvedAt) || alreadyAccepted;
  const contestSolvedAt = isContest
    ? (prevContestSolvedAt ?? (judge.verdict === 'ACCEPTED' ? new Date() : null))
    : null;
  const contestWrongAttempts = isContest
    ? (!contestAlreadySolved && !isJudgeFailure && judge.verdict !== 'ACCEPTED'
        ? prevContestWrong + 1
        : prevContestWrong)
    : 0;

  let submission: { id: string };
  // Keep the canonical row when a later non-accepted attempt would erase progress:
  // (a) an already-cleared (ACCEPTED) row, or (b) a held reopen solve still awaiting
  // admin acceptance — a stray wrong resubmit mustn't wipe the pending acceptance.
  const keepExisting = Boolean(existingSubmission)
    && judge.verdict !== 'ACCEPTED'
    && (existingSubmission!.verdict === 'ACCEPTED' || existingSubmission!.reopenPending);
  if (keepExisting) {
    submission = { id: existingSubmission!.id };
  } else {
    submission = await prisma.problemSubmission.upsert({
      where: { userId_problemId_contextType_contextKey: submissionKey },
      create: {
        ...submissionKey,
        language: params.language,
        code: params.code,
        verdict: storedVerdict,
        score: scored.score,
        passedCount: scored.passedCount,
        totalCount: scored.totalCount,
        perTestVerdicts: scored.perTestVerdicts as unknown as Prisma.InputJsonValue,
        runtimeMs: judge.totalRuntimeMs,
        compilerOutput: judge.compilerOutput,
        activeMs: params.activeMs,
        needsReview: flagNeedsReview,
        reopenPending: reopenPendingAccept,
        contestWrongAttempts,
        contestSolvedAt,
      },
      update: {
        language: params.language,
        code: params.code,
        verdict: storedVerdict,
        score: scored.score,
        passedCount: scored.passedCount,
        totalCount: scored.totalCount,
        perTestVerdicts: scored.perTestVerdicts as unknown as Prisma.InputJsonValue,
        runtimeMs: judge.totalRuntimeMs,
        compilerOutput: judge.compilerOutput,
        // Only overwrite when the client reports a fresh measurement so a stale
        // submit (or a client without the timer) doesn't wipe a prior value.
        activeMs:
          params.activeMs !== undefined
            ? { set: params.activeMs }
            : undefined,
        manualOverride: false,
        overrideNotes: null,
        // A real (judged) verdict resolves a prior judge-error/appeal flag; a
        // fresh judge failure (re)flags it for manual review.
        needsReview: flagNeedsReview,
        reopenPending: reopenPendingAccept,
        // CONTEST penalty fields only — leave untouched for QOTD/Practice rows.
        ...(isContest ? { contestWrongAttempts, contestSolvedAt } : {}),
      },
    });
  }

  await auditLog(params.user.id, 'PROBLEM_SUBMITTED', 'ProblemSubmission', submission.id, {
    problemId: problem.id,
    verdict: judge.verdict,
    storedVerdict,
    score: scored.score,
    contextType: params.contextType,
    contextKey: params.contextKey,
    needsReview: flagNeedsReview,
    reopenPending: reopenPendingAccept,
  });

  // Materialize QOTD streak when a QOTD-context submission becomes ACCEPTED — but
  // NOT for a held reopen solve (that recomputes on admin acceptance instead).
  // Fire-and-forget; never blocks the response.
  if (params.contextType === 'QOTD' && judge.verdict === 'ACCEPTED' && !reopenPendingAccept) {
    recomputeUserStreakSafe(params.user.id);
  }

  // Invalidate the QOTD leaderboard caches for any QOTD submission (regardless
  // of verdict) so the next leaderboard read reflects the new attempt counts.
  // Callers no longer need to do this — the pipeline owns the side effect.
  if (params.contextType === 'QOTD') {
    invalidateQotdLeaderboardCaches(params.contextKey);
  }

  // Live contest push (fire-and-forget): admin submission feed + first-solve balloon +
  // throttled leaderboard broadcast, so no end needs to reload. Never blocks the response.
  if (params.contextType === 'CONTEST' && !isJudgeFailure) {
    void onContestSubmission({
      roundId: params.contextKey,
      userId: params.user.id,
      userName: params.user.name,
      problemId: problem.id,
      verdict: judge.verdict,
      score: scored.score,
    });
  }

  return {
    submissionId: submission.id,
    // Report the real judged verdict so the solver sees they passed; the canonical
    // row stays PENDING until accepted (pendingAcceptance below tells the UI).
    verdict: judge.verdict,
    score: scored.score,
    passedCount: scored.passedCount,
    totalCount: scored.totalCount,
    perTestVerdicts: scored.perTestVerdicts,
    totalRuntimeMs: judge.totalRuntimeMs,
    compilerOutput: judge.compilerOutput,
    // Refunded attempts/quota are reflected back so the client UI stays accurate.
    remainingSubmits: isJudgeFailure ? capReservation.remaining + 1 : capReservation.remaining,
    remainingDailyQuota: isJudgeFailure ? daily.remaining + 1 : daily.remaining,
    // UI hint: "judging unavailable" state. The acceptance hold is a distinct
    // state (pendingAcceptance) so the solver shows "awaiting acceptance" instead.
    needsReview: isJudgeFailure,
    pendingAcceptance: reopenPendingAccept,
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
  const scored = calculateScore(judge, sampleTests, hiddenTests, {
    privateOnly: submission.contextType === 'CONTEST',
  });
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
