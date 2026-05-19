// EventAdminHub — outer attendance shell with Details / Scanner / Manage / Certificates tabs.
// Design source: code-scriet-innerdashboard/project/js/screen-attendance.jsx
//   - AttendanceScreen (lines 3-46) — header with back chevron + event cover/title/meta,
//     UnderlineTabs for the four sub-screens. Tab content lives in the existing
//     AdminScanner / AttendanceManager / EventCertificateWizard components.
//
// Back-nav fix: admin path used to point at /admin/events/<id>/edit which was wrong —
// admins land here from /admin/event-registrations, so back should route them there,
// matching the design's "← Event registrations" chevron.

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type Event } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/dateUtils';

import AdminScanner from '@/components/attendance/AdminScanner';
import AttendanceManager from '@/components/attendance/AttendanceManager';
import EventCertificateWizard from '@/components/attendance/EventCertificateWizard';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { DSCard, Pill, UnderlineTabs, type PillTone } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
  Loader2,
  ChevronLeft,
  Settings as SettingsIcon,
  QrCode,
  Users,
  Award,
  ExternalLink,
  Calendar,
  MapPin,
  Clock,
} from 'lucide-react';

const VALID_TABS = ['details', 'scanner', 'manage', 'certificates'] as const;
type TabValue = (typeof VALID_TABS)[number];

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

const statusPillFor = (status?: string): { tone: PillTone; label: string; dot: boolean } => {
  if (status === 'ONGOING') return { tone: 'success', label: 'Live now', dot: true };
  if (status === 'UPCOMING') return { tone: 'info', label: 'Upcoming', dot: false };
  return { tone: 'neutral', label: 'Past', dot: false };
};

export default function EventAdminHub() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, token } = useAuth();
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  // Core members access via /dashboard/events/:id/attendance; admins via /admin/events/:id/attendance.
  const isAdminPath = location.pathname.startsWith('/admin');
  // Back target: admins go to event-registrations (the page they came from per the
  // design, screen-attendance.jsx:10); core members go to their events list.
  const backHref = isAdminPath ? '/admin/event-registrations' : '/dashboard/events';
  const backLabel = isAdminPath ? 'Event registrations' : 'My events';

  const [event, setEvent] = useState<Event | null>(null);
  const [hasCompetitionRounds, setHasCompetitionRounds] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isPastEvent = event?.status === 'PAST';

  const rawTab = searchParams.get('tab') as TabValue | null;
  const activeTab: TabValue = (() => {
    if (!rawTab || !VALID_TABS.includes(rawTab)) return isPastEvent ? 'manage' : 'details';
    if (rawTab === 'certificates' && !isAdmin) return isPastEvent ? 'manage' : 'details';
    if (rawTab === 'scanner' && isPastEvent) return 'manage';
    return rawTab;
  })();

  const setActiveTab = useCallback(
    (tab: TabValue) => {
      setSearchParams({ tab }, { replace: true });
    },
    [setSearchParams],
  );

  const handleEndSession = useCallback(() => {
    setActiveTab('manage');
  }, [setActiveTab]);

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;
    const loadEvent = async () => {
      setLoading(true);
      setError(null);
      setHasCompetitionRounds(false);

      try {
        const [eventResult, competitionResult] = await Promise.allSettled([
          api.getEvent(eventId),
          isAdmin && token
            ? api.getCompetitionRoundsAdmin(eventId, token)
            : Promise.resolve({ rounds: [] }),
        ]);

        if (eventResult.status === 'rejected') {
          throw eventResult.reason;
        }

        if (!cancelled) {
          setEvent(eventResult.value);
          setHasCompetitionRounds(
            competitionResult.status === 'fulfilled'
            && competitionResult.value.rounds.some((round) => round.status === 'FINISHED'),
          );
        }
      } catch {
        if (!cancelled) setError('Event not found or failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadEvent();

    return () => {
      cancelled = true;
    };
  }, [eventId, isAdmin, token]);

  if (loading) {
    return (
      <div data-dashboard data-accent={accent} className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (error || !event || !eventId) {
    return (
      <div data-dashboard data-accent={accent} className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-[14px] text-[var(--ds-text-2)]">{error ?? 'Event not found.'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(backHref)} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to {backLabel}
        </Button>
      </div>
    );
  }

  const status = statusPillFor(event.status);
  const cover = fallbackGradient(event.title || 'event');

  // Build tabs dynamically — hide Scanner on past events, hide Certificates for non-admins.
  const tabs: Array<{ value: TabValue; label: string; icon?: React.ReactNode }> = [
    { value: 'details', label: 'Details', icon: <SettingsIcon className="h-3.5 w-3.5" /> },
  ];
  if (!isPastEvent) tabs.push({ value: 'scanner', label: 'Scanner', icon: <QrCode className="h-3.5 w-3.5" /> });
  tabs.push({ value: 'manage', label: 'Manage', icon: <Users className="h-3.5 w-3.5" /> });
  if (isAdmin) tabs.push({ value: 'certificates', label: 'Certificates', icon: <Award className="h-3.5 w-3.5" /> });

  return (
    <motion.div
      data-dashboard
      data-accent={accent}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-5"
    >
      {/* Header — design line 9-32: small back chevron + event cover/title/meta + status indicator */}
      <div>
        <button
          onClick={() => navigate(backHref)}
          className="inline-flex items-center gap-1 text-[12px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] mb-2 transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          {backLabel}
        </button>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {/* Event cover swatch */}
            <div className={`size-12 rounded-[10px] bg-gradient-to-br shrink-0 flex items-center justify-center text-white ${cover}`}>
              <Calendar className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight leading-tight text-[var(--ds-text-1)] truncate">
                {event.title}
              </h1>
              <div className="flex items-center gap-2 mt-1 text-[12px] text-[var(--ds-text-3)] flex-wrap">
                <Pill tone={status.tone} size="xs" dot={status.dot}>{status.label}</Pill>
                <span className="font-mono tabular-nums">
                  {formatDate(event.startDate)} · {formatTime(event.startDate)}
                </span>
                {(event.venue || event.location) && (
                  <>
                    <span className="h-3 w-px bg-[var(--border-default)]" />
                    <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {event.venue || event.location}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/events/${event.slug || event.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" className="gap-1.5">
                Event page
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <UnderlineTabs
        value={activeTab}
        onChange={(v) => setActiveTab(v as TabValue)}
        items={tabs}
      />

      {/* Tab content */}
      {activeTab === 'details' && (
        <DetailsTab
          event={event}
          isAdmin={isAdmin}
          isAdminPath={isAdminPath}
          isPastEvent={isPastEvent}
          eventId={eventId}
        />
      )}

      {activeTab === 'scanner' && !isPastEvent && (
        <ErrorBoundary resetKey={`${eventId}-scanner`}>
          <AdminScanner
            eventId={eventId}
            token={token!}
            onEndSession={handleEndSession}
          />
        </ErrorBoundary>
      )}

      {activeTab === 'manage' && (
        <ErrorBoundary resetKey={`${eventId}-manage`}>
          <AttendanceManager eventId={eventId} token={token!} />
        </ErrorBoundary>
      )}

      {activeTab === 'certificates' && isAdmin && (
        <ErrorBoundary resetKey={`${eventId}-certificates`}>
          <EventCertificateWizard
            eventId={eventId}
            eventName={event.title}
            token={token!}
            hasCompetitionRounds={hasCompetitionRounds}
          />
        </ErrorBoundary>
      )}
    </motion.div>
  );
}

// Details tab — design line 260-293: event info dl + quick actions card.
function DetailsTab({
  event,
  isAdmin,
  isAdminPath,
  isPastEvent,
  eventId,
}: {
  event: Event;
  isAdmin: boolean;
  isAdminPath: boolean;
  isPastEvent: boolean;
  eventId: string;
}) {
  const facts: Array<[string, React.ReactNode]> = [
    ['Status', <Pill key="s" tone={statusPillFor(event.status).tone} size="xs" dot={statusPillFor(event.status).dot}>{statusPillFor(event.status).label}</Pill>],
    ['Starts', formatDateTimeShort(event.startDate)],
  ];
  if (event.endDate) facts.push(['Ends', formatDateTimeShort(event.endDate)]);
  if (event.venue) facts.push(['Venue', event.venue]);
  if (event.location) facts.push(['Location', event.location]);
  if (event.eventDays && event.eventDays > 1) facts.push(['Days', String(event.eventDays)]);
  if (event.eventType) facts.push(['Type', event.eventType]);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <DSCard className="md:col-span-2">
        <div className="text-[13.5px] font-semibold mb-3 flex items-center gap-2">
          <SettingsIcon className="h-3.5 w-3.5 text-[var(--ds-text-3)]" />
          Event info
        </div>
        {isPastEvent && (
          <div className="mb-3 rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-[12px] text-[var(--warning)]">
            This event has ended. Use the <span className="font-semibold">Manage</span> tab to review,
            export, or correct attendance records.
          </div>
        )}
        <dl className="text-[13px] grid grid-cols-2 gap-y-2.5 gap-x-6">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[var(--ds-text-3)] text-[10.5px] uppercase tracking-[0.06em] font-semibold">{k}</dt>
              <dd className="text-[var(--ds-text-1)] font-medium mt-0.5">{v}</dd>
            </div>
          ))}
        </dl>
      </DSCard>

      <DSCard>
        <div className="text-[13.5px] font-semibold mb-2 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[var(--ds-text-3)]" />
          Quick actions
        </div>
        <div className="flex flex-col gap-1.5">
          {isAdminPath && isAdmin ? (
            <Link to={`/admin/events/${eventId}/edit`}>
              <Button variant="secondary" size="sm" className="justify-start w-full gap-1.5">
                <SettingsIcon className="h-3.5 w-3.5" />
                Edit event details
              </Button>
            </Link>
          ) : (
            <p className="text-[11.5px] text-[var(--ds-text-3)]">Contact an admin to edit event details.</p>
          )}
          <Link to={`/events/${event.slug || event.id}`} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm" className="justify-start w-full gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              View public page
            </Button>
          </Link>
        </div>
      </DSCard>
    </div>
  );
}

function formatDateTimeShort(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}
