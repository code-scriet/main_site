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
  UserListResponse,
} from '../api';

export const usersApi = {
  // Stats
  getPublicStats: () => request<{ members: number; events: number; achievements: number }>('/stats/public'),
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
    request('/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
      token,
    }),
  addPassword: (newPassword: string, token: string) =>
    request('/users/me/add-password', {
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

  // Upload — lives here because users routinely upload avatars/profile pics
  uploadImage: async (file: File, token: string): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const result = await requestForm<{ url: string }>('/upload/image', formData, { token, method: 'POST' });
    return result.url ?? '';
  },
} as const;
