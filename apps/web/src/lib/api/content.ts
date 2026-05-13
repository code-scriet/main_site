// Content domain: announcements, polls, team members, achievements, credits.
// Bundled because they share the same shape (CRUD on club content surfaces)
// and the per-file cost would not pay for the import overhead.

import { request, requestBlob } from './_internal';
import type {
  AdminPollDetail,
  AdminPollListResponse,
  Achievement,
  Announcement,
  Credit,
  Poll,
  PollCurrentFeedback,
  PollInput,
  TeamMember,
} from '../api';

export const contentApi = {
  // Announcements
  getAnnouncements: (priority?: string, featured?: boolean) => {
    const params = new URLSearchParams();
    if (priority) params.set('priority', priority);
    if (featured) params.set('featured', 'true');
    const queryString = params.toString();
    return request<Announcement[]>(`/announcements${queryString ? `?${queryString}` : ''}`);
  },
  getAnnouncement: (idOrSlug: string) =>
    request<Announcement>(`/announcements/${idOrSlug}`),
  createAnnouncement: (data: Partial<Announcement>, token: string) =>
    request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(data), token }),
  updateAnnouncement: (id: string, data: Partial<Announcement>, token: string) =>
    request<Announcement>(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteAnnouncement: (id: string, token: string) =>
    request(`/announcements/${id}`, { method: 'DELETE', token }),

  // Polls
  getPolls: (
    options?: { search?: string; includeClosed?: boolean; limit?: number; offset?: number },
    token?: string,
  ) => {
    const params = new URLSearchParams();
    if (options?.search) params.set('search', options.search);
    if (options?.includeClosed) params.set('includeClosed', 'true');
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));
    const queryString = params.toString();
    return request<Poll[]>(`/polls${queryString ? `?${queryString}` : ''}`, token ? { token } : {});
  },
  getPoll: (idOrSlug: string, token?: string) =>
    request<Poll>(`/polls/${idOrSlug}`, token ? { token } : {}),
  createPoll: (data: PollInput, token: string) =>
    request<AdminPollDetail>('/polls', { method: 'POST', body: JSON.stringify(data), token }),
  updatePoll: (id: string, data: Partial<PollInput>, token: string) =>
    request<AdminPollDetail>(`/polls/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deletePoll: (id: string, token: string) =>
    request<{ id: string }>(`/polls/${id}`, { method: 'DELETE', token }),
  voteOnPoll: (idOrSlug: string, optionIds: string[], token: string) =>
    request<Poll>(`/polls/${idOrSlug}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionIds }),
      token,
    }),
  submitPollFeedback: (idOrSlug: string, message: string, token: string) =>
    request<PollCurrentFeedback>(`/polls/${idOrSlug}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ message }),
      token,
    }),
  getAdminPolls: (
    token: string,
    filters?: {
      search?: string;
      status?: 'ALL' | 'OPEN' | 'CLOSED' | 'DRAFT';
      anonymity?: 'ALL' | 'ANONYMOUS' | 'NAMED';
      limit?: number;
      offset?: number;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.anonymity) params.set('anonymity', filters.anonymity);
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
    const queryString = params.toString();
    return request<AdminPollListResponse>(`/polls/admin/public-view${queryString ? `?${queryString}` : ''}`, { token });
  },
  getAdminPollDetail: (id: string, token: string) =>
    request<AdminPollDetail>(`/polls/admin/public-view/${id}`, { token }),
  downloadPollExport: (id: string, token: string) =>
    requestBlob(`/polls/${id}/admin/export.xlsx`, { token }),

  // Team
  getTeam: (team?: string, options?: { compact?: boolean }) => {
    const params = new URLSearchParams();
    if (team) params.set('team', team);
    if (options?.compact) params.set('compact', 'true');
    const query = params.toString();
    return request<TeamMember[]>(`/team${query ? `?${query}` : ''}`);
  },
  getTeamMember: (id: string) =>
    request<TeamMember>(`/team/${id}`),
  getTeamMemberBySlug: (slug: string) =>
    request<TeamMember>(`/team/slug/${slug}`),
  createTeamMember: (data: Partial<TeamMember>, token: string) =>
    request<TeamMember>('/team', { method: 'POST', body: JSON.stringify(data), token }),
  updateTeamMember: (id: string, data: Partial<TeamMember>, token: string) =>
    request<TeamMember>(`/team/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  updateTeamMemberProfile: (id: string, data: { bio?: string; vision?: string; story?: string; expertise?: string; achievements?: string; website?: string; github?: string; linkedin?: string; twitter?: string; instagram?: string }, token: string) =>
    request<TeamMember>(`/team/${id}/profile`, { method: 'PUT', body: JSON.stringify(data), token }),
  linkTeamMemberToUser: (id: string, userId: string | null, token: string) =>
    request<TeamMember>(`/team/${id}/link-user`, { method: 'PATCH', body: JSON.stringify({ userId }), token }),
  getMyTeamProfile: (token: string) =>
    request<TeamMember | null>(`/team/me`, { token }),

  // User search (admin) — lives here because the only callers are team-member linking flows
  searchUsers: async (query: string, token: string) => {
    const res = await request<
      Array<{ id: string; name: string; email: string; avatar?: string; role?: string }> |
      { data?: Array<{ id: string; name: string; email: string; avatar?: string; role?: string }> }
    >(
      `/users/search?q=${encodeURIComponent(query)}`,
      { token },
    );
    return { users: Array.isArray(res) ? res : (Array.isArray(res.data) ? res.data : []) };
  },

  deleteTeamMember: (id: string, token: string) =>
    request(`/team/${id}`, { method: 'DELETE', token }),

  // Achievements
  getAchievements: (options?: { year?: string; featured?: boolean; limit?: number; includeContent?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.year) params.append('year', options.year);
    if (options?.featured) params.append('featured', 'true');
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.includeContent) params.append('includeContent', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<Achievement[]>(`/achievements${query}`);
  },
  getFeaturedAchievements: (limit?: number) => {
    const params = limit ? `?limit=${limit}` : '';
    return request<Achievement[]>(`/achievements/featured${params}`);
  },
  getAchievement: (idOrSlug: string) =>
    request<Achievement>(`/achievements/${idOrSlug}`),
  createAchievement: (data: Partial<Achievement>, token: string) =>
    request<Achievement>('/achievements', { method: 'POST', body: JSON.stringify(data), token }),
  updateAchievement: (id: string, data: Partial<Achievement>, token: string) =>
    request<Achievement>(`/achievements/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteAchievement: (id: string, token: string) =>
    request(`/achievements/${id}`, { method: 'DELETE', token }),

  // Credits
  getCredits: (teamMemberId?: string) => {
    const params = new URLSearchParams();
    if (teamMemberId) params.set('teamMemberId', teamMemberId);
    const query = params.toString();
    return request<Credit[]>(`/credits${query ? `?${query}` : ''}`);
  },
  getCredit: (id: string) =>
    request<Credit>(`/credits/${id}`),
  createCredit: (data: Partial<Credit>, token: string) =>
    request<Credit>('/credits', { method: 'POST', body: JSON.stringify(data), token }),
  updateCredit: (id: string, data: Partial<Credit>, token: string) =>
    request<Credit>(`/credits/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteCredit: (id: string, token: string) =>
    request(`/credits/${id}`, { method: 'DELETE', token }),
  reorderCredits: (credits: { id: string; order: number }[], token: string) =>
    request('/credits/reorder', { method: 'PATCH', body: JSON.stringify({ credits }), token }),
} as const;
