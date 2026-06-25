// Dashboard v2 — client methods for the new endpoints added in dashboard_v2 (May 2026).
// Source of truth: apps/api/src/routes/notifications.ts, search.ts, plus additions to
// problems.ts, qotd.ts, teams.ts, upload.ts, stats.ts.

import { request } from './_internal';

export interface NotifItem {
  id: string;
  group: 'invitations' | 'quiz' | 'certificates' | 'system';
  icon: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

export interface NotificationsPayload {
  unreadCount: number;
  total: number;
  readCutoff: string;
  groups: {
    invitations: NotifItem[];
    quiz: NotifItem[];
    certificates: NotifItem[];
    system: NotifItem[];
    broadcasts: NotifItem[];
  };
}

export interface GlobalSearchPayload {
  pages: Array<{ kind: 'page'; label: string; icon: string; route: string }>;
  events: Array<{ kind: 'event'; label: string; sub?: string; icon: string; route: string }>;
  problems: Array<{ kind: 'problem'; label: string; sub?: string; icon: string; route: string }>;
  polls: Array<{ kind: 'poll'; label: string; icon: string; route: string }>;
  people: Array<{ kind: 'person'; label: string; sub?: string; icon: string; route: string }>;
  announcements: Array<{ kind: 'announcement'; label: string; icon: string; route: string }>;
}

// S-08 — monthly digest payload (auto-built recap, editable before sending).
export interface MonthlyDigest {
  month: string;
  label: string;
  summary: {
    month: string;
    label: string;
    newMembers: number;
    eventsHeld: number;
    attendanceMarks: number;
    certificatesIssued: number;
    qotdSolves: number;
    quizSessions: number;
    newNetworkMembers: number;
    topStreaks: Array<{ name: string; streak: number }>;
  };
  subject: string;
  markdown: string;
}

// S-06 — first-week onboarding checklist status.
export interface OnboardingStatus {
  profileCompleted: boolean;
  solvedQotd: boolean;
  registeredEvent: boolean;
  savedSnippet: boolean;
  allDone: boolean;
}

export interface RecentSubmission {
  id: string;
  problemId: string;
  problemTitle: string;
  problemSlug: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | null;
  language: string;
  verdict: string;
  score: number;
  passedCount: number;
  totalCount: number;
  runtimeMs: number | null;
  submittedAt: string;
  contextType: string;
  contextKey: string;
}

export interface AroundMeLeaderboard {
  slice: Array<{ rank: number; userId: string; name: string; avatar: string | null; score: number; you: boolean }>;
  myRank: number | null;
  totalRanked: number;
  nextUpDelta: number | null;
  nextUp: { rank: number; name: string; score: number } | null;
}

export interface MyTeamCard {
  id: string;
  eventId: string;
  event: { id: string; title: string; slug: string; startDate: string; status: string; teamMinSize: number; teamMaxSize: number };
  teamName: string;
  inviteCode?: string;
  leaderId: string;
  isLocked: boolean;
  createdAt: string;
  isLeader: boolean;
  isComplete: boolean;
  isFull: boolean;
  members: Array<{
    id: string;
    userId: string;
    role: string;
    joinedAt: string;
    user: { id: string; name: string; email: string; avatar: string | null };
  }>;
}

export interface AdminInsights {
  totalUsers: number;
  newUsersLastWeek: number;
  usersDelta: number;
  activeEvents: number;
  upcomingEvents: number;
  pendingInvitationsCount: number;
  certificatesThisMonth: number;
  liveScansLastHour: number;
  quizSessionsLast7d: number;
  registrationsThisWeek: number;
  attendedThisWeek: number;
  averageStreak: number;
  longestStreakOverall: number;
  acRatePct: number;
  submissionsThisWeek: number;
  topContributor: { id: string; name: string; avatar: string | null; count: number } | null;
  networkPending: number;
  playgroundPressurePct: number;
  playgroundActiveToday: number;
  playgroundAtCap: number;
}

export interface AdminDashboardStats {
  overview: {
    totalUsers: number;
    newUsersThisMonth: number;
    totalEvents: number;
    upcomingEvents: number;
    totalRegistrations: number;
    recentRegistrations: number;
    totalAnnouncements: number;
    totalQOTDs: number;
    qotdSubmissionsThisWeek: number;
  };
  insights: AdminInsights;
  popularEvents: Array<{ id: string; title: string; registrations: number }>;
  recentUsers: Array<{ id: string; name: string; email: string; createdAt: string }>;
}

export type NotifAudience =
  | 'ALL' | 'USERS' | 'NETWORK' | 'ALUMNI' | 'NETWORK_AND_ALUMNI' | 'ADMIN' | 'CORE_MEMBER' | 'CUSTOM';

export interface ComposeNotificationInput {
  audience: NotifAudience;
  audienceRoles?: string[];
  audienceUserIds?: string[];
  category?: string;
  icon?: string;
  title: string;
  body?: string;
  link?: string;
  expiresAt?: string;
}

export interface BroadcastRow {
  id: string;
  source: string;
  audience: NotifAudience;
  audienceRoles: unknown;
  audienceUserIds: unknown;
  category: string;
  icon: string;
  title: string;
  body: string | null;
  link: string | null;
  refEntity: string | null;
  refEntityId: string | null;
  createdAt: string;
  expiresAt: string | null;
  createdBy: { id: string; name: string; email: string; avatar?: string | null } | null;
}

export const dashboardApi = {
  // Notifications
  getNotifications: (token: string) => request<NotificationsPayload>('/notifications', { token }),
  markNotificationsRead: (token: string, at?: string) =>
    request<{ readCutoff: string }>('/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify(at ? { at } : {}),
      token,
    }),
  composeNotification: (input: ComposeNotificationInput, token: string) =>
    request<{ id: string }>('/notifications/compose', {
      method: 'POST',
      body: JSON.stringify(input),
      token,
    }),
  listAdminBroadcasts: (token: string) =>
    request<BroadcastRow[]>('/notifications/admin/broadcasts', { token }),
  deleteAdminBroadcast: (id: string, token: string) =>
    request<{ id: string }>(`/notifications/admin/broadcasts/${id}`, { method: 'DELETE', token }),

  // Global Cmd+K search
  globalSearch: (q: string, token: string, limit = 5) =>
    request<GlobalSearchPayload>(`/search/global?q=${encodeURIComponent(q)}&limit=${limit}`, { token }),

  // Recent submissions for current user (overview widget)
  getMyRecentSubmissions: (token: string, limit = 5) =>
    request<RecentSubmission[]>(`/problems/me/recent?limit=${limit}`, { token }),

  // S-06 — first-week onboarding checklist status
  getOnboarding: (token: string) =>
    request<OnboardingStatus>('/stats/onboarding', { token }),

  // Rank ± window around me
  getQOTDLeaderboardAroundMe: (token: string, windowSize = 2) =>
    request<AroundMeLeaderboard>(`/qotd/leaderboard/around-me?window=${windowSize}`, { token }),

  // All teams I'm a member of (across events)
  getMyAllTeams: (token: string) =>
    request<{ teams: MyTeamCard[] }>('/teams/my-all', { token }),

  // Admin dashboard stats (now with 12-tile insights block)
  getAdminDashboardStats: (token: string) =>
    request<AdminDashboardStats>('/stats/dashboard', { token }),

  // S-08 — monthly "what happened" digest (admin loads → edits → sends via the mailer)
  getMonthlyDigest: (token: string, month?: string) =>
    request<MonthlyDigest>(`/stats/digest${month ? `?month=${encodeURIComponent(month)}` : ''}`, { token }),

  // Admin: grant or deny a pending cap request (one-click from the overview pending-requests card)
  adminGrantCapRequest: (counterId: string, token: string, body?: { deltaSubmits?: number; newCap?: number }) =>
    request<{ success: boolean; capOverride: number }>(`/problems/admin/cap-requests/${counterId}/grant`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
      token,
    }),
  adminDenyCapRequest: (counterId: string, token: string) =>
    request<{ success: boolean }>(`/problems/admin/cap-requests/${counterId}/deny`, {
      method: 'POST',
      token,
    }),
};
