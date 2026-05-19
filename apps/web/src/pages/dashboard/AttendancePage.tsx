// Dashboard v2 — Take Attendance landing page (core-member shortcut).
// Lists active + upcoming events that the caller can scan attendance for; jumps to the
// EventAdminHub Scanner tab. Past events are listed under a smaller section.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ScanLine, Calendar, Search, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type Event } from '@/lib/api';
import { DSCard, EmptyState, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Derives the effective event status from clock time, independent of the DB-stored
// `status` column. The background status scheduler is off by default on the free tier,
// so a stale UPCOMING flag would otherwise bury an ONGOING event under the wrong section.
function computeEffectiveStatus(event: Event): 'UPCOMING' | 'ONGOING' | 'PAST' {
  const now = Date.now();
  const start = event.startDate ? new Date(event.startDate).getTime() : null;
  const end = event.endDate ? new Date(event.endDate).getTime() : null;
  if (start != null && start > now) return 'UPCOMING';
  if (end != null && end < now) return 'PAST';
  // No end-date events default to 4h after start before flipping to PAST.
  if (start != null && end == null) {
    return now - start > 4 * 60 * 60 * 1000 ? 'PAST' : 'ONGOING';
  }
  if (start != null) return 'ONGOING';
  // No dates at all — fall back to DB status, then UPCOMING.
  return event.status ?? 'UPCOMING';
}

// Comparator that sorts ONGOING first, then UPCOMING (by start asc), then PAST (by start desc).
function compareAttendanceEvents(a: Event, b: Event): number {
  const orderRank: Record<'UPCOMING' | 'ONGOING' | 'PAST', number> = { ONGOING: 0, UPCOMING: 1, PAST: 2 };
  const sa = computeEffectiveStatus(a);
  const sb = computeEffectiveStatus(b);
  if (sa !== sb) return orderRank[sa] - orderRank[sb];
  const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
  const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
  return sa === 'PAST' ? tb - ta : ta - tb;
}

export default function AttendancePage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';

  const eventsQ = useQuery({
    queryKey: ['events', 'attendance-picker'],
    queryFn: () => api.getEvents(),
    enabled: Boolean(token),
  });

  const all = useMemo(() => (eventsQ.data ?? []).slice().sort(compareAttendanceEvents), [eventsQ.data]);
  const filtered = useMemo(
    () => all.filter((e) => e.title.toLowerCase().includes(search.toLowerCase())),
    [all, search],
  );
  // Bucket using the live computed status so stale DB rows don't misplace events.
  const active = filtered.filter((e) => computeEffectiveStatus(e) !== 'PAST');
  const past = filtered.filter((e) => computeEffectiveStatus(e) === 'PAST');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Core member</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Take attendance</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 max-w-prose">
            Pick an event to open its scanner. Scans queue offline and sync automatically when you reconnect.
          </p>
        </div>
        <div className="relative w-full sm:w-[260px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find an event…"
            className="pl-8 h-8 text-[13px]"
          />
        </div>
      </div>

      {eventsQ.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[120px] bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
          ))}
        </div>
      ) : active.length === 0 && past.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Calendar size={18} />}
            title="No events found"
            body="There are no events to take attendance for. Create one or wait for an event to go live."
          />
        </DSCard>
      ) : (
        <>
          <Section eyebrow="Live & upcoming" title={`${active.length} ${active.length === 1 ? 'event' : 'events'}`}>
            {active.length === 0 ? (
              <DSCard padded>
                <EmptyState title="Nothing live right now" body="When an event goes live, it appears here." />
              </DSCard>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {active.map((e) => (
                  <EventPickerCard
                    key={e.id}
                    title={e.title}
                    status={computeEffectiveStatus(e)}
                    startDate={e.startDate}
                    venue={e.venue || e.location || null}
                    onPick={() =>
                      navigate(
                        isAdmin
                          ? `/admin/events/${e.id}/attendance?tab=scanner`
                          : `/dashboard/events/${e.id}/attendance?tab=scanner`,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          {past.length > 0 && (
            <Section eyebrow="Past" title={`${past.length} events`}>
              <DSCard padded={false}>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {past.slice(0, 12).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          isAdmin
                            ? `/admin/events/${e.id}/attendance?tab=manage`
                            : `/dashboard/events/${e.id}/attendance?tab=manage`,
                        )
                      }
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--surface-soft)] text-left transition-colors"
                    >
                      <Pill tone="neutral" size="xs">Past</Pill>
                      <span className="flex-1 truncate text-[13px] font-medium">{e.title}</span>
                      <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
                        {new Date(e.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <ChevronRight size={14} className="text-[var(--ds-text-3)]" />
                    </button>
                  ))}
                </div>
              </DSCard>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function EventPickerCard({
  title, status, startDate, venue, onPick,
}: {
  title: string;
  status: string;
  startDate: string;
  venue: string | null;
  onPick: () => void;
}) {
  return (
    <DSCard padded hover onClick={onPick} className="cursor-pointer flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Pill
          tone={status === 'ONGOING' ? 'success' : 'info'}
          size="xs"
          dot={status === 'ONGOING'}
        >
          {status === 'ONGOING' ? 'Live now' : 'Upcoming'}
        </Pill>
        <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
          {new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div>
        <div className="text-[14.5px] font-semibold leading-tight truncate">{title}</div>
        {venue && <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5 truncate">{venue}</div>}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12.5px] font-medium bg-[var(--accent)] text-[var(--accent-fg)]')}>
          <ScanLine size={13} />
          Open scanner
        </span>
      </div>
    </DSCard>
  );
}
