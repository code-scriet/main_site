const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

interface RequestOptions extends RequestInit {
  token?: string;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'An error occurred' }));
    // Handle Zod validation errors (array format)
    if (Array.isArray(errorData.error)) {
      const messages = errorData.error.map((e: { message?: string; path?: string[] }) => 
        e.message || 'Validation error'
      ).join(', ');
      throw new Error(messages);
    }
    // Handle string error messages
    let message: string;
    if (typeof errorData.error === 'string') {
      message = errorData.error;
    } else if (errorData.error?.message) {
      // Handle object error: { error: { message: "..." } }
      message = errorData.error.message;
    } else {
      message = errorData.message || `HTTP error! status: ${response.status}`;
    }
    throw new Error(message);
  }

  const json = await response.json();
  // Extract data from the API response format { success: true, data: ... }
  return json.data !== undefined ? json.data : json;
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
  // Social Links
  githubUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  instagramUrl?: string;
  discordUrl?: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  title: string;
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
}

export interface Registration {
  id: string;
  userId: string;
  eventId: string;
  timestamp: string;
  event: Event;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  createdBy: string;
  createdAt: string;
  creator?: { name: string };
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
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  eventName?: string;
  achievedBy: string;
  date: string;
  imageUrl?: string;
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
  registerForEvent: (eventId: string, token: string) =>
    request<Registration>(`/registrations/events/${eventId}`, { method: 'POST', token }),
  cancelRegistration: (eventId: string, token: string) =>
    request(`/registrations/events/${eventId}`, { method: 'DELETE', token }),
  getMyRegistrations: (token: string) =>
    request<Registration[]>('/registrations/my', { token }),
  
  // Announcements
  getAnnouncements: (priority?: string) => {
    const params = priority ? `?priority=${priority}` : '';
    return request<Announcement[]>(`/announcements${params}`);
  },
  createAnnouncement: (data: Partial<Announcement>, token: string) =>
    request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(data), token }),
  updateAnnouncement: (id: string, data: Partial<Announcement>, token: string) =>
    request<Announcement>(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteAnnouncement: (id: string, token: string) =>
    request(`/announcements/${id}`, { method: 'DELETE', token }),
  
  // Team
  getTeam: (team?: string) => {
    const params = team ? `?team=${team}` : '';
    return request<TeamMember[]>(`/team${params}`);
  },
  createTeamMember: (data: Partial<TeamMember>, token: string) =>
    request<TeamMember>('/team', { method: 'POST', body: JSON.stringify(data), token }),
  updateTeamMember: (id: string, data: Partial<TeamMember>, token: string) =>
    request<TeamMember>(`/team/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteTeamMember: (id: string, token: string) =>
    request(`/team/${id}`, { method: 'DELETE', token }),
  
  // Achievements
  getAchievements: (year?: string) => {
    const params = year ? `?year=${year}` : '';
    return request<Achievement[]>(`/achievements${params}`);
  },
  createAchievement: (data: Partial<Achievement>, token: string) =>
    request<Achievement>('/achievements', { method: 'POST', body: JSON.stringify(data), token }),
  
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
};
