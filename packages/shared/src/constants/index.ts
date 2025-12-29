// Role Hierarchy
export const ROLE_HIERARCHY: Record<string, number> = {
  PUBLIC: 0,
  USER: 1,
  CORE_MEMBER: 2,
  ADMIN: 3,
};

// Teams
export const TEAMS = [
  'Admin',
  'Technical',
  'Design',
  'Management',
  'Content',
] as const;

// Difficulty Levels
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

// Event Statuses
export const EVENT_STATUSES = ['UPCOMING', 'ONGOING', 'PAST'] as const;

// Announcement Priorities
export const ANNOUNCEMENT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

// API Endpoints
export const API_ENDPOINTS = {
  AUTH: {
    GOOGLE: '/auth/google',
    GITHUB: '/auth/github',
    ME: '/auth/me',
    LOGOUT: '/auth/logout',
  },
  EVENTS: '/events',
  REGISTRATIONS: '/registrations',
  ANNOUNCEMENTS: '/announcements',
  TEAM: '/team',
  ACHIEVEMENTS: '/achievements',
  QOTD: '/qotd',
  USERS: '/users',
  STATS: '/stats',
} as const;
