// User Types
export type Role = 'PUBLIC' | 'USER' | 'CORE_MEMBER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

// Event Types
export type EventStatus = 'UPCOMING' | 'ONGOING' | 'PAST';

export interface Event {
  id: string;
  title: string;
  description: string;
  status: EventStatus;
  startDate: Date;
  endDate?: Date;
  location?: string;
  capacity?: number;
  imageUrl?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventRegistration {
  id: string;
  userId: string;
  eventId: string;
  timestamp: Date;
}

// Announcement Types
export type AnnouncementPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Team Types
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  team: string;
  imageUrl: string;
  github?: string;
  linkedin?: string;
  twitter?: string;
  order: number;
  createdAt: Date;
}

// Achievement Types
export interface Achievement {
  id: string;
  title: string;
  description: string;
  eventName?: string;
  achievedBy: string;
  imageUrl?: string;
  date: Date;
  createdAt: Date;
}

// QOTD Types
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface QOTD {
  id: string;
  date: Date;
  question: string;
  problemLink: string;
  difficulty: Difficulty;
  createdAt: Date;
}

export interface QOTDSubmission {
  id: string;
  userId: string;
  qotdId: string;
  timestamp: Date;
}

// Stats Types
export interface PublicStats {
  members: number;
  events: number;
  achievements: number;
}

export interface DashboardStats {
  eventsRegistered: number;
  qotdCompleted: number;
}

// Hiring Types
export type ApplyingRole = 'TECHNICAL' | 'DESIGNING' | 'VIDEO_EDITING' | 'MANAGEMENT';
export type ApplicationStatus = 'PENDING' | 'INTERVIEW_SCHEDULED' | 'SELECTED' | 'REJECTED';

export interface HiringApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  year: string;
  skills?: string;
  applyingRole: ApplyingRole;
  status: ApplicationStatus;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}
