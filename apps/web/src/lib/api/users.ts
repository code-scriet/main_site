// Users domain: admin user management, settings, self-profile, public stats,
// hiring applications, network profiles. Bundled because they all share the
// "people-related" surface and several callers cross domains (admin panels
// hit multiple of these to render a single page).

import { request, requestForm } from './_internal';
import type {
  HomePageData,
  NetworkConnectionType,
  NetworkProfile,
  NetworkProfileInput,
  NetworkStatus,
  PendingNetworkUser,
  SecurityEnvStatus,
  Settings,
  User,
  UserActivityItem,
  UserAuditEntry,
  UserBlock,
  UserBlockFeature,
  UserFullDetail,
  UserListAdvancedQuery,
  UserListResponse,
} from '../api';

// Full Cloudinary metadata returned by POST /upload/image. Consumed by the
// image-library tool to build its localStorage gallery entries (no server history).
export interface UploadImageResult {
  url: string;
  publicId: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  filename: string | null;
}

export const usersApi = {
  // Stats
  getPublicStats: () => request<{ users?: number; members: number; events: number; upcomingEvents?: number; teamMembers?: number; achievements: number; teamCounts?: Record<string, number> }>('/stats/public'),
  getHomePageData: () => request<HomePageData>('/stats/home'),
  getDashboardStats: (token: string) => request('/stats/dashboard', { token }),

  // Users (Admin)
  getUsers: (token: string, options?: { limit?: number; includeAll?: boolean }) => {
    const params = new URLSearchParams();
    if (typeof options?.limit === 'number') params.append('limit', String(options.limit));
    if (options?.includeAll) params.append('includeAll', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<UserListResponse>(`/users${query}`, { token });
  },
  getUser: (id: string, token: string) => request<User>(`/users/${id}`, { token }),
  updateUser: (id: string, data: {
    name?: string;
    bio?: string;
    avatarUrl?: string;
    phone?: string;
    course?: string;
    branch?: string;
    year?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
    password?: string;
  }, token: string) =>
    request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  updateUserRole: (id: string, role: string, token: string) =>
    request(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }), token }),
  deleteUser: (id: string, token: string) =>
    request(`/users/${id}`, { method: 'DELETE', token }),

  // ─── admin-deep-control ────────────────────────────────────────────────
  getUsersAdvanced: (token: string, query: UserListAdvancedQuery = {}) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.role?.length) params.set('role', query.role.join(','));
    if (query.branch?.length) params.set('branch', query.branch.join(','));
    if (query.year?.length) params.set('year', query.year.join(','));
    if (query.blockedFrom?.length) params.set('blockedFrom', query.blockedFrom.join(','));
    if (query.hasNetwork) params.set('hasNetwork', '1');
    if (query.includeDeleted) params.set('includeDeleted', '1');
    if (query.sort) params.set('sort', query.sort);
    if (query.cursor) params.set('cursor', query.cursor);
    if (typeof query.take === 'number') params.set('take', String(query.take));
    if (query.searchAll) params.set('searchAll', '1');
    const qs = params.toString();
    return request<UserListResponse>(`/users${qs ? `?${qs}` : ''}`, { token });
  },
  getUserFull: (id: string, token: string) =>
    request<UserFullDetail>(`/users/${id}/full`, { token }),
  getUserActivity: (id: string, token: string, opts: { take?: number } = {}) => {
    const qs = typeof opts.take === 'number' ? `?take=${opts.take}` : '';
    return request<{ items: UserActivityItem[] }>(`/users/${id}/activity${qs}`, { token });
  },
  getUserAudit: (
    id: string,
    token: string,
    opts: { as?: 'actor' | 'target'; cursor?: string | null; take?: number } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.as) params.set('as', opts.as);
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (typeof opts.take === 'number') params.set('take', String(opts.take));
    const qs = params.toString();
    return request<{ entries: UserAuditEntry[]; meta: { hasMore: boolean; nextCursor: string | null; as: string } }>(
      `/users/${id}/audit${qs ? `?${qs}` : ''}`,
      { token },
    );
  },
  resetCurrentStreak: (id: string, token: string) =>
    request<{ id: string; currentStreak: number }>(`/users/${id}/streak/reset-current`, { method: 'POST', token }),
  restoreLongestStreak: (id: string, token: string) =>
    request<{ id: string; currentStreak: number }>(`/users/${id}/streak/restore-longest`, { method: 'POST', token }),

  listUserBlocks: (id: string, token: string) =>
    request<UserBlock[]>(`/users/${id}/blocks`, { token }),
  addUserBlock: (
    id: string,
    data: { feature: UserBlockFeature; reason?: string | null; expiresAt?: string | null },
    token: string,
  ) => request<UserBlock>(`/users/${id}/blocks`, { method: 'POST', body: JSON.stringify(data), token }),
  removeUserBlock: (id: string, feature: UserBlockFeature, token: string) =>
    request<{ removed: number }>(`/users/${id}/blocks/${feature}`, { method: 'DELETE', token }),

  forceLogoutUser: (id: string, token: string) =>
    request<{ id: string; tokenVersion: number }>(`/users/${id}/force-logout`, { method: 'POST', token }),
  sendPasswordResetEmail: (id: string, token: string) =>
    request<{ sent: boolean; expiresAt: string }>(`/users/${id}/password-reset`, { method: 'POST', token }),
  softDeleteUser: (id: string, token: string) =>
    request<{ id: string; isDeleted: true }>(`/users/${id}`, { method: 'DELETE', token }),
  hardDeleteUser: (id: string, token: string) =>
    request<{ id: string }>(`/users/${id}?hard=true`, { method: 'DELETE', token }),
  restoreUser: (id: string, token: string) =>
    request<{ id: string; isDeleted: false }>(`/users/${id}/restore`, { method: 'POST', token }),

  // Settings
  getSettings: () => request<Settings>('/settings/public'),
  updateSettings: (data: Partial<Settings>, token: string) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data), token }),
  patchSetting: (key: string, value: boolean | string | number, token: string) =>
    request<Settings>(`/settings/${key}`, { method: 'PATCH', body: JSON.stringify({ value }), token }),
  getSecurityEnvStatus: (token: string) =>
    request<SecurityEnvStatus>('/settings/security-env', { token }),
  updateSecurityEnvSettings: (
    data: { attendanceJwtSecret?: string | null; indexNowKey?: string | null },
    token: string,
  ) => request<SecurityEnvStatus>('/settings/security-env', { method: 'PATCH', body: JSON.stringify(data), token }),

  // Profile (self)
  getProfile: (token: string) => request<{
    id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
    bio?: string;
    phone?: string;
    course?: string;
    branch?: string;
    year?: string;
    profileCompleted?: boolean;
    hasPassword?: boolean;
    oauthProvider?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
    createdAt: string;
    _count: { registrations: number; qotdSubmissions: number };
  }>('/users/me', { token }),
  updateProfile: (data: {
    name?: string;
    bio?: string;
    avatarUrl?: string;
    phone?: string;
    course?: string;
    branch?: string;
    year?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
  }, token: string) =>
    request('/users/me', { method: 'PUT', body: JSON.stringify(data), token }),
  changePassword: (currentPassword: string, newPassword: string, token: string) =>
    // S6: the API bumps tokenVersion (killing every other session) and returns
    // a fresh token the caller must adopt so the current session survives.
    request<{ success: boolean; message?: string; token?: string }>('/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
      token,
    }),
  addPassword: (newPassword: string, token: string) =>
    request<{ success: boolean; message?: string; token?: string }>('/users/me/add-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
      token,
    }),

  // Hiring
  getMyHiringApplication: (token: string) =>
    request<{
      hasApplied: boolean;
      application?: {
        id: string;
        applyingRole: string;
        status: string;
        createdAt: string;
      };
    } | null>('/hiring/my-application', { token }),
  submitHiringApplication: (
    data: {
      name: string;
      email: string;
      phone?: string;
      department: string;
      year: string;
      skills?: string;
      applyingRole: string;
    },
    token?: string,
  ) =>
    request<{ message?: string }>('/hiring/apply', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  // Network (public)
  getNetworkProfiles: (filters?: { industry?: string; connectionType?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.industry) params.append('industry', filters.industry);
    if (filters?.connectionType) params.append('connectionType', filters.connectionType);
    if (filters?.search) params.append('search', filters.search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<{
      profiles: NetworkProfile[];
      filters: { industries: string[]; connectionTypes: NetworkConnectionType[] };
      total: number;
    }>(`/network${query}`);
  },
  getNetworkProfile: (idOrSlug: string) => request<NetworkProfile>(`/network/${idOrSlug}`),

  // Network (authenticated)
  joinNetwork: (token: string) =>
    request<{ success: boolean; message: string; newRole: string }>('/network/join', {
      method: 'POST',
      token,
    }),
  getMyNetworkProfile: (token: string) =>
    request<{ data: NetworkProfile | null; hasProfile: boolean }>('/network/profile/me', { token }),
  createNetworkProfile: (data: NetworkProfileInput, token: string) =>
    request<NetworkProfile>('/network/profile', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),
  updateNetworkProfile: (data: Partial<NetworkProfileInput>, token: string) =>
    request<NetworkProfile>('/network/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  // Network (admin)
  getNetworkPending: (token: string) =>
    request<NetworkProfile[]>('/network/admin/pending', { token }),
  getNetworkAll: (token: string, status?: NetworkStatus) => {
    const params = status ? `?status=${status}` : '';
    return request<{
      profiles: NetworkProfile[];
      counts: { PENDING: number; VERIFIED: number; REJECTED: number };
      total: number;
    }>(`/network/admin/all${params}`, { token });
  },
  getNetworkPendingUsers: (token: string) =>
    request<{ users: PendingNetworkUser[]; total: number }>('/network/admin/pending-users', { token }),
  revertPendingNetworkUser: (userId: string, token: string) =>
    request<{ id: string; role: string; name: string; email: string }>(
      `/network/admin/pending-users/${userId}/revert`,
      { method: 'PATCH', token },
    ),
  deletePendingNetworkUser: (userId: string, token: string) =>
    request<{ message: string }>(`/network/admin/pending-users/${userId}`, {
      method: 'DELETE',
      token,
    }),
  verifyNetworkProfile: (id: string, token: string) =>
    request<NetworkProfile>(`/network/admin/${id}/verify`, { method: 'PATCH', token }),
  rejectNetworkProfile: (id: string, reason: string, token: string) =>
    request<NetworkProfile>(`/network/admin/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
      token,
    }),
  updateNetworkProfileAdmin: (id: string, data: Partial<NetworkProfile>, token: string) =>
    request<NetworkProfile>(`/network/admin/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),
  deleteNetworkProfile: (id: string, token: string) =>
    request(`/network/admin/${id}`, { method: 'DELETE', token }),
  getNetworkStats: (token: string) =>
    request<{ totalVerified: number; totalPending: number; thisMonth: number }>(
      '/network/admin/stats',
      { token },
    ),

  // Upload — lives here because users routinely upload avatars/profile pics.
  // String-only: the avatar/signature callers just need the URL.
  uploadImage: async (file: File, token: string): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const result = await requestForm<{ url: string }>('/upload/image', formData, { token, method: 'POST' });
    return result.url ?? '';
  },

  // Detailed upload — returns the full Cloudinary metadata the image-library tool
  // needs to render its localStorage-backed gallery. Nothing is persisted server-side
  // (the gallery lives only in the uploader's browser), so the client owns history.
  uploadImageDetailed: async (file: File, token: string): Promise<UploadImageResult> => {
    const formData = new FormData();
    formData.append('image', file);
    const r = await requestForm<Partial<UploadImageResult>>('/upload/image', formData, { token, method: 'POST' });
    return {
      url: r.url ?? '',
      publicId: r.publicId ?? '',
      bytes: typeof r.bytes === 'number' ? r.bytes : (Number.isFinite(file.size) ? file.size : null),
      width: r.width ?? null,
      height: r.height ?? null,
      format: r.format ?? null,
      filename: r.filename ?? file.name ?? null,
    };
  },

  // Upload a streak-share card to the dedicated streak-cards/ folder (S-03).
  // Unlike uploadImage, this creates NO gallery row and is open to any authenticated
  // user (not just CORE_MEMBER+). Returns the Cloudinary URL to persist via setStreakCard.
  uploadStreakCard: async (file: File, token: string): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const result = await requestForm<{ url: string }>('/upload/streak-card', formData, { token, method: 'POST' });
    return result.url ?? '';
  },

  // Persist the streak-share card URL → og:image of /share/streak/:userId (S-03).
  setStreakCard: (url: string, token: string) =>
    request<{ streakCardUrl: string }>('/users/me/streak-card', { method: 'POST', body: JSON.stringify({ url }), token }),
} as const;
