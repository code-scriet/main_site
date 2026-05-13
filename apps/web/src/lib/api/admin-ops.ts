// Admin ops: quiz + audit log + playground + signatories. Bundled because
// they all sit behind admin UI and rarely change shape together with
// public-facing flows.

import { request, requestForm } from './_internal';
import type {
  AuditLogEntry,
  PlaygroundLimitResetRequest,
  QuizAdminSummary,
  QuizCreateInput,
  QuizImportResult,
  QuizQuestionInput,
} from '../api';

export const adminOpsApi = {
  // Audit Logs
  getAuditLogs: (token: string, filters?: {
    page?: number;
    limit?: number;
    entity?: string;
    action?: string;
    userId?: string;
    search?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.entity) params.append('entity', filters.entity);
    if (filters?.action) params.append('action', filters.action);
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.search) params.append('search', filters.search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<{
      logs: AuditLogEntry[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
      filters: { entities: string[]; actions: string[] };
    }>(`/audit-logs${query}`, { token });
  },

  // Quiz
  getMyQuizDashboard: (token: string) =>
    request<{
      liveQuizzes: Array<{
        id: string;
        title: string;
        status: string;
        questionCount: number;
        participantCount: number;
      }>;
      history: Array<{
        quizId: string;
        title: string;
        endedAt: string | null;
        questionCount: number;
        finalScore: number;
        finalRank: number | null;
        correctCount: number;
        totalParticipants: number;
        joinedMidQuiz: boolean;
      }>;
    }>('/quiz/my-dashboard', { token }),
  getQuizAdminList: (token: string) =>
    request<QuizAdminSummary[]>('/quiz/admin/list', { token }),
  importQuizFile: async (file: File, token: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return requestForm<QuizImportResult>('/quiz/import', formData, { token, method: 'POST' });
  },
  createQuiz: (data: QuizCreateInput, token: string) =>
    request<{ id: string; title: string }>('/quiz', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),
  updateQuiz: (quizId: string, data: QuizCreateInput, token: string) =>
    request<{ id: string }>(`/quiz/${quizId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),
  getQuiz: (quizId: string, token: string) =>
    request<{
      id: string;
      title: string;
      description: string | null;
      status: 'WAITING' | 'ACTIVE' | 'FINISHED' | 'DRAFT' | 'ABANDONED';
      questionCount: number;
      questions: QuizQuestionInput[];
    }>(`/quiz/${quizId}`, { token }),
  joinQuizByPin: (pin: string, token?: string) =>
    request<{
      quizId: string;
      title: string;
      quizAccessToken: string;
    }>('/quiz/join', {
      method: 'POST',
      body: JSON.stringify({ pin }),
      token,
    }),
  deleteQuiz: (quizId: string, token: string) =>
    request<{ message?: string }>(`/quiz/${quizId}`, {
      method: 'DELETE',
      token,
    }),
  openQuiz: (quizId: string, token: string) =>
    request<{ pin?: string }>(`/quiz/${quizId}/open`, {
      method: 'POST',
      token,
    }),
  checkQuizHost: (quizId: string, token: string) =>
    request<{ isHost: boolean; quizAccessToken?: string }>(`/quiz/${quizId}/check-host`, {
      token,
    }),
  getQuizResults: (quizId: string, token?: string) =>
    request<unknown>(`/quiz/${quizId}/results`, {
      token,
    }),

  // Playground
  getPlaygroundSnippets: (token: string) =>
    request<Array<{
      id: string;
      title: string;
      language: string;
      createdAt: string;
    }>>('/playground/snippets', { token }),
  getPlaygroundStats: (token: string) =>
    request<{
      languageStats: Array<{ language: string; count: number }>;
      totalExecutions: number;
      todayCount: number;
      dailyLimit: number;
    }>('/playground/stats', { token }),
  getPlaygroundHistory: (token: string) =>
    request<Array<{
      id: string;
      language: string;
      code: string;
      output: string;
      durationMs: number;
      status: string;
      executedAt: string;
    }>>('/playground/history', { token }),
  requestPlaygroundReset: (token: string, note?: string) =>
    request<{ request: PlaygroundLimitResetRequest }>('/playground/request-reset', {
      method: 'POST',
      body: JSON.stringify({ note }),
      token,
    }),
  getMyPlaygroundResetRequest: (token: string) =>
    request<{ request: PlaygroundLimitResetRequest | null }>('/playground/my-reset-request', { token }),
  adminGetPendingPlaygroundResetRequests: (token: string) =>
    request<{ requests: PlaygroundLimitResetRequest[] }>('/playground/admin/pending-reset-requests', { token }),
  adminGrantPlaygroundResetRequest: (id: string, token: string) =>
    request<{ request: PlaygroundLimitResetRequest }>(`/playground/admin/reset-requests/${id}/grant`, {
      method: 'POST',
      token,
    }),
  adminDenyPlaygroundResetRequest: (id: string, token: string) =>
    request<{ request: PlaygroundLimitResetRequest }>(`/playground/admin/reset-requests/${id}/deny`, {
      method: 'POST',
      token,
    }),

  // Signatories
  getActiveSignatories: (token: string) =>
    request<{ id: string; name: string; title: string; signatureUrl: string | null }[]>('/signatories/active', { token }),
  getSignatories: (token: string) =>
    request<{
      id: string; name: string; title: string; signatureUrl: string | null; isActive: boolean;
      _count: { certificatesAsPrimary: number; certificatesAsFaculty: number };
    }[]>('/signatories', { token }),
  createSignatory: (data: { name: string; title: string; signatureImageBase64?: string; signatureImageUrl?: string }, token: string) =>
    request<{ id: string; name: string; title: string; signatureUrl: string | null; isActive: boolean }>('/signatories', { method: 'POST', body: JSON.stringify(data), token }),
  updateSignatory: (id: string, data: { name?: string; title?: string; isActive?: boolean; signatureImageBase64?: string | null; signatureImageUrl?: string | null }, token: string) =>
    request<{ id: string; name: string; title: string; signatureUrl: string | null; isActive: boolean }>(`/signatories/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  deleteSignatory: (id: string, token: string) =>
    request<{ deactivated?: boolean; certCount?: number } | null>(`/signatories/${id}`, { method: 'DELETE', token }),
} as const;
