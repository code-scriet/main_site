// EventDetailPage — public + signed-in event detail surface, redesigned to the
// dashboard v2 system. Hero + sticky sub-nav + 12-col grid (8 main / 4 right rail)
// with countdown / capacity / registration / quick-facts cards.
// Design source: code-scriet-innerdashboard/project/js/screen-events.jsx
//   - EventDetailScreen (lines 132-331) — hero, sub-nav, right-rail composition
//   - TicketSheet (lines 333-420) — QR sheet (re-used via QRTicketSheet)
//
// Hard rule: never expose participant registration count to the public. Capacity
// progress is shown as a capped count only to CORE_MEMBER+ viewers; the public
// sees the cap and (if available) "Open" / "Closing soon" cues instead.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Copy as CopyIcon,
  ExternalLink,
  FileText,
  Github,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Link as LinkIcon,
  Loader2,
  LogIn,
  MapPin,
  Mic,
  Play,
  Presentation,
  QrCode,
  Share2,
  Star,
  Tag,
  Target,
  Trophy,
  Users,
  Video,
  X,
} from 'lucide-react';

import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema, EventSchema, FAQPageSchema } from '@/components/ui/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import { LightboxGallery } from '@/components/media/LightboxGallery';
import ChiefGuestsStrip from '@/components/events/ChiefGuestsStrip';
import { TeamCreateModal, TeamDashboard, TeamJoinModal } from '@/components/teams';
import { QRTicketSheet } from '@/components/attendance/QRTicket';
import {
  Avatar,
  Banner,
  DSCard,
  Divider,
  EmptyState,
  Pill,
  type PillTone,
} from '@/components/dash';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import {
  api,
  type AttendanceQR,
  type Event,
  type EventRegistrationField,
  type EventTeam,
  type FAQ,
  type RegistrationAdditionalFieldInput,
  type Speaker,
} from '@/lib/api';
import { formatDateTime, formatTime, getDayOfMonth, getMonthShort } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { getRegistrationStatus } from '@/lib/registrationStatus';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { normalizeTrustedVideoEmbedUrl } from '@/lib/videoEmbed';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Constants / helpers

type EventStatus = 'UPCOMING' | 'ONGOING' | 'PAST';

const statusPillFor = (status: EventStatus): { tone: PillTone; label: string; dot: boolean } => {
  if (status === 'ONGOING') return { tone: 'success', label: 'Live now', dot: true };
  if (status === 'UPCOMING') return { tone: 'info', label: 'Upcoming', dot: false };
  return { tone: 'neutral', label: 'Past', dot: false };
};

// Deterministic gradient fallback when no cover image is supplied. Matches the
// QRTicket fallback palette so the ticket strip and the hero feel related.
const FALLBACK_GRADIENTS = [
  'from-orange-500 to-red-600',
  'from-violet-500 to-fuchsia-600',
  'from-teal-500 to-cyan-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
];
function fallbackGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 7) % FALLBACK_GRADIENTS.length;
  return FALLBACK_GRADIENTS[h];
}

const resourceIconFor = (type?: string) => {
  switch (type) {
    case 'pdf':
      return <FileText className="h-4 w-4" />;
    case 'video':
      return <Video className="h-4 w-4" />;
    case 'github':
      return <Github className="h-4 w-4" />;
    case 'slides':
      return <Presentation className="h-4 w-4" />;
    case 'link':
      return <LinkIcon className="h-4 w-4" />;
    default:
      return <ExternalLink className="h-4 w-4" />;
  }
};

function validateCustomFieldValue(field: EventRegistrationField, value: string): string | null {
  const trimmed = value.trim();
  if (field.required && !trimmed) return `${field.label} is required`;
  if (!trimmed) return null;
  if (field.minLength !== undefined && trimmed.length < field.minLength) {
    return `${field.label} must be at least ${field.minLength} characters`;
  }
  if (field.maxLength !== undefined && trimmed.length > field.maxLength) {
    return `${field.label} must be at most ${field.maxLength} characters`;
  }
  if (field.type === 'NUMBER') {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return `${field.label} must be a valid number`;
    if (field.min !== undefined && numeric < field.min) return `${field.label} must be >= ${field.min}`;
    if (field.max !== undefined && numeric > field.max) return `${field.label} must be <= ${field.max}`;
  }
  if (field.type === 'EMAIL') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return `${field.label} must be a valid email address`;
  }
  if (field.type === 'PHONE') {
    const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
    if (!phoneRegex.test(trimmed)) return `${field.label} must be a valid phone number`;
  }
  if (field.type === 'URL') {
    try {
      const url = new URL(trimmed);
      if (!['http:', 'https:'].includes(url.protocol)) return `${field.label} must be a valid URL`;
    } catch {
      return `${field.label} must be a valid URL`;
    }
  }
  if (field.pattern) {
    try {
      const regex = new RegExp(field.pattern);
      if (!regex.test(trimmed)) return `${field.label} does not match required format`;
    } catch {
      return `${field.label} has an invalid validation pattern`;
    }
  }
  return null;
}

// Eyebrow chip used inside right-rail cards (matches design line 265, 273, 308).
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-2">
      {children}
    </div>
  );
}

// Sub-nav button — animated underline for active state.
function SubNavButton({ value, active, onClick, children }: {
  value: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      data-section={value}
      className={cn(
        'relative px-3 h-10 text-[13px] font-medium capitalize transition-colors whitespace-nowrap',
        active
          ? 'text-[var(--ds-text-1)]'
          : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-2)]',
      )}
    >
      <span>{children}</span>
      {active && (
        <motion.span
          layoutId="event-subnav-underline"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[var(--accent)]"
        />
      )}
    </button>
  );
}

// FAQ accordion, restyled in dashboard v2 tokens.
function FAQSection({ faqs }: { faqs: FAQ[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!faqs.length) return null;
  return (
    <div className="space-y-2.5">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={index}
            className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden"
          >
            <button
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[var(--surface-soft)] transition-colors"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <span className="text-[13.5px] font-medium text-[var(--ds-text-1)]">{faq.question}</span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-[var(--ds-text-3)] shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[var(--ds-text-3)] shrink-0" />
              )}
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <div className="px-4 py-3 text-[13px] text-[var(--ds-text-2)] leading-[1.6] border-t border-[var(--border-subtle)]">
                    {faq.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// Speaker card — restyled with dashboard tokens + role pill.
function SpeakerCard({ speaker }: { speaker: Speaker }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-soft)]/40">
      {speaker.image ? (
        <img
          src={processImageUrl(speaker.image, 'square')}
          alt={speaker.name}
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <Avatar name={speaker.name} size={48} />
      )}
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-[var(--ds-text-1)] truncate">{speaker.name}</div>
        <div className="text-[11.5px] text-[var(--accent)] font-medium mt-0.5">{speaker.role}</div>
        {speaker.bio && (
          <p className="text-[12px] text-[var(--ds-text-3)] mt-1 leading-snug line-clamp-3">{speaker.bio}</p>
        )}
      </div>
    </div>
  );
}

// Countdown computation — days + hours + minutes (minutes is shown only when < 1 day remains).
function formatCountdown(startDate: string): { days: number; hours: number; minutes: number; isLive: boolean; isPast: boolean } {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const diff = start - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, isLive: diff > -4 * 60 * 60 * 1000, isPast: diff <= -4 * 60 * 60 * 1000 };
  const totalMinutes = Math.floor(diff / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24, minutes: totalMinutes % 60, isLive: false, isPast: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token, isLoading: authLoading } = useAuth();
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showRegistrationFormPopup, setShowRegistrationFormPopup] = useState(false);
  const [registrationFieldValues, setRegistrationFieldValues] = useState<Record<string, string>>({});
  const [registrationFieldErrors, setRegistrationFieldErrors] = useState<Record<string, string>>({});
  const [registrationFormError, setRegistrationFormError] = useState<string | null>(null);
  const [invitationResponding, setInvitationResponding] = useState(false);
  const [autoRegisterTriggered, setAutoRegisterTriggered] = useState(false);
  const [attendanceSummary, setAttendanceSummary] = useState<{
    total: number;
    attended: number;
    eventDays?: number;
    dayLabels?: string[];
    daySummary?: Array<{ dayNumber: number; attended: number }>;
  } | null>(null);

  const [myTeam, setMyTeam] = useState<EventTeam | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showJoinTeamModal, setShowJoinTeamModal] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [attendanceQR, setAttendanceQR] = useState<AttendanceQR | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [competitionRounds, setCompetitionRounds] = useState<
    Array<{
      id: string;
      title: string;
      status: 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'JUDGING' | 'FINISHED';
      roundType?: 'IMAGE_TARGET' | 'DSA';
      remainingSeconds?: number | null;
      problems?: Array<{ id?: string; problemId?: string; title?: string }>;
      hasSubmitted?: boolean;
      isEligible?: boolean;
      eligibilityReason?: string;
    }>
  >([]);

  // Sub-nav state — design intent is tab rendering: clicking a tab swaps the
  // main column to that section only (screen-events.jsx:186-258). The sticky
  // sub-nav scrolls the section into view on small viewports.
  const [activeSection, setActiveSection] = useState('overview');
  const mainColumnRef = useRef<HTMLDivElement | null>(null);

  const trustedVideoUrl = event?.videoUrl ? normalizeTrustedVideoEmbedUrl(event.videoUrl) : null;

  const sortedCompetitionRounds = useMemo(() => {
    const priority = { ACTIVE: 0, DRAFT: 1, LOCKED: 2, JUDGING: 3, FINISHED: 4 } as const;
    return [...competitionRounds].sort((a, b) => priority[a.status] - priority[b.status]);
  }, [competitionRounds]);

  // Sub-nav sections — computed early (before any conditional return) to satisfy
  // the Rules of Hooks. When `event` is null we just return an empty list.
  const acceptedInvitationForNav = event?.userInvitation?.status === 'ACCEPTED' ? event.userInvitation : null;
  const sections = useMemo(() => {
    if (!event) return [] as Array<{ value: string; label: string }>;
    const list: Array<{ value: string; label: string }> = [{ value: 'overview', label: 'overview' }];
    if (event.agenda || event.learningOutcomes) list.push({ value: 'schedule', label: 'schedule' });
    if (event.speakers && event.speakers.length > 0) list.push({ value: 'speakers', label: 'speakers' });
    if (event.guests && event.guests.length > 0) list.push({ value: 'guests', label: 'guests' });
    if (event.resources && event.resources.length > 0) list.push({ value: 'resources', label: 'resources' });
    if (event.faqs && event.faqs.length > 0) list.push({ value: 'faq', label: 'faq' });
    if (isRegistered || acceptedInvitationForNav) list.push({ value: 'my-registration', label: 'my registration' });
    return list;
  }, [event, isRegistered, acceptedInvitationForNav]);

  const getCompetitionRoundUrl = (round: {
    id: string;
    roundType?: 'IMAGE_TARGET' | 'DSA';
    problems?: Array<{ id?: string; problemId?: string }>;
  }) => {
    if (round.roundType === 'DSA') {
      const firstProblem = round.problems?.[0];
      const problemId = firstProblem?.problemId ?? firstProblem?.id;
      return problemId ? `/competition/${round.id}/solve/${problemId}` : `/competition/${round.id}/results`;
    }
    return getPlaygroundLaunchUrl(`/competition/${round.id}`);
  };

  const loadEvent = useCallback(async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
    if (!id) {
      setError('Event not found');
      setLoading(false);
      return;
    }
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const eventData = await api.getEvent(id, token || undefined);
      if (eventData.slug && id !== eventData.slug) {
        navigate(`/events/${eventData.slug}`, { replace: true });
        return;
      }
      setEvent(eventData);
      setIsRegistered(Boolean(eventData.isRegistered || eventData.userInvitation?.status === 'ACCEPTED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, navigate, token]);

  useEffect(() => {
    setAutoRegisterTriggered(false);
    void loadEvent({ showLoading: true });
  }, [loadEvent]);

  useEffect(() => {
    const fetchTeam = async () => {
      if (!event?.teamRegistration || !token || !event.id) {
        setMyTeam(null);
        return;
      }
      try {
        setTeamLoading(true);
        const team = await api.getMyTeam(event.id, token);
        setMyTeam(team);
        if (team) setIsRegistered(true);
      } catch {
        setMyTeam(null);
      } finally {
        setTeamLoading(false);
      }
    };
    fetchTeam();
  }, [event?.id, event?.teamRegistration, token]);

  const loadCompetitionRounds = useCallback(async () => {
    if (!event?.id) {
      setCompetitionRounds([]);
      return;
    }
    try {
      const data = await api.getCompetitionRounds(event.id, token || undefined);
      setCompetitionRounds(
        (data.rounds || []).filter((round) =>
          round.status === 'ACTIVE' ||
          round.status === 'LOCKED' ||
          round.status === 'JUDGING' ||
          round.status === 'FINISHED',
        ),
      );
    } catch {
      setCompetitionRounds([]);
    }
  }, [event?.id, token]);

  // Poll only while a non-FINISHED round exists (status transitions matter
  // live: ACTIVE→LOCKED→JUDGING→FINISHED). Most events have no competition
  // rounds at all — for those visitors this fetches once and never polls,
  // instead of hitting /api/competition/event/:id every 30s for everyone.
  const hasUnfinishedRound = competitionRounds.some((round) => round.status !== 'FINISHED');
  useEffect(() => {
    void loadCompetitionRounds();
    if (!event?.id) return;
    if (!hasUnfinishedRound) return;
    const interval = window.setInterval(() => void loadCompetitionRounds(), 30_000);
    return () => window.clearInterval(interval);
  }, [event?.id, loadCompetitionRounds, hasUnfinishedRound]);

  useEffect(() => {
    const hasActiveCountdown = competitionRounds.some(
      (round) => round.status === 'ACTIVE' && round.remainingSeconds !== undefined && round.remainingSeconds !== null,
    );
    if (!hasActiveCountdown) return;
    const interval = window.setInterval(() => {
      setCompetitionRounds((prev) =>
        prev.map((round) => {
          if (round.status !== 'ACTIVE' || round.remainingSeconds === undefined || round.remainingSeconds === null) {
            return round;
          }
          return { ...round, remainingSeconds: Math.max(0, round.remainingSeconds - 1) };
        }),
      );
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [competitionRounds]);

  // Attendance summary — gated to CORE_MEMBER+ to avoid leaking attendee counts.
  // (Registered counts are never rendered on this page for any viewer — admins
  // see them on /admin/event-registrations. This page is public-only.)
  const canViewAttendanceSummary =
    user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';

  useEffect(() => {
    if (event?.status === 'PAST' && event.id && canViewAttendanceSummary && token) {
      api.getAttendanceSummary(event.id, token)
        .then(setAttendanceSummary)
        .catch(() => setAttendanceSummary(null));
    } else {
      setAttendanceSummary(null);
    }
  }, [event?.id, event?.status, canViewAttendanceSummary, token]);

  const openQrTicket = useCallback(async () => {
    if (!event) return;
    setShowTicket(true);
    if (!attendanceQR && token && isRegistered) {
      try {
        setTicketLoading(true);
        const data = await api.getMyQR(event.id, token);
        setAttendanceQR(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load your QR ticket');
      } finally {
        setTicketLoading(false);
      }
    }
  }, [event, token, isRegistered, attendanceQR]);

  const handleAcceptInvitation = useCallback(async () => {
    if (!event?.userInvitation || event.userInvitation.status !== 'PENDING') return;
    if (!token) {
      // UX#2: carry the return path so sign-in (email or OAuth) lands back here.
      const next = encodeURIComponent(`/events/${event.slug || event.id}`);
      navigate(`/signin?next=${next}`, {
        state: { message: 'Please sign in to accept this invitation.' },
      });
      return;
    }
    try {
      setInvitationResponding(true);
      await api.acceptInvitation(event.userInvitation.id, token);
      const updatedEvent = await api.getEvent(event.id, token);
      setEvent(updatedEvent);
      setIsRegistered(true);
      toast.success('Invitation accepted. Your QR ticket is now available.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setInvitationResponding(false);
    }
  }, [event, navigate, token]);

  const handleTeamChange = async () => {
    if (!event?.id || !token) return;
    try {
      const team = await api.getMyTeam(event.id, token);
      setMyTeam(team);
      setIsRegistered(!!team);
      const updatedEvent = await api.getEvent(event.id, token);
      setEvent(updatedEvent);
    } catch {
      setMyTeam(null);
      setIsRegistered(false);
    }
  };

  const performRegistration = useCallback(async (additionalFields?: RegistrationAdditionalFieldInput[]) => {
    if (!event || !token) return;
    try {
      setRegistering(true);
      setRegistrationFormError(null);
      await api.registerForEvent(event.id, token, additionalFields);
      setIsRegistered(true);
      setShowRegistrationFormPopup(false);
      const updatedEvent = await api.getEvent(event.id, token);
      setEvent(updatedEvent);
      toast.success(`Registered for ${event.title}`, {
        action: { label: 'View ticket', onClick: () => { void openQrTicket(); } },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to register';
      setRegistrationFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setRegistering(false);
    }
  }, [event, openQrTicket, token]);

  const openRegistrationFormPopup = useCallback(() => {
    if (!event?.registrationFields || event.registrationFields.length === 0) return;
    const initialValues: Record<string, string> = {};
    event.registrationFields.forEach((field) => { initialValues[field.id] = ''; });
    setRegistrationFieldValues(initialValues);
    setRegistrationFieldErrors({});
    setRegistrationFormError(null);
    setShowRegistrationFormPopup(true);
  }, [event?.registrationFields]);

  const handleRegister = useCallback(async () => {
    if (!event) return;
    if (authLoading) return;
    const regStatus = getRegistrationStatus(event);
    if (!regStatus.canRegister) { toast.error(regStatus.message); return; }
    if (!user || !token) {
      // pendingEventRegistration drives the profile-completion path; ?next=
      // (UX#2) is the explicit return that lands back on the event with the
      // register sheet open. AuthCallback consumes one and clears the other.
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      const next = encodeURIComponent(`/events/${event.slug}?register=1`);
      navigate(`/signin?next=${next}`, { state: { message: 'Please sign in to register for events' } });
      return;
    }
    if (!user.phone || !user.course || !user.branch || !user.year) {
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      navigate('/dashboard/profile', { state: { message: 'Please complete your profile to register for events', pendingEventId: event.id } });
      return;
    }
    if (event.teamRegistration) {
      toast.error('This is a team event. Please create a team or join a team to continue.');
      return;
    }
    if (event.registrationFields && event.registrationFields.length > 0) {
      localStorage.setItem('pendingEventRegistrationType', 'solo');
      openRegistrationFormPopup();
      return;
    }
    localStorage.setItem('pendingEventRegistrationType', 'solo');
    await performRegistration();
  }, [authLoading, event, navigate, openRegistrationFormPopup, performRegistration, token, user]);

  useEffect(() => {
    if (!event || isRegistered || autoRegisterTriggered || authLoading) return;
    if (searchParams.get('register') !== '1') return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('register');
    setSearchParams(nextParams, { replace: true });
    if (event.teamRegistration) { setAutoRegisterTriggered(true); return; }
    setAutoRegisterTriggered(true);
    handleRegister();
  }, [event, isRegistered, autoRegisterTriggered, searchParams, setSearchParams, authLoading, handleRegister]);

  const handleRegistrationFieldChange = (fieldId: string, value: string) => {
    setRegistrationFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    setRegistrationFieldErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const updated = { ...prev };
      delete updated[fieldId];
      return updated;
    });
  };

  const handleRegistrationFormSubmit = async () => {
    if (!event?.registrationFields || event.registrationFields.length === 0) {
      await performRegistration();
      return;
    }
    const fieldErrors: Record<string, string> = {};
    for (const field of event.registrationFields) {
      const value = registrationFieldValues[field.id] || '';
      const errorMessage = validateCustomFieldValue(field, value);
      if (errorMessage) fieldErrors[field.id] = errorMessage;
    }
    if (Object.keys(fieldErrors).length > 0) {
      setRegistrationFieldErrors(fieldErrors);
      return;
    }
    const additionalFields: RegistrationAdditionalFieldInput[] = event.registrationFields
      .map((field) => ({ fieldId: field.id, value: (registrationFieldValues[field.id] || '').trim() }))
      .filter((entry) => entry.value.length > 0);
    await performRegistration(additionalFields);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: event?.title,
          text: event?.shortDescription || event?.description.slice(0, 100),
          url,
        });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    const ok = await copyTextToClipboard(url);
    toast[ok ? 'success' : 'error'](ok ? 'Event link copied' : 'Could not copy link');
  };

  // Loading + error states wrapped in Layout (no dashboard scope needed for these).
  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  if (error || !event) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-900">{error || 'Event not found'}</h2>
          <Button onClick={() => navigate('/events')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Events
          </Button>
        </div>
      </Layout>
    );
  }

  const regStatus = getRegistrationStatus(event);
  const statusInfo = statusPillFor(event.status as EventStatus);
  const coverImage = event.imageUrl ? processImageUrl(event.imageUrl, 'event-cover') : null;
  const heroGradient = fallbackGradient(event.title || 'event');
  const showAttendanceSummary = canViewAttendanceSummary && event.status === 'PAST' && !!attendanceSummary && attendanceSummary.attended > 0;
  const attendanceDayBreakdown = showAttendanceSummary
    && (attendanceSummary.eventDays ?? 1) > 1
    && (attendanceSummary.daySummary?.length ?? 0) > 0
    ? attendanceSummary.daySummary
      ?.filter((summary) => summary.attended > 0)
      .map((summary) => `${attendanceSummary.dayLabels?.[summary.dayNumber - 1] || `Day ${summary.dayNumber}`}: ${summary.attended}`)
      .join(' • ')
    : null;

  const acceptedInvitation = event.userInvitation?.status === 'ACCEPTED' ? event.userInvitation : null;
  const pendingInvitation = event.userInvitation?.status === 'PENDING' ? event.userInvitation : null;

  const countdown = formatCountdown(event.startDate);
  const showCountdown = event.status === 'UPCOMING' && (countdown.days > 0 || countdown.hours > 0);

  // Tab switch — swaps which section renders. On small screens we also scroll
  // the main column into view so the user lands on the new content.
  const handleSubNavClick = (value: string) => {
    setActiveSection(value);
    if (typeof window !== 'undefined' && mainColumnRef.current && window.innerWidth < 1024) {
      const top = mainColumnRef.current.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  // Guard: if the user is on a section that no longer exists (e.g., switched
  // events, lost team registration), fall back to overview.
  const isValidActiveSection = sections.some((s) => s.value === activeSection);
  const currentSection = isValidActiveSection ? activeSection : 'overview';

  // ── Registration / Team / QR action surface (used inside right rail + inline on mobile)
  const registrationActions = (() => {
    if (acceptedInvitation) {
      return (
        <Button
          onClick={() => { void openQrTicket(); }}
          className="w-full"
        >
          <QrCode className="h-4 w-4 mr-2" />
          View your QR ticket
        </Button>
      );
    }
    if (pendingInvitation) {
      return (
        <Banner
          tone="warning"
          icon={<Info size={14} />}
          title={`You're invited as ${pendingInvitation.role}`}
          action={
            <div className="flex items-center gap-2">
              <Link to={`/dashboard/invitations/${pendingInvitation.id}`}>
                <Button size="sm" variant="outline">Manage</Button>
              </Link>
              <Button
                size="sm"
                onClick={() => { void handleAcceptInvitation(); }}
                disabled={invitationResponding}
              >
                {invitationResponding ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Accept
              </Button>
            </div>
          }
        >
          Accept this invitation to confirm attendance and unlock your QR ticket.
        </Banner>
      );
    }
    if (event.teamRegistration) {
      if (teamLoading) {
        return (
          <div className="flex items-center justify-center py-3 text-[12.5px] text-[var(--ds-text-3)]">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading team…
          </div>
        );
      }
      if (myTeam) {
        return (
          <div className="flex flex-col gap-3">
            <TeamDashboard team={myTeam} event={event} onTeamChange={handleTeamChange} />
            <Button onClick={() => { void openQrTicket(); }} className="w-full">
              <QrCode className="h-4 w-4 mr-2" /> View ticket
            </Button>
          </div>
        );
      }
      if (isRegistered) {
        return (
          <Button onClick={() => { void openQrTicket(); }} className="w-full">
            <QrCode className="h-4 w-4 mr-2" /> View ticket
          </Button>
        );
      }
      if (event.status !== 'PAST' && regStatus.canRegister) {
        if (!user) {
          return (
            <Button variant="outline" onClick={handleRegister} className="w-full">
              <LogIn className="h-4 w-4 mr-2" /> Sign in to register
            </Button>
          );
        }
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center mb-1">
              <Pill tone="accent" size="sm" icon={<Users size={11} />}>
                Team event · {event.teamMinSize}–{event.teamMaxSize}
              </Pill>
            </div>
            <Button onClick={() => setShowCreateTeamModal(true)} className="w-full">
              <Users className="h-4 w-4 mr-2" /> Create a team
            </Button>
            <Button variant="outline" onClick={() => setShowJoinTeamModal(true)} className="w-full">
              Join a team
            </Button>
          </div>
        );
      }
      return (
        <Button variant="outline" className="w-full" disabled>
          {event.status === 'PAST' ? 'Event completed' : regStatus.message}
        </Button>
      );
    }
    // Solo registration
    if (isRegistered) {
      return (
        <Button onClick={() => { void openQrTicket(); }} className="w-full">
          <QrCode className="h-4 w-4 mr-2" /> View ticket
        </Button>
      );
    }
    if (event.status !== 'PAST' && regStatus.canRegister) {
      if (!user) {
        return (
          <Button variant="outline" onClick={handleRegister} className="w-full">
            <LogIn className="h-4 w-4 mr-2" /> Sign in to register
          </Button>
        );
      }
      return (
        <Button onClick={handleRegister} disabled={registering} className="w-full">
          {registering ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering…</>
          ) : (
            'Register for this event'
          )}
        </Button>
      );
    }
    return (
      <Button variant="outline" className="w-full" disabled>
        {event.status === 'PAST' ? 'Event completed' : regStatus.message}
      </Button>
    );
  })();

  // Quick facts — pull from concrete event fields. Skip missing ones.
  const quickFacts: Array<[string, React.ReactNode]> = [];
  if (event.venue) quickFacts.push(['Venue', event.venue]);
  if (event.location) quickFacts.push(['Location', event.location]);
  quickFacts.push(['Format', event.teamRegistration ? `Team · ${event.teamMinSize}–${event.teamMaxSize}` : 'Solo']);
  if (event.eventType) quickFacts.push(['Type', event.eventType]);
  if (event.targetAudience) quickFacts.push(['Audience', event.targetAudience]);
  if (event.prerequisites) quickFacts.push(['Prereqs', event.prerequisites]);

  // ── Render

  return (
    <Layout>
      <SEO
        title={(() => {
          const dateLabel = event.startDate
            ? new Date(event.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';
          const venue = event.venue || event.location || '';
          const suffix = [dateLabel, venue].filter(Boolean).join(', ');
          return `${event.title}${suffix ? ` — ${suffix}` : ''} | codescriet Events`;
        })()}
        description={(event.shortDescription || event.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)}
        url={`/events/${event.slug}`}
        image={event.imageUrl || undefined}
      />

      <EventSchema
        name={event.title}
        description={event.shortDescription || event.description}
        startDate={event.startDate}
        endDate={event.endDate}
        eventImage={event.imageUrl || 'https://codescriet.dev/logo.png'}
        slug={event.slug}
      />

      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Events', url: 'https://codescriet.dev/events' },
          { name: event.title, url: `https://codescriet.dev/events/${event.slug}` },
        ]}
      />

      {event.faqs && event.faqs.length > 0 && (
        <FAQPageSchema
          items={event.faqs.map((faq) => ({ question: faq.question, answer: faq.answer }))}
        />
      )}

      {/* Registration form modal — preserved verbatim, restyled with dashboard tokens. */}
      <AnimatePresence>
        {showRegistrationFormPopup && event?.registrationFields && event.registrationFields.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[4px] p-4 sm:p-6 flex items-center justify-center"
            data-dashboard
            data-accent={accent}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              className="w-full max-w-2xl bg-[var(--bg-raised)] rounded-[14px] border border-[var(--border-subtle)] shadow-[var(--shadow-xl)] max-h-[90vh] overflow-y-auto"
            >
              <div className="px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[17px] font-semibold tracking-tight">Complete registration</h3>
                  <p className="text-[12.5px] text-[var(--ds-text-3)] mt-0.5">
                    Fill the additional details required for <span className="font-medium text-[var(--ds-text-1)]">{event.title}</span>.
                  </p>
                </div>
                <button
                  className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center"
                  onClick={() => setShowRegistrationFormPopup(false)}
                  aria-label="Close"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                {registrationFormError && (
                  <div className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-[12.5px] text-[var(--danger)]">
                    {registrationFormError}
                  </div>
                )}
                {event.registrationFields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <label
                      htmlFor={`event-registration-field-${field.id}`}
                      className="text-[12px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]"
                    >
                      {field.label}
                      {field.required && <span className="text-[var(--danger)] ml-1">*</span>}
                    </label>
                    {field.type === 'TEXTAREA' ? (
                      <Textarea
                        id={`event-registration-field-${field.id}`}
                        value={registrationFieldValues[field.id] || ''}
                        onChange={(e) => handleRegistrationFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        rows={4}
                      />
                    ) : (
                      <Input
                        id={`event-registration-field-${field.id}`}
                        type={
                          field.type === 'NUMBER' ? 'number'
                            : field.type === 'EMAIL' ? 'email'
                            : field.type === 'URL' ? 'url'
                            : field.type === 'PHONE' ? 'tel'
                            : 'text'
                        }
                        value={registrationFieldValues[field.id] || ''}
                        onChange={(e) => handleRegistrationFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        min={field.min}
                        max={field.max}
                        minLength={field.minLength}
                        maxLength={field.maxLength}
                      />
                    )}
                    {registrationFieldErrors[field.id] && (
                      <p className="text-[11.5px] text-[var(--danger)]">{registrationFieldErrors[field.id]}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="px-5 sm:px-6 py-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowRegistrationFormPopup(false)} disabled={registering}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleRegistrationFormSubmit} disabled={registering}>
                  {registering ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering…</>
                  ) : (
                    'Done & register'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The entire detail surface runs inside the dashboard v2 token scope. */}
      <div
        data-dashboard
        data-accent={accent}
        className="bg-[var(--bg-canvas)] text-[var(--ds-text-1)] min-h-[60vh]"
      >
        {/* Hero */}
        <section className="relative">
          {coverImage ? (
            <div className="relative w-full h-[260px] sm:h-[320px] lg:h-[380px] overflow-hidden">
              <img
                src={coverImage}
                alt={event.title}
                className="absolute inset-0 w-full h-full object-cover scale-[1.02]"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/75" />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.10) 0%, transparent 35%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.08) 0%, transparent 35%)',
                }}
              />
              {/* Fine dot grid for texture */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.10] mix-blend-overlay"
                style={{
                  backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
            </div>
          ) : (
            <div className={cn('relative w-full h-[260px] sm:h-[320px] lg:h-[380px] overflow-hidden bg-gradient-to-br', heroGradient)}>
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/65" />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.12) 0%, transparent 38%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.10) 0%, transparent 38%)',
                }}
              />
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
                style={{
                  backgroundImage: 'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
            </div>
          )}

          {/* Top-left back + top-right share */}
          <div className="absolute top-4 left-4 sm:left-6 z-10">
            <button
              onClick={() => navigate('/events')}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-[7px] text-[12px] font-medium text-white bg-black/35 hover:bg-black/50 backdrop-blur-[6px] transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> All events
            </button>
          </div>
          <div className="absolute top-4 right-4 sm:right-6 z-10">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-[7px] text-[12px] font-medium text-white bg-black/35 hover:bg-black/50 backdrop-blur-[6px] transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>

          {/* Title block */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-8">
            <div className="max-w-[1200px] mx-auto">
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <Pill tone={statusInfo.tone} size="sm" dot={statusInfo.dot}>{statusInfo.label}</Pill>
                {event.eventType && (
                  <span className="inline-flex items-center px-2 h-[22px] rounded-[6px] text-[11.5px] font-medium bg-white/15 text-white border border-white/10 backdrop-blur-[4px]">
                    {event.eventType}
                  </span>
                )}
                {event.teamRegistration && (
                  <span className="inline-flex items-center gap-1 px-2 h-[22px] rounded-[6px] text-[11.5px] font-medium bg-white/15 text-white border border-white/10 backdrop-blur-[4px]">
                    <Users className="h-3 w-3" /> Team · {event.teamMinSize}–{event.teamMaxSize}
                  </span>
                )}
                {event.featured && (
                  <span className="inline-flex items-center gap-1 px-2 h-[22px] rounded-[6px] text-[11.5px] font-semibold bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm">
                    <Star className="h-3 w-3" /> Featured
                  </span>
                )}
              </div>
              <h1 className="text-[28px] sm:text-[38px] lg:text-[46px] font-semibold tracking-tight text-white leading-[1.05] drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                {event.title}
              </h1>
              {event.shortDescription && (
                <p className="text-white/90 mt-3 max-w-[680px] text-[14px] sm:text-[15px] leading-[1.6] line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
                  {event.shortDescription}
                </p>
              )}
              {/* Date + venue strip in hero */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-white/85">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDateTime(event.startDate)}
                </span>
                {(event.venue || event.location) && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.venue || event.location}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Page body */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 sm:py-7">
          {/* Competition rounds banner — kept above grid because it's time-sensitive */}
          {sortedCompetitionRounds.length > 0 && (
            <DSCard className="mb-5 sm:mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-[15px] font-semibold">Competition rounds</h3>
                  <Pill tone="accent" size="xs">{sortedCompetitionRounds.length}</Pill>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                {sortedCompetitionRounds.map((round) => {
                  const statusLabel =
                    round.status === 'DRAFT' ? 'Scheduled'
                    : round.status === 'ACTIVE'
                      ? `Live${round.remainingSeconds !== undefined ? ` · ${Math.max(0, Math.ceil((round.remainingSeconds ?? 0) / 60))} min left` : ''}`
                    : round.status === 'LOCKED' ? 'Closed · results pending'
                    : round.status === 'JUDGING' ? 'Judging in progress'
                    : 'Results published';
                  const statusTone: PillTone =
                    round.status === 'ACTIVE' ? 'success'
                    : round.status === 'FINISHED' ? 'accent'
                    : 'info';
                  return (
                    <div
                      key={round.id}
                      className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between p-3 rounded-[10px] bg-[var(--surface-soft)]/40 border border-[var(--border-subtle)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <Pill tone="info" size="xs">{round.roundType === 'DSA' ? 'DSA' : 'HTML/CSS'}</Pill>
                          <Pill tone={statusTone} size="xs" dot={round.status === 'ACTIVE'}>{statusLabel}</Pill>
                          {round.hasSubmitted && <Pill tone="success" size="xs" icon={<Check size={9} />}>Submitted</Pill>}
                        </div>
                        <div className="text-[14px] font-semibold truncate">{round.title}</div>
                        {round.isEligible === false && round.eligibilityReason && (
                          <p className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">{round.eligibilityReason}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {round.status === 'FINISHED' ? (
                          <Link to={`/competition/${round.id}/results`}>
                            <Button size="sm">View results <ExternalLink className="ml-1.5 h-3 w-3" /></Button>
                          </Link>
                        ) : user && round.isEligible !== false && round.status === 'ACTIVE' ? (
                          <a
                            href={getCompetitionRoundUrl(round)}
                            target={round.roundType === 'DSA' ? undefined : '_blank'}
                            rel="noreferrer"
                          >
                            <Button size="sm">Enter contest <ExternalLink className="ml-1.5 h-3 w-3" /></Button>
                          </a>
                        ) : user && round.isEligible !== false && (round.status === 'LOCKED' || round.status === 'JUDGING') ? (
                          <Button size="sm" variant="outline" disabled>Awaiting results</Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            {round.eligibilityReason || (user ? 'Not yet open' : 'Sign in to enter')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </DSCard>
          )}

          {/* Mobile registration block — sticky right rail content collapses up here */}
          <div className="lg:hidden mb-5">
            <DSCard>
              <Eyebrow>Registration</Eyebrow>
              {registrationActions}
              {showAttendanceSummary && (
                <div className="mt-3 text-[11.5px] text-[var(--ds-text-3)] tabular-nums text-center">
                  <Users className="inline h-3 w-3 mr-1 -mt-px" />
                  {attendanceSummary.attended} {attendanceSummary.attended === 1 ? 'person' : 'people'} attended
                  {attendanceDayBreakdown && (
                    <div className="mt-0.5 text-[10.5px] text-[var(--ds-text-3)]">{attendanceDayBreakdown}</div>
                  )}
                </div>
              )}
            </DSCard>
          </div>

          <div className="grid lg:grid-cols-12 gap-5 sm:gap-6">
            {/* Main column — tab-rendering: only the active section is shown
                (design source: screen-events.jsx EventDetailScreen, lines
                186-258 — `section === 'overview'` / `section !== 'overview'`
                conditional render). The Quick-info card stays above the tabs
                because it's a context strip, not a section. */}
            <div ref={mainColumnRef} className="lg:col-span-8 flex flex-col gap-4 sm:gap-5 min-w-0">
              {/* Sticky sub-nav */}
              <div className="sticky top-[var(--site-header-height,56px)] z-10 -mx-4 sm:-mx-0 px-4 sm:px-0 backdrop-blur-[8px] bg-[var(--bg-canvas)]/85 border-b border-[var(--border-subtle)]">
                <div className="flex items-center overflow-x-auto no-scrollbar h-10">
                  {sections.map((s) => (
                    <SubNavButton
                      key={s.value}
                      value={s.value}
                      active={currentSection === s.value}
                      onClick={() => handleSubNavClick(s.value)}
                    >
                      {s.label}
                    </SubNavButton>
                  ))}
                </div>
              </div>

              {/* Quick info row — context strip, always visible */}
              <DSCard padded={false} className="p-3.5 sm:p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:divide-x md:divide-[var(--border-subtle)]">
                  <div className="flex items-center gap-3 md:pr-3">
                    <div className="w-11 h-11 rounded-[10px] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]/15 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-[var(--accent)] uppercase tracking-wider leading-none">
                        {getMonthShort(event.startDate)}
                      </span>
                      <span className="text-[15px] font-bold text-[var(--ds-text-1)] leading-none mt-0.5">
                        {getDayOfMonth(event.startDate)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Date</div>
                      <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate mt-0.5">
                        {new Date(event.startDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:px-3">
                    <div className="w-11 h-11 rounded-[10px] bg-sky-500/10 ring-1 ring-sky-500/20 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Time</div>
                      <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate mt-0.5">{formatTime(event.startDate)}</div>
                    </div>
                  </div>
                  {event.location ? (
                    <div className="flex items-center gap-3 md:px-3">
                      <div className="w-11 h-11 rounded-[10px] bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center shrink-0">
                        <MapPin className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Where</div>
                        <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate mt-0.5">{event.location}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 md:px-3">
                      <div className="w-11 h-11 rounded-[10px] bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center shrink-0">
                        <MapPin className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Where</div>
                        <div className="text-[12.5px] font-medium text-[var(--ds-text-3)] italic truncate mt-0.5">TBA</div>
                      </div>
                    </div>
                  )}
                  {event.eventDays && event.eventDays > 1 ? (
                    <div className="flex items-center gap-3 md:pl-3">
                      <div className="w-11 h-11 rounded-[10px] bg-violet-500/10 ring-1 ring-violet-500/20 flex items-center justify-center shrink-0">
                        <Calendar className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Duration</div>
                        <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate mt-0.5">{event.eventDays} days</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 md:pl-3">
                      <div className="w-11 h-11 rounded-[10px] bg-violet-500/10 ring-1 ring-violet-500/20 flex items-center justify-center shrink-0">
                        <Tag className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Format</div>
                        <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate mt-0.5">
                          {event.teamRegistration ? `Team · ${event.teamMinSize}–${event.teamMaxSize}` : 'Solo'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </DSCard>

              {/* ── Active tab content. */}

              <motion.div
                key={currentSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col gap-4"
              >
              {currentSection === 'overview' && (
                <div role="tabpanel" aria-labelledby="tab-overview" className="flex flex-col gap-4">
                  <DSCard>
                    <h3 className="text-[15px] font-semibold mb-2 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[var(--accent)]" /> About
                    </h3>
                    {event.description ? (
                      <div className="text-[13.5px] text-[var(--ds-text-2)] leading-[1.7] markdown-prose">
                        <Markdown>{event.description}</Markdown>
                      </div>
                    ) : (
                      <p className="text-[13px] text-[var(--ds-text-3)]">No description yet.</p>
                    )}
                  </DSCard>

                  {event.highlights && (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-2 flex items-center gap-2">
                        <Star className="h-4 w-4 text-[var(--accent)]" /> Highlights
                      </h3>
                      <div className="text-[13.5px] text-[var(--ds-text-2)] leading-[1.7] markdown-prose">
                        <Markdown>{event.highlights}</Markdown>
                      </div>
                    </DSCard>
                  )}

                  {!event.description && !event.highlights && (
                    <DSCard>
                      <EmptyState
                        icon={<Info size={18} />}
                        title="More details coming soon"
                        body="The organizers haven't published the full overview yet. Check back closer to the event date."
                      />
                    </DSCard>
                  )}
                </div>
              )}

              {currentSection === 'schedule' && (
                <div role="tabpanel" aria-labelledby="tab-schedule" className="flex flex-col gap-4">
                  {event.agenda && (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-[var(--accent)]" /> Schedule
                      </h3>
                      <div className="text-[13.5px] text-[var(--ds-text-2)] leading-[1.7] markdown-prose">
                        <Markdown>{event.agenda}</Markdown>
                      </div>
                    </DSCard>
                  )}
                  {event.learningOutcomes && (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
                        <Target className="h-4 w-4 text-[var(--accent)]" /> What you'll learn
                      </h3>
                      <div className="text-[13.5px] text-[var(--ds-text-2)] leading-[1.7] markdown-prose">
                        <Markdown>{event.learningOutcomes}</Markdown>
                      </div>
                    </DSCard>
                  )}
                  {!event.agenda && !event.learningOutcomes && (
                    <DSCard>
                      <EmptyState
                        icon={<Calendar size={18} />}
                        title="Schedule TBA"
                        body="The detailed schedule will appear here when the organizers publish it."
                      />
                    </DSCard>
                  )}
                </div>
              )}

              {currentSection === 'speakers' && (
                <div role="tabpanel" aria-labelledby="tab-speakers" className="flex flex-col gap-4">
                  {event.speakers && event.speakers.length > 0 ? (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
                        <Mic className="h-4 w-4 text-[var(--accent)]" /> Speakers
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {event.speakers.map((speaker, index) => <SpeakerCard key={index} speaker={speaker} />)}
                      </div>
                    </DSCard>
                  ) : (
                    <DSCard>
                      <EmptyState
                        icon={<Mic size={18} />}
                        title="Speakers coming soon"
                        body="The lineup will appear here once confirmed."
                      />
                    </DSCard>
                  )}
                </div>
              )}

              {currentSection === 'guests' && (
                <div role="tabpanel" aria-labelledby="tab-guests" className="flex flex-col gap-4">
                  {event.guests && event.guests.length > 0 ? (
                    <ChiefGuestsStrip guests={event.guests} />
                  ) : (
                    <DSCard>
                      <EmptyState
                        icon={<Users size={18} />}
                        title="No confirmed guests yet"
                        body="Invitation responses appear here as guests accept."
                      />
                    </DSCard>
                  )}
                </div>
              )}

              {currentSection === 'resources' && (
                <div role="tabpanel" aria-labelledby="tab-resources" className="flex flex-col gap-4">
                  {trustedVideoUrl && (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
                        <Play className="h-4 w-4 text-[var(--accent)]" /> Video
                      </h3>
                      <div className="aspect-video rounded-[10px] overflow-hidden bg-[var(--surface-soft)]">
                        <iframe
                          src={trustedVideoUrl}
                          title="Event video"
                          className="w-full h-full"
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          sandbox="allow-scripts allow-same-origin allow-presentation"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      </div>
                    </DSCard>
                  )}
                  {event.imageGallery && event.imageGallery.length > 0 && (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-[var(--accent)]" /> Gallery
                      </h3>
                      <LightboxGallery images={event.imageGallery} imageAltPrefix="Event image" />
                    </DSCard>
                  )}
                  {event.resources && event.resources.length > 0 && (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
                        <LinkIcon className="h-4 w-4 text-[var(--accent)]" /> Resources
                      </h3>
                      <div className="flex flex-col gap-2">
                        {event.resources.map((resource, index) => (
                          <a
                            key={index}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-[10px] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-soft)] transition-colors"
                          >
                            <div className="w-9 h-9 rounded-[7px] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                              {resourceIconFor(resource.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[var(--ds-text-1)]">{resource.title}</div>
                              <div className="text-[11.5px] text-[var(--ds-text-3)] truncate font-mono">{resource.url}</div>
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 text-[var(--ds-text-3)] shrink-0" />
                          </a>
                        ))}
                      </div>
                    </DSCard>
                  )}
                  {!trustedVideoUrl && !event.imageGallery?.length && !event.resources?.length && (
                    <DSCard>
                      <EmptyState
                        icon={<LinkIcon size={18} />}
                        title="No resources yet"
                        body="Slides, recordings and links land here after the event."
                      />
                    </DSCard>
                  )}
                </div>
              )}

              {currentSection === 'faq' && (
                <div role="tabpanel" aria-labelledby="tab-faq" className="flex flex-col gap-4">
                  {event.faqs && event.faqs.length > 0 ? (
                    <DSCard>
                      <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-[var(--accent)]" /> FAQ
                      </h3>
                      <FAQSection faqs={event.faqs} />
                    </DSCard>
                  ) : (
                    <DSCard>
                      <EmptyState
                        icon={<HelpCircle size={18} />}
                        title="No FAQs yet"
                        body="Common questions will be answered here."
                      />
                    </DSCard>
                  )}
                </div>
              )}

              {currentSection === 'my-registration' && (isRegistered || acceptedInvitation) && (
                <div role="tabpanel" aria-labelledby="tab-my-registration" className="flex flex-col gap-4">
                  <DSCard>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-[15px] font-semibold flex items-center gap-2">
                        <QrCode className="h-4 w-4 text-[var(--accent)]" /> Your registration
                      </h3>
                      <Pill tone="success" size="xs" icon={<Check size={9} />}>
                        {acceptedInvitation ? 'Guest pass' : 'Confirmed'}
                      </Pill>
                    </div>

                    <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px] mb-4">
                      <div>
                        <dt className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Holder</dt>
                        <dd className="text-[var(--ds-text-1)] font-medium mt-0.5 truncate">{user?.name || '—'}</dd>
                      </div>
                      {acceptedInvitation && (
                        <div>
                          <dt className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Role</dt>
                          <dd className="text-[var(--ds-text-1)] font-medium mt-0.5">{acceptedInvitation.role}</dd>
                        </div>
                      )}
                      {myTeam?.teamName && (
                        <div>
                          <dt className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Team</dt>
                          <dd className="text-[var(--ds-text-1)] font-medium mt-0.5 truncate">{myTeam.teamName}</dd>
                        </div>
                      )}
                      {myTeam?.inviteCode && (
                        <div>
                          <dt className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Code</dt>
                          <dd className="text-[var(--ds-text-1)] font-mono tabular-nums mt-0.5">{myTeam.inviteCode}</dd>
                        </div>
                      )}
                    </dl>

                    <Button onClick={() => { void openQrTicket(); }} className="w-full sm:w-auto">
                      <QrCode className="h-4 w-4 mr-2" /> Open QR ticket
                    </Button>

                    {event.eventDays && event.eventDays > 1 && (
                      <p className="text-[11.5px] text-[var(--ds-text-3)] mt-3">
                        Multi-day event — your ticket shows a check-in per day inside the sheet.
                      </p>
                    )}
                  </DSCard>
                </div>
              )}
              </motion.div>
            </div>

            {/* Right rail */}
            <aside className="lg:col-span-4 hidden lg:flex flex-col gap-4 lg:sticky lg:top-[calc(var(--site-header-height,56px)+0.75rem)] lg:self-start">
              {/* Countdown / status */}
              {showCountdown ? (
                <DSCard className="relative overflow-hidden">
                  {/* Soft accent glow */}
                  <div
                    aria-hidden
                    className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(closest-side, var(--accent-subtle), transparent 75%)' }}
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                      <Eyebrow>Starts in</Eyebrow>
                      <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--accent)]">
                        <span className="size-1.5 rounded-full bg-[var(--accent)]" />
                        Soon
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: countdown.days, label: 'days' },
                        { value: countdown.hours, label: 'hrs' },
                        { value: countdown.minutes, label: 'min' },
                      ].map((seg) => (
                        <div
                          key={seg.label}
                          className="flex flex-col items-center justify-center py-2.5 rounded-[10px] bg-[var(--surface-soft)]/60 border border-[var(--border-subtle)]"
                        >
                          <span className="text-[24px] leading-none font-semibold font-mono tabular-nums text-[var(--ds-text-1)]">
                            {String(seg.value).padStart(2, '0')}
                          </span>
                          <span className="mt-1 text-[10px] uppercase tracking-[0.08em] font-medium text-[var(--ds-text-3)]">
                            {seg.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11.5px] text-[var(--ds-text-3)] text-center">
                      {formatDateTime(event.startDate)}
                    </p>
                  </div>

                  {event.capacity && (
                    <>
                      <Divider className="my-4" />
                      <div className="relative">
                        <Eyebrow>Capacity</Eyebrow>
                        {/* Hard rule: never render the registered count on this
                            public event page — not even for admins. Admins read
                            live counts on /admin/event-registrations. The bar
                            here is a status-only signal (Open / Closed). */}
                        <div className="h-[6px] w-full rounded-full bg-[var(--surface-soft)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)]/60 to-[var(--accent)]"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11.5px] font-mono tabular-nums mt-1.5">
                          <span className={cn(
                            'inline-flex items-center gap-1 font-medium',
                            regStatus.canRegister ? 'text-[var(--success)]' : 'text-[var(--ds-text-3)]',
                          )}>
                            {regStatus.canRegister && <span className="size-1.5 rounded-full bg-[var(--success)] animate-pulse" />}
                            {regStatus.canRegister ? 'Open' : 'Closed'}
                          </span>
                          <span className="text-[var(--ds-text-3)]">cap {event.capacity}</span>
                        </div>
                      </div>
                    </>
                  )}
                </DSCard>
              ) : event.status === 'ONGOING' ? (
                <DSCard>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[var(--success)] animate-pulse" />
                    <span className="text-[13px] font-semibold text-[var(--success)]">Happening now</span>
                  </div>
                  <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1">
                    {event.endDate ? `Ends ${formatDateTime(event.endDate)}` : 'In progress'}
                  </p>
                </DSCard>
              ) : event.status === 'PAST' ? (
                <DSCard>
                  <Eyebrow>This event has ended</Eyebrow>
                  <p className="text-[12.5px] text-[var(--ds-text-2)]">
                    {formatDateTime(event.startDate)}
                  </p>
                  {showAttendanceSummary && (
                    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                      <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-1.5">Attendance</div>
                      <div className="text-[15px] font-semibold text-[var(--ds-text-1)] tabular-nums">
                        {attendanceSummary.attended}
                      </div>
                      {attendanceDayBreakdown && (
                        <div className="text-[11px] text-[var(--ds-text-3)] mt-0.5">{attendanceDayBreakdown}</div>
                      )}
                    </div>
                  )}
                </DSCard>
              ) : null}

              {/* Registration / Team action card */}
              <DSCard>
                <Eyebrow>
                  {acceptedInvitation ? 'Guest pass' :
                   pendingInvitation ? 'Invitation' :
                   isRegistered ? 'Your pass' :
                   event.teamRegistration ? 'Team registration' : 'Register'}
                </Eyebrow>
                {registrationActions}
                {!isRegistered && !acceptedInvitation && !pendingInvitation && event.status !== 'PAST' && (
                  <div className="mt-3 text-[11.5px] text-[var(--ds-text-3)] flex items-start gap-1.5">
                    <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{regStatus.message}</span>
                  </div>
                )}
              </DSCard>

              {/* Quick facts */}
              {quickFacts.length > 0 && (
                <DSCard>
                  <Eyebrow>Quick facts</Eyebrow>
                  <dl className="text-[12.5px] space-y-2">
                    {quickFacts.map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-3">
                        <dt className="text-[var(--ds-text-3)] shrink-0">{k}</dt>
                        <dd className="text-[var(--ds-text-1)] font-medium text-right truncate max-w-[60%]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </DSCard>
              )}

              {/* Tags */}
              {event.tags && event.tags.length > 0 && (
                <DSCard>
                  <Eyebrow>Tags</Eyebrow>
                  <div className="flex flex-wrap gap-1.5">
                    {event.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="bg-[var(--surface-soft)] border-[var(--border-subtle)] text-[var(--ds-text-2)]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </DSCard>
              )}

              {/* Registration window */}
              {(event.registrationStartDate || event.registrationEndDate) && (
                <DSCard>
                  <Eyebrow>Registration window</Eyebrow>
                  <dl className="text-[12.5px] space-y-1.5">
                    {event.registrationStartDate && (
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-[var(--ds-text-3)]">Opens</dt>
                        <dd className="text-[var(--ds-text-1)] font-medium text-right font-mono tabular-nums text-[11.5px]">
                          {formatDateTime(event.registrationStartDate)}
                        </dd>
                      </div>
                    )}
                    {event.registrationEndDate && (
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-[var(--ds-text-3)]">Closes</dt>
                        <dd className="text-[var(--ds-text-1)] font-medium text-right font-mono tabular-nums text-[11.5px]">
                          {formatDateTime(event.registrationEndDate)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </DSCard>
              )}

              {/* Share helper */}
              <button
                onClick={handleShare}
                className="flex items-center justify-center gap-1.5 h-9 rounded-[8px] text-[12.5px] font-medium text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] hover:bg-[var(--surface-soft)] border border-[var(--border-subtle)]"
              >
                <CopyIcon className="h-3.5 w-3.5" /> Copy event link
              </button>
            </aside>
          </div>
        </section>
      </div>

      {/* Team modals */}
      {event.teamRegistration && (
        <>
          <TeamCreateModal
            open={showCreateTeamModal}
            onOpenChange={setShowCreateTeamModal}
            event={event}
            onSuccess={(team) => {
              setMyTeam(team);
              setIsRegistered(true);
              setShowCreateTeamModal(false);
              void loadEvent();
            }}
          />
          <TeamJoinModal
            open={showJoinTeamModal}
            onOpenChange={setShowJoinTeamModal}
            event={event}
            onSuccess={(team) => {
              setMyTeam(team);
              setIsRegistered(true);
              setShowJoinTeamModal(false);
              void loadEvent();
            }}
          />
        </>
      )}

      {/* QR Ticket Sheet — single instance shared by accepted invitees + registrants */}
      {(isRegistered || acceptedInvitation) && (
        <QRTicketSheet
          open={showTicket}
          onOpenChange={setShowTicket}
          event={{
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate || null,
            status: event.status,
            eventType: event.eventType || undefined,
          }}
          coverGradient={heroGradient}
          attendanceToken={
            acceptedInvitation?.attendanceToken ?? attendanceQR?.attendanceToken ?? null
          }
          attended={
            acceptedInvitation?.registration?.attended ?? attendanceQR?.attended ?? false
          }
          scannedAt={
            acceptedInvitation?.registration?.scannedAt ?? attendanceQR?.scannedAt ?? null
          }
          eventDays={event.eventDays ?? attendanceQR?.eventDays ?? 1}
          dayLabels={event.dayLabels ?? attendanceQR?.dayLabels}
          dayAttendances={
            acceptedInvitation?.registration?.dayAttendances ?? attendanceQR?.dayAttendances
          }
          daysAttended={attendanceQR?.daysAttended}
          allDaysAttended={attendanceQR?.allDaysAttended}
          teamName={myTeam?.teamName}
          ticketReference={myTeam?.inviteCode}
          intro={ticketLoading ? (
            <div className="text-[12px] text-[var(--ds-text-3)] mb-3">Loading your ticket…</div>
          ) : null}
        />
      )}
    </Layout>
  );
}
