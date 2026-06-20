import { getPlaygroundStoredToken } from './authToken';
import { requestMainApiJson } from './utils';

export type ProblemLanguage = 'PYTHON' | 'JAVASCRIPT' | 'CPP' | 'JAVA';
export type ProblemContextType = 'QOTD' | 'CONTEST' | 'PRACTICE';
export type SubmissionVerdict =
  | 'PENDING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'COMPILATION_ERROR'
  | 'JUDGE_ERROR';

export interface ProblemTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  label?: string;
  points?: number;
}

export interface ProblemSummary {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  tags?: string[];
  allowedLanguages?: ProblemLanguage[];
  isPublished?: boolean;
  submissionCount?: number;
  createdAt?: string;
}

export interface ProblemDetail extends ProblemSummary {
  body: string;
  timeLimitMs: number;
  defaultSubmitCap: number;
  sampleTests: ProblemTestCase[];
  hiddenTests?: ProblemTestCase[];
  referenceSolution?: string;
  referenceLanguage?: ProblemLanguage;
}

export interface ProblemSubmission {
  id: string;
  userId: string;
  problemId: string;
  contextType: ProblemContextType;
  contextKey: string;
  language: ProblemLanguage;
  code: string;
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
    expectedOutput?: string;
    error?: string;
  }>;
  runtimeMs?: number | null;
  compilerOutput?: string | null;
  manualOverride?: boolean;
  needsReview?: boolean;
  /** Held reopened-QOTD solve: judged ACCEPTED but parked at PENDING until an admin accepts it. */
  reopenPending?: boolean;
  appealedAt?: string | null;
  appealNote?: string | null;
  submittedAt: string;
  updatedAt: string;
}

export interface QOTDSummary {
  id: string;
  date: string;
  question: string;
  problemLink?: string;
  difficulty: string;
  problemId?: string | null;
  problem?: ProblemDetail | null;
  hasSubmitted?: boolean;
  isPublished?: boolean;
}

export interface TestRunResult {
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

export interface SubmissionResult extends ProblemSubmission {
  submissionId: string;
  remainingSubmits: number;
  remainingDailyQuota: number;
  /** Judging was unavailable — submission captured for manual review, attempt refunded. */
  needsReview?: boolean;
  /**
   * Reopened-past-QOTD solve that judged ACCEPTED but is held for admin acceptance:
   * nothing (streak/marks/leaderboard) counts until an admin approves it.
   */
  pendingAcceptance?: boolean;
}

export interface PlaygroundLimitResetRequest {
  id: string;
  userId: string;
  note: string | null;
  status: 'PENDING' | 'GRANTED' | 'DENIED';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; avatar: string | null };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getPlaygroundStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return { ...headers, ...(extra as Record<string, string> | undefined) };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const fetchInit: RequestInit = {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...buildHeaders(init.headers),
    },
  };
  const result = await requestMainApiJson<T>(path, fetchInit);
  if (!result.response.ok) {
    const payload = result.payload as { error?: { code?: string; message?: string }; message?: string } | null;
    const code = payload?.error?.code;
    const message = payload?.error?.message ?? payload?.message ?? result.response.statusText;
    throw new ApiError(message, result.response.status, code);
  }
  return result.data;
}

export const mainApi = {
  getTodayQOTD: () => call<QOTDSummary | null>('/api/qotd/today'),
  getQOTDHistory: (limit = 30, options?: { includeUnpublished?: boolean }) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (options?.includeUnpublished) params.set('includeUnpublished', 'true');
    return call<QOTDSummary[]>(`/api/qotd/history?${params.toString()}`);
  },
  // Resolve one specific day's QOTD by its calendar date (YYYY-MM-DD). Used by the
  // reopen-link flow so a past day of ANY age resolves (not just the recent window).
  getQOTDByDate: (date: string) => {
    const params = new URLSearchParams({ date, limit: '1' });
    return call<QOTDSummary[]>(`/api/qotd/history?${params.toString()}`).then((list) => list[0] ?? null);
  },
  getProblems: (filters?: { difficulty?: string; tag?: string; search?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.difficulty) params.set('difficulty', filters.difficulty);
    if (filters?.tag) params.set('tag', filters.tag);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    return call<{ problems: ProblemSummary[] }>(`/api/problems${query ? `?${query}` : ''}`);
  },
  getProblem: (idOrSlug: string, options?: { contextType?: ProblemContextType; contextKey?: string }) => {
    const params = new URLSearchParams();
    if (options?.contextType) params.set('contextType', options.contextType);
    if (options?.contextKey) params.set('contextKey', options.contextKey);
    const query = params.toString();
    return call<{ problem: ProblemDetail }>(`/api/problems/${idOrSlug}${query ? `?${query}` : ''}`);
  },
  // Round status + title for the DSA contest solve context (gates submit on ACTIVE,
  // labels the solver). Mirrors the main app's GET /api/competition/:roundId, which
  // returns the round fields at the top level of `data`.
  getCompetitionRound: (roundId: string) =>
    call<{
      id: string;
      title: string;
      status: 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'JUDGING' | 'FINISHED';
      roundType?: 'IMAGE_TARGET' | 'DSA';
      duration: number;
      remainingSeconds?: number | null;
    }>(`/api/competition/${roundId}`),
  runProblem: (problemId: string, body: { language: ProblemLanguage; code: string; contextType?: ProblemContextType; contextKey?: string; reopenToken?: string }) =>
    call<TestRunResult>(`/api/problems/${problemId}/run`, { method: 'POST', body: JSON.stringify(body) }),
  submitProblem: (problemId: string, body: { language: ProblemLanguage; code: string; contextType: ProblemContextType; contextKey: string; activeMs?: number; reopenToken?: string }) =>
    call<SubmissionResult>(`/api/problems/${problemId}/submit`, { method: 'POST', body: JSON.stringify(body) }),
  appealSubmission: (problemId: string, body: { contextType: ProblemContextType; contextKey: string; note?: string }) =>
    call<{ submission: ProblemSubmission }>(`/api/problems/${problemId}/appeal`, { method: 'POST', body: JSON.stringify(body) }),
  getMySubmission: (problemId: string, contextType: ProblemContextType, contextKey: string) =>
    call<{
      submission: ProblemSubmission | null;
      counter: { used: number; cap: number; remaining: number; pendingRequest: boolean; lastGrantedAt: string | null };
    }>(`/api/problems/${problemId}/my-submission?contextType=${encodeURIComponent(contextType)}&contextKey=${encodeURIComponent(contextKey)}`),
  requestSubmitCap: (problemId: string, body: { contextType: ProblemContextType; contextKey: string; note?: string }) =>
    call<{ success: boolean }>(`/api/problems/${problemId}/request-cap`, { method: 'POST', body: JSON.stringify(body) }),
  requestPlaygroundReset: (note?: string) =>
    call<{ request: PlaygroundLimitResetRequest }>('/api/playground/request-reset', { method: 'POST', body: JSON.stringify({ note }) }),
  getMyPlaygroundResetRequest: () =>
    call<{ request: PlaygroundLimitResetRequest | null }>('/api/playground/my-reset-request'),
  adminGetPendingPlaygroundResetRequests: () =>
    call<{ requests: PlaygroundLimitResetRequest[] }>('/api/playground/admin/pending-reset-requests'),
  adminGrantPlaygroundResetRequest: (id: string) =>
    call<{ request: PlaygroundLimitResetRequest }>(`/api/playground/admin/reset-requests/${id}/grant`, { method: 'POST' }),
  adminDenyPlaygroundResetRequest: (id: string) =>
    call<{ request: PlaygroundLimitResetRequest }>(`/api/playground/admin/reset-requests/${id}/deny`, { method: 'POST' }),
};
