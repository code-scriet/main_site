import { extractApiErrorMessage } from '@/lib/error';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

interface RequestOptions extends RequestInit {
  token?: string;
}

async function readErrorPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => '');
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text.trim() };
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const hasRequestBody =
    fetchOptions.body !== undefined &&
    fetchOptions.body !== null &&
    method !== 'GET' &&
    method !== 'HEAD';

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  const hasHeader = (name: string) =>
    Object.keys(headers).some((headerName) => headerName.toLowerCase() === name.toLowerCase());

  // Avoid forcing JSON content-type on GET/HEAD requests because that triggers CORS preflight.
  if (hasRequestBody && !hasHeader('Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }

  if (!hasHeader('Accept')) {
    headers.Accept = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    credentials: 'include',   // send & receive cookies for cross-origin session
    headers,
  });

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    const message = extractApiErrorMessage(errorData, `Request failed (${response.status})`);
    throw new Error(message);
  }

  const json = await response.json();
  // Extract data from the API response format { success: true, data: ... }
  return json.data !== undefined ? json.data : json;
}

function parseFilenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallback;
}

async function requestBlob(
  endpoint: string,
  options: RequestOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  const hasHeader = (name: string) =>
    Object.keys(headers).some((headerName) => headerName.toLowerCase() === name.toLowerCase());

  if (!hasHeader('Accept')) {
    headers.Accept = 'application/octet-stream';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    const message = extractApiErrorMessage(errorData, `Request failed (${response.status})`);
    throw new Error(message);
  }

  const blob = await response.blob();
  const fallbackFilename = `${endpoint.split('/').pop() || 'download'}.pdf`;

  return {
    blob,
    filename: parseFilenameFromDisposition(response.headers.get('content-disposition'), fallbackFilename),
  };
}

export interface AuthProviders {
  google: boolean;
  github: boolean;
  devLogin: boolean;
  emailPassword: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  phone?: string;
  course?: string;
  branch?: string;
  year?: string;
  profileCompleted?: boolean;
  createdAt?: string;
}

export interface Settings {
  id: string;
  clubName: string;
  clubEmail: string;
  clubDescription: string;
  registrationOpen: boolean;
  maxEventsPerUser: number;
  announcementsEnabled: boolean;
  showLeaderboard?: boolean;
  showQOTD?: boolean;
  showAchievements?: boolean;
  hiringEnabled?: boolean;
  hiringTechnical?: boolean;
  hiringDsaChamps?: boolean;
  hiringDesigning?: boolean;
  hiringSocialMedia?: boolean;
  hiringManagement?: boolean;
  showNetwork?: boolean;
  mailingEnabled?: boolean;
  certificatesEnabled?: boolean;
  playgroundEnabled?: boolean;
  playgroundDailyLimit?: number;
  // Social Links
  githubUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  instagramUrl?: string;
  discordUrl?: string;
  // Email Template Customization
  emailWelcomeBody?: string;
  emailAnnouncementBody?: string;
  emailEventBody?: string;
  emailFooterText?: string;
  updatedAt: string;
}

// Extended types for event details
export interface Speaker {
  name: string;
  role: string;
  bio?: string;
  image?: string;
}

export interface Resource {
  title: string;
  url: string;
  type?: 'pdf' | 'video' | 'link' | 'github' | 'slides' | 'other';
}

export interface FAQ {
  question: string;
  answer: string;
}

export type EventRegistrationFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'EMAIL'
  | 'PHONE'
  | 'URL';

export interface EventRegistrationField {
  id: string;
  label: string;
  type: EventRegistrationFieldType;
  required: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface RegistrationAdditionalFieldInput {
  fieldId: string;
  value: string;
}

export interface Event {
  id: string;
  title: string;
  slug: string; // URL-friendly version of title
  description: string;
  status: 'UPCOMING' | 'ONGOING' | 'PAST';
  startDate: string;
  endDate?: string;
  registrationStartDate?: string;
  registrationEndDate?: string;
  location?: string;
  venue?: string;
  eventType?: string;
  prerequisites?: string;
  capacity?: number;
  imageUrl?: string;
  createdBy: string;
  _count?: { registrations: number };
  // Extended event fields
  shortDescription?: string;
  agenda?: string;
  highlights?: string;
  learningOutcomes?: string;
  targetAudience?: string;
  speakers?: Speaker[];
  resources?: Resource[];
  faqs?: FAQ[];
  imageGallery?: string[];
  videoUrl?: string;
  tags?: string[];
  featured?: boolean;
  allowLateRegistration?: boolean;
  registrationFields?: EventRegistrationField[];
}

export interface Registration {
  id: string;
  userId: string;
  eventId: string;
  timestamp: string;
  customFieldResponses?: Array<{
    fieldId: string;
    label: string;
    value: string;
  }>;
  event: Event;
}

export interface Announcement {
  id: string;
  title: string;
  slug: string;
  body: string;
  shortDescription?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  imageUrl?: string | null;
  imageGallery?: string[] | null;
  attachments?: { title: string; url: string; type?: string }[] | null;
  links?: { title: string; url: string }[] | null;
  tags?: string[];
  featured: boolean;
  pinned: boolean;
  expiresAt?: string | null;
  createdBy: string;
  createdAt: string;
  creator?: { id: string; name: string; avatar?: string };
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  team: string;
  imageUrl: string;
  github?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  order?: number;
  // New profile fields
  userId?: string;
  slug?: string;
  bio?: string;
  vision?: string;
  story?: string;
  expertise?: string;
  achievements?: string;
  website?: string;
  // Linked user data (merged from user)
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    bio?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
  };
  // Sync metadata
  _syncedFrom?: Record<string, 'user' | 'team'>;
}

export interface Achievement {
  id: string;
  title: string;
  slug: string;
  description: string;
  content?: string;
  shortDescription?: string;
  eventName?: string;
  achievedBy: string;
  date: string;
  imageUrl?: string;
  imageGallery?: string[];
  tags?: string[];
  featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Network types
export type NetworkConnectionType =
  | 'GUEST_SPEAKER'
  | 'GMEET_SESSION'
  | 'EVENT_JUDGE'
  | 'MENTOR'
  | 'INDUSTRY_PARTNER'
  | 'ALUMNI'
  | 'OTHER';

export type NetworkStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

// Event participation entry - events the network member attended/hosted
export interface NetworkEvent {
  title: string;
  date: string;
  description?: string;
  type?: string; // 'GMeet Session', 'In-Person Talk', etc.
  link?: string;
}

export interface NetworkProfile {
  id: string;
  userId?: string;
  slug?: string;
  fullName: string;
  designation: string;
  company: string;
  industry: string;
  bio?: string;
  profilePhoto?: string;
  phone?: string;
  linkedinUsername?: string;
  twitterUsername?: string;
  githubUsername?: string;
  personalWebsite?: string;
  connectionType: NetworkConnectionType;
  connectionNote?: string;
  connectedSince?: number;
  // Alumni-specific fields
  passoutYear?: number;
  degree?: string;
  branch?: string;
  rollNumber?: string;
  achievements?: string;
  currentLocation?: string;
  // Rich profile content fields
  vision?: string;
  story?: string;
  expertise?: string;
  // Admin fields
  adminNotes?: string;
  events?: NetworkEvent[];
  isFeatured?: boolean;
  status: NetworkStatus;
  isPublic: boolean;
  displayOrder?: number;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface NetworkProfileInput {
  fullName: string;
  designation: string;
  company: string;
  industry: string;
  bio?: string;
  profilePhoto?: string;
  phone?: string;
  linkedinUsername?: string;
  twitterUsername?: string;
  githubUsername?: string;
  personalWebsite?: string;
  connectionType: NetworkConnectionType;
  connectionNote?: string;
  connectedSince?: number;
  // Alumni-specific fields
  passoutYear?: number;
  degree?: string;
  branch?: string;
  rollNumber?: string;
  achievements?: string;
  currentLocation?: string;
}

export interface PendingNetworkUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  oauthProvider?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
  user: { id: string; name: string; email: string; avatar?: string | null };
}

export interface HomeEventPreview {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string | null;
  status: 'UPCOMING' | 'ONGOING' | 'PAST';
  startDate: string;
  endDate?: string | null;
  registrationStartDate?: string | null;
  registrationEndDate?: string | null;
  location?: string | null;
  eventType?: string | null;
  capacity?: number | null;
  imageUrl?: string | null;
  registrationFields?: EventRegistrationField[] | null;
  _count?: { registrations: number };
}

export interface HomeAnnouncementPreview {
  id: string;
  title: string;
  slug?: string | null;
  body: string;
  shortDescription?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  createdAt: string;
  creator?: { id: string; name: string; avatar?: string | null } | null;
}

export interface HomeAchievementPreview {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string | null;
  eventName?: string | null;
  achievedBy: string;
  imageUrl?: string | null;
  imageGallery?: string[] | null;
  date: string;
  featured?: boolean;
}

export interface HomeTeamPreview {
  id: string;
  name: string;
  role: string;
  slug?: string | null;
  imageUrl: string;
  github?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  instagram?: string | null;
}

export interface HomeNetworkPreview {
  id: string;
  slug?: string | null;
  fullName: string;
  designation: string;
  company: string;
  industry: string;
  profilePhoto?: string | null;
  linkedinUsername?: string | null;
  githubUsername?: string | null;
  personalWebsite?: string | null;
  connectionType: NetworkConnectionType;
  passoutYear?: number | null;
  branch?: string | null;
  isFeatured?: boolean;
}

export interface HomePageData {
  stats: {
    members: number;
    events: number;
    achievements: number;
  };
  settings: {
    clubDescription?: string | null;
    hiringEnabled?: boolean;
    showNetwork?: boolean;
  };
  upcomingEvents: HomeEventPreview[];
  latestAnnouncements: HomeAnnouncementPreview[];
  featuredAchievements: HomeAchievementPreview[];
  teamHighlights: HomeTeamPreview[];
  networkHighlights: HomeNetworkPreview[];
}

export const api = {
  // Auth
  getProviders: () => request<AuthProviders>('/auth/providers'),
  getMe: (token: string) => request<User>('/auth/me', { token }),
  devLogin: (email: string, name?: string) => 
    request<{ token: string; user: User }>('/auth/dev-login', { 
      method: 'POST', 
      body: JSON.stringify({ email, name }) 
    }),
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  exchangeAuthCode: (code: string) =>
    request<{ token: string; intent?: string; network_type?: 'professional' | 'alumni' }>('/auth/exchange-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  
  // Events
  getEvents: (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return request<Event[]>(`/events${params}`);
  },
  getEvent: (id: string) => request<Event>(`/events/${id}`),
  createEvent: (data: Partial<Event>, token: string) => 
    request<Event>('/events', { method: 'POST', body: JSON.stringify(data), token }),
  updateEvent: (id: string, data: Partial<Event>, token: string) =>
    request<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteEvent: (id: string, token: string) =>
    request(`/events/${id}`, { method: 'DELETE', token }),
  
  // Registrations
  registerForEvent: (
    eventId: string,
    token: string,
    additionalFields?: RegistrationAdditionalFieldInput[]
  ) =>
    request<Registration>(`/registrations/events/${eventId}`, {
      method: 'POST',
      body: JSON.stringify({
        ...(additionalFields ? { additionalFields } : {}),
      }),
      token,
    }),
  cancelRegistration: (eventId: string, token: string) =>
    request(`/registrations/events/${eventId}`, { method: 'DELETE', token }),
  getMyRegistrations: (token: string) =>
    request<Registration[]>('/registrations/my', { token }),
  
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
  
  // User search (admin)
  searchUsers: async (query: string, token: string) => {
    const res = await request<Array<{ id: string; name: string; email: string; avatar?: string; role?: string }>>(
      `/users/search?q=${encodeURIComponent(query)}`,
      { token }
    );
    return { users: Array.isArray(res) ? res : (res as any).data || [] };
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
  
  // QOTD
  getTodayQOTD: () => request('/qotd/today'),
  getQOTDHistory: (limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/qotd/history${query}`);
  },
  createQOTD: (data: { date: string; question: string; problemLink: string; difficulty: string }, token: string) =>
    request('/qotd', { method: 'POST', body: JSON.stringify(data), token }),
  submitQOTD: (id: string, token: string) =>
    request(`/qotd/${id}/submit`, { method: 'POST', token }),
  getQOTDStats: (token: string) => request('/users/me/qotd-stats', { token }),
  
  // Stats
  getPublicStats: () => request<{ members: number; events: number; achievements: number }>('/stats/public'),
  getHomePageData: () => request<HomePageData>('/stats/home'),
  getDashboardStats: (token: string) => request('/stats/dashboard', { token }),
  
  // Users (Admin)
  getUsers: (token: string) => request('/users', { token }),
  getUser: (id: string, token: string) => request(`/users/${id}`, { token }),
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
  
  // Profile
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
      token 
    }),
  
  addPassword: (newPassword: string, token: string) =>
    request('/users/me/add-password', { 
      method: 'POST', 
      body: JSON.stringify({ newPassword }), 
      token 
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

  // Network (authenticated - NETWORK role user)
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
      { method: 'PATCH', token }
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
      { token }
    ),

  // Audit Logs (admin)
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
      }>;
    }>('/quiz/my-dashboard', { token }),

  // Certificates
  getCertificates: (token: string, params?: { page?: number; limit?: number; search?: string; type?: string; eventId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.type) qs.set('type', params.type);
    if (params?.eventId) qs.set('eventId', params.eventId);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ certificates: unknown[]; total: number; page: number; totalPages: number }>(`/certificates${query}`, { token });
  },
  generateCertificate: (data: Record<string, unknown>, token: string) =>
    request<{ certId: string; pdfUrl: string; downloadUrl: string; verifyUrl: string }>('/certificates/generate', { method: 'POST', body: JSON.stringify(data), token }),
  bulkGenerateCertificates: (data: Record<string, unknown>, token: string) =>
    request<{ generated: number; failed: number; results: unknown[]; errors: unknown[] }>('/certificates/bulk', { method: 'POST', body: JSON.stringify(data), token }),
  downloadCertificate: (certId: string, token: string) =>
    requestBlob(`/certificates/download/${certId}`, { token }),
  getMyCertificates: (token: string, params?: { page?: number; limit?: number; type?: string; sort?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.type) qs.set('type', params.type);
    if (params?.sort) qs.set('sort', params.sort);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ certificates: unknown[]; total: number; page: number; totalPages: number }>(`/certificates/mine${query}`, { token });
  },
  revokeCertificate: (certId: string, reason: string | undefined, token: string) =>
    request<{ certId: string }>(`/certificates/${certId}/revoke`, { method: 'PATCH', body: JSON.stringify({ reason }), token }),
  resendCertificateEmail: (certId: string, token: string) =>
    request<{ sent: boolean }>(`/certificates/${certId}/resend`, { method: 'POST', token }),
};
