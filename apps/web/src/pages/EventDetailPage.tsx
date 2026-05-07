import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { EventSchema, BreadcrumbSchema, FAQPageSchema } from '@/components/ui/schema';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import {
  Calendar, MapPin, Users, Loader2, Clock, AlertCircle,
  LogIn, ArrowLeft, Target, BookOpen, User, ExternalLink, ChevronDown,
  ChevronUp, Play, Image as ImageIcon, Link as LinkIcon, FileText,
  Github, Presentation, Video, HelpCircle, Tag, Star, Share2, X, QrCode
} from 'lucide-react';
import {
  api,
  type Event,
  type Speaker,
  type FAQ,
  type EventRegistrationField,
  type RegistrationAdditionalFieldInput,
  type EventTeam,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatTime, formatDateTime, getWeekdayShort, getDayOfMonth, getMonthShort } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { getRegistrationStatus } from '@/lib/registrationStatus';
import { TeamCreateModal, TeamJoinModal, TeamDashboard } from '@/components/teams';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { normalizeTrustedVideoEmbedUrl } from '@/lib/videoEmbed';
import { LightboxGallery } from '@/components/media/LightboxGallery';
import QRTicket from '@/components/attendance/QRTicket';
import ChiefGuestsStrip from '@/components/events/ChiefGuestsStrip';
import { toast } from 'sonner';

type EventStatus = 'UPCOMING' | 'ONGOING' | 'PAST';

const statusConfig: Record<EventStatus, { label: string; variant: 'success' | 'warning' | 'secondary'; color: string }> = {
  UPCOMING: { label: 'Upcoming', variant: 'success', color: 'bg-green-100 text-green-800 border-green-200' },
  ONGOING: { label: 'Happening Now', variant: 'warning', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  PAST: { label: 'Completed', variant: 'secondary', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

// Resource type icons
const resourceIcons: Record<string, React.ReactNode> = {
  pdf: <FileText className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  github: <Github className="h-4 w-4" />,
  slides: <Presentation className="h-4 w-4" />,
  link: <LinkIcon className="h-4 w-4" />,
  other: <ExternalLink className="h-4 w-4" />,
};

// Helper to get registration status
function validateCustomFieldValue(field: EventRegistrationField, value: string): string | null {
  const trimmed = value.trim();

  if (field.required && !trimmed) {
    return `${field.label} is required`;
  }

  if (!trimmed) {
    return null;
  }

  if (field.minLength !== undefined && trimmed.length < field.minLength) {
    return `${field.label} must be at least ${field.minLength} characters`;
  }

  if (field.maxLength !== undefined && trimmed.length > field.maxLength) {
    return `${field.label} must be at most ${field.maxLength} characters`;
  }

  if (field.type === 'NUMBER') {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return `${field.label} must be a valid number`;
    }
    if (field.min !== undefined && numeric < field.min) {
      return `${field.label} must be >= ${field.min}`;
    }
    if (field.max !== undefined && numeric > field.max) {
      return `${field.label} must be <= ${field.max}`;
    }
  }

  if (field.type === 'EMAIL') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return `${field.label} must be a valid email address`;
    }
  }

  if (field.type === 'PHONE') {
    const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
    if (!phoneRegex.test(trimmed)) {
      return `${field.label} must be a valid phone number`;
    }
  }

  if (field.type === 'URL') {
    try {
      const url = new URL(trimmed);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return `${field.label} must be a valid URL`;
      }
    } catch {
      return `${field.label} must be a valid URL`;
    }
  }

  if (field.pattern) {
    try {
      const regex = new RegExp(field.pattern);
      if (!regex.test(trimmed)) {
        return `${field.label} does not match required format`;
      }
    } catch {
      return `${field.label} has an invalid validation pattern`;
    }
  }

  return null;
}

// Image Gallery Component with Lightbox
function ImageGallery({ images }: { images: string[] }) {
  return (
    <LightboxGallery images={images} imageAltPrefix="Event image" />
  );
}

// FAQ Accordion Component
function FAQSection({ faqs }: { faqs: FAQ[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!faqs.length) return null;

  return (
    <div className="space-y-3">
      {faqs.map((faq, index) => (
        <motion.div
          key={index}
          initial={false}
          className="border border-amber-200 rounded-lg overflow-hidden"
        >
          <button
            className="w-full px-4 py-3 flex items-center justify-between text-left bg-white hover:bg-amber-50 transition-colors"
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
          >
            <span className="font-medium text-gray-900">{faq.question}</span>
            {openIndex === index ? (
              <ChevronUp className="h-5 w-5 text-amber-600 shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 text-amber-600 shrink-0" />
            )}
          </button>
          <AnimatePresence>
            {openIndex === index && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="px-4 py-3 bg-amber-50/50 text-gray-700 border-t border-amber-100">
                  {faq.answer}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}

// Speaker Card Component
function SpeakerCard({ speaker }: { speaker: Speaker }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {speaker.image ? (
          <img
            src={processImageUrl(speaker.image, 'square')}
            alt={speaker.name}
            className="w-16 h-16 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <User className="h-8 w-8 text-amber-600" />
          </div>
        )}
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">{speaker.name}</h4>
          <p className="text-sm text-amber-600">{speaker.role}</p>
          {speaker.bio && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{speaker.bio}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token, isLoading: authLoading } = useAuth();

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

  // Team registration state
  const [myTeam, setMyTeam] = useState<EventTeam | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showJoinTeamModal, setShowJoinTeamModal] = useState(false);
  const [competitionRounds, setCompetitionRounds] = useState<
    Array<{
      id: string;
      title: string;
      status: 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'JUDGING' | 'FINISHED';
      hasSubmitted?: boolean;
      isEligible?: boolean;
      eligibilityReason?: string;
    }>
  >([]);
  const trustedVideoUrl = event?.videoUrl ? normalizeTrustedVideoEmbedUrl(event.videoUrl) : null;

  const getCompetitionRoundUrl = (roundId: string) => {
    return getPlaygroundLaunchUrl(`/competition/${roundId}`);
  };

  useEffect(() => {
    const fetchEvent = async () => {
      if (!id) {
        setError('Event not found');
        setLoading(false);
        return;
      }

      try {
        setAutoRegisterTriggered(false);
        setLoading(true);
        setError(null);
        const eventData = await api.getEvent(id, token || undefined);
        setEvent(eventData);
        setIsRegistered(Boolean(eventData.isRegistered || eventData.userInvitation?.status === 'ACCEPTED'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event');
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [id, token]);

  // Fetch team data for team events
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
        // If user has a team, they are registered
        if (team) {
          setIsRegistered(true);
        }
      } catch {
        setMyTeam(null);
      } finally {
        setTeamLoading(false);
      }
    };

    fetchTeam();
  }, [event?.id, event?.teamRegistration, token]);

  useEffect(() => {
    const fetchCompetitionRounds = async () => {
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
            round.status === 'FINISHED'
          )
        );
      } catch {
        setCompetitionRounds([]);
      }
    };

    void fetchCompetitionRounds();
  }, [event?.id, token]);

  // Fetch attendance summary for past events — restricted to CORE_MEMBER+ to avoid
  // disclosing attendee counts to the public.
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

  const openQrTicket = useCallback(() => {
    if (!event) return;
    navigate('/dashboard/events', { state: { openQrForEventId: event.id } });
  }, [event, navigate]);

  const handleAcceptInvitation = useCallback(async () => {
    if (!event?.userInvitation || event.userInvitation.status !== 'PENDING') {
      return;
    }

    if (!token) {
      navigate('/signin', {
        state: {
          from: `/events/${event.slug || event.id}`,
          message: 'Please sign in to accept this invitation.',
        },
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
      // Refresh event data
      const updatedEvent = await api.getEvent(event.id, token);
      setEvent(updatedEvent);
    } catch {
      setMyTeam(null);
      setIsRegistered(false);
    }
  };

  const performRegistration = useCallback(async (additionalFields?: RegistrationAdditionalFieldInput[]) => {
    if (!event || !token) {
      return;
    }

    try {
      setRegistering(true);
      setRegistrationFormError(null);

      await api.registerForEvent(event.id, token, additionalFields);
      setIsRegistered(true);
      setShowRegistrationFormPopup(false);

      // Refresh event data
      const updatedEvent = await api.getEvent(event.id, token);
      setEvent(updatedEvent);
      toast.success(`Successfully registered for "${event.title}"!`, {
        action: {
          label: 'View QR Ticket',
          onClick: openQrTicket,
        },
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
    if (!event?.registrationFields || event.registrationFields.length === 0) {
      return;
    }

    const initialValues: Record<string, string> = {};
    event.registrationFields.forEach((field) => {
      initialValues[field.id] = '';
    });

    setRegistrationFieldValues(initialValues);
    setRegistrationFieldErrors({});
    setRegistrationFormError(null);
    setShowRegistrationFormPopup(true);
  }, [event?.registrationFields]);

  const handleRegister = useCallback(async () => {
    if (!event) return;

    if (authLoading) {
      return;
    }

    const regStatus = getRegistrationStatus(event);

    if (!regStatus.canRegister) {
      toast.error(regStatus.message);
      return;
    }

    if (!user || !token) {
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      navigate('/signin', { state: { from: `/events/${event.slug}`, message: 'Please sign in to register for events' } });
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
    if (!event || isRegistered || autoRegisterTriggered || authLoading) {
      return;
    }
    if (searchParams.get('register') !== '1') {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('register');
    setSearchParams(nextParams, { replace: true });

    if (event.teamRegistration) {
      setAutoRegisterTriggered(true);
      return;
    }

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
      if (errorMessage) {
        fieldErrors[field.id] = errorMessage;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setRegistrationFieldErrors(fieldErrors);
      return;
    }

    const additionalFields: RegistrationAdditionalFieldInput[] = event.registrationFields
      .map((field) => ({
        fieldId: field.id,
        value: (registrationFieldValues[field.id] || '').trim(),
      }))
      .filter((entry) => entry.value.length > 0);

    await performRegistration(additionalFields);
  };

  const qrTicketCta = (
    <Button
      className="w-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
      variant="outline"
      onClick={openQrTicket}
    >
      <QrCode className="h-4 w-4 mr-2" />
      View Your QR Ticket
    </Button>
  );

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event?.title,
          text: event?.shortDescription || event?.description.slice(0, 100),
          url,
        });
      } catch {
        // User cancelled the native share sheet.
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Event link copied to clipboard');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  if (error || !event) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
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
  const statusInfo = statusConfig[event.status];
  const coverImage = event.imageUrl ? processImageUrl(event.imageUrl, 'event-cover') : null;
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
  const acceptedGuestTicket = acceptedInvitation ? (
    <QRTicket
      attendanceToken={acceptedInvitation.attendanceToken ?? null}
      attended={acceptedInvitation.registration?.attended ?? false}
      scannedAt={acceptedInvitation.registration?.scannedAt ?? null}
      eventDays={event.eventDays}
      dayLabels={event.dayLabels}
      dayAttendances={acceptedInvitation.registration?.dayAttendances}
      event={{
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate || null,
        status: event.status,
      }}
    />
  ) : null;
  const invitationBanner = pendingInvitation ? (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">You're invited as {pendingInvitation.role}.</p>
          <p className="mt-1 text-amber-800">
            Accept this invitation to confirm attendance and unlock your QR ticket.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => {
              void handleAcceptInvitation();
            }}
            disabled={invitationResponding}
          >
            {invitationResponding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Accept Invitation
          </Button>
          <Link to={`/dashboard/invitations/${pendingInvitation.id}`}>
            <Button variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
              Manage in Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  ) : null;
  const invitationResponseContent = pendingInvitation ? invitationBanner : null;
  const registrationStatusBox = acceptedInvitation ? (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
      <QrCode className="h-4 w-4 shrink-0" />
      <span>Your guest invitation is accepted. Present this QR at the event.</span>
    </div>
  ) : pendingInvitation ? (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Clock className="h-4 w-4 shrink-0" />
      <span>You have a pending guest invitation for this event.</span>
    </div>
  ) : (
    <div className={`flex items-center gap-2 text-sm rounded-lg border px-4 py-3 ${regStatus.status === 'open' ? 'bg-green-50 text-green-700 border-green-200' :
        regStatus.status === 'not_started' ? 'bg-blue-50 text-blue-700 border-blue-200' :
          'bg-gray-100 text-gray-600 border-gray-200'
      }`}>
      <Clock className="h-4 w-4 shrink-0" />
      <span>{regStatus.message}</span>
    </div>
  );

  return (
    <Layout>
      <SEO
        title={event.title}
        description={event.shortDescription || event.description.slice(0, 160)}
        url={`/events/${event.slug}`}
      />

      {/* Schema markup for SEO */}
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

      {/* FAQ Schema if FAQs exist */}
      {event.faqs && event.faqs.length > 0 && (
        <FAQPageSchema
          items={event.faqs.map(faq => ({
            question: faq.question,
            answer: faq.answer,
          }))}
        />
      )}

      <AnimatePresence>
        {showRegistrationFormPopup && event?.registrationFields && event.registrationFields.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 p-4 sm:p-6 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-amber-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="p-5 sm:p-6 border-b border-amber-100 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-amber-900">Complete Registration</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Fill the additional details required for <strong>{event.title}</strong>.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRegistrationFormPopup(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                {registrationFormError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {registrationFormError}
                  </div>
                )}

                {event.registrationFields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <label htmlFor={`event-registration-field-${field.id}`} className="text-sm font-medium text-gray-800">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
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
                          field.type === 'NUMBER'
                            ? 'number'
                            : field.type === 'EMAIL'
                              ? 'email'
                              : field.type === 'URL'
                                ? 'url'
                                : field.type === 'PHONE'
                                  ? 'tel'
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
                      <p className="text-xs text-red-600">{registrationFieldErrors[field.id]}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-5 sm:p-6 border-t border-amber-100 flex flex-col sm:flex-row gap-3 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRegistrationFormPopup(false)}
                  disabled={registering}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleRegistrationFormSubmit}
                  disabled={registering}
                >
                  {registering ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    'Done & Register'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section with Cover Image */}
      <section className="relative">
        {coverImage ? (
          <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
            <img
              src={coverImage}
              alt={event.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide the image and show gradient background instead
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          </div>
        ) : (
          <div className="h-[30vh] bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900" />
        )}

        {/* Back Button */}
        <div className="absolute top-4 left-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/events')}
            className="bg-white/90 backdrop-blur-sm hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Events
          </Button>
        </div>

        {/* Share Button */}
        <div className="absolute top-4 right-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="bg-white/90 backdrop-blur-sm hover:bg-white"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>

        {/* Event Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-8">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <Badge className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
              {event.eventType && (
                <Badge variant="outline" className="bg-white/90 text-xs sm:text-sm">
                  {event.eventType}
                </Badge>
              )}
              {event.featured && (
                <Badge className="bg-amber-500 text-white text-xs sm:text-sm">
                  <Star className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl lg:text-5xl">
              {event.title}
            </h1>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-6 sm:py-8 md:py-12 bg-amber-50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Mobile: Registration Card First */}
            <div className="lg:hidden">
              <Card className="border-amber-200 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-t-lg py-3">
                  <CardTitle className="text-center text-lg">Register Now</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {/* Registration Status */}
                  {registrationStatusBox}

                  {invitationResponseContent}

                  {/* Spots Remaining - inline on mobile */}
                  {event.capacity && (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-amber-600">
                          {Math.max(0, event.capacity - (event._count?.registrations || 0))}
                        </span>
                        <span className="text-sm text-gray-500">spots left</span>
                      </div>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
                        <div
                          className="h-full bg-amber-500 transition-all"
                          style={{
                            width: `${Math.min(100, ((event._count?.registrations || 0) / event.capacity) * 100)}%`
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Register Button - different UI for team events */}
                  {acceptedInvitation ? (
                    acceptedGuestTicket
                  ) : pendingInvitation ? null : event.teamRegistration ? (
                    // Team Registration UI
                    <>
                      {teamLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                          <span className="ml-2 text-sm text-gray-600">Loading team...</span>
                        </div>
                      ) : myTeam ? (
                        // User has a team - show dashboard
                        <>
                          <TeamDashboard team={myTeam} event={event} onTeamChange={handleTeamChange} />
                          <div className="mt-3">{qrTicketCta}</div>
                        </>
                      ) : isRegistered ? (
                        qrTicketCta
                      ) : event.status !== 'PAST' && regStatus.canRegister ? (
                        // User can register - show create/join buttons
                        user ? (
                          <div className="space-y-3">
                            <div className="text-center mb-2">
                              <Badge variant="outline" className="text-amber-600 border-amber-300">
                                <Users className="h-3 w-3 mr-1" />
                                Team Event ({event.teamMinSize}-{event.teamMaxSize} members)
                              </Badge>
                            </div>
                            <Button
                              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={() => setShowCreateTeamModal(true)}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Create a Team
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => setShowJoinTeamModal(true)}
                            >
                              Join a Team
                            </Button>
                          </div>
                        ) : (
                          <Button
                            className="w-full"
                            variant="outline"
                            onClick={handleRegister}
                          >
                            <LogIn className="h-4 w-4 mr-2" />
                            Sign In to Register
                          </Button>
                        )
                      ) : (
                        <Button variant="outline" className="w-full" disabled>
                          {event.status === 'PAST' ? 'Event Completed' : regStatus.message}
                        </Button>
                      )}
                    </>
                  ) : (
                    // Solo Registration UI (original)
                    <>
                      {isRegistered ? (
                        qrTicketCta
                      ) : event.status !== 'PAST' && regStatus.canRegister ? (
                        user ? (
                          <Button
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={handleRegister}
                            disabled={registering}
                          >
                            {registering ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Registering...
                              </>
                            ) : (
                              'Register for This Event'
                            )}
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            variant="outline"
                            onClick={handleRegister}
                          >
                            <LogIn className="h-4 w-4 mr-2" />
                            Sign In to Register
                          </Button>
                        )
                      ) : (
                        <Button variant="outline" className="w-full" disabled>
                          {event.status === 'PAST' ? 'Event Completed' : regStatus.message}
                        </Button>
                      )}
                    </>
                  )}
                  {competitionRounds.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-sm font-semibold text-blue-900">Competition Rounds</p>
                      {competitionRounds.map((round) => (
                        <div key={round.id} className="rounded-md border border-blue-200 bg-white px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-blue-900 truncate">{round.title}</p>
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                              {round.status}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-[11px] text-blue-700">
                              {round.hasSubmitted
                                ? 'Submitted'
                                : round.isEligible === false
                                  ? (round.eligibilityReason || 'Not eligible')
                                  : round.status === 'ACTIVE'
                                    ? 'Open now'
                                    : round.status === 'LOCKED'
                                      ? 'Locked'
                                      : round.status === 'JUDGING'
                                        ? 'Judging'
                                        : 'Results published'}
                            </p>
                            <div className="flex items-center gap-2">
                              {round.status === 'FINISHED' && (
                                <Link
                                  to={`/competition/${round.id}/results`}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 underline"
                                >
                                  View Results
                                </Link>
                              )}
                              {user && round.status !== 'FINISHED' && round.isEligible !== false && (
                                <a
                                  href={getCompetitionRoundUrl(round.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 underline"
                                >
                                  Open
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showAttendanceSummary && (
                    <p className="text-sm text-center text-gray-500 mt-2">
                      <Users className="inline h-4 w-4 mr-1" />
                      {attendanceSummary.attended} {attendanceSummary.attended === 1 ? 'person' : 'people'} attended
                    </p>
                  )}
                  {attendanceDayBreakdown && (
                    <p className="text-xs text-center text-gray-400 mt-1">
                      {attendanceDayBreakdown}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6 lg:space-y-8">
              {/* Quick Info Bar */}
              <Card className="border-amber-200">
                <CardContent className="p-3 sm:p-4">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-lg flex flex-col items-center justify-center">
                        <span className="text-[10px] sm:text-xs text-amber-600 font-medium">{getMonthShort(event.startDate)}</span>
                        <span className="text-sm sm:text-lg font-bold text-amber-900">{getDayOfMonth(event.startDate)}</span>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-500">Date</p>
                        <p className="text-sm sm:text-base font-medium text-gray-900">{getWeekdayShort(event.startDate)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                        <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-500">Time</p>
                        <p className="text-sm sm:text-base font-medium text-gray-900">{formatTime(event.startDate)}</p>
                      </div>
                    </div>

                    {event.location && (
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                          <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm text-gray-500">Location</p>
                          <p className="text-sm sm:text-base font-medium text-gray-900 line-clamp-1">{event.location}</p>
                        </div>
                      </div>
                    )}

                    {event.capacity && (
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                          <Users className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm text-gray-500">Capacity</p>
                          <p className="text-sm sm:text-base font-medium text-gray-900">
                            {event._count?.registrations || 0} / {event.capacity}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {event.guests && event.guests.length > 0 && (
                <ChiefGuestsStrip guests={event.guests} />
              )}

              {/* About This Event */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-amber-600" />
                    About This Event
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Markdown>{event.description}</Markdown>
                </CardContent>
              </Card>

              {/* Event Highlights */}
              {event.highlights && (
                <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-600" />
                      Event Highlights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Markdown>{event.highlights}</Markdown>
                  </CardContent>
                </Card>
              )}

              {/* Agenda / Schedule */}
              {event.agenda && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-amber-600" />
                      Agenda / Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Markdown>{event.agenda}</Markdown>
                  </CardContent>
                </Card>
              )}

              {/* What You'll Learn */}
              {event.learningOutcomes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-amber-600" />
                      What You'll Learn
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Markdown>{event.learningOutcomes}</Markdown>
                  </CardContent>
                </Card>
              )}

              {/* Speakers */}
              {event.speakers && event.speakers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-amber-600" />
                      Speakers & Instructors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {event.speakers.map((speaker, index) => (
                        <SpeakerCard key={index} speaker={speaker} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Video Embed */}
              {trustedVideoUrl && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Play className="h-5 w-5 text-amber-600" />
                      Event Video
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
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
                  </CardContent>
                </Card>
              )}

              {/* Image Gallery */}
              {event.imageGallery && event.imageGallery.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-amber-600" />
                      Event Gallery
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ImageGallery images={event.imageGallery} />
                  </CardContent>
                </Card>
              )}

              {/* Resources */}
              {event.resources && event.resources.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LinkIcon className="h-5 w-5 text-amber-600" />
                      Resources & Materials
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {event.resources.map((resource, index) => (
                        <a
                          key={index}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors"
                        >
                          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                            {resourceIcons[resource.type || 'other']}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{resource.title}</p>
                            <p className="text-sm text-gray-500 truncate">{resource.url}</p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* FAQs */}
              {event.faqs && event.faqs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HelpCircle className="h-5 w-5 text-amber-600" />
                      Frequently Asked Questions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FAQSection faqs={event.faqs} />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Sticky Sidebar (Desktop only) */}
            <div className="hidden lg:block lg:col-span-1">
              <div className="sticky top-[calc(var(--site-header-height)+1rem)] space-y-6">
                {/* Registration Card */}
                <Card className="border-amber-200 shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-t-lg">
                    <CardTitle className="text-center">Register Now</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Registration Status */}
                    {registrationStatusBox}

                    {invitationResponseContent}

                    {/* Spots Remaining */}
                    {event.capacity && (
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">
                          {Math.max(0, event.capacity - (event._count?.registrations || 0))}
                        </div>
                        <p className="text-sm text-gray-500">spots remaining</p>
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 transition-all"
                            style={{
                              width: `${Math.min(100, ((event._count?.registrations || 0) / event.capacity) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Register Button - different UI for team events */}
                    {acceptedInvitation ? (
                      acceptedGuestTicket
                    ) : pendingInvitation ? null : event.teamRegistration ? (
                      // Team Registration UI (Desktop)
                      <>
                        {teamLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                            <span className="ml-2 text-sm text-gray-600">Loading team...</span>
                          </div>
                        ) : myTeam ? (
                          <>
                            <TeamDashboard team={myTeam} event={event} onTeamChange={handleTeamChange} />
                            <div className="mt-3">{qrTicketCta}</div>
                          </>
                        ) : isRegistered ? (
                          qrTicketCta
                        ) : event.status !== 'PAST' && regStatus.canRegister ? (
                          user ? (
                            <div className="space-y-3">
                              <div className="text-center mb-2">
                                <Badge variant="outline" className="text-amber-600 border-amber-300">
                                  <Users className="h-3 w-3 mr-1" />
                                  Team Event ({event.teamMinSize}-{event.teamMaxSize} members)
                                </Badge>
                              </div>
                              <Button
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={() => setShowCreateTeamModal(true)}
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Create a Team
                              </Button>
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setShowJoinTeamModal(true)}
                              >
                                Join a Team
                              </Button>
                            </div>
                          ) : (
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={handleRegister}
                            >
                              <LogIn className="h-4 w-4 mr-2" />
                              Sign In to Register
                            </Button>
                          )
                        ) : (
                          <Button variant="outline" className="w-full" disabled>
                            {event.status === 'PAST' ? 'Event Completed' : regStatus.message}
                          </Button>
                        )}
                      </>
                    ) : (
                      // Solo Registration UI (Desktop)
                      <>
                        {isRegistered ? (
                          qrTicketCta
                        ) : event.status !== 'PAST' && regStatus.canRegister ? (
                          user ? (
                            <Button
                              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={handleRegister}
                              disabled={registering}
                            >
                              {registering ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Registering...
                                </>
                              ) : (
                                'Register for This Event'
                              )}
                            </Button>
                          ) : (
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={handleRegister}
                            >
                              <LogIn className="h-4 w-4 mr-2" />
                              Sign In to Register
                            </Button>
                          )
                        ) : (
                          <Button variant="outline" className="w-full" disabled>
                            {event.status === 'PAST' ? 'Event Completed' : regStatus.message}
                          </Button>
                        )}
                      </>
                    )}
                    {competitionRounds.length > 0 && (
                      <div className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <p className="text-sm font-semibold text-blue-900">Competition Rounds</p>
                        {competitionRounds.map((round) => (
                          <div key={round.id} className="rounded-md border border-blue-200 bg-white px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-blue-900 truncate">{round.title}</p>
                              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                                {round.status}
                              </Badge>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <p className="text-[11px] text-blue-700">
                                {round.hasSubmitted
                                  ? 'Submitted'
                                  : round.isEligible === false
                                    ? (round.eligibilityReason || 'Not eligible')
                                    : round.status === 'ACTIVE'
                                      ? 'Open now'
                                      : round.status === 'LOCKED'
                                        ? 'Locked'
                                        : round.status === 'JUDGING'
                                          ? 'Judging'
                                          : 'Results published'}
                              </p>
                              <div className="flex items-center gap-2">
                                {round.status === 'FINISHED' && (
                                  <Link
                                    to={`/competition/${round.id}/results`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 underline"
                                  >
                                    View Results
                                  </Link>
                                )}
                                {user && round.status !== 'FINISHED' && round.isEligible !== false && (
                                  <a
                                    href={getCompetitionRoundUrl(round.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 underline"
                                  >
                                    Open
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {showAttendanceSummary && (
                      <p className="text-sm text-center text-gray-500 mt-2">
                        <Users className="inline h-4 w-4 mr-1" />
                        {attendanceSummary.attended} {attendanceSummary.attended === 1 ? 'person' : 'people'} attended
                      </p>
                    )}
                    {attendanceDayBreakdown && (
                      <p className="text-xs text-center text-gray-400 mt-1">
                        {attendanceDayBreakdown}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Event Details Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Event Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900">Date & Time</p>
                        <p className="text-sm text-gray-600">
                          {formatDateTime(event.startDate)}
                          {event.endDate && (
                            <>
                              <br />
                              to {formatDateTime(event.endDate)}
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {event.location && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-gray-900">Location</p>
                          <p className="text-sm text-gray-600">
                            {event.location}
                            {event.venue && <><br />{event.venue}</>}
                          </p>
                        </div>
                      </div>
                    )}

                    {event.targetAudience && (
                      <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-gray-900">Who Should Attend</p>
                          <p className="text-sm text-gray-600">{event.targetAudience}</p>
                        </div>
                      </div>
                    )}

                    {event.prerequisites && (
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-gray-900">Prerequisites</p>
                          <p className="text-sm text-gray-600">{event.prerequisites}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tags */}
                {event.tags && event.tags.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Tags
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {event.tags.map((tag, index) => (
                          <Badge key={index} variant="outline" className="bg-amber-50">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Registration Timeline */}
                {(event.registrationStartDate || event.registrationEndDate) && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                      <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Registration Window
                      </h4>
                      <div className="text-sm text-blue-800 space-y-1">
                        {event.registrationStartDate && (
                          <p>Opens: {formatDateTime(event.registrationStartDate)}</p>
                        )}
                        {event.registrationEndDate && (
                          <p>Closes: {formatDateTime(event.registrationEndDate)}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Registration Modals */}
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
            }}
          />
        </>
      )}

    </Layout>
  );
}
