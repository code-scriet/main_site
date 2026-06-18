// Helpers (request, requestEnvelope, requestForm, requestBlob, UnauthorizedError,
// ApiError) live in ./api/_internal.ts. The classes are re-exported here so
// existing `import { UnauthorizedError } from '@/lib/api'` call sites keep
// working and forms can `import { ApiError } from '@/lib/api'` for field errors.
import { UnauthorizedError, ApiError } from './api/_internal';
import { authApi } from './api/auth';
import { eventsApi } from './api/events';
import { contentApi } from './api/content';
import { codingApi } from './api/coding';
import { usersApi } from './api/users';
import { adminOpsApi } from './api/admin-ops';
import { eventOpsApi } from './api/event-ops';

export { UnauthorizedError, ApiError };




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
  reopenedAt?: string | null;
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

// S-09 — curated problem sheets ("topic ladders").
export interface ProblemSheetSummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  isPublished: boolean;
  createdAt: string;
  total: number;
  solved: number;
}

export interface ProblemSheetItem {
  order: number;
  id: string;
  slug: string;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  solved: boolean;
}

export interface ProblemSheetDetail extends ProblemSheetSummary {
  items: ProblemSheetItem[];
}

export interface ProblemSheetInput {
  title: string;
  description?: string | null;
  isPublished?: boolean;
  problemIds: string[];
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
  needsReview?: boolean;
  // A reopened-past-QOTD solve judged ACCEPTED but held for admin acceptance
  // (verdict stays PENDING and nothing counts until an admin approves it).
  reopenPending?: boolean;
  appealedAt?: string | null;
  appealNote?: string | null;
  submittedAt: string;
  updatedAt: string;
  user?: { id: string; name: string; email?: string; avatar?: string | null };
  problem?: { id: string; slug: string; title: string; difficulty: string };
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
  /** Daily QOTD leaderboard only — ms between QOTD publish and the user's submission. */
  timeTakenMs?: number;
  /** Daily QOTD leaderboard only — active-tab solve time the client reported on submit. */
  activeMs?: number | null;
  /** All-time QOTD leaderboard only — earliest QOTD AC across all days. */
  firstSolveAt?: string;
  /** All-time QOTD leaderboard only — unique IST days the user has solved. */
  solveDays?: number;
}

export interface QOTDDailyLeaderboard {
  entries: ProblemLeaderboardEntry[];
  publishedAt: string | null;
  date: string | null;
}

export interface QOTDTotalLeaderboard {
  entries: ProblemLeaderboardEntry[];
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
  /** Judging failed (upstream outage) — submission captured for manual review, attempt refunded. */
  needsReview?: boolean;
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
  isSuperAdmin?: boolean;
  isPresident?: boolean;
  oauthProvider?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  // admin-deep-control
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  isDeleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  currentStreak?: number;
  longestStreak?: number;
  longestStreakAt?: string | null;
  blocks?: Array<{ feature: UserBlockFeature; expiresAt?: string | null }>;
}

export type UserBlockFeature = 'EVENT' | 'PLAYGROUND' | 'QOTD' | 'QUIZ' | 'NETWORK';

export interface UserBlock {
  id: string;
  feature: UserBlockFeature;
  blockedAt: string;
  blockedBy: string;
  reason: string | null;
  expiresAt: string | null;
}

export interface UserListMeta {
  totalUsers: number;
  privilegedUsers?: number;
  regularUsersTotal?: number;
  regularUsersReturned?: number;
  regularLimit?: number | null;
  includeAll?: boolean;
  hasMoreRegular?: boolean;
  // advanced mode (admin-deep-control)
  returned?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  mode?: 'legacy' | 'advanced';
  appliedFilters?: {
    q: string | null;
    role: string[];
    branch: string[];
    year: string[];
    blockedFrom: string[];
    hasNetwork: boolean;
    includeDeleted: boolean;
    sort: string;
  };
}

export interface UserListResponse {
  users: User[];
  meta: UserListMeta;
}

export interface UserListAdvancedQuery {
  q?: string;
  role?: string[];
  branch?: string[];
  year?: string[];
  blockedFrom?: UserBlockFeature[];
  hasNetwork?: boolean;
  includeDeleted?: boolean;
  sort?: 'created' | 'last_seen' | 'name';
  cursor?: string | null;
  take?: number;
  searchAll?: boolean;
}

export interface UserFullDetail {
  user: User & {
    bio?: string;
    networkProfile?: Record<string, unknown> | null;
    hiringApplications?: Array<{ id: string; applyingRole: string; status: string; department: string; year: string; createdAt: string }>;
    blocks?: UserBlock[];
    tokenVersion?: number;
    oauthProvider?: string | null;
    createdAt?: string;
    updatedAt?: string;
    longestStreakAt?: string | null;
    deletedAt?: string | null;
    deletedBy?: string | null;
    profileCompleted?: boolean;
    lastLoginAt?: string | null;
    lastLoginIp?: string | null;
  };
  counts: {
    eventRegistrations: number;
    certificates: number;
    qotdSubmissions: number;
    executions: number;
    snippets: number;
    quizParticipants: number;
    competitionSubmissions: number;
    pollVotes: number;
    pollFeedback: number;
    createdPolls: number;
    ledTeams: number;
    teamMemberships: number;
    auditEntries: number;
    invitationsReceived?: number;
    invitationsSent?: number;
    uploadedImages?: number;
  };
  coding?: { totalSubmissions: number; accepted: number; acRate: number; qotdSolved: number };
  contentCreated?: { events: number; announcements: number; quizzes: number; qotds: number; problems: number; problemSheets: number; polls: number };
  eventRegistrations: Array<{
    id: string;
    eventId: string;
    timestamp: string;
    attended: boolean;
    scannedAt: string | null;
    registrationType: 'PARTICIPANT' | 'GUEST';
    event: { id: string; title: string; slug: string; startDate: string; status: string };
  }>;
  certificates: Array<{ id: string; certId: string; type: string; eventName: string; issuedAt: string; isRevoked: boolean; viewCount: number }>;
  qotdSubmissions: Array<{ id: string; timestamp: string; qotd: { id: string; date: string; difficulty: string; question: string } }>;
  playgroundUsage: Array<{ usageDate: string; count: number }>;
  quizParticipants: Array<{ id: string; finalScore: number; finalRank: number | null; joinedAt: string; quiz: { id: string; title: string; status: string } }>;
}

export interface UserActivityItem {
  kind: 'event_registered' | 'invitation_accepted' | 'qotd_submitted' | 'certificate_issued' | 'quiz_joined' | 'playground_run';
  ts: string;
  data: unknown;
}

export interface UserAuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  timestamp: string;
}

export interface ContactEmail {
  label: string;
  email: string;
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
  hiringCycle?: string;
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
  whatsappUrl?: string;
  // Public contact-page channels
  contactPhone?: string | null;
  contactEmails?: ContactEmail[];
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
  // Dashboard v2 — admin-controlled accent token. rust | teal | indigo | violet | mint | mono.
  accentColor?: string;
  // Admin-selected primary code-execution provider for the judge + playground. wandbox | godbolt.
  codeExecutionProvider?: string;
  // ISO date of the club's founding — drives the "months since inception" stat on /about.
  siteLaunchDate?: string | null;
  updatedAt: string;
}

export type DashAccent = 'rust' | 'teal' | 'indigo' | 'violet' | 'mint' | 'mono';

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

// Event normalization helpers moved to ./api/events.ts.

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
  remindersEnabled?: boolean;
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
  eventId?: string | null;
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
  eventId?: string | null;
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
  eventId?: string | null;
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
  emailTemplate?: CertificateEmailTemplate;
  emailSignerName?: string | null;
}

export type CertificateEmailTemplate = 'default' | 'faculty_distribution';

export interface CertificateUpdateInput {
  recipientName?: string;
  recipientEmail?: string;
  eventName?: string | null;
  position?: string | null;
  domain?: string | null;
  description?: string | null;
  type?: CertType;
  emailTemplate?: CertificateEmailTemplate;
  emailSignerName?: string | null;
}

export interface CertificateDetail {
  id: string;
  certId: string;
  recipientId: string | null;
  recipientName: string;
  recipientEmail: string;
  eventId: string | null;
  eventName: string;
  type: CertType;
  position: string | null;
  domain: string | null;
  description: string | null;
  template: string;
  pdfUrl: string | null;
  isRevoked: boolean;
  emailTemplate?: CertificateEmailTemplate;
  emailSignerName?: string | null;
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
  user: { id: string; name: string; email: string; avatar?: string | null; role?: string | null; isDeleted?: boolean };
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

import { dashboardApi } from './api/dashboard';
export type {
  NotifItem,
  NotificationsPayload,
  GlobalSearchPayload,
  RecentSubmission,
  AroundMeLeaderboard,
  MyTeamCard,
  UploadHistoryItem,
  AdminInsights,
  AdminDashboardStats,
  NotifAudience,
  ComposeNotificationInput,
  BroadcastRow,
  OnboardingStatus,
  MonthlyDigest,
} from './api/dashboard';

export const api = {
  // Auth — implementation in ./api/auth.ts
  ...authApi,

  // Events + Registrations — implementation in ./api/events.ts
  ...eventsApi,

  // Announcements + Polls + Team + Achievements + Credits — implementation in ./api/content.ts
  ...contentApi,

  // Problems + QOTD — implementation in ./api/coding.ts
  ...codingApi,

  // Stats + Users + Settings + Profile + Hiring + Network + Upload — implementation in ./api/users.ts
  ...usersApi,

  // Audit + Quiz + Playground + Signatories — implementation in ./api/admin-ops.ts
  ...adminOpsApi,

  // Certificates + Attendance + Invitations + Teams + Competition — implementation in ./api/event-ops.ts
  ...eventOpsApi,

  // Dashboard v2 — notifications, global search, admin insights, recent subs, leaderboard slice, teams, upload history.
  ...dashboardApi,
};
