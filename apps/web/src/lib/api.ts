import { extractApiErrorMessage } from '@/lib/error';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// ISSUE-013: Custom error class for 401 responses to trigger auto-logout
export class UnauthorizedError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  token?: string;
  [key: string]: unknown;
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

async function executeJsonRequest(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
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

  const executeRequest = (requestHeaders: Record<string, string>) =>
    fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      credentials: 'include', // send & receive cookies for cross-origin session
      headers: requestHeaders,
    });

  const withoutAuthHeader = (requestHeaders: Record<string, string>) => {
    const sanitized = { ...requestHeaders };
    for (const headerName of Object.keys(sanitized)) {
      if (headerName.toLowerCase() === 'authorization') {
        delete sanitized[headerName];
      }
    }
    return sanitized;
  };

  let response = await executeRequest(headers);
  // If a stale local token triggers 401 but a fresh session cookie exists, retry once using cookie auth only.
  if (response.status === 401 && token) {
    response = await executeRequest(withoutAuthHeader(headers));
  }

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    const message = extractApiErrorMessage(errorData, `Request failed (${response.status})`);
    // ISSUE-013: Throw UnauthorizedError on 401 to trigger auto-logout
    if (response.status === 401) {
      throw new UnauthorizedError(message);
    }
    throw new Error(message);
  }

  return response.json();
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const json = await executeJsonRequest(endpoint, options) as ApiEnvelope<T>;
  // Extract data from the API response format { success: true, data: ... }
  return json.data !== undefined ? json.data : json as T;
}

async function requestEnvelope<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  return executeJsonRequest(endpoint, options) as Promise<ApiEnvelope<T>>;
}

async function requestForm<T>(endpoint: string, formData: FormData, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  const hasHeader = (name: string) =>
    Object.keys(headers).some((headerName) => headerName.toLowerCase() === name.toLowerCase());

  if (token && !hasHeader('Authorization')) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!hasHeader('Accept')) {
    headers.Accept = 'application/json';
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    method: fetchOptions.method ?? 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    const message = extractApiErrorMessage(errorData, `Request failed (${response.status})`);
    if (response.status === 401) {
      throw new UnauthorizedError(message);
    }
    throw new Error(message);
  }

  const json = await response.json() as ApiEnvelope<T>;
  return json.data !== undefined ? json.data : json as T;
}

async function requestBlob(endpoint: string, options: RequestOptions = {}): Promise<Blob> {
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

  if (hasRequestBody && !hasHeader('Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }

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
    if (response.status === 401) {
      throw new UnauthorizedError(message);
    }
    throw new Error(message);
  }

  return response.blob();
}




export interface AuthProviders {
  google: boolean;
  github: boolean;
  devLogin: boolean;
  emailPassword: boolean;
}

export interface QOTDHistoryEntry {
  id: string;
  date: string;
  question: string;
  problemLink: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface QOTDLeaderboardEntry {
  user: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  submissions: number;
}

export interface QuizAdminSummary {
  id: string;
  title: string;
  description: string | null;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED' | 'DRAFT' | 'ABANDONED';
  questionCount: number;
  participantCount: number;
  createdBy?: { id: string; name: string };
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  pin?: string;
  creator?: { name: string };
  _count?: { participants: number };
}

export type QuizQuestionType =
  | 'MCQ'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'POLL'
  | 'RATING'
  | 'MULTI_SELECT'
  | 'OPEN_ENDED';

export interface QuizQuestionInput {
  position: number;
  questionText: string;
  questionType: QuizQuestionType;
  options?: string[] | null;
  correctAnswer?: string | null;
  timeLimitSeconds: number;
  points: number;
  mediaUrl?: string | null;
}

export interface QuizCreateInput {
  title: string;
  description?: string;
  questions: QuizQuestionInput[];
}

export interface QuizImportResult {
  titleSuggestion: string;
  importedCount: number;
  skippedBlankRows: number;
  questions: QuizQuestionInput[];
}

export interface User {
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
  createdAt?: string;
  isSuperAdmin?: boolean; // ISSUE-014: Added to support audit log visibility
  oauthProvider?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
}

export interface UserListMeta {
  totalUsers: number;
  privilegedUsers: number;
  regularUsersTotal: number;
  regularUsersReturned: number;
  regularLimit: number | null;
  includeAll: boolean;
  hasMoreRegular: boolean;
}

export interface UserListResponse {
  users: User[];
  meta: UserListMeta;
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
  show_tech_blogs?: boolean;
  hiringEnabled?: boolean;
  hiringTechnical?: boolean;
  hiringDsaChamps?: boolean;
  hiringDesigning?: boolean;
  hiringSocialMedia?: boolean;
  hiringManagement?: boolean;
  competitionEnabled?: boolean;
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
  // Email Notification Controls
  emailWelcomeEnabled?: boolean;
  emailEventCreationEnabled?: boolean;
  emailRegistrationEnabled?: boolean;
  emailAnnouncementEnabled?: boolean;
  emailCertificateEnabled?: boolean;
  emailReminderEnabled?: boolean;
  emailTestingMode?: boolean;
  emailTestRecipients?: string | null;
  updatedAt: string;
}

export interface SecurityEnvStatus {
  attendanceJwtSecretConfigured: boolean;
  indexNowKeyConfigured: boolean;
  mode: 'settings-only';
  runtimeStatus: {
    nodeEnv: string;
    attendanceJwtSecretActive: boolean;
    indexNowKeyActive: boolean;
    legacyEnvDetected: {
      attendanceJwtSecret: boolean;
      indexNowKey: boolean;
    };
  };
  persistenceSupported?: boolean;
  runtimeOnlyMode?: boolean;
  runtimeOnlyApplied?: boolean;
  updatedAt: string | null;
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

export interface CompetitionRoundPreview {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  duration: number;
  status: 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'JUDGING' | 'FINISHED';
  participantScope?: 'ALL' | 'SELECTED_TEAMS';
  leadersOnly?: boolean;
  allowedTeamIds?: string[];
  startedAt?: string;
  lockedAt?: string;
  remainingSeconds?: number | null;
  submissionCount?: number;
  hasSubmitted?: boolean;
  isEligible?: boolean;
  eligibilityReason?: string;
  createdAt: string;
  updatedAt: string;
}

const EVENT_REGISTRATION_FIELD_TYPES: readonly EventRegistrationFieldType[] = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'EMAIL',
  'PHONE',
  'URL',
];

const isEventRegistrationFieldType = (value: string): value is EventRegistrationFieldType =>
  EVENT_REGISTRATION_FIELD_TYPES.includes(value as EventRegistrationFieldType);

function normalizeEventRegistrationFields(input: unknown): EventRegistrationField[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const usedIds = new Set<string>();
  const normalized: EventRegistrationField[] = [];

  input.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const raw = entry as Record<string, unknown>;

    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    if (!label) return;

    const rawId =
      (typeof raw.id === 'string' && raw.id.trim()) ||
      (typeof raw.key === 'string' && raw.key.trim()) ||
      `field_${index + 1}`;

    let id = rawId;
    while (usedIds.has(id)) {
      id = `${rawId}_${index + 1}`;
    }
    usedIds.add(id);

    const rawType = typeof raw.type === 'string' ? raw.type.toUpperCase() : 'TEXT';
    const type = isEventRegistrationFieldType(rawType) ? rawType : 'TEXT';

    const toOptionalNumber = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;

    normalized.push({
      id,
      label,
      type,
      required: Boolean(raw.required),
      placeholder: typeof raw.placeholder === 'string' ? raw.placeholder : undefined,
      minLength: toOptionalNumber(raw.minLength),
      maxLength: toOptionalNumber(raw.maxLength),
      min: toOptionalNumber(raw.min),
      max: toOptionalNumber(raw.max),
      pattern: typeof raw.pattern === 'string' ? raw.pattern : undefined,
    });
  });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeEventPayload(event: Event): Event {
  return {
    ...event,
    registrationFields: normalizeEventRegistrationFields(
      (event as Event & { registrationFields?: unknown }).registrationFields
    ),
  };
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
  eventDays?: number;
  dayLabels?: string[];
  registrationFields?: EventRegistrationField[];
  // Team registration fields
  teamRegistration?: boolean;
  teamMinSize?: number;
  teamMaxSize?: number;
}

export interface Registration {
  id: string;
  userId: string;
  eventId: string;
  timestamp: string;
  attendanceToken?: string;
  attended?: boolean;
  scannedAt?: string;
  manualOverride?: boolean;
  customFieldResponses?: Array<{
    fieldId: string;
    label: string;
    value: string;
  }>;
  event: Event;
}

// Team registration types
export interface EventTeamMemberInfo {
  id: string;
  userId: string;
  role: 'LEADER' | 'MEMBER';
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
}

export interface EventTeam {
  id: string;
  eventId: string;
  teamName: string;
  inviteCode?: string; // Only visible to leader
  leaderId: string;
  isLocked: boolean;
  createdAt: string;
  members: EventTeamMemberInfo[];
  isLeader?: boolean;
  isComplete?: boolean;
  isFull?: boolean;
  teamMinSize?: number;
  teamMaxSize?: number;
}

export interface EventTeamWithEvent extends EventTeam {
  event: { teamMinSize: number; teamMaxSize: number };
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

export interface PollOptionResult {
  id: string;
  text: string;
  sortOrder: number;
  voteCount: number;
  percentage: number;
}

export interface PollCurrentVote {
  id: string;
  optionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PollCurrentFeedback {
  id: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface Poll {
  id: string;
  question: string;
  description?: string | null;
  slug: string;
  shareUrl: string;
  allowMultipleChoices: boolean;
  allowVoteChange: boolean;
  isAnonymous: boolean;
  isPublished: boolean;
  deadline?: string | null;
  createdAt: string;
  updatedAt: string;
  isClosed: boolean;
  totalVotes: number;
  totalFeedback: number;
  creator?: { id: string; name: string; email?: string; avatar?: string | null };
  options: PollOptionResult[];
  currentUserVote: PollCurrentVote | null;
  currentUserFeedback: PollCurrentFeedback | null;
}

export interface PollInput {
  question: string;
  description?: string | null;
  options: string[];
  allowMultipleChoices?: boolean;
  allowVoteChange?: boolean;
  isAnonymous?: boolean;
  deadline?: string | null;
  isPublished?: boolean;
}

export interface AdminPollListItem {
  id: string;
  question: string;
  slug: string;
  shareUrl: string;
  allowMultipleChoices: boolean;
  allowVoteChange: boolean;
  isAnonymous: boolean;
  isPublished: boolean;
  deadline?: string | null;
  createdAt: string;
  updatedAt: string;
  isClosed: boolean;
  totalVotes: number;
  totalFeedback: number;
  optionCount: number;
  creator: { id: string; name: string; email: string };
}

export interface AdminPollResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    role: string;
  };
  optionIds: string[];
  optionLabels: string[];
}

export interface AdminPollFeedbackEntry {
  id: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    role: string;
  };
}

export interface AdminPollDetail extends Poll {
  creator: { id: string; name: string; email: string; avatar?: string | null };
  responses: AdminPollResponse[];
  feedback: AdminPollFeedbackEntry[];
}

export interface AdminPollListResponse {
  polls: AdminPollListItem[];
  total: number;
  limit: number;
  offset: number;
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

export interface Credit {
  id: string;
  title: string;
  description?: string;
  category: string;
  teamMemberId?: string;
  teamMember?: { id: string; name: string; slug?: string; imageUrl: string; role: string; team: string };
  order: number;
  createdAt: string;
}

export interface CompetitionRound {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  duration: number;
  status: 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'JUDGING' | 'FINISHED';
  participantScope?: 'ALL' | 'SELECTED_TEAMS';
  leadersOnly?: boolean;
  allowedTeamIds?: string[];
  isEligible?: boolean;
  eligibilityReason?: string;
  targetImageUrl?: string;
  startedAt?: string;
  lockedAt?: string;
  serverTime?: string;
  remainingSeconds?: number | null;
  submissionCount?: number;
  hasSubmitted?: boolean;
  myTeam?: { id: string; teamName: string; memberCount: number } | null;
  eventTitle?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CompetitionSubmission {
  id: string;
  roundId: string;
  teamId?: string;
  teamName?: string | null;
  userId: string;
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
  code: string;
  submittedAt: string;
  isAutoSubmit: boolean;
  score?: number | null;
  rank?: number | null;
  adminNotes?: string | null;
}

export interface CompetitionMissingTeam {
  id: string;
  teamName: string;
  members: string[];
}

export interface CompetitionResult {
  id: string;
  rank: number | null;
  teamName: string;
  members: string[];
  score: number | null;
  submittedAt: string;
  elapsedSeconds?: number | null;
  isAutoSubmit: boolean;
  userName?: string;
}

export type CertType = 'PARTICIPATION' | 'COMPLETION' | 'WINNER' | 'SPEAKER';
export type CertificateTemplate = 'gold' | 'dark' | 'white' | 'emerald';
export type CompetitionGenerationStrategy = 'specific_round' | 'best_selected_rounds' | 'average_selected_rounds';
export type CertificateBulkSource = 'attendance' | 'competition' | 'generic';

export interface CompetitionResultsSummaryMember {
  userId: string;
  name: string;
  email: string;
  attended: boolean;
}

export interface CompetitionResultsSummarySubmission {
  submissionId: string;
  rank: number | null;
  score: number | null;
  submittedAt: string;
  teamId?: string;
  teamName?: string;
  members?: CompetitionResultsSummaryMember[];
  userId?: string;
  userName?: string;
  userEmail?: string;
  attended?: boolean;
}

export interface CompetitionResultsSummaryRound {
  roundId: string;
  title: string;
  submissions: CompetitionResultsSummarySubmission[];
}

export interface CompetitionResultsSummaryResponse {
  rounds: CompetitionResultsSummaryRound[];
}

export interface CertificateBulkRecipientInput {
  name: string;
  email: string;
  userId?: string | null;
  type?: CertType | null;
  position?: string | null;
  description?: string | null;
  template?: CertificateTemplate | null;
  domain?: string | null;
  teamName?: string | null;
}

export interface CertificateBulkGenerateInput {
  recipients: CertificateBulkRecipientInput[];
  eventId?: string | null;
  eventName?: string | null;
  type?: CertType | null;
  template?: CertificateTemplate;
  signatoryId?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  signatoryCustomImageUrl?: string | null;
  facultySignatoryId?: string | null;
  facultyName?: string | null;
  facultyTitle?: string | null;
  facultyCustomImageUrl?: string | null;
  description?: string | null;
  domain?: string | null;
  source?: CertificateBulkSource;
  generationStrategy?: CompetitionGenerationStrategy | null;
  selectedRoundIds?: string[];
  sendEmail?: boolean;
}

export interface CertificateBulkGenerateResponse {
  generated: number;
  failed: number;
  results: Array<{
    certId: string;
    pdfUrl: string;
    name: string;
    email: string;
    type?: CertType;
  }>;
  errors: Array<{
    name: string;
    email: string;
    reason: string;
  }>;
  emailsSent?: number;
  emailsFailed?: number;
}

// Attendance types
export interface DayAttendance {
  dayNumber: number;
  attended: boolean;
  scannedAt: string | null;
  scannedBy?: string | null;
  manualOverride?: boolean;
}

export interface AttendanceQR {
  attendanceToken: string;
  attended: boolean;
  scannedAt: string | null;
  event: { title: string; startDate: string; endDate: string | null };
  eventDays?: number;
  dayLabels?: string[];
  dayAttendances?: DayAttendance[];
  daysAttended?: number;
  allDaysAttended?: boolean;
}

export interface AttendanceLiveData {
  total: number;
  attended: number;
  notAttended: number;
  attendanceRate: number;
  eventDays?: number;
  dayLabels?: string[];
  dayStats?: Array<{ dayNumber: number; count: number }>;
  recentScans: Array<{
    registrationId: string;
    userId: string;
    userName: string;
    userAvatar?: string | null;
    dayNumber?: number;
    scannedAt: string | null;
    manualOverride?: boolean;
  }>;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  eventId: string;
  timestamp: string;
  attended: boolean;
  scannedAt: string | null;
  manualOverride: boolean;
  attendanceToken: string | null;
  dayAttendances?: DayAttendance[];
  user: { id: string; name: string; email: string; avatar: string | null; branch: string | null; year: string | null };
}

export interface CertificateRecipient {
  registrationId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar: string | null;
  attended: boolean;
  scannedAt: string | null;
  manualOverride: boolean;
  dayAttendances?: DayAttendance[];
  daysAttended?: number;
  hasCertificate: boolean;
  certificateDbId: string | null;
  certificateId: string | null;
  certificateType: CertType | null;
  certificatePdfUrl: string | null;
  emailSent: boolean;
  emailSentAt: string | null;
}

export interface AttendanceSearchResult {
  registrationId: string;
  userName: string;
  userEmail: string;
  userAvatar: string | null;
  attended: boolean;
  scannedAt: string | null;
  manualOverride: boolean;
}

export interface AttendanceHistoryEvent {
  id: string;
  scannedAt: string;
  eventDays?: number;
  dayLabels?: string[];
  dayAttendances?: DayAttendance[];
  daysAttended?: number;
  event: { id: string; title: string; slug: string; startDate: string; imageUrl: string | null };
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
  vision?: string;
  story?: string;
  expertise?: string;
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
  userId: string | null;
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
  body?: string | null;
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
  getMeWithToken: async (token?: string | null) => {
    const response = await requestEnvelope<User>('/auth/me', token ? { token } : {});
    return {
      user: response.data ?? null,
      token: typeof response.token === 'string' ? response.token : undefined,
    };
  },
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
  getEvents: async (status?: string) => {
    const params = status ? `?status=${status}` : '';
    const events = await request<Event[]>(`/events${params}`);
    return events.map((event) => normalizeEventPayload(event));
  },
  getEvent: async (id: string) => normalizeEventPayload(await request<Event>(`/events/${id}`)),
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
  
  // User search (admin)
  searchUsers: async (query: string, token: string) => {
    const res = await request<
      Array<{ id: string; name: string; email: string; avatar?: string; role?: string }> |
      { data?: Array<{ id: string; name: string; email: string; avatar?: string; role?: string }> }
    >(
      `/users/search?q=${encodeURIComponent(query)}`,
      { token }
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

  // QOTD
  getTodayQOTD: () => request('/qotd/today'),
  getQOTDHistory: (limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<QOTDHistoryEntry[]>(`/qotd/history${query}`);
  },
  getQOTDLeaderboard: (limit = 50) =>
    request<QOTDLeaderboardEntry[]>(`/qotd/stats/leaderboard?limit=${limit}`),
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
    token?: string
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

  // Signatories (admin)
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

  // Upload image to Cloudinary (returns secure_url)
  uploadImage: async (file: File, token: string): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:5001/api';
    const res = await fetch(`${BASE_URL}/upload/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(err.message || 'Image upload failed');
    }
    const json = await res.json() as { data?: { url: string } };
    return json.data?.url ?? '';
  },

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
  bulkGenerateCertificates: (data: CertificateBulkGenerateInput, token: string) =>
    request<CertificateBulkGenerateResponse>('/certificates/bulk', { method: 'POST', body: JSON.stringify(data), token }),
  downloadCertificate: (certId: string, token: string) =>
    request<{ url: string }>(`/certificates/download/${certId}`, { token }),
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
  deleteCertificate: (certId: string, token: string) =>
    request<{ certId: string }>(`/certificates/${certId}`, { method: 'DELETE', token }),
  resendCertificateEmail: (certId: string, token: string) =>
    request<{ sent: boolean }>(`/certificates/${certId}/resend`, { method: 'POST', token }),

  // === Attendance ===
  getMyQR: (eventId: string, token: string) =>
    request<AttendanceQR>(`/attendance/my-qr/${eventId}`, { token }),
  scanAttendance: (qrToken: string, token: string, dayNumber: number, bypassWindow?: boolean) =>
    request<{ userId: string; userName: string; scannedAt: string; dayNumber: number }>('/attendance/scan', { method: 'POST', body: JSON.stringify({ token: qrToken, dayNumber, bypassWindow }), token }),
  scanAttendanceBatch: (scans: Array<{ token: string; scannedAtLocal: string; localId: string; dayNumber?: number }>, eventId: string, token: string, bypassWindow?: boolean) =>
    request<{ results: Array<{ localId: string; status: 'ok' | 'duplicate' | 'error'; name?: string; message?: string }> }>('/attendance/scan-batch', { method: 'POST', body: JSON.stringify({ scans, eventId, bypassWindow }), token }),
  manualCheckin: (registrationId: string, token: string, dayNumber = 1) =>
    request<{ registrationId: string; dayNumber: number }>('/attendance/manual-checkin', { method: 'POST', body: JSON.stringify({ registrationId, dayNumber }), token }),
  unmarkAttendance: (registrationId: string, token: string, dayNumber = 1) =>
    request<{ registrationId: string; dayNumber: number }>('/attendance/unmark', { method: 'PATCH', body: JSON.stringify({ registrationId, dayNumber }), token }),
  bulkUpdateAttendance: (registrationIds: string[], action: 'mark' | 'unmark', token: string, dayNumber = 1) =>
    request<{ updated: number }>('/attendance/bulk-update', { method: 'PATCH', body: JSON.stringify({ registrationIds, action, dayNumber }), token }),
  editAttendance: (registrationId: string, data: { scannedAt?: string; manualOverride?: boolean; dayNumber?: number }, token: string) =>
    request<{ registrationId: string }>(`/attendance/edit/${registrationId}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  regenerateAttendanceToken: (registrationId: string, token: string) =>
    request<{ attendanceToken: string }>(`/attendance/regenerate-token/${registrationId}`, { method: 'POST', token }),
  regenerateAttendanceTokensForEvent: (eventId: string, token: string) =>
    request<{ regenerated: number; total: number }>(`/attendance/regenerate-tokens/event/${eventId}`, { method: 'POST', token }),
  searchAttendance: (eventId: string, query: string, token: string, page?: number) =>
    request<{ results: AttendanceSearchResult[]; total: number; page: number; totalPages: number }>(`/attendance/search?eventId=${eventId}&q=${encodeURIComponent(query)}${page ? `&page=${page}` : ''}`, { token }),
  getAttendanceLive: (eventId: string, token: string) =>
    request<AttendanceLiveData>(`/attendance/live/${eventId}`, { token }),
  getAttendanceFull: (eventId: string, token: string) =>
    request<{ registrations: AttendanceRecord[]; eventDays?: number; dayLabels?: string[] }>(`/attendance/event/${eventId}/full`, { token }),
  exportAttendanceExcel: async (eventId: string, token: string, dayNumber?: number) => {
    const dayQuery = typeof dayNumber === 'number' ? `?dayNumber=${dayNumber}` : '';
    const res = await fetch(`${API_URL}/attendance/event/${eventId}/export${dayQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Export failed');
    // ISSUE-036: Add error handling for blob() parsing
    try {
      return await res.blob();
    } catch {
      throw new Error('Failed to parse export file');
    }
  },
  emailAbsentees: (eventId: string, subject: string, body: string, token: string, dayNumber?: number) =>
    request<{ emailed: number; sent?: number; dayNumber?: number }>(`/attendance/email-absentees/${eventId}`, { method: 'POST', body: JSON.stringify({ subject, body, dayNumber }), token }),
  getAttendanceCertRecipients: (eventId: string, token: string, minDays?: number) =>
    request<{ recipients: CertificateRecipient[]; stats: { totalRegistered: number; totalAttended: number; alreadyCertified: number; eligibleRecipients?: number }; eventDays?: number; dayLabels?: string[] }>(`/attendance/event/${eventId}/certificate-recipients${typeof minDays === 'number' ? `?minDays=${minDays}` : ''}`, { token }),
  getMyAttendanceHistory: (token: string) =>
    request<{ events: AttendanceHistoryEvent[] }>('/attendance/my-history', { token }),
  getAttendanceSummary: (eventId: string) =>
    request<{ total: number; attended: number; eventDays?: number; dayLabels?: string[]; daySummary?: Array<{ dayNumber: number; attended: number }> }>(`/attendance/event/${eventId}/summary`),
  backfillAttendanceTokens: (token: string) =>
    request<{ backfilled: number }>('/attendance/backfill-tokens', { method: 'POST', token }),

  // ========================================
  // Team registration API
  // ========================================
  createTeam: (data: { eventId: string; teamName: string; customFieldResponses?: Record<string, unknown> }, token: string) =>
    request<{ team: EventTeam; event: { teamMinSize: number; teamMaxSize: number }; message: string }>('/teams/create', { method: 'POST', body: JSON.stringify(data), token }),

  joinTeam: (data: { inviteCode: string; customFieldResponses?: Record<string, unknown> }, token: string) =>
    request<{ team: EventTeam; event: { teamMinSize: number; teamMaxSize: number }; message: string }>('/teams/join', { method: 'POST', body: JSON.stringify(data), token }),

  getCompetitionRounds: (eventId: string, token?: string) =>
    request<{ rounds: CompetitionRoundPreview[] }>(`/competition/event/${eventId}`, { ...(token ? { token } : {}) }),

  getMyTeam: async (eventId: string, token: string): Promise<EventTeam | null> => {
    try {
      return await request<EventTeam>(`/teams/my-team/${eventId}`, { token });
    } catch {
      // 404 means no team - return null instead of throwing
      return null;
    }
  },

  toggleTeamLock: (teamId: string, token: string) =>
    request<{ isLocked: boolean }>(`/teams/${teamId}/lock`, { method: 'PATCH', token }),

  removeTeamMember: (teamId: string, userId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE', token }),

  leaveTeam: (teamId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/leave`, { method: 'POST', token }),

  transferLeadership: (teamId: string, newLeaderId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/transfer-leadership`, { method: 'POST', body: JSON.stringify({ newLeaderId }), token }),

  dissolveTeam: (teamId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/dissolve`, { method: 'DELETE', token }),

  // Admin team routes
  getEventTeams: (eventId: string, token: string) =>
    request<{
      teams: Array<EventTeam & {
        memberCount: number;
        leader: { id: string; name: string; email: string; avatar: string | null };
        members: Array<EventTeamMemberInfo & {
          registration: { id: string; timestamp: string; customFieldResponses: unknown };
        }>;
      }>;
      event: { teamMinSize: number; teamMaxSize: number };
    }>(`/teams/event/${eventId}`, { token }),

  adminToggleTeamLock: (teamId: string, token: string) =>
    request<{ isLocked: boolean }>(`/teams/${teamId}/admin-lock`, { method: 'PATCH', token }),

  adminDissolveTeam: (teamId: string, token: string) =>
    request<{ message: string }>(`/teams/${teamId}/admin-dissolve`, { method: 'DELETE', token }),

  // Competition
  createCompetitionRound: (data: {
    eventId: string;
    title: string;
    description?: string;
    duration: number;
    participantScope?: 'ALL' | 'SELECTED_TEAMS';
    leadersOnly?: boolean;
    allowedTeamIds?: string[];
    targetImageUrl?: string;
  }, token: string) =>
    request<{ round: CompetitionRound }>('/competition', { method: 'POST', body: JSON.stringify(data), token }),
  getCompetitionRoundsAdmin: (eventId: string, token: string) =>
    request<{ rounds: CompetitionRound[] }>(`/competition/event/${eventId}`, { token }),
  getCompetitionRound: (roundId: string, token: string) =>
    request<CompetitionRound>(`/competition/${roundId}`, { token }),
  startCompetitionRound: (roundId: string, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}/start`, { method: 'PATCH', token }),
  lockCompetitionRound: (roundId: string, token: string) =>
    request<{ message: string }>(`/competition/${roundId}/lock`, { method: 'PATCH', token }),
  beginJudging: (roundId: string, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}/judging`, { method: 'PATCH', token }),
  finishCompetition: (roundId: string, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}/finish`, { method: 'PATCH', token }),
  saveCompetitionCode: (roundId: string, data: { code: string }, token: string) =>
    request<{ savedAt: string; serverTime: string }>(`/competition/${roundId}/save`, { method: 'POST', body: JSON.stringify(data), token }),
  submitCompetitionCode: (roundId: string, data: { code: string }, token: string) =>
    request<{ submission: { id: string; submittedAt: string }; message: string }>(`/competition/${roundId}/submit`, { method: 'POST', body: JSON.stringify(data), token }),
  getMyCompetitionSubmission: (roundId: string, token: string) =>
    request<{
      submission: (CompetitionSubmission & { submittedAt: string }) | null;
      autoSave: { code: string; savedAt: string } | null;
    }>(`/competition/${roundId}/my-submission`, { token }),
  getCompetitionSubmissions: (roundId: string, token: string) =>
    request<{
      round: CompetitionRound;
      submissions: CompetitionSubmission[];
      missingTeams: CompetitionMissingTeam[];
    }>(`/competition/${roundId}/submissions`, { token }),
  scoreCompetitionSubmission: (roundId: string, submissionId: string, data: { score?: number; rank?: number; adminNotes?: string }, token: string) =>
    request<{ submission: CompetitionSubmission }>(`/competition/${roundId}/score/${submissionId}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  getCompetitionResults: (roundId: string) =>
    request<{ round: CompetitionRound; results: CompetitionResult[] }>(`/competition/${roundId}/results`),
  getCompetitionResultsSummary: (eventId: string, token: string) =>
    request<CompetitionResultsSummaryResponse>(`/competition/event/${eventId}/results-summary`, { token }),
  deleteCompetitionRound: (roundId: string, token: string) =>
    request<{ message: string }>(`/competition/${roundId}`, { method: 'DELETE', token }),
  updateCompetitionRound: (roundId: string, data: {
    title?: string;
    description?: string;
    duration?: number;
    participantScope?: 'ALL' | 'SELECTED_TEAMS';
    leadersOnly?: boolean;
    allowedTeamIds?: string[];
    targetImageUrl?: string | null;
  }, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}`, { method: 'PUT', body: JSON.stringify(data), token }),
  exportCompetitionResults: async (roundId: string, token: string) => {
    const res = await fetch(`${API_URL}/competition/${roundId}/results/export?format=xlsx`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Export failed');
    try {
      return await res.blob();
    } catch {
      throw new Error('Failed to parse export file');
    }
  },
};
