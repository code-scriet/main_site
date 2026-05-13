// Helpers (request, requestEnvelope, requestForm, requestBlob, UnauthorizedError)
// live in ./api/_internal.ts. Re-exported here so existing imports keep working.
import {
  API_URL,
  UnauthorizedError,
  request,
  requestEnvelope,
  requestForm,
  requestBlob,
} from './api/_internal';
import { authApi } from './api/auth';

export { UnauthorizedError };




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
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'EASY' | 'MEDIUM' | 'HARD';
  problemId?: string | null;
  problem?: Problem | null;
  hasSubmitted?: boolean;
  isPublished?: boolean;
  publishAt?: string | null;
  publishedAt?: string | null;
  heldBy?: string | null;
  holdReason?: string | null;
}

export interface QOTDDetail extends QOTDHistoryEntry {
  createdAt?: string;
}

export interface QOTDBadge {
  id: string;
  label: string;
  description: string;
  kind: 'streak' | 'volume';
  threshold: number;
  icon: string;
  earned: boolean;
}

export interface QOTDStats {
  currentStreak: number;
  longestStreak: number;
  totalSolved: number;
  totalSubmissions: number; // legacy alias of totalSolved
  daysActive: number;
  todaySolved: boolean;
  last30Days: Array<{ date: string; solved: boolean }>;
  badges: QOTDBadge[];
  nextMilestone:
    | {
        kind: 'streak' | 'volume';
        label: string;
        description: string;
        icon: string;
        progress: number;
        target: number;
        remaining: number;
      }
    | null;
  recentSubmissions: Array<{ date: string; difficulty: string; timestamp: string }>;
}

export type ProblemLanguage = 'PYTHON' | 'JAVASCRIPT' | 'CPP' | 'JAVA';
export type ProblemContextType = 'QOTD' | 'CONTEST' | 'PRACTICE';
export type SubmissionVerdict =
  | 'PENDING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'COMPILATION_ERROR'
  | 'JUDGE_ERROR';

export interface ProblemTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  label?: string;
  points?: number;
}

export interface Problem {
  id: string;
  slug: string;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  allowedLanguages: ProblemLanguage[];
  isPublished: boolean;
  createdAt: string;
  submissionCount?: number;
  body?: string;
  timeLimitMs?: number;
  defaultSubmitCap?: number;
  sampleTests?: ProblemTestCase[];
  hiddenTests?: ProblemTestCase[];
  referenceSolution?: string;
  referenceLanguage?: ProblemLanguage;
}

export interface ProblemInput {
  slug: string;
  title: string;
  body: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  allowedLanguages: ProblemLanguage[];
  timeLimitMs: number;
  defaultSubmitCap: number;
  sampleTests: ProblemTestCase[];
  hiddenTests: ProblemTestCase[];
  referenceSolution?: string | null;
  referenceLanguage?: ProblemLanguage | null;
  isPublished: boolean;
}

export interface ProblemSubmission {
  id: string;
  userId: string;
  problemId: string;
  contextType: ProblemContextType;
  contextKey: string;
  language: ProblemLanguage;
  code: string;
  verdict: SubmissionVerdict;
  score: number;
  passedCount: number;
  totalCount: number;
  perTestVerdicts: Array<{
    testId: string;
    isHidden?: boolean;
    passed: boolean;
    runtimeMs?: number;
    actualOutput?: string;
    expectedOutput?: string;
    error?: string;
  }>;
  runtimeMs?: number | null;
  compilerOutput?: string | null;
  manualOverride?: boolean;
  overrideNotes?: string | null;
  submittedAt: string;
  updatedAt: string;
  user?: { id: string; name: string; email?: string; avatar?: string | null };
}

export interface ProblemLeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar?: string | null;
  score: number;
  verdict?: SubmissionVerdict;
  submittedAt?: string;
  runtimeMs?: number | null;
}

export interface PendingCapRequest {
  id: string;
  userId: string;
  user: { id: string; name: string; email?: string; avatar?: string | null };
  problem: { id: string; title: string; slug: string; defaultSubmitCap: number };
  contextType: ProblemContextType;
  contextKey: string;
  contextLabel: string;
  currentCap: number;
  used: number;
  note?: string | null;
  requestedAt: string | null;
}

export interface PlaygroundLimitResetRequest {
  id: string;
  userId: string;
  note: string | null;
  status: 'PENDING' | 'GRANTED' | 'DENIED';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; avatar: string | null };
}

export interface SubmissionResult {
  submissionId: string;
  verdict: SubmissionVerdict;
  score: number;
  passedCount: number;
  totalCount: number;
  perTestVerdicts: ProblemSubmission['perTestVerdicts'];
  totalRuntimeMs: number;
  compilerOutput?: string;
  remainingSubmits: number;
  remainingDailyQuota: number;
}

export interface TestRunResult {
  perTestVerdicts: Array<{
    testId: string;
    passed: boolean;
    actualOutput: string;
    expectedOutput: string;
    runtimeMs?: number;
    error?: string;
  }>;
  totalRuntimeMs: number;
  compilerOutput?: string;
  remainingDailyQuota: number;
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
  problemsEnabled?: boolean;
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
  emailInvitationEnabled?: boolean;
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
  roundType?: 'IMAGE_TARGET' | 'DSA';
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
  problems?: Array<{ id?: string; problemId?: string; displayOrder: number; points: number; problem?: Problem; title?: string; difficulty?: string; allowedLanguages?: ProblemLanguage[]; submission?: Partial<ProblemSubmission> | null }>;
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
  isRegistered?: boolean;
  registrationStatus?: {
    status: 'open' | 'not_started' | 'closed' | 'full';
    canRegister: boolean;
    message: string;
  };
  spotsRemaining?: number | null;
  guests?: EventGuestSummary[];
  userInvitation?: EventInvitation | null;
}

export type RegistrationType = 'PARTICIPANT' | 'GUEST';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';

export interface EventGuestSummary {
  name: string;
  designation: string;
  company: string;
  photo?: string | null;
  role: string;
  networkSlug?: string | null;
}

export interface EventInvitation {
  id: string;
  eventId: string;
  event?: Event;
  inviteeUserId?: string | null;
  inviteeEmail?: string | null;
  inviteeNameSnapshot?: string | null;
  inviteeDesignationSnapshot?: string | null;
  inviteeCompanySnapshot?: string | null;
  role: string;
  customMessage?: string | null;
  status: InvitationStatus;
  certificateEnabled: boolean;
  certificateType: CertType;
  invitedById: string;
  invitedBy?: {
    id: string;
    name: string;
    email: string;
  };
  inviteeUser?: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    role: string;
    networkProfile?: {
      id: string;
      fullName: string;
      designation: string;
      company: string;
      profilePhoto?: string | null;
      slug?: string | null;
      isPublic?: boolean;
      status?: NetworkStatus;
    } | null;
  } | null;
  invitedAt: string;
  respondedAt?: string | null;
  revokedAt?: string | null;
  emailSent: boolean;
  emailSentAt?: string | null;
  lastEmailResentAt?: string | null;
  registrationId?: string | null;
  registration?: {
    id: string;
    eventId: string;
    attended?: boolean;
    scannedAt?: string | null;
    manualOverride?: boolean;
    registrationType: RegistrationType;
    dayAttendances?: DayAttendance[];
  } | null;
  attendanceToken?: string | null;
  createdAt: string;
  updatedAt?: string;
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

export interface EventAdminRegistration {
  id: string;
  userId: string;
  eventId: string;
  timestamp: string;
  registrationType: RegistrationType;
  customFieldResponses?: Array<{
    fieldId: string;
    label?: string;
    value: string;
  }>;
  invitation?: {
    id: string;
    role: string;
    status: Exclude<InvitationStatus, 'EXPIRED'>;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string | null;
    phone?: string;
    course?: string;
    branch?: string;
    year?: string;
  };
}

export interface EventRegistrationExportFilters {
  year?: string;
  branch?: string;
  course?: string;
  userRole?: string;
  registrationType?: RegistrationType;
  search?: string;
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
  roundType?: 'IMAGE_TARGET' | 'DSA';
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
  problems?: Array<{ id?: string; problemId?: string; displayOrder: number; points: number; problem?: Problem; title?: string; difficulty?: string; allowedLanguages?: ProblemLanguage[]; submission?: Partial<ProblemSubmission> | null }>;
  problemSubmissions?: ProblemSubmission[];
  createdAt: string;
  updatedAt?: string;
}

export interface CompetitionSubmission {
  id: string;
  roundId: string;
  problemId?: string;
  problemTitle?: string;
  teamId?: string;
  teamName?: string | null;
  userId: string;
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
  code: string;
  language?: ProblemLanguage;
  verdict?: SubmissionVerdict;
  submittedAt: string;
  updatedAt?: string;
  isAutoSubmit: boolean;
  score?: number | null;
  rank?: number | null;
  adminNotes?: string | null;
  runtimeMs?: number | null;
  passedCount?: number;
  totalCount?: number;
  manualOverride?: boolean;
  overrideNotes?: string | null;
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
  userId?: string;
  avatar?: string | null;
  totalScore?: number;
  totalRuntimeMs?: number;
  problems?: Array<{ problemId: string; title: string; score: number; weightedScore: number; verdict: string; runtimeMs: number | null }>;
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
  registrationType?: RegistrationType;
  invitation?: {
    role?: string | null;
  } | null;
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

export interface GuestCertificateRecipient {
  invitationId: string;
  userId: string;
  name: string;
  email: string;
  designation?: string | null;
  role: string;
  attended: boolean;
  certificateEnabled: boolean;
  certificateType: CertType;
  existingCertificateId?: string | null;
  certificateId?: string | null;
  emailSent?: boolean;
  emailSentAt?: string | null;
}

export interface AttendanceCertificateRecipientsResponse {
  recipients: CertificateRecipient[];
  participants: CertificateRecipient[];
  guests: GuestCertificateRecipient[];
  stats: {
    totalRegistered: number;
    totalAttended: number;
    alreadyCertified: number;
    eligibleRecipients?: number;
    guestCount?: number;
  };
  eventDays?: number;
  dayLabels?: string[];
}

export interface AttendanceSearchResult {
  registrationId: string;
  userName: string;
  userEmail: string;
  userAvatar: string | null;
  attended: boolean;
  scannedAt: string | null;
  manualOverride: boolean;
  registrationType?: RegistrationType;
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
  // Auth — implementation in ./api/auth.ts
  ...authApi,

  // Events
  getEvents: async (status?: string) => {
    const params = status ? `?status=${status}` : '';
    const events = await request<Event[]>(`/events${params}`);
    return events.map((event) => normalizeEventPayload(event));
  },
  getEvent: async (id: string, token?: string) => normalizeEventPayload(await request<Event>(`/events/${id}`, token ? { token } : {})),
  createEvent: (data: Partial<Event>, token: string) => 
    request<Event>('/events', { method: 'POST', body: JSON.stringify(data), token }),
  updateEvent: (id: string, data: Partial<Event>, token: string) =>
    request<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
  deleteEvent: (id: string, token: string) =>
    request(`/events/${id}`, { method: 'DELETE', token }),
  getEventRegistrations: (eventId: string, token: string) =>
    request<EventAdminRegistration[]>(`/events/${eventId}/registrations`, { token }),
  deleteEventRegistration: (eventId: string, registrationId: string, token: string) =>
    request(`/events/${eventId}/registrations/${registrationId}`, { method: 'DELETE', token }),
  exportEventRegistrations: async (
    eventId: string,
    token: string,
    options?: { format?: 'xlsx' | 'csv'; filters?: EventRegistrationExportFilters },
  ) => {
    const params = new URLSearchParams();
    if (options?.format) {
      params.set('format', options.format);
    }

    const filters = options?.filters;
    if (filters?.year) params.set('year', filters.year);
    if (filters?.branch) params.set('branch', filters.branch);
    if (filters?.course) params.set('course', filters.course);
    if (filters?.userRole) params.set('userRole', filters.userRole);
    if (filters?.registrationType) params.set('registrationType', filters.registrationType);
    if (filters?.search) params.set('search', filters.search);

    const queryString = params.toString();
    return requestBlob(
      `/events/${eventId}/registrations/export${queryString ? `?${queryString}` : ''}`,
      { token },
    );
  },
  
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

  // Problems
  getProblems: (filters?: { published?: boolean; difficulty?: string; tag?: string; search?: string; limit?: number; cursor?: string }, token?: string) => {
    const params = new URLSearchParams();
    if (filters?.published !== undefined) params.set('published', String(filters.published));
    if (filters?.difficulty) params.set('difficulty', filters.difficulty);
    if (filters?.tag) params.set('tag', filters.tag);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.cursor) params.set('cursor', filters.cursor);
    const query = params.toString();
    return request<{ problems: Problem[] }>(`/problems${query ? `?${query}` : ''}`, { token });
  },
  adminGetProblems: (token: string) =>
    request<{ problems: Problem[] }>('/problems/admin/all', { token }),
  getProblem: (idOrSlug: string, options?: { contextType?: ProblemContextType; contextKey?: string; token?: string }) => {
    const params = new URLSearchParams();
    if (options?.contextType) params.set('contextType', options.contextType);
    if (options?.contextKey) params.set('contextKey', options.contextKey);
    const query = params.toString();
    return request<{ problem: Problem }>(`/problems/${idOrSlug}${query ? `?${query}` : ''}`, { token: options?.token });
  },
  createProblem: (input: ProblemInput, token: string) =>
    request<{ problem: Problem }>('/problems', { method: 'POST', body: JSON.stringify(input), token }),
  updateProblem: (id: string, input: ProblemInput, rejudge: 'auto' | 'manual' | undefined, token: string) =>
    request<{ problem: Problem }>(`/problems/${id}`, { method: 'PUT', body: JSON.stringify({ ...input, rejudge }), token }),
  deleteProblem: (id: string, token: string) =>
    request<{ success: boolean }>(`/problems/${id}`, { method: 'DELETE', token }),
  runProblem: (id: string, data: { language: ProblemLanguage; code: string; contextType?: ProblemContextType; contextKey?: string }, token: string) =>
    request<TestRunResult>(`/problems/${id}/run`, { method: 'POST', body: JSON.stringify(data), token }),
  submitProblem: (id: string, data: { language: ProblemLanguage; code: string; contextType: ProblemContextType; contextKey: string }, token: string) =>
    request<SubmissionResult>(`/problems/${id}/submit`, { method: 'POST', body: JSON.stringify(data), token }),
  getMyProblemSubmission: (id: string, contextType: ProblemContextType, contextKey: string, token: string) =>
    request<{ submission: ProblemSubmission | null }>(`/problems/${id}/my-submission?contextType=${encodeURIComponent(contextType)}&contextKey=${encodeURIComponent(contextKey)}`, { token }),
  getProblemLeaderboard: (id: string, contextType: ProblemContextType, contextKey: string, limit = 10) =>
    request<{ entries: ProblemLeaderboardEntry[] }>(`/problems/${id}/leaderboard?contextType=${encodeURIComponent(contextType)}&contextKey=${encodeURIComponent(contextKey)}&limit=${limit}`),
  adminGetProblemSubmissions: (id: string, filters: { contextType?: ProblemContextType; contextKey?: string; limit?: number; cursor?: string } | undefined, token: string) => {
    const params = new URLSearchParams();
    if (filters?.contextType) params.set('contextType', filters.contextType);
    if (filters?.contextKey) params.set('contextKey', filters.contextKey);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.cursor) params.set('cursor', filters.cursor);
    const query = params.toString();
    return request<{ submissions: ProblemSubmission[] }>(`/problems/${id}/all-submissions${query ? `?${query}` : ''}`, { token });
  },
  adminOverrideSubmission: (problemId: string, submissionId: string, override: { verdict?: SubmissionVerdict; score?: number; notes?: string }, token: string) =>
    request<{ submission: ProblemSubmission }>(`/problems/${problemId}/override/${submissionId}`, { method: 'PATCH', body: JSON.stringify(override), token }),
  adminRejudgeProblem: (id: string, filter: { contextType?: ProblemContextType; contextKey?: string } | undefined, token: string) =>
    request<{ jobId: string }>(`/problems/${id}/rejudge`, { method: 'POST', body: JSON.stringify(filter ?? {}), token }),
  adminRejudgeStatus: (id: string, jobId: string, token: string) =>
    request<{ status: string; processed: number; total: number; errors: string[] }>(`/problems/${id}/rejudge-status/${jobId}`, { token }),
  adminResetSubmitCap: (input: { userId: string; problemId: string; contextType: ProblemContextType; contextKey: string; newCap?: number; deltaSubmits?: number; clearRequest?: boolean; resetCount?: boolean }, token: string) =>
    request<{ success: boolean; capOverride: number | null }>('/problems/admin/reset-cap', { method: 'POST', body: JSON.stringify(input), token }),
  requestSubmitCap: (problemId: string, input: { contextType: ProblemContextType; contextKey: string; note?: string }, token: string) =>
    request<{ success: boolean }>(`/problems/${problemId}/request-cap`, { method: 'POST', body: JSON.stringify(input), token }),
  adminGetPendingCapRequests: (filters: { contextType?: ProblemContextType; contextKey?: string } | undefined, token: string) => {
    const params = new URLSearchParams();
    if (filters?.contextType) params.set('contextType', filters.contextType);
    if (filters?.contextKey) params.set('contextKey', filters.contextKey);
    const query = params.toString();
    return request<{ requests: PendingCapRequest[] }>(`/problems/admin/pending-cap-requests${query ? `?${query}` : ''}`, { token });
  },

  // QOTD
  getTodayQOTD: () => request<QOTDDetail | null>('/qotd/today'),
  getQOTDHistory: (limit?: number, offset?: number, options?: { includeUnpublished?: boolean; token?: string }) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    if (options?.includeUnpublished) params.append('includeUnpublished', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<QOTDHistoryEntry[]>(`/qotd/history${query}`, options?.token ? { token: options.token } : undefined);
  },
  getQOTDLeaderboard: (limit = 50) =>
    request<QOTDLeaderboardEntry[]>(`/qotd/stats/leaderboard?limit=${limit}`),
  getQOTDDailyLeaderboard: (qotdId: string) =>
    request<{ entries: ProblemLeaderboardEntry[] }>(`/qotd/${qotdId}/leaderboard`),
  getQOTDTotalLeaderboard: () =>
    request<{ entries: ProblemLeaderboardEntry[] }>('/qotd/leaderboard/total'),
  createQOTD: (data: { date: string; question?: string; problemLink?: string; difficulty?: string; problemId?: string; newProblem?: ProblemInput; publishNow?: boolean }, token: string) =>
    request('/qotd', { method: 'POST', body: JSON.stringify(data), token }),
  publishQOTD: (id: string, token: string) =>
    request(`/qotd/${id}/publish`, { method: 'POST', token }),
  holdQOTD: (id: string, reason: string | undefined, token: string) =>
    request(`/qotd/${id}/hold`, { method: 'POST', body: JSON.stringify({ reason }), token }),
  publishQOTDToPractice: (id: string, token: string) =>
    request<{ success: boolean; problemId: string }>(`/qotd/${id}/publish-practice`, { method: 'POST', token }),
  unpublishQOTDFromPractice: (id: string, token: string) =>
    request<{ success: boolean }>(`/qotd/${id}/unpublish-practice`, { method: 'POST', token }),
  submitQOTD: (id: string, token: string) =>
    request(`/qotd/${id}/submit`, { method: 'POST', token }),
  getQOTDStats: (token: string) => request<QOTDStats>('/users/me/qotd-stats', { token }),
  
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
  getAttendanceCertRecipients: (eventId: string, token: string, minDays?: number, includeGuestNonAttendees?: boolean) => {
    const params = new URLSearchParams();
    if (typeof minDays === 'number') params.set('minDays', String(minDays));
    if (includeGuestNonAttendees) params.set('includeGuestNonAttendees', 'true');
    const query = params.toString();
    return request<AttendanceCertificateRecipientsResponse>(`/attendance/event/${eventId}/certificate-recipients${query ? `?${query}` : ''}`, { token });
  },
  getMyAttendanceHistory: (token: string) =>
    request<{ events: AttendanceHistoryEvent[] }>('/attendance/my-history', { token }),
  getAttendanceSummary: (eventId: string, token: string) =>
    request<{ total: number; attended: number; eventDays?: number; dayLabels?: string[]; daySummary?: Array<{ dayNumber: number; attended: number }> }>(`/attendance/event/${eventId}/summary`, { token }),
  backfillAttendanceTokens: (token: string) =>
    request<{ backfilled: number }>('/attendance/backfill-tokens', { method: 'POST', token }),

  // Invitations
  getMyInvitations: (token: string) =>
    request<EventInvitation[]>('/invitations/my', { token }),
  acceptInvitation: (id: string, token: string) =>
    request<{ invitation: EventInvitation; registration: { id: string; attendanceToken: string; eventId: string } }>(`/invitations/${id}/accept`, { method: 'POST', token }),
  declineInvitation: (id: string, token: string) =>
    request<EventInvitation>(`/invitations/${id}/decline`, { method: 'POST', token }),
  claimInvitation: (invitationToken: string, token: string) =>
    request<EventInvitation>('/invitations/claim', { method: 'POST', body: JSON.stringify({ token: invitationToken }), token }),
  searchInvitees: (
    query: string,
    eventId: string,
    token: string,
  ) => request<Array<{ userId: string; name: string; designation: string; company: string; photo?: string | null }>>(
    `/invitations/search-invitees?q=${encodeURIComponent(query)}&eventId=${encodeURIComponent(eventId)}`,
    { token },
  ),
  createInvitations: (
    data: {
      eventId: string;
      invitees: Array<{
        userId?: string;
        email?: string;
        role?: string;
        certificateEnabled?: boolean;
        certificateType?: CertType;
      }>;
      customMessage?: string;
    },
    token: string,
  ) => request<{ created: EventInvitation[]; skipped: Array<{ identifier: string; reason: string }> }>(
    '/invitations',
    { method: 'POST', body: JSON.stringify(data), token },
  ),
  getEventInvitations: (eventId: string, token: string) =>
    request<EventInvitation[]>(`/invitations/event/${eventId}`, { token }),
  updateInvitation: (
    id: string,
    data: Partial<Pick<EventInvitation, 'role' | 'customMessage' | 'certificateEnabled' | 'certificateType'>>,
    token: string,
  ) => request<EventInvitation>(`/invitations/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  revokeInvitation: (id: string, token: string) =>
    request(`/invitations/${id}`, { method: 'DELETE', token }),
  resendInvitationEmail: (id: string, token: string) =>
    request<EventInvitation>(`/invitations/${id}/resend`, { method: 'POST', token }),

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
    roundType?: 'IMAGE_TARGET' | 'DSA';
    participantScope?: 'ALL' | 'SELECTED_TEAMS';
    leadersOnly?: boolean;
    allowedTeamIds?: string[];
    targetImageUrl?: string;
    problemIds?: string[];
    problems?: Array<{ problemId: string; displayOrder?: number; points?: number }>;
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
  submitCompetitionCode: (roundId: string, data: { code: string; problemId?: string; language?: ProblemLanguage }, token: string) =>
    request<{ submission?: { id: string; submittedAt: string }; result?: SubmissionResult; message: string }>(`/competition/${roundId}/submit`, { method: 'POST', body: JSON.stringify(data), token }),
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
    roundType?: 'IMAGE_TARGET' | 'DSA';
    participantScope?: 'ALL' | 'SELECTED_TEAMS';
    leadersOnly?: boolean;
    allowedTeamIds?: string[];
    targetImageUrl?: string | null;
    problemIds?: string[];
    problems?: Array<{ problemId: string; displayOrder?: number; points?: number }>;
  }, token: string) =>
    request<{ round: CompetitionRound }>(`/competition/${roundId}`, { method: 'PUT', body: JSON.stringify(data), token }),
  publishContestAsPractice: (roundId: string, token: string) =>
    request<{ success: boolean }>(`/competition/${roundId}/publish-as-practice`, { method: 'POST', token }),
  raiseContestCap: (roundId: string, input: { userId?: string; problemId?: string; newCap: number }, token: string) =>
    request<{ success: boolean; affected: number }>(`/competition/${roundId}/raise-cap`, { method: 'POST', body: JSON.stringify(input), token }),
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
