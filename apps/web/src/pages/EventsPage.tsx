import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  MapPin,
  Users,
  Loader2,
  Clock,
  CheckCircle,
  LogIn,
  ArrowRight,
  Star,
  Sparkles,
  CalendarRange,
  Search,
} from 'lucide-react';
import { api, type Event } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { formatDate, getMonthShort, getDayOfMonth } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { getRegistrationStatus } from '@/lib/registrationStatus';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type EventStatus = 'UPCOMING' | 'ONGOING' | 'PAST';
type FilterKey = EventStatus | 'ALL';

const TAB_DEFS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'ONGOING', label: 'Live' },
  { key: 'PAST', label: 'Past' },
];

function statusChipClass(status: EventStatus): string {
  switch (status) {
    case 'ONGOING':
      return 'bg-emerald-500 text-white shadow-emerald-500/25';
    case 'UPCOMING':
      return 'bg-amber-500 text-white shadow-amber-500/25';
    case 'PAST':
    default:
      return 'bg-stone-700/90 text-white';
  }
}

function statusLabel(status: EventStatus): string {
  if (status === 'ONGOING') return 'Live now';
  if (status === 'UPCOMING') return 'Upcoming';
  return 'Concluded';
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-amber-200/70 bg-white dark:border-zinc-800 dark:bg-[#0d1017]">
      <div className="aspect-[16/10] bg-gradient-to-br from-amber-100 to-orange-100 dark:from-[#1a140b] dark:to-[#131019] animate-pulse" />
      <div className="p-5 space-y-3">
        <div className="h-4 w-3/4 rounded bg-amber-100 dark:bg-[#1a140b] animate-pulse" />
        <div className="h-3 w-full rounded bg-amber-50 dark:bg-[#11151e] animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-amber-50 dark:bg-[#11151e] animate-pulse" />
        <div className="h-9 w-full rounded-lg bg-amber-100 dark:bg-[#1a140b] animate-pulse mt-4" />
      </div>
    </div>
  );
}

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<FilterKey>('ALL');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const { user, token } = useAuth();
  const navigate = useNavigate();

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const eventsData = await api.getEvents();
      setEvents(eventsData);

      if (token) {
        try {
          const registrations = await api.getMyRegistrations(token);
          setRegisteredEventIds(new Set(registrations.map(r => r.eventId)));
        } catch {
          toast.error('Could not load your event registrations');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load events';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleRegister = async (event: Event) => {
    const regStatus = getRegistrationStatus(event);

    if (!regStatus.canRegister) {
      toast.error(regStatus.message);
      return;
    }

    if (!user || !token) {
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      navigate('/signin', { state: { from: '/events', message: 'Please sign in to register for events', pendingEventId: event.id } });
      return;
    }

    if (user.role === 'NETWORK') {
      try {
        const eventDetail = await api.getEvent(event.id, token);
        if (eventDetail.userInvitation?.status === 'PENDING') {
          toast.info('You already have a guest invitation for this event. Accept it to continue.');
          navigate(`/dashboard/invitations/${eventDetail.userInvitation.id}`);
          return;
        }
      } catch {
        // fall through
      }
    }

    if (!user.phone || !user.course || !user.branch || !user.year) {
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      navigate('/dashboard/profile', { state: { message: 'Please complete your profile to register for events', pendingEventId: event.id } });
      return;
    }

    if (event.teamRegistration) {
      navigate(`/events/${event.slug || event.id}`);
      return;
    }

    if (event.registrationFields && event.registrationFields.length > 0) {
      localStorage.setItem('pendingEventRegistrationType', 'solo');
      navigate(`/events/${event.slug || event.id}?register=1`);
      return;
    }

    try {
      setRegistering(event.id);
      await api.registerForEvent(event.id, token);
      toast.success(`Successfully registered for "${event.title}"!`);

      await loadEvents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setRegistering(null);
    }
  };

  const counts = useMemo(() => {
    const byStatus = { UPCOMING: 0, ONGOING: 0, PAST: 0 } as Record<EventStatus, number>;
    for (const e of events) byStatus[e.status as EventStatus] += 1;
    return { ALL: events.length, ...byStatus };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const base = activeTab === 'ALL' ? events : events.filter(e => e.status === activeTab);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(e => {
      const haystack = [
        e.title,
        e.shortDescription,
        e.description,
        e.location,
        e.venue,
        e.eventType,
        ...(e.tags || []),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [activeTab, events, query]);

  // Featured spotlight: a single featured upcoming/ongoing event, only on ALL tab and when no search
  const spotlight = useMemo(() => {
    if (activeTab !== 'ALL' || query.trim()) return null;
    const featured = events.find(e => e.featured && (e.status === 'UPCOMING' || e.status === 'ONGOING'));
    return featured || null;
  }, [activeTab, events, query]);

  return (
    <Layout>
      <SEO
        title="Events"
        description="Explore upcoming and past events from codescriet — hackathons, workshops, and tech events at SCRIET."
        url="/events"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Events', url: 'https://codescriet.dev/events' },
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 border-b border-amber-200/60">
        {/* Decorative orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(60% 60% at 15% 20%, rgba(251,191,36,0.35) 0%, transparent 60%), radial-gradient(50% 50% at 85% 80%, rgba(249,115,22,0.28) 0%, transparent 60%)',
          }}
        />
        {/* Subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(120,53,15,1) 1px, transparent 1px), linear-gradient(90deg, rgba(120,53,15,1) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />

        <div className="relative container mx-auto px-4 py-16 sm:py-20 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-900 text-[11.5px] font-medium tracking-wide uppercase mb-5">
              <Sparkles className="h-3 w-3" />
              code.scriet events
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-stone-900 tracking-tight leading-[1.05]">
              Where curiosity meets <span className="italic font-serif text-amber-700">code</span>.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-stone-700 max-w-2xl leading-relaxed">
              Workshops, hackathons, talks, and labs — built by the club, open to everyone.
              Browse what's coming up and reserve your spot.
            </p>

            {/* Stat strip */}
            {!loading && (
              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/70 backdrop-blur border border-amber-200 text-stone-700 text-[12.5px] font-medium dark:bg-[#0d1017]/70 dark:border-amber-900/40 dark:text-zinc-300">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  {counts.UPCOMING} upcoming
                </span>
                {counts.ONGOING > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/70 backdrop-blur border border-emerald-200 text-emerald-800 text-[12.5px] font-medium dark:bg-[#0d1017]/70 dark:border-emerald-900/40 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {counts.ONGOING} live now
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/70 backdrop-blur border border-stone-200 text-stone-600 text-[12.5px] font-medium dark:bg-[#0d1017]/70 dark:border-zinc-800 dark:text-zinc-400">
                  <CalendarRange className="h-3.5 w-3.5" />
                  {counts.PAST} in the archive
                </span>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Sticky filter + search */}
      <section className="bg-white/85 backdrop-blur-md border-b border-amber-200/70 sticky top-under-header z-40 dark:bg-[#07090f]/85 dark:border-zinc-800">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Segmented filter pills */}
            <div className="no-scrollbar -mx-1 flex flex-nowrap items-center gap-1 overflow-x-auto bg-amber-50 rounded-full p-1 ring-1 ring-amber-200/70 dark:bg-[#1a140b] dark:ring-amber-900/40 sm:mx-0">
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.key;
                const count = counts[tab.key];
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'relative shrink-0 inline-flex items-center gap-2 px-3.5 sm:px-4 h-9 rounded-full text-[13px] font-medium transition-colors',
                      isActive
                        ? 'text-stone-900'
                        : 'text-stone-600 hover:text-stone-900',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="event-tab-pill"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-amber-300/60 dark:bg-[#0d1017] dark:ring-amber-900/50 dark:shadow-black/30"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                    <span
                      className={cn(
                        'relative z-10 inline-flex items-center justify-center min-w-[20px] px-1.5 h-[18px] rounded-full text-[10.5px] font-semibold tabular-nums',
                        isActive ? 'bg-amber-500/15 text-amber-800' : 'bg-stone-200/70 text-stone-600',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative sm:ml-auto sm:max-w-[300px] w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, tags, venues…"
                className="w-full h-9 pl-9 pr-3 rounded-full bg-amber-50/60 border border-amber-200/70 text-[13px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 dark:bg-[#1a140b]/60 dark:border-amber-900/40 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-amber-900/40 dark:focus:border-amber-900/40"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="py-10 sm:py-14 bg-gradient-to-b from-amber-50/40 to-white min-h-[60vh] dark:from-[#07090f]/40 dark:to-[#07090f]">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : error ? (
            <div className="text-center py-24">
              <p className="text-red-600 font-medium">{error}</p>
              <Button onClick={() => void loadEvents()} className="mt-4">
                Try again
              </Button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-24 max-w-md mx-auto">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 mb-4">
                <CalendarRange className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900">
                {query.trim()
                  ? 'No events match that search'
                  : activeTab === 'ALL'
                    ? 'No events yet'
                    : `No ${activeTab.toLowerCase()} events`}
              </h3>
              <p className="text-stone-500 text-sm mt-1.5">
                {query.trim()
                  ? 'Try a different keyword or clear the search to see everything.'
                  : 'Check back soon — the club calendar fills up fast.'}
              </p>
              {query.trim() && (
                <Button variant="outline" className="mt-5" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Featured spotlight */}
              {spotlight && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="mb-10"
                >
                  <SpotlightCard
                    event={spotlight}
                    user={user}
                    isRegistered={registeredEventIds.has(spotlight.id)}
                    registering={registering === spotlight.id}
                    onRegister={() => void handleRegister(spotlight)}
                  />
                </motion.div>
              )}

              {/* Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-7">
                {filteredEvents
                  .filter(e => !spotlight || e.id !== spotlight.id)
                  .map((event, index) => {
                    const regStatus = getRegistrationStatus(event);
                    const eventHref = `/events/${event.slug || event.id}`;
                    const isRegistered = registeredEventIds.has(event.id);
                    const monthShort = getMonthShort(event.startDate);
                    const day = getDayOfMonth(event.startDate);

                    return (
                      <motion.article
                        key={event.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.3) }}
                        className="group relative flex flex-col rounded-2xl overflow-hidden bg-white border border-amber-200/60 hover:border-amber-300 shadow-[0_1px_3px_rgba(120,53,15,0.04)] hover:shadow-[0_18px_36px_-18px_rgba(120,53,15,0.30)] transition-all duration-300 hover:-translate-y-0.5 dark:bg-[#0d1017] dark:border-amber-900/40 dark:hover:border-amber-900/60 dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_18px_36px_-18px_rgba(0,0,0,0.8)]"
                      >
                        <Link to={eventHref} className="block relative">
                          <div className="relative overflow-hidden bg-gradient-to-br from-amber-200 to-orange-200 aspect-[16/10]">
                            {event.imageUrl ? (
                              <img
                                src={processImageUrl(event.imageUrl, 'card')}
                                alt={event.title}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Calendar className="h-16 w-16 text-amber-400/70" />
                              </div>
                            )}
                            {/* Vignette for badge legibility */}
                            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent pointer-events-none" />

                            {/* Date badge — top-left */}
                            {day !== null && (
                              <div className="absolute top-3 left-3 flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-white/95 backdrop-blur shadow-md ring-1 ring-black/5 dark:bg-[#0d1017]/95 dark:shadow-black/50 dark:ring-zinc-700/40">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">{monthShort}</span>
                                <span className="text-[16px] font-bold leading-none text-stone-900 dark:text-zinc-100">{day}</span>
                              </div>
                            )}

                            {/* Status + featured — top-right */}
                            <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
                              <span className={cn(
                                'inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-[10.5px] font-semibold tracking-wide uppercase shadow-sm',
                                statusChipClass(event.status as EventStatus),
                              )}>
                                {event.status === 'ONGOING' && <span className="size-1.5 rounded-full bg-white animate-pulse" />}
                                {statusLabel(event.status as EventStatus)}
                              </span>
                              {event.featured && (
                                <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-white/95 text-amber-700 text-[10.5px] font-semibold shadow-sm dark:bg-[#0d1017]/95 dark:text-amber-300 dark:shadow-black/50">
                                  <Star className="h-2.5 w-2.5 fill-current" />
                                  Featured
                                </span>
                              )}
                            </div>

                            {/* Type chip — bottom-left */}
                            {event.eventType && (
                              <div className="absolute bottom-3 left-3">
                                <span className="inline-flex items-center px-2 h-6 rounded-md bg-black/55 backdrop-blur text-white text-[10.5px] font-medium tracking-wide">
                                  {event.eventType}
                                </span>
                              </div>
                            )}
                          </div>
                        </Link>

                        <div className="flex flex-col flex-1 p-5">
                          <Link to={eventHref} className="block">
                            <h3 className="text-[17px] font-semibold text-stone-900 leading-snug tracking-tight group-hover:text-amber-700 transition-colors line-clamp-2 dark:text-zinc-100 dark:group-hover:text-amber-300">
                              {event.title}
                            </h3>
                          </Link>
                          {(event.shortDescription || event.description) && (
                            <p className="mt-1.5 text-[13px] text-stone-600 leading-relaxed line-clamp-2 dark:text-zinc-400">
                              {event.shortDescription || event.description}
                            </p>
                          )}

                          {/* Meta */}
                          <dl className="mt-4 space-y-1.5 text-[12.5px] text-stone-600 dark:text-zinc-400">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-amber-600/80 shrink-0" />
                              <span className="truncate">
                                {formatDate(event.startDate, 'short')}
                                {event.endDate && ` — ${formatDate(event.endDate, 'short')}`}
                              </span>
                            </div>
                            {(event.location || event.venue) && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 text-amber-600/80 shrink-0" />
                                <span className="truncate">
                                  {event.venue || event.location}
                                </span>
                              </div>
                            )}
                            {event.teamRegistration && (
                              <div className="flex items-center gap-2">
                                <Users className="h-3.5 w-3.5 text-amber-600/80 shrink-0" />
                                <span>Team · {event.teamMinSize}–{event.teamMaxSize} members</span>
                              </div>
                            )}
                          </dl>

                          {/* Registration status hint */}
                          <div className={cn(
                            'mt-4 inline-flex items-center gap-1.5 self-start px-2.5 h-6 rounded-md text-[11px] font-medium',
                            regStatus.status === 'open' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
                            regStatus.status === 'not_started' && 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
                            (regStatus.status === 'closed' || regStatus.status === 'full' || regStatus.status === 'past') && 'bg-stone-100 text-stone-500 ring-1 ring-stone-200',
                          )}>
                            <Clock className="h-3 w-3" />
                            {regStatus.message}
                          </div>

                          {/* Spacer + single primary CTA */}
                          <div className="mt-5 pt-4 border-t border-amber-100 flex items-center gap-3">
                            {renderPrimaryCTA({
                              event,
                              regStatus,
                              isRegistered,
                              registering: registering === event.id,
                              user,
                              onRegister: () => void handleRegister(event),
                              onSignIn: () => navigate('/signin', { state: { from: '/events' } }),
                            })}
                            <Link
                              to={eventHref}
                              aria-label={`View details for ${event.title}`}
                              className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — kept in-file because they're small and only used here.

function renderPrimaryCTA(args: {
  event: Event;
  regStatus: ReturnType<typeof getRegistrationStatus>;
  isRegistered: boolean;
  registering: boolean;
  user: ReturnType<typeof useAuth>['user'];
  onRegister: () => void;
  onSignIn: () => void;
}) {
  const { event, regStatus, isRegistered, registering, user, onRegister, onSignIn } = args;

  if (isRegistered) {
    return (
      <Button
        variant="secondary"
        className="flex-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-default"
        disabled
      >
        <CheckCircle className="h-4 w-4 mr-2" />
        Registered
      </Button>
    );
  }

  if (event.status === 'PAST') {
    return (
      <Button variant="outline" className="flex-1" disabled>
        Event ended
      </Button>
    );
  }

  if (!regStatus.canRegister) {
    return (
      <Button variant="outline" className="flex-1" disabled>
        {event.status === 'ONGOING' ? 'In progress' : regStatus.message}
      </Button>
    );
  }

  if (!user) {
    return (
      <Button variant="outline" className="flex-1" onClick={onSignIn}>
        <LogIn className="h-4 w-4 mr-2" />
        Sign in to register
      </Button>
    );
  }

  return (
    <Button
      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
      onClick={onRegister}
      disabled={registering}
    >
      {registering ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Registering…
        </>
      ) : (
        <>Register{event.teamRegistration ? ' team' : ''}</>
      )}
    </Button>
  );
}

function SpotlightCard({
  event,
  user,
  isRegistered,
  registering,
  onRegister,
}: {
  event: Event;
  user: ReturnType<typeof useAuth>['user'];
  isRegistered: boolean;
  registering: boolean;
  onRegister: () => void;
}) {
  const navigate = useNavigate();
  const regStatus = getRegistrationStatus(event);
  const eventHref = `/events/${event.slug || event.id}`;
  const day = getDayOfMonth(event.startDate);
  const monthShort = getMonthShort(event.startDate);

  return (
    <article className="relative rounded-3xl overflow-hidden border border-amber-200/70 bg-white shadow-[0_24px_60px_-30px_rgba(120,53,15,0.35)] dark:bg-[#0d1017] dark:border-amber-900/40 dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
      <div className="grid lg:grid-cols-5 gap-0">
        {/* Image */}
        <Link to={eventHref} className="relative lg:col-span-3 block aspect-[16/10] lg:aspect-auto lg:min-h-[340px] bg-gradient-to-br from-amber-200 to-orange-300 dark:from-[#1a140b] dark:to-[#131019] overflow-hidden">
          {event.imageUrl ? (
            <img
              src={processImageUrl(event.imageUrl, 'card')}
              alt={event.title}
              loading="eager"
              className="absolute inset-0 w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700 ease-out"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Calendar className="h-24 w-24 text-amber-400/80" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-transparent pointer-events-none" />
          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 h-7 rounded-full bg-amber-500 text-white text-[11px] font-bold uppercase tracking-wider shadow-md">
            <Star className="h-3 w-3 fill-current" /> Featured
          </span>
          {day !== null && (
            <div className="absolute bottom-4 left-4 flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-white/95 backdrop-blur shadow-lg ring-1 ring-black/5 dark:bg-[#0d1017]/95 dark:shadow-black/50 dark:ring-zinc-700/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">{monthShort}</span>
              <span className="text-[22px] font-bold leading-none text-stone-900 dark:text-zinc-100">{day}</span>
            </div>
          )}
        </Link>

        {/* Content */}
        <div className="lg:col-span-2 p-6 sm:p-8 flex flex-col dark:border-l-amber-900/40">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={cn(
              'inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-[10.5px] font-semibold tracking-wide uppercase',
              statusChipClass(event.status as EventStatus),
            )}>
              {event.status === 'ONGOING' && <span className="size-1.5 rounded-full bg-white animate-pulse dark:bg-zinc-100" />}
              {statusLabel(event.status as EventStatus)}
            </span>
            {event.eventType && (
              <span className="inline-flex items-center px-2 h-6 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] font-medium dark:bg-[#1a140b] dark:border-amber-900/40 dark:text-amber-300">
                {event.eventType}
              </span>
            )}
          </div>
          <Link to={eventHref}>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight leading-tight hover:text-amber-700 transition-colors dark:text-zinc-100 dark:hover:text-amber-300">
              {event.title}
            </h2>
          </Link>
          {(event.shortDescription || event.description) && (
            <p className="mt-3 text-[14px] text-stone-600 leading-relaxed line-clamp-3 dark:text-zinc-400">
              {event.shortDescription || event.description}
            </p>
          )}

          <dl className="mt-5 space-y-2 text-[13px] text-stone-700 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600 shrink-0 dark:text-amber-400" />
              <span>
                {formatDate(event.startDate, 'short')}
                {event.endDate && ` — ${formatDate(event.endDate, 'short')}`}
              </span>
            </div>
            {(event.location || event.venue) && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-600 shrink-0 dark:text-amber-400" />
                <span className="truncate">{event.venue || event.location}</span>
              </div>
            )}
            {event.teamRegistration && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-600 shrink-0 dark:text-amber-400" />
                <span>Team · {event.teamMinSize}–{event.teamMaxSize} members</span>
              </div>
            )}
          </dl>

          <div className="mt-auto pt-6 flex flex-col sm:flex-row gap-2.5">
            {renderPrimaryCTA({
              event,
              regStatus,
              isRegistered,
              registering,
              user,
              onRegister,
              onSignIn: () => navigate('/signin', { state: { from: '/events' } }),
            })}
            <Button asChild variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-[#1a140b]">
              <Link to={eventHref}>
                View details
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
