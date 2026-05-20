// Dashboard v2 — Admin · Event Registrations.
// Per-event cards with registered / attended / teams counts + Manage / Export / Email actions.
// Pixel-port of screen-admin2.jsx:388 (AdminRegistrationsScreen).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Download, Mail, Loader2, Calendar, Filter, RotateCcw, RefreshCw, Pencil, Trash2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/context/AuthContext';
import { api, type Event as EventT, type EventRegistrationExportFilters, type RegistrationType } from '@/lib/api';
import { DSCard, EmptyState, Field, Pill, ProgressBar, SegmentedTabs, Section } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ExportFormat = 'xlsx' | 'csv';
interface ExportFilterState extends EventRegistrationExportFilters {
  format: ExportFormat;
}

const DEFAULT_EXPORT_FILTERS: ExportFilterState = {
  format: 'xlsx',
  registrationType: undefined,
  year: '',
  branch: '',
  course: '',
  userRole: '',
  search: '',
};

function hasActiveExportFilters(f: ExportFilterState): boolean {
  return Boolean(
    f.registrationType || (f.year ?? '').trim() || (f.branch ?? '').trim()
    || (f.course ?? '').trim() || (f.userRole ?? '').trim() || (f.search ?? '').trim(),
  );
}

function countActiveExportFilters(f: ExportFilterState): number {
  let n = 0;
  if (f.registrationType) n++;
  if ((f.year ?? '').trim()) n++;
  if ((f.branch ?? '').trim()) n++;
  if ((f.course ?? '').trim()) n++;
  if ((f.userRole ?? '').trim()) n++;
  if ((f.search ?? '').trim()) n++;
  return n;
}

type FilterId = 'all' | 'upcoming' | 'ongoing' | 'past';

const COVERS = [
  'from-orange-500 to-red-600',
  'from-violet-500 to-fuchsia-600',
  'from-teal-500 to-cyan-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
];

function gradFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 7) % COVERS.length;
  return COVERS[h];
}

interface SyncResult {
  toOngoing: number;
  toPastFromOngoing: number;
  toPastFromUpcoming: number;
}

export default function AdminEventRegistrations() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterId>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<{ id: string; title: string } | null>(null);
  const canDeleteEvent = user?.isSuperAdmin === true || user?.role === 'PRESIDENT';

  const deleteEventMut = useMutation({
    mutationFn: (id: string) => api.deleteEvent(id, token!),
    onSuccess: () => {
      toast.success('Event deleted');
      setDeleteEventTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-events', 'registrations'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to delete event'),
  });

  // Manual event-status sync (HEAD parity). Hits the existing settings router endpoint.
  // The background scheduler is OFF by default in dev/free-tier, so this is the only path
  // for admins to refresh status badges after editing event timings.
  const handleSyncStatuses = async () => {
    if (!token) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const res = await fetch(`${apiUrl}/settings/event-status/sync-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      const summary = (data.data ?? {}) as Partial<SyncResult> & { changed?: number; updated?: number };
      setSyncResult({
        toOngoing: summary.toOngoing ?? 0,
        toPastFromOngoing: summary.toPastFromOngoing ?? 0,
        toPastFromUpcoming: summary.toPastFromUpcoming ?? 0,
      });
      const changed = (summary.changed ?? summary.updated
        ?? ((summary.toOngoing ?? 0) + (summary.toPastFromOngoing ?? 0) + (summary.toPastFromUpcoming ?? 0))) as number;
      toast.success(changed > 0 ? `Event statuses synced — ${changed} updated` : 'Event statuses synced');
      qc.invalidateQueries({ queryKey: ['admin-events', 'registrations'] });
    } catch (e) {
      toast.error(e instanceof Error ? `Sync failed: ${e.message}` : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const eventsQ = useQuery({
    queryKey: ['admin-events', 'registrations'],
    queryFn: () => api.getEvents(),
    enabled: Boolean(token),
  });

  const all = eventsQ.data ?? [];
  const counts = useMemo(() => ({
    all: all.length,
    upcoming: all.filter((e) => e.status === 'UPCOMING').length,
    ongoing: all.filter((e) => e.status === 'ONGOING').length,
    past: all.filter((e) => e.status === 'PAST').length,
  }), [all]);
  const filtered = useMemo(() => {
    if (filter === 'all') return all;
    return all.filter((e) => e.status === filter.toUpperCase());
  }, [all, filter]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Event registrations</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">One stop for who registered, who showed up, and who got a cert.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncStatuses}
          disabled={syncing}
          title="Recompute every event's status based on its startDate / endDate"
        >
          {syncing ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <RefreshCw size={11} className="mr-1.5" />}
          Sync statuses
        </Button>
      </div>

      {syncResult && (
        <div className="flex items-center gap-3 rounded-[10px] border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-2.5 text-[12.5px] text-[var(--success)]">
          <RefreshCw size={13} />
          <span className="flex-1 font-mono tabular-nums">
            Synced • <strong>{syncResult.toOngoing}</strong> → ONGOING
            {' · '}<strong>{syncResult.toPastFromOngoing}</strong> → PAST (from ONGOING)
            {' · '}<strong>{syncResult.toPastFromUpcoming}</strong> → PAST (from UPCOMING)
          </span>
          <button
            type="button"
            onClick={() => setSyncResult(null)}
            className="size-5 rounded-[4px] hover:bg-[var(--success-border)]/30 flex items-center justify-center"
            aria-label="Dismiss sync result"
          >
            <X size={11} />
          </button>
        </div>
      )}

      <Section
        eyebrow="Events"
        title={`${filtered.length} ${filter === 'all' ? 'total' : filter}`}
        action={
          <SegmentedTabs
            items={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { value: 'ongoing', label: 'Ongoing', count: counts.ongoing },
              { value: 'past', label: 'Past', count: counts.past },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as FilterId)}
          />
        }
      >
        {eventsQ.isLoading ? (
          <div className="grid lg:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[140px] bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <DSCard padded>
            <EmptyState icon={<Calendar size={18} />} title="No events match" body="Create an event from the Create Event page." />
          </DSCard>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {filtered.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                onAttendance={() => navigate(`/admin/events/${e.id}/attendance`)}
                onOpenDetail={() => navigate(`/admin/event-registrations/${e.id}`)}
                onEdit={() => navigate(`/admin/events/${e.id}/edit`)}
                onDelete={canDeleteEvent ? () => setDeleteEventTarget({ id: e.id, title: e.title }) : undefined}
                isDeleting={deleteEventMut.isPending && deleteEventTarget?.id === e.id}
              />
            ))}
          </div>
        )}
      </Section>

      <AlertDialog open={Boolean(deleteEventTarget)} onOpenChange={(o) => !o && setDeleteEventTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteEventTarget?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the event, every registration, every guest invitation, and every team. Certificates already issued stay valid. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEventMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEventTarget && deleteEventMut.mutate(deleteEventTarget.id)}
              disabled={deleteEventMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {deleteEventMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EventRow({ event: e, onAttendance, onOpenDetail, onEdit, onDelete, isDeleting }: {
  event: EventT;
  onAttendance: () => void;
  onOpenDetail: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}) {
  const { token } = useAuth();
  const status = e.status;
  const team = e.teamRegistration;
  const cover = e.imageUrl;
  const capacity = e.capacity ?? 0;
  const startDate = e.startDate ? new Date(e.startDate) : null;
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState<ExportFilterState>(DEFAULT_EXPORT_FILTERS);

  const statsQ = useQuery({
    queryKey: ['admin-event-reg-stats', e.id],
    queryFn: () => api.getEventRegistrationStats(e.id, token!),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
  const stats = statsQ.data;
  const registered = stats?.participants ?? 0;
  const attended = stats?.attended ?? 0;
  const teamCount = team ? Math.ceil(registered / Math.max(1, e.teamMinSize ?? 2)) : 0;
  const activeFilterCount = countActiveExportFilters(exportFilters);

  const setFilter = <K extends keyof ExportFilterState>(key: K, value: ExportFilterState[K]) => {
    setExportFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    setExportDialogOpen(false);
    try {
      const { format, ...filters } = exportFilters;
      // Strip empty strings; the server treats them as filters too if not careful.
      const cleanFilters: EventRegistrationExportFilters = {};
      if (filters.registrationType) cleanFilters.registrationType = filters.registrationType;
      if (filters.year?.trim()) cleanFilters.year = filters.year.trim();
      if (filters.branch?.trim()) cleanFilters.branch = filters.branch.trim();
      if (filters.course?.trim()) cleanFilters.course = filters.course.trim();
      if (filters.userRole?.trim()) cleanFilters.userRole = filters.userRole.trim();
      if (filters.search?.trim()) cleanFilters.search = filters.search.trim();
      const blob = await api.exportEventRegistrations(e.id, token, { format, filters: cleanFilters });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(e.slug || e.id)}-registrations.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(activeFilterCount > 0 ? `Exported ${activeFilterCount}-filter view` : 'Exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <DSCard padded={false} hover className="overflow-hidden">
      <div className="flex">
        <div
          className={cn('w-[120px] shrink-0 bg-gradient-to-br relative', !cover && gradFor(e.id))}
          style={cover ? { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute bottom-2 left-2 text-white text-[10px] font-mono tabular-nums opacity-90">
            {startDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Pill
              tone={status === 'ONGOING' ? 'success' : status === 'UPCOMING' ? 'info' : 'neutral'}
              size="xs"
              dot={status === 'ONGOING'}
            >
              {status === 'ONGOING' ? 'Live' : status === 'UPCOMING' ? 'Upcoming' : 'Past'}
            </Pill>
            {team && <Pill tone="neutral" size="xs">Team</Pill>}
          </div>
          <div className="text-[14px] font-semibold leading-tight truncate">{e.title}</div>
          <div className="flex items-center gap-4 mt-2.5">
            <div>
              <div className="text-[10px] uppercase font-semibold text-[var(--ds-text-3)] tracking-[0.06em]">Registered</div>
              <div className="font-mono tabular-nums text-[15px] font-semibold mt-0.5">
                <span>{registered}</span>
                {capacity > 0 && <span className="text-[var(--ds-text-3)]">/{capacity}</span>}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-[var(--ds-text-3)] tracking-[0.06em]">Attended</div>
              <div className="font-mono tabular-nums text-[15px] font-semibold mt-0.5 text-[var(--success)]">{attended}</div>
            </div>
            {team && (
              <div>
                <div className="text-[10px] uppercase font-semibold text-[var(--ds-text-3)] tracking-[0.06em]">Teams</div>
                <div className="font-mono tabular-nums text-[15px] font-semibold mt-0.5">{teamCount}</div>
              </div>
            )}
          </div>
          {capacity > 0 && <ProgressBar value={registered} max={capacity} className="mt-3" />}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <Button size="sm" onClick={onOpenDetail}>
              Manage
            </Button>
            <Button size="sm" variant="outline" onClick={onAttendance}>
              <ScanLine size={11} className="mr-1.5" />
              Attendance
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExportDialogOpen(true)} disabled={exporting}>
              {exporting ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Download size={11} className="mr-1.5" />}
              Export
              {hasActiveExportFilters(exportFilters) && (
                <Pill tone="accent" size="xs" className="ml-1.5">{activeFilterCount}</Pill>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={onAttendance}>
              <Mail size={11} className="mr-1.5" />
              Email
            </Button>
            {onEdit && (
              <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit event">
                <Pencil size={11} className="mr-1.5" />
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={isDeleting}
                aria-label="Delete event"
                className="text-[var(--danger)] hover:bg-[var(--danger-bg)]"
              >
                {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Filter size={14} />
              Export — {e.title}
            </DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Format" required>
              <SegmentedTabs
                items={[
                  { value: 'xlsx', label: 'XLSX' },
                  { value: 'csv', label: 'CSV' },
                ]}
                value={exportFilters.format}
                onChange={(v) => setFilter('format', v as ExportFormat)}
              />
            </Field>
            <Field label="Registration type">
              <div className="flex gap-1.5">
                {([
                  { value: undefined, label: 'Any' },
                  { value: 'PARTICIPANT' as RegistrationType, label: 'Participant' },
                  { value: 'GUEST' as RegistrationType, label: 'Guest' },
                ]).map((opt) => {
                  const active = (exportFilters.registrationType ?? undefined) === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setFilter('registrationType', opt.value)}
                      className={cn(
                        'h-7 px-2.5 text-[12px] font-medium rounded-[6px] transition-colors',
                        active
                          ? 'bg-[var(--ds-text-1)] text-[var(--ds-text-inverse)]'
                          : 'bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:bg-[var(--bg-sunken)]',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Year" hint="exact match">
              <Input value={exportFilters.year ?? ''} onChange={(ev) => setFilter('year', ev.target.value)} placeholder="3rd Year" />
            </Field>
            <Field label="Branch" hint="exact match">
              <Input value={exportFilters.branch ?? ''} onChange={(ev) => setFilter('branch', ev.target.value)} placeholder="CSE" />
            </Field>
            <Field label="Course" hint="exact match">
              <Input value={exportFilters.course ?? ''} onChange={(ev) => setFilter('course', ev.target.value)} placeholder="BTech" />
            </Field>
            <Field label="User role" hint="USER / CORE_MEMBER / …">
              <Input value={exportFilters.userRole ?? ''} onChange={(ev) => setFilter('userRole', ev.target.value)} placeholder="USER" />
            </Field>
            <Field label="Search" hint="name or email substring" className="sm:col-span-2">
              <Input value={exportFilters.search ?? ''} onChange={(ev) => setFilter('search', ev.target.value)} placeholder="alice@example.com" />
            </Field>
          </div>
          <DialogFooter className="flex items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExportFilters(DEFAULT_EXPORT_FILTERS)}
              disabled={!hasActiveExportFilters(exportFilters) && exportFilters.format === 'xlsx'}
            >
              <RotateCcw size={11} className="mr-1.5" />
              Reset
            </Button>
            <Button size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Download size={13} className="mr-1.5" />}
              Export {exportFilters.format.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DSCard>
  );
}
