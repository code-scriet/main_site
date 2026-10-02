// Dashboard v2 — Admin · Hiring Applications.
// Kanban (PENDING → INTERVIEW_SCHEDULED → SLOT_BOOKED → INTERVIEWED → SELECTED →
// REJECTED) with click-to-move + detail dialog, plus the Phase 4 interview
// pipeline views: Interview slots, Awaiting slot pick, Bookings overview.
// Pixel-port of screen-stubs.jsx:241 + brief §7.14.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Download, Mail, Phone, GraduationCap, Eye, AlertCircle, Briefcase, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar, DSCard, EmptyState, Pill, SegmentedTabs, type PillTone } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateUtils';
import { InterviewSlotsSection } from './InterviewSlotsSection';
import { AwaitingPickSection, BookingsOverviewSection } from './InterviewPipelineSections';
import {
  SlotAdminError,
  deriveAwaitingPick,
  formatSlotRangeIst,
  listInterviewSlots,
  scheduleInterviews,
  type AdminInterviewSlot,
  type AdminSlotBooking,
} from '@/lib/interviewSlotsAdmin';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

interface HiringApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  year: string;
  skills?: string;
  applyingRole: string;
  status: string;
  cycle?: string;
  userId?: string;
  createdAt: string;
}

const STATUSES = ['PENDING', 'INTERVIEW_SCHEDULED', 'SLOT_BOOKED', 'INTERVIEWED', 'SELECTED', 'REJECTED'] as const;
type Status = typeof STATUSES[number];

type View = 'applications' | 'slots' | 'awaiting' | 'bookings';

const COL_LABEL: Record<Status, string> = {
  PENDING: 'Pending',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  SLOT_BOOKED: 'Slot booked',
  INTERVIEWED: 'Interviewed',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};

const COL_TONE: Record<Status, PillTone> = {
  PENDING: 'warning',
  INTERVIEW_SCHEDULED: 'info',
  SLOT_BOOKED: 'accent',
  INTERVIEWED: 'neutral',
  SELECTED: 'success',
  REJECTED: 'danger',
};

const ROLE_LABEL: Record<string, string> = {
  TECHNICAL: 'Technical',
  DSA_CHAMPS: 'DSA Champs',
  DESIGNING: 'Designing',
  SOCIAL_MEDIA: 'Social Media',
  MANAGEMENT: 'Management',
};

function moveButtonClass(tone: PillTone): string {
  switch (tone) {
    case 'warning':
      return 'text-[var(--warning)] border-[var(--warning-border)] hover:bg-[var(--warning-bg)]';
    case 'info':
      return 'text-[var(--info)] border-[var(--info-border)] hover:bg-[var(--info-bg)]';
    case 'success':
      return 'text-[var(--success)] border-[var(--success-border)] hover:bg-[var(--success-bg)]';
    case 'danger':
      return 'text-[var(--danger)] border-[var(--danger-border)] hover:bg-[var(--danger-bg)]';
    case 'accent':
      return 'text-[var(--accent)] border-[var(--accent)] hover:bg-[var(--accent-subtle)]';
    default:
      return 'text-[var(--ds-text-2)] border-[var(--border-default)] hover:bg-[var(--surface-soft)]';
  }
}

export default function AdminHiring() {
  const { token } = useAuth();
  const [apps, setApps] = useState<HiringApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'' | Status>('');
  const [cycleFilter, setCycleFilter] = useState<string>('');
  const [cycles, setCycles] = useState<Array<{ cycle: string; count: number }>>([]);
  const [currentCycle, setCurrentCycle] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<HiringApplication | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [applicationToDelete, setApplicationToDelete] = useState<HiringApplication | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Fetch-all: the board pages through every application like Users.
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  // Phase 4 — pipeline views.
  const [view, setView] = useState<View>('applications');
  const [slots, setSlots] = useState<AdminInterviewSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotCycle, setSlotCycle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);

  const effectiveSlotCycle = slotCycle || currentCycle || '';

  const fetchPage = useCallback(async (page: number): Promise<{ rows: HiringApplication[]; total: number }> => {
    if (!token) return { rows: [], total: 0 };
    const params = new URLSearchParams();
    if (roleFilter !== 'all') params.append('role', roleFilter);
    if (statusFilter) params.append('status', statusFilter);
    if (cycleFilter) params.append('cycle', cycleFilter);
    params.append('limit', '100');
    params.append('page', String(page));
    const res = await fetch(`${API_URL}/hiring/applications?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Failed to load applications');
    const data = await res.json();
    const rows = (data.data ?? []) as HiringApplication[];
    return { rows, total: typeof data.meta?.total === 'number' ? data.meta.total : rows.length };
  }, [token, roleFilter, statusFilter, cycleFilter]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const { rows, total: serverTotal } = await fetchPage(1);
      setApps(rows);
      setTotal(serverTotal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, fetchPage]);

  useEffect(() => { void load(); }, [load]);

  const reloadSlots = useCallback(async () => {
    if (!token) return;
    setSlotsLoading(true);
    setSlotsError(null);
    try {
      const rows = await listInterviewSlots(token, effectiveSlotCycle || undefined);
      setSlots(rows);
    } catch (e) {
      setSlotsError(e instanceof Error ? e.message : 'Failed to load slots');
    } finally {
      setSlotsLoading(false);
    }
  }, [token, effectiveSlotCycle]);

  useEffect(() => { void reloadSlots(); }, [reloadSlots]);

  const hasMore = total != null && apps.length < total;

  const loadMore = async () => {
    if (loadingMore || loadingAll || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = Math.floor(apps.length / 100) + 1;
      const { rows } = await fetchPage(nextPage);
      setApps((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...rows.filter((a) => !seen.has(a.id))];
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load more failed');
    } finally {
      setLoadingMore(false);
    }
  };

  // "Load all" — page through every remaining page in one go.
  const loadAll = async () => {
    if (loadingAll || loadingMore || !hasMore) return;
    setLoadingAll(true);
    try {
      let page = Math.floor(apps.length / 100) + 1;
      for (;;) {
        const { rows, total: serverTotal } = await fetchPage(page);
        if (rows.length === 0) break;
        setApps((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...rows.filter((a) => !seen.has(a.id))];
        });
        setTotal(serverTotal);
        if (rows.length < 100) break;
        page += 1;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load all failed');
    } finally {
      setLoadingAll(false);
    }
  };

  // Load the distinct-cycles list once for the filter dropdowns.
  useEffect(() => {
    if (!token) return;
    void fetch(`${API_URL}/hiring/cycles`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.cycles) setCycles(data.data.cycles);
        if (typeof data?.data?.current === 'string') setCurrentCycle(data.data.current);
      })
      .catch(() => { /* dropdown just stays empty on failure */ });
  }, [token]);

  // applicationId -> booking + slot join, derived client-side from GET /slots
  // (which embeds bookings). Powers the per-row booked-slot chips.
  const bookingsByApp = useMemo(() => {
    const map = new Map<string, { booking: AdminSlotBooking; slot: AdminInterviewSlot }>();
    for (const slot of slots) {
      for (const booking of slot.bookings ?? []) {
        if (!map.has(booking.applicationId)) map.set(booking.applicationId, { booking, slot });
      }
    }
    return map;
  }, [slots]);

  const bookedAppIds = useMemo(() => new Set(bookingsByApp.keys()), [bookingsByApp]);
  const awaitingCount = useMemo(() => deriveAwaitingPick(apps, bookedAppIds).length, [apps, bookedAppIds]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingSelectedIds = useMemo(
    () => [...selected].filter((id) => apps.find((a) => a.id === id)?.status === 'PENDING'),
    [selected, apps],
  );

  const scheduleSelected = async () => {
    if (!token || scheduling || pendingSelectedIds.length === 0) return;
    setScheduling(true);
    try {
      const results = await scheduleInterviews(token, pendingSelectedIds);
      const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      const failed = results.filter((r) => !r.ok);
      if (okIds.size > 0) {
        setApps((prev) => prev.map((a) => (okIds.has(a.id) ? { ...a, status: 'INTERVIEW_SCHEDULED' } : a)));
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of okIds) next.delete(id);
          return next;
        });
      }
      if (failed.length === 0) {
        toast.success(`Scheduled ${okIds.size} interview${okIds.size === 1 ? '' : 's'} — invites sent`);
      } else {
        const sample = failed
          .slice(0, 3)
          .map((f) => `${f.id.slice(0, 8)} (${f.error ?? 'failed'})`)
          .join(', ');
        toast.error(`Scheduled ${okIds.size}, failed ${failed.length}: ${sample}${failed.length > 3 ? '…' : ''}`);
      }
    } catch (e) {
      // Global 409 no_open_slots: no future open slot exists for the cycle.
      if (e instanceof SlotAdminError && e.errorType === 'no_open_slots') {
        toast.error('Create interview slots for this cycle first');
      } else {
        toast.error(e instanceof Error ? e.message : 'Schedule failed');
      }
    } finally {
      setScheduling(false);
    }
  };

  const moveTo = async (id: string, status: Status) => {
    if (!token) return;
    setMoving(id);
    // Optimistic — flip the column before the server confirms.
    const prevApps = apps;
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      const res = await fetch(`${API_URL}/hiring/applications/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Application status updated');
    } catch (e) {
      setApps(prevApps);
      toast.error(e instanceof Error ? e.message : 'Move failed');
    } finally {
      setMoving(null);
    }
  };

  const confirmDelete = async () => {
    if (!applicationToDelete || !token) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/hiring/applications/${applicationToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setApps((prev) => prev.filter((a) => a.id !== applicationToDelete.id));
      toast.success('Application deleted');
      setApplicationToDelete(null);
      setPicked(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);
      const res = await fetch(`${API_URL}/hiring/export?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `hiring-${roleFilter}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success('XLSX exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setDownloading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) =>
      !q ? true : (a.name + ' ' + a.email + ' ' + a.applyingRole + ' ' + a.department).toLowerCase().includes(q),
    );
  }, [apps, search]);

  const grouped = useMemo(() => {
    const g: Record<Status, HiringApplication[]> = {
      PENDING: [],
      INTERVIEW_SCHEDULED: [],
      SLOT_BOOKED: [],
      INTERVIEWED: [],
      SELECTED: [],
      REJECTED: [],
    };
    for (const a of filtered) {
      const s = (STATUSES as readonly string[]).includes(a.status) ? (a.status as Status) : 'PENDING';
      g[s].push(a);
    }
    return g;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Hiring applications</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Drag the status pill to move; click a card for the full form.</p>
          <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1 tabular-nums">
            {loading ? 'Loading…' : `${total ?? apps.length} total`}
            {apps.length ? ` · ${apps.length} loaded` : ''}
            {hasMore ? ' · more available' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={downloading}>
            {downloading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Download size={13} className="mr-1.5" />}
            Export XLSX
          </Button>
        </div>
      </div>

      <SegmentedTabs<View>
        items={[
          { value: 'applications', label: 'Applications' },
          { value: 'slots', label: 'Interview slots', count: slots.length },
          { value: 'awaiting', label: 'Awaiting slot pick', count: awaitingCount },
          { value: 'bookings', label: 'Bookings', count: bookingsByApp.size },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'slots' && token && (
        <InterviewSlotsSection
          token={token}
          slots={slots}
          loading={slotsLoading}
          error={slotsError}
          cycles={cycles}
          currentCycle={currentCycle}
          activeCycle={effectiveSlotCycle}
          onCycleChange={setSlotCycle}
          onRefresh={() => void reloadSlots()}
        />
      )}

      {view === 'awaiting' && token && (
        <AwaitingPickSection
          token={token}
          applications={apps}
          bookedAppIds={bookedAppIds}
          onChanged={() => void reloadSlots()}
        />
      )}

      {view === 'bookings' && <BookingsOverviewSection slots={slots} />}

      {view === 'applications' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative max-w-[280px] flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search applicants…" className="pl-8 h-8 text-[13px]" />
            </div>
            <SegmentedTabs
              items={[
                { value: 'all', label: 'All' },
                { value: 'TECHNICAL', label: 'Technical' },
                { value: 'DSA_CHAMPS', label: 'DSA' },
                { value: 'DESIGNING', label: 'Design' },
              ]}
              value={roleFilter === 'SOCIAL_MEDIA' || roleFilter === 'MANAGEMENT' ? 'all' : roleFilter}
              onChange={(v) => setRoleFilter(v)}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | Status)}
              className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
              aria-label="Filter by status"
              title="Filter by status"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{COL_LABEL[s]}</option>
              ))}
            </select>
            {cycles.length > 0 && (
              <select
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
                aria-label="Filter by hiring cycle"
                title="Filter by hiring cycle"
              >
                <option value="">All cycles</option>
                {cycles.map(({ cycle, count }) => (
                  <option key={cycle} value={cycle}>{cycle} ({count})</option>
                ))}
              </select>
            )}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] flex-wrap">
              <span className="text-[12.5px] text-[var(--ds-text-2)] tabular-nums">
                {selected.size} selected · {pendingSelectedIds.length} pending
              </span>
              <span className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                onClick={scheduleSelected}
                disabled={scheduling || pendingSelectedIds.length === 0}
                title={pendingSelectedIds.length === 0 ? 'Select PENDING applications to schedule interviews' : `Schedule interviews for ${pendingSelectedIds.length} pending applications`}
              >
                {scheduling ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />}
                Schedule interviews
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-[var(--ds-text-3)]">
                Clear
              </Button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-64 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
              {STATUSES.map((s) => (
                <DSCard key={s} padded className="flex flex-col gap-3 min-h-[200px]">
                  <div className="flex items-center justify-between">
                    <Pill tone={COL_TONE[s]} size="sm">{COL_LABEL[s]}</Pill>
                    <span className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">{grouped[s].length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {grouped[s].length === 0 ? (
                      <div className="text-[11.5px] text-[var(--ds-text-3)] italic py-2">Nothing here.</div>
                    ) : (
                      grouped[s].map((a) => {
                        const booked = bookingsByApp.get(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setPicked(a)}
                            className={cn(
                              'text-left p-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[var(--border-default)] hover:bg-[var(--surface-soft)] transition-colors',
                              moving === a.id && 'opacity-50 pointer-events-none',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span onClick={(ev) => ev.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selected.has(a.id)}
                                  onChange={() => toggleSelect(a.id)}
                                  onClick={(ev) => ev.stopPropagation()}
                                  aria-label={`Select ${a.name}`}
                                  title={`Select ${a.name}`}
                                />
                              </span>
                              <Avatar name={a.name} size={24} />
                              <span className="text-[13px] font-medium truncate flex-1">{a.name}</span>
                            </div>
                            <div className="mt-1.5 text-[11px] text-[var(--ds-text-3)]">
                              {ROLE_LABEL[a.applyingRole] ?? a.applyingRole} · {a.year} · {a.department}
                            </div>
                            {booked && (
                              <div className="mt-1.5">
                                <Pill tone="accent" size="xs" title={`Booked: ${booked.slot.venue ?? 'venue TBD'}`}>
                                  Booked {formatSlotRangeIst(booked.slot.startsAt, booked.slot.endsAt)}
                                </Pill>
                              </div>
                            )}
                            {STATUSES.filter((st) => st !== s).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1 pt-2 border-t border-[var(--border-subtle)]">
                                {STATUSES.filter((st) => st !== s).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={(ev) => { ev.stopPropagation(); moveTo(a.id, st); }}
                                    className={cn(
                                      'text-[10px] font-medium px-1.5 h-5 rounded-[5px] border transition-colors',
                                      moveButtonClass(COL_TONE[st]),
                                    )}
                                  >
                                    → {COL_LABEL[st]}
                                  </button>
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </DSCard>
              ))}
            </div>
          )}

          {filtered.length === 0 && !loading && (
            <DSCard padded>
              <EmptyState icon={<Briefcase size={18} />} title="No applications match" body="Try clearing filters or check back later." />
            </DSCard>
          )}

          {/* Fetch-all controls — incremental "Load more" + a "Load all" option */}
          {apps.length > 0 && (hasMore || loadingAll) && (
            <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={!hasMore || loadingMore || loadingAll}>
                {loadingMore ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
                Load more
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadAll()}
                disabled={!hasMore || loadingAll || loadingMore}
                className="text-[var(--ds-text-3)]"
              >
                {loadingAll ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
                {loadingAll ? `Loading all… (${apps.length}${total != null ? `/${total}` : ''})` : 'Load all applications'}
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={Boolean(applicationToDelete)} onOpenChange={(o) => !o && setApplicationToDelete(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this application?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this application from {applicationToDelete?.name}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {deleting ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail dialog */}
      <Dialog open={Boolean(picked)} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-lg">
          <DialogHeader>
            <DialogTitle>{picked?.name}</DialogTitle>
          </DialogHeader>
          {picked && (
            <div className="flex flex-col gap-3 text-[13px]">
              <div className="flex items-center gap-2 flex-wrap"><Pill tone={COL_TONE[picked.status as Status] ?? 'neutral'} size="sm">{COL_LABEL[picked.status as Status] ?? picked.status}</Pill><Pill tone="accent" size="sm">{ROLE_LABEL[picked.applyingRole] ?? picked.applyingRole}</Pill></div>
              {(() => {
                const booked = bookingsByApp.get(picked.id);
                if (!booked) return null;
                return (
                  <div className="text-[12.5px] text-[var(--ds-text-2)]">
                    Booked slot:{' '}
                    <span className="font-mono tabular-nums">{formatSlotRangeIst(booked.slot.startsAt, booked.slot.endsAt)}</span>
                    {booked.slot.venue ? ` · ${booked.slot.venue}` : ''}
                  </div>
                );
              })()}
              <a href={`mailto:${picked.email}`} className="flex items-center gap-2 text-[var(--ds-text-2)] hover:text-[var(--accent)] hover:underline"><Mail size={13} className="text-[var(--ds-text-3)]" />{picked.email}</a>
              {picked.phone && <a href={`tel:${picked.phone}`} className="flex items-center gap-2 text-[var(--ds-text-2)] hover:text-[var(--accent)] hover:underline"><Phone size={13} className="text-[var(--ds-text-3)]" />{picked.phone}</a>}
              <div className="flex items-center gap-2 text-[var(--ds-text-2)]"><GraduationCap size={13} className="text-[var(--ds-text-3)]" />{picked.department} · {picked.year}</div>
              {picked.skills && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-1">Skills</div>
                  <p className="text-[12.5px] text-[var(--ds-text-2)] whitespace-pre-wrap">{picked.skills}</p>
                </div>
              )}
              <div className="text-[11.5px] text-[var(--ds-text-3)] font-mono" title={new Date(picked.createdAt).toISOString()}>
                applied {formatDate(picked.createdAt, 'long')}
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-1">
            {picked && STATUSES.filter((s) => s !== picked.status).map((s) => (
              <Button key={s} size="sm" variant="outline" onClick={() => { moveTo(picked.id, s); setPicked(null); }}>
                Move to {COL_LABEL[s]}
              </Button>
            ))}
            {picked && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setApplicationToDelete(picked)}
                className="text-[var(--danger)] border-[var(--danger-border)] hover:bg-[var(--danger-bg)]"
              >
                <Trash2 size={13} className="mr-1.5" />Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}><Eye size={13} className="mr-1.5" />Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
