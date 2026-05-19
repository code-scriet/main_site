// Dashboard v2 — My Events.
// Filter chips (All/Upcoming/Ongoing/Past/Team/Solo/Guest) + responsive card grid.
// Ticket "QR" opens a Sheet with the QRTicket component.
// Design source: screen-events.jsx:3-131.

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, MapPin, Calendar, Check, QrCode, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type Registration, type Event as EventT } from '@/lib/api';
import { DSCard, EmptyState, Pill, ProgressBar, Section } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { QRTicketSheet } from '@/components/attendance/QRTicket';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { extractApiErrorMessage } from '@/lib/error';

type FilterId = 'all' | 'upcoming' | 'ongoing' | 'past' | 'team' | 'solo' | 'guest';

export default function DashboardEvents() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterId>('all');
  const [ticketEventId, setTicketEventId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Registration | null>(null);

  const cancelMut = useMutation({
    mutationFn: (eventId: string) => api.cancelRegistration(eventId, token!),
    onSuccess: () => {
      toast.success('Registration cancelled');
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ['my-registrations'] });
    },
    onError: (err: unknown) => {
      const msg = extractApiErrorMessage(err, err instanceof Error ? err.message : 'Cancel failed');
      // Server rejects leader cancellations with a specific message; surface the actionable copy.
      if (/team leader/i.test(msg) || /leader.+cancel/i.test(msg)) {
        toast.error('You are the team leader. Transfer leadership or dissolve the team before cancelling.');
      } else {
        toast.error(msg);
      }
    },
  });

  // Pre-check: for team events, look up the user's team to detect leader before opening the dialog.
  // Falls through to server enforcement if the lookup fails.
  const requestCancel = async (registration: Registration) => {
    const eventId = registration.event.id;
    const isTeamEvent = Boolean(registration.event.teamRegistration);
    if (isTeamEvent && token) {
      try {
        const team = await api.getMyTeam(eventId, token);
        if (team?.isLeader) {
          toast.error('You are the team leader. Transfer leadership or dissolve the team before cancelling.');
          return;
        }
      } catch {
        /* fall through to confirm dialog and rely on server-side check */
      }
    }
    setCancelTarget(registration);
  };

  // Fallback: if any legacy surface still navigates here with `state.openQrForEventId`,
  // open the sheet for that event. Then strip the state so back-nav doesn't re-fire.
  useEffect(() => {
    const state = location.state as { openQrForEventId?: string } | null;
    const target = state?.openQrForEventId;
    if (target) {
      setTicketEventId(target);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const regsQ = useQuery({
    queryKey: ['my-registrations'],
    queryFn: () => api.getMyRegistrations(token!),
    enabled: Boolean(token),
  });

  const all = regsQ.data ?? [];

  const counts = useMemo(() => ({
    all: all.length,
    upcoming: all.filter((r) => r.event?.status === 'UPCOMING').length,
    ongoing: all.filter((r) => r.event?.status === 'ONGOING').length,
    past: all.filter((r) => r.event?.status === 'PAST').length,
    team: all.filter((r) => r.event?.teamRegistration).length,
    solo: all.filter((r) => !r.event?.teamRegistration).length,
    guest: all.filter((r) => (r as Registration & { registrationType?: string }).registrationType === 'GUEST').length,
  }), [all]);

  const filtered = useMemo(() => {
    return all.filter((r) => {
      if (!r.event) return false;
      const e = r.event;
      const type = (r as Registration & { registrationType?: string }).registrationType;
      switch (filter) {
        case 'all': return true;
        case 'upcoming': return e.status === 'UPCOMING';
        case 'ongoing': return e.status === 'ONGOING';
        case 'past': return e.status === 'PAST';
        case 'team': return e.teamRegistration === true;
        case 'solo': return !e.teamRegistration;
        case 'guest': return type === 'GUEST';
        default: return true;
      }
    });
  }, [all, filter]);

  const filters: Array<{ id: FilterId; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'ongoing', label: 'Live' },
    { id: 'past', label: 'Past' },
    { id: 'team', label: 'Team' },
    { id: 'solo', label: 'Solo' },
    { id: 'guest', label: 'As guest' },
  ];

  const ticketRegistration = ticketEventId ? all.find((r) => r.event?.id === ticketEventId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">My events</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 whitespace-nowrap">
            <span className="font-mono tabular-nums text-[var(--ds-text-2)]">{counts.all}</span> registered
            {' · '}
            <span className="font-mono tabular-nums text-[var(--ds-text-2)]">{counts.upcoming}</span> upcoming
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/events')}>
          <Search size={13} className="mr-1.5" />
          Browse all events
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'h-7 px-2.5 text-[12px] font-medium rounded-[6px] transition-colors',
                active
                  ? 'bg-[var(--ds-text-1)] text-[var(--ds-text-inverse)]'
                  : 'bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:bg-[var(--bg-sunken)]',
              )}
            >
              {f.label}
              <span className={cn('ml-1.5 tabular-nums text-[10.5px]', active ? 'opacity-70' : 'opacity-50')}>
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {regsQ.isLoading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[280px] bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Calendar size={18} />}
            title={filter === 'all' ? "You haven't joined any events yet" : 'No events match this filter'}
            body="Browse the public events list and register for your first one."
            action={<Button size="sm" onClick={() => navigate('/events')}>Browse upcoming events</Button>}
          />
        </DSCard>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <EventCard
              key={r.id}
              registration={r}
              onOpen={() => navigate(`/events/${r.event.slug || r.event.id}`)}
              onTicket={() => setTicketEventId(r.event.id)}
              onCancel={() => void requestCancel(r)}
            />
          ))}
        </div>
      )}

      {/* QR ticket sheet */}
      {ticketRegistration && (
        <QRTicketSheet
          open={Boolean(ticketEventId)}
          onOpenChange={(open) => !open && setTicketEventId(null)}
          event={{
            title: ticketRegistration.event.title,
            startDate: ticketRegistration.event.startDate,
            endDate: ticketRegistration.event.endDate ?? null,
            status: ticketRegistration.event.status,
            eventType: (ticketRegistration.event as EventT).eventType || undefined,
          }}
          attendanceToken={ticketRegistration.attendanceToken ?? null}
          attended={ticketRegistration.attended ?? false}
          scannedAt={ticketRegistration.scannedAt ?? null}
          eventDays={(ticketRegistration.event as EventT).eventDays ?? 1}
          dayLabels={(ticketRegistration.event as EventT).dayLabels as string[] | undefined}
        />
      )}

      {/* Cancel-registration confirm — restored from HEAD */}
      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel registration for &ldquo;{cancelTarget?.event.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              You can re-register later if seats are still available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep registration</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && cancelMut.mutate(cancelTarget.event.id)}
              disabled={cancelMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {cancelMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Cancel registration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const COVERS = [
  'from-orange-500 to-red-600',
  'from-violet-500 to-fuchsia-600',
  'from-teal-500 to-cyan-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
];

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 7) % COVERS.length;
  return COVERS[h];
}

function EventCard({
  registration, onOpen, onTicket, onCancel,
}: {
  registration: Registration;
  onOpen: () => void;
  onTicket: () => void;
  onCancel: () => void;
}) {
  const e = registration.event;
  const status = e.status ?? 'UPCOMING';
  const startDate = e.startDate ? new Date(e.startDate) : null;
  const dateStr = startDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const timeStr = startDate?.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const ticketAvailable = status !== 'PAST';
  const team = e.teamRegistration;
  const teamSize = team ? `${e.teamMinSize ?? 1}–${e.teamMaxSize ?? 4}` : null;
  const registered = (e as EventT & { registered?: number; registeredCount?: number }).registered ?? (e as EventT & { registered?: number; registeredCount?: number }).registeredCount ?? 0;
  const capacity = e.capacity ?? 0;
  const cover = e.imageUrl;

  return (
    <DSCard padded={false} hover className="overflow-hidden cursor-pointer flex flex-col" onClick={onOpen}>
      <div
        className={cn(
          'h-[110px] relative bg-gradient-to-br',
          !cover && gradientFor(e.id),
        )}
        style={cover ? { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 whitespace-nowrap">
          <Pill
            tone={status === 'ONGOING' ? 'success' : status === 'UPCOMING' ? 'info' : 'neutral'}
            size="xs"
            dot={status === 'ONGOING'}
          >
            {status === 'ONGOING' ? 'Live now' : status === 'UPCOMING' ? 'Upcoming' : 'Past'}
          </Pill>
          {team && <Pill tone="neutral" size="xs">Team · {teamSize}</Pill>}
          <Pill tone="success" size="xs" icon={<Check size={9} />}>{' '}</Pill>
        </div>
        <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
          <div className="text-[11px] opacity-90 mb-0.5 font-mono tabular-nums">
            {dateStr} · {timeStr}
          </div>
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14.5px] font-semibold leading-tight line-clamp-1 flex-1">{e.title}</h3>
          {e.eventType && <Pill tone="neutral" size="xs">{e.eventType}</Pill>}
        </div>
        {e.shortDescription && (
          <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1.5 leading-snug line-clamp-2">{e.shortDescription}</p>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ds-text-3)]">
            <MapPin size={11} />
            <span className="truncate max-w-[110px]">{e.venue || e.location || '—'}</span>
          </div>
          {capacity > 0 && (
            <div className="flex items-center gap-1.5">
              <ProgressBar value={registered} max={capacity} className="w-[60px]" />
              <span className="text-[11px] font-mono tabular-nums text-[var(--ds-text-3)]">
                <span className="text-[var(--ds-text-2)]">{registered}</span>/{capacity}
              </span>
            </div>
          )}
        </div>

        {/* Multi-day strip if applicable */}
        {(e.eventDays ?? 1) > 1 && (
          <div className="flex items-center gap-1 mt-3">
            {Array.from({ length: e.eventDays ?? 1 }, (_, i) => {
              const attended = ((registration as Registration & { daysAttended?: number }).daysAttended ?? 0) > i;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={cn('h-[3px] rounded-full w-full', attended ? 'bg-[var(--success)]' : 'bg-[var(--border-default)]')} />
                  <span className="text-[9px] text-[var(--ds-text-3)] font-mono tabular-nums">D{i + 1}</span>
                </div>
              );
            })}
          </div>
        )}

        {ticketAvailable && (
          <div className="flex items-center gap-1.5 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={(ev) => {
                ev.stopPropagation();
                onTicket();
              }}
            >
              <QrCode size={13} className="mr-1.5" />
              View ticket
            </Button>
            {status === 'UPCOMING' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onCancel();
                }}
                title="Cancel registration"
                className="text-[var(--ds-text-3)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
              >
                <X size={13} />
              </Button>
            )}
          </div>
        )}
      </div>
    </DSCard>
  );
}

// silence unused (Section reserved for follow-up)
void Section;
