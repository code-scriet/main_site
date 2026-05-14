// Coding domain: problems + QOTD. Tightly coupled — QOTD wraps a Problem
// with a date and publish lifecycle, and submissions flow through the same
// ProblemSubmission table via contextType/contextKey.

import { request } from './_internal';
import type {
  PendingCapRequest,
  Problem,
  ProblemContextType,
  ProblemInput,
  ProblemLanguage,
  ProblemLeaderboardEntry,
  ProblemSubmission,
  QOTDDailyLeaderboard,
  QOTDDetail,
  QOTDHistoryEntry,
  QOTDStats,
  QOTDTotalLeaderboard,
  SubmissionResult,
  SubmissionVerdict,
  TestRunResult,
} from '../api';

export const codingApi = {
  // Problems
  getProblems: (filters?: { published?: boolean; difficulty?: string; tag?: string; search?: string; limit?: number; cursor?: string }, token?: string) => {
    const params = new URLSearchParams();
    if (filters?.published !== undefined) params.set('published', String(filters.published));
    if (filters?.difficulty) params.set('difficulty', filters.difficulty);
    if (filters?.tag) params.set('tag', filters.tag);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.cursor) params.set('cursor', filters.cursor);
    const query = params.toString();
    return request<{ problems: Problem[] }>(`/problems${query ? `?${query}` : ''}`, { token });
  },
  adminGetProblems: (token: string) =>
    request<{ problems: Problem[] }>('/problems/admin/all', { token }),
  getProblem: (idOrSlug: string, options?: { contextType?: ProblemContextType; contextKey?: string; token?: string }) => {
    const params = new URLSearchParams();
    if (options?.contextType) params.set('contextType', options.contextType);
    if (options?.contextKey) params.set('contextKey', options.contextKey);
    const query = params.toString();
    return request<{ problem: Problem }>(`/problems/${idOrSlug}${query ? `?${query}` : ''}`, { token: options?.token });
  },
  createProblem: (input: ProblemInput, token: string) =>
    request<{ problem: Problem }>('/problems', { method: 'POST', body: JSON.stringify(input), token }),
  updateProblem: (id: string, input: ProblemInput, rejudge: 'auto' | 'manual' | undefined, token: string) =>
    request<{ problem: Problem }>(`/problems/${id}`, { method: 'PUT', body: JSON.stringify({ ...input, rejudge }), token }),
  deleteProblem: (id: string, token: string) =>
    request<{ success: boolean }>(`/problems/${id}`, { method: 'DELETE', token }),
  setProblemPublished: (id: string, isPublished: boolean, token: string) =>
    request<{ problem: Problem }>(`/problems/${id}/publish`, { method: 'PATCH', body: JSON.stringify({ isPublished }), token }),
  runProblem: (id: string, data: { language: ProblemLanguage; code: string; contextType?: ProblemContextType; contextKey?: string }, token: string) =>
    request<TestRunResult>(`/problems/${id}/run`, { method: 'POST', body: JSON.stringify(data), token }),
  submitProblem: (id: string, data: { language: ProblemLanguage; code: string; contextType: ProblemContextType; contextKey: string }, token: string) =>
    request<SubmissionResult>(`/problems/${id}/submit`, { method: 'POST', body: JSON.stringify(data), token }),
  getMyProblemSubmission: (id: string, contextType: ProblemContextType, contextKey: string, token: string) =>
    request<{ submission: ProblemSubmission | null }>(`/problems/${id}/my-submission?contextType=${encodeURIComponent(contextType)}&contextKey=${encodeURIComponent(contextKey)}`, { token }),
  getProblemLeaderboard: (id: string, contextType: ProblemContextType, contextKey: string, limit = 10) =>
    request<{ entries: ProblemLeaderboardEntry[] }>(`/problems/${id}/leaderboard?contextType=${encodeURIComponent(contextType)}&contextKey=${encodeURIComponent(contextKey)}&limit=${limit}`),
  adminGetProblemSubmissions: (id: string, filters: { contextType?: ProblemContextType; contextKey?: string; limit?: number; cursor?: string } | undefined, token: string) => {
    const params = new URLSearchParams();
    if (filters?.contextType) params.set('contextType', filters.contextType);
    if (filters?.contextKey) params.set('contextKey', filters.contextKey);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.cursor) params.set('cursor', filters.cursor);
    const query = params.toString();
    return request<{ submissions: ProblemSubmission[] }>(`/problems/${id}/all-submissions${query ? `?${query}` : ''}`, { token });
  },
  adminOverrideSubmission: (problemId: string, submissionId: string, override: { verdict?: SubmissionVerdict; score?: number; notes?: string }, token: string) =>
    request<{ submission: ProblemSubmission }>(`/problems/${problemId}/override/${submissionId}`, { method: 'PATCH', body: JSON.stringify(override), token }),
  adminRejudgeProblem: (id: string, filter: { contextType?: ProblemContextType; contextKey?: string } | undefined, token: string) =>
    request<{ jobId: string }>(`/problems/${id}/rejudge`, { method: 'POST', body: JSON.stringify(filter ?? {}), token }),
  adminRejudgeStatus: (id: string, jobId: string, token: string) =>
    request<{ status: string; processed: number; total: number; errors: string[] }>(`/problems/${id}/rejudge-status/${jobId}`, { token }),
  adminResetSubmitCap: (input: { userId: string; problemId: string; contextType: ProblemContextType; contextKey: string; newCap?: number; deltaSubmits?: number; clearRequest?: boolean; resetCount?: boolean }, token: string) =>
    request<{ success: boolean; capOverride: number | null }>('/problems/admin/reset-cap', { method: 'POST', body: JSON.stringify(input), token }),
  requestSubmitCap: (problemId: string, input: { contextType: ProblemContextType; contextKey: string; note?: string }, token: string) =>
    request<{ success: boolean }>(`/problems/${problemId}/request-cap`, { method: 'POST', body: JSON.stringify(input), token }),
  adminGetPendingCapRequests: (filters: { contextType?: ProblemContextType; contextKey?: string } | undefined, token: string) => {
    const params = new URLSearchParams();
    if (filters?.contextType) params.set('contextType', filters.contextType);
    if (filters?.contextKey) params.set('contextKey', filters.contextKey);
    const query = params.toString();
    return request<{ requests: PendingCapRequest[] }>(`/problems/admin/pending-cap-requests${query ? `?${query}` : ''}`, { token });
  },

  // QOTD
  getTodayQOTD: () => request<QOTDDetail | null>('/qotd/today'),
  getQOTDHistory: (limit?: number, offset?: number, options?: { includeUnpublished?: boolean; token?: string }) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    if (options?.includeUnpublished) params.append('includeUnpublished', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<QOTDHistoryEntry[]>(`/qotd/history${query}`, options?.token ? { token: options.token } : undefined);
  },
  getQOTDDailyLeaderboard: (qotdId: string) =>
    request<QOTDDailyLeaderboard>(`/qotd/${qotdId}/leaderboard`),
  getQOTDTotalLeaderboard: () =>
    request<QOTDTotalLeaderboard>('/qotd/leaderboard/total'),
  createQOTD: (data: { date: string; question?: string; problemLink?: string; difficulty?: string; problemId?: string; newProblem?: ProblemInput; publishNow?: boolean }, token: string) =>
    request('/qotd', { method: 'POST', body: JSON.stringify(data), token }),
  publishQOTD: (id: string, token: string) =>
    request(`/qotd/${id}/publish`, { method: 'POST', token }),
  holdQOTD: (id: string, reason: string | undefined, token: string) =>
    request(`/qotd/${id}/hold`, { method: 'POST', body: JSON.stringify({ reason }), token }),
  publishQOTDToPractice: (id: string, token: string) =>
    request<{ success: boolean; problemId: string }>(`/qotd/${id}/publish-practice`, { method: 'POST', token }),
  unpublishQOTDFromPractice: (id: string, token: string) =>
    request<{ success: boolean }>(`/qotd/${id}/unpublish-practice`, { method: 'POST', token }),
  submitQOTD: (id: string, token: string) =>
    request(`/qotd/${id}/submit`, { method: 'POST', token }),
  deleteQOTD: (id: string, token: string) =>
    request<{ success: boolean }>(`/qotd/${id}`, { method: 'DELETE', token }),
  getQOTDStats: (token: string) => request<QOTDStats>('/users/me/qotd-stats', { token }),
} as const;
