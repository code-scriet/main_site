// Dashboard v2 — Admin · Hiring Applications.
// Kanban (PENDING → INTERVIEW_SCHEDULED → SLOT_BOOKED → INTERVIEWED → SELECTED →
// REJECTED) with click-to-move + detail dialog, plus the Phase 4 interview
// pipeline views: Interview slots, Awaiting slot pick, Bookings overview.
// Pixel-port of screen-stubs.jsx:241 + brief §7.14.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, Download, Mail, Phone, GraduationCap, Eye, AlertCircle, Briefcase, Trash2, Send, ExternalLink, FileText, Quote, MessageSquare, CheckCircle2, CheckSquare } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar, DSCard, EmptyState, Pill, SegmentedTabs, type PillTone } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateUtils';
import { InterviewSlotsSection } from './InterviewSlotsSection';
import { AwaitingPickSection, BookingsOverviewSection } from './InterviewPipelineSections';
import { MessageBody } from '@/components/hiring/MessageBody';
import {
  SlotAdminError,
  deriveAwaitingPick,
  formatSlotRangeIst,
  listInterviewSlots,
  scheduleInterviews,
  type AdminInterviewSlot,
  type AdminSlotBooking,
} from '@/lib/interviewSlotsAdmin';
import { teamQuestionsFor } from '@/lib/hiringTeams';

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
  cvLink?: string | null;
  whyJoin?: string | null;
  teamQuestion1?: string | null;
  teamQuestion2?: string | null;
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

// Column tone -> solid dot colour used on every card, so a card still reads
// which lane it sits in when the columns scroll or wrap on narrower screens.
const COL_DOT: Record<Status, string> = {
  PENDING: 'var(--warning)',
  INTERVIEW_SCHEDULED: 'var(--info)',
  SLOT_BOOKED: 'var(--accent)',
  INTERVIEWED: 'var(--ds-text-3)',
  SELECTED: 'var(--success)',
  REJECTED: 'var(--danger)',
};

const ROLE_LABEL: Record<string, string> = {
  TECHNICAL: 'Technical',
  DSA_CHAMPS: 'DSA Champs',
  DESIGNING: 'Designing',
  SOCIAL_MEDIA: 'Social Media',
  MANAGEMENT: 'Management',
};

function DetailAnswer({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-1 flex items-center gap-1.5">
        <Quote size={11} className="text-[var(--ds-text-3)]" /> {label}
      </div>
      <p className="text-[12.5px] text-[var(--ds-text-2)] whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default function AdminHiring() {
  const { token } = useAuth();
  const [apps, setApps] = useState<HiringApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'' | Status>('');
  const [cycleFilter, setCycleFilter] = useState<string>('');
  // Filter by whether the applicant has booked an interview slot (client-side,
  // derived from the loaded slots for the active cycle).
  const [bookedFilter, setBookedFilter] = useState<'' | 'booked' | 'unbooked'>('');
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

  // Direct messaging to selected applicants.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeIds, setComposeIds] = useState<string[]>([]);
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgEmail, setMsgEmail] = useState(true);
  const [msgBell, setMsgBell] = useState(true);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Message history shown in the detail dialog.
  const [messages, setMessages] = useState<Array<{ id: string; subject: string; body: string; emailSent: boolean; bellSent: boolean; createdAt: string; createdBy?: { name: string } | null }>>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

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

  // Auto-refresh the board — no manual page reload needed. Polls every 60s
  // while the Applications tab is open and re-fetches whenever the window
  // regains focus or the tab becomes visible again.
  // `loadingRef` keeps overlapping requests from stacking; `boardSizeRef`
  // skips the refresh once the admin has paged past page 1 (a 100-row page is
  // the board's fetch limit — see fetchPage), so an auto-refresh can never
  // collapse a fully loaded board back down to the first page.
  const loadingRef = useRef(false);
  const boardSizeRef = useRef(0);

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { boardSizeRef.current = apps.length; }, [apps.length]);

  useEffect(() => {
    if (!token || view !== 'applications') return;
    const busy = () => loadingRef.current || boardSizeRef.current > 100;
    // Poll: applications only (cheap, keeps the lanes in sync).
    const refetchBoard = () => { if (!busy()) void load(); };
    // Tab came back into view: applications + booked slots, so the "Booked"
    // chips reflect whatever got booked while the admin was away.
    const refetchAll = () => {
      if (busy()) return;
      void load();
      void reloadSlots();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refetchAll();
    };
    window.addEventListener('focus', refetchAll);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = window.setInterval(refetchBoard, 60_000);
    return () => {
      window.removeEventListener('focus', refetchAll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [token, view, load, reloadSlots]);

  // Live bridge: the notifications socket dispatches a window 'cs-live' event
  // when the server emits a hiring/slots change, so the board refreshes without
  // a manual reload or waiting on the poll.
  useEffect(() => {
    if (!token) return;
    const onCsLive = (e: Event) => {
      const scope = (e as CustomEvent).detail as string | undefined;
      if (scope !== 'hiring' && scope !== 'slots') return;
      if (loadingRef.current || boardSizeRef.current > 100) return;
      void load();
      void reloadSlots();
    };
    window.addEventListener('cs-live', onCsLive);
    return () => window.removeEventListener('cs-live', onCsLive);
  }, [token, load, reloadSlots]);

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
        // Scheduling sends invite emails but leaves bookings unclaimed, so the
        // slot/booking chips need a refresh alongside the lane swap above.
        void reloadSlots();
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

  // Schedule every PENDING application in a single team in one action: page the
  // applications endpoint for that role, then bulk-schedule the ids in 100-id
  // chunks (the schedule endpoint caps applicationIds at 100 per request).
  const scheduleAllInRole = async (role: string) => {
    if (!token || scheduling || role === 'all') return;
    setScheduling(true);
    try {
      const ids: string[] = [];
      let page = 1;
      for (;;) {
        const params = new URLSearchParams({ role, status: 'PENDING', limit: '100', page: String(page) });
        const res = await fetch(`${API_URL}/hiring/applications?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) break;
        const data = await res.json();
        const rows = (data.data ?? []) as HiringApplication[];
        ids.push(...rows.map((r) => r.id));
        const total = typeof data.meta?.total === 'number' ? data.meta.total : rows.length;
        if (rows.length === 0 || ids.length >= total) break;
        page += 1;
      }
      if (ids.length === 0) {
        toast.message(`No pending applications in ${ROLE_LABEL[role] ?? role}.`);
        return;
      }
      const okIds = new Set<string>();
      let failed = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const results = await scheduleInterviews(token, ids.slice(i, i + 100));
        for (const r of results) {
          if (r.ok) okIds.add(r.id);
          else failed += 1;
        }
      }
      if (okIds.size > 0) {
        setApps((prev) => prev.map((a) => (okIds.has(a.id) ? { ...a, status: 'INTERVIEW_SCHEDULED' } : a)));
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of okIds) next.delete(id);
          return next;
        });
        // Scheduling sends invite emails but leaves bookings unclaimed, so the
        // slot/booking chips need a refresh alongside the lane swap above.
        void reloadSlots();
      }
      if (failed === 0) {
        toast.success(`Scheduled ${okIds.size} interview${okIds.size === 1 ? '' : 's'} in ${ROLE_LABEL[role] ?? role} — invites sent`);
      } else {
        toast.error(`Scheduled ${okIds.size}, ${failed} could not be scheduled.`);
      }
    } catch (e) {
      if (e instanceof SlotAdminError && e.errorType === 'no_open_slots') {
        toast.error('Create interview slots for this cycle first');
      } else {
        toast.error(e instanceof Error ? e.message : 'Bulk schedule failed');
      }
    } finally {
      setScheduling(false);
    }
  };

  // One-click select of every applicant matching the active filters. If the
  // board hasn't loaded them all yet, page the rest in first so nothing is
  // missed — the common case being filter status=INTERVIEW_SCHEDULED → Select
  // all → Message, to reach exactly the scheduled cohort.
  const selectAllMatching = async () => {
    if (!token) return;
    let pool: HiringApplication[] = apps;
    if (hasMore || loadingAll) {
      setLoadingAll(true);
      const acc: HiringApplication[] = [];
      try {
        let page = 1;
        for (;;) {
          const { rows, total: serverTotal } = await fetchPage(page);
          if (rows.length === 0) break;
          acc.push(...rows);
          setTotal(serverTotal);
          if (rows.length < 100) break;
          page += 1;
        }
        setApps((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          const merged = [...prev];
          for (const a of acc) {
            if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
          }
          return merged;
        });
        pool = acc;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not load all applicants');
        return;
      } finally {
        setLoadingAll(false);
      }
    }
    const q = search.trim().toLowerCase();
    const ids = pool
      .filter((a) => {
        if (q && !(a.name + ' ' + a.email + ' ' + a.applyingRole + ' ' + a.department).toLowerCase().includes(q)) return false;
        if (bookedFilter === 'booked' && !bookedAppIds.has(a.id)) return false;
        if (bookedFilter === 'unbooked' && bookedAppIds.has(a.id)) return false;
        return true;
      })
      .map((a) => a.id);
    setSelected(new Set(ids));
    toast.success(`Selected ${ids.length} applicant${ids.length === 1 ? '' : 's'}`);
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
      if (!res.ok) {
        let message = 'Failed to update';
        try {
          const data = await res.json();
          if (typeof data?.error?.message === 'string' && data.error.message) message = data.error.message;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }
      toast.success('Application status updated');
      // Moving someone in/out of an interview lane can change their booking,
      // so re-pull the slots that back the per-card "Booked" chips.
      void reloadSlots();
    } catch (e) {
      setApps(prevApps);
      toast.error(e instanceof Error ? e.message : 'Move failed');
    } finally {
      setMoving(null);
    }
  };

  const openCompose = (ids: string[]) => {
    if (ids.length === 0) return;
    setComposeIds(ids);
    setMsgSubject('');
    setMsgBody('');
    setMsgEmail(true);
    setMsgBell(true);
    setComposeError(null);
    setComposeOpen(true);
  };

  const sendMessage = async () => {
    if (!token) return;
    const subject = msgSubject.trim();
    const body = msgBody.trim();
    if (!subject) { setComposeError('Subject is required.'); return; }
    if (!body) { setComposeError('Message cannot be empty.'); return; }
    if (!msgEmail && !msgBell) { setComposeError('Choose at least one delivery channel.'); return; }
    const ids = composeIds;
    if (ids.length === 0) { setComposeError('No applicants selected.'); return; }

    setSending(true);
    setComposeError(null);
    try {
      const res = await fetch(`${API_URL}/hiring/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationIds: ids, subject, body, email: msgEmail, bell: msgBell }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to send message');
      const d = data?.data ?? {};
      const parts: string[] = [];
      if (msgEmail) parts.push(`${d.emailed ?? 0} emailed`);
      if (msgBell) parts.push(`${d.belled ?? 0} in-app`);
      toast.success(`Message sent — ${parts.join(', ') || 'logged'} to ${d.total ?? ids.length} applicant${d.total === 1 ? '' : 's'}`);
      if (msgBell && d.bellSkipped > 0) {
        toast.message(`${d.bellSkipped} applicant(s) have no account, so the in-app notification was skipped for them (email still covers them).`);
      }
      setComposeOpen(false);
      // Drop just-messaged applicants from the board selection (no-op for a
      // single send triggered from a detail card).
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      // Refresh the open detail dialog's history if this applicant is showing.
      if (picked && ids.includes(picked.id)) void loadMessages(picked.id);
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const loadMessages = async (applicationId: string) => {
    if (!token) return;
    setMessages([]);
    setMessagesLoading(true);
    try {
      const res = await fetch(`${API_URL}/hiring/applications/${applicationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(res.ok ? (data?.data?.messages ?? []) : []);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (picked) void loadMessages(picked.id);
    else setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.id]);

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
    return apps.filter((a) => {
      if (q && !(a.name + ' ' + a.email + ' ' + a.applyingRole + ' ' + a.department).toLowerCase().includes(q)) return false;
      if (bookedFilter === 'booked' && !bookedAppIds.has(a.id)) return false;
      if (bookedFilter === 'unbooked' && bookedAppIds.has(a.id)) return false;
      return true;
    });
  }, [apps, search, bookedFilter, bookedAppIds]);

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
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Use a card's Move menu to change status; click a card for the full form.</p>
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
            <div className="relative w-full sm:max-w-[240px] sm:flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search applicants…" className="pl-8 h-8 text-[13px]" />
            </div>
            <div className="overflow-x-auto max-w-full">
              <SegmentedTabs
                items={[
                  { value: 'all', label: 'All' },
                  { value: 'TECHNICAL', label: 'Technical' },
                  { value: 'DSA_CHAMPS', label: 'DSA' },
                  { value: 'DESIGNING', label: 'Design' },
                  { value: 'SOCIAL_MEDIA', label: 'Social' },
                  { value: 'MANAGEMENT', label: 'Management' },
                ]}
                value={roleFilter}
                onChange={(v) => setRoleFilter(v)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | Status)}
              className="h-8 px-2.5 min-w-0 max-w-full text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
              aria-label="Filter by status"
              title="Filter by status"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{COL_LABEL[s]}</option>
              ))}
            </select>
            <select
              value={bookedFilter}
              onChange={(e) => setBookedFilter(e.target.value as '' | 'booked' | 'unbooked')}
              className="h-8 px-2.5 min-w-0 max-w-full text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
              aria-label="Filter by booked slot"
              title="Filter by whether they booked an interview slot (for the active slot cycle)"
            >
              <option value="">All slots</option>
              <option value="booked">Booked a slot</option>
              <option value="unbooked">Not booked yet</option>
            </select>
            {cycles.length > 0 && (
              <select
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                className="h-8 px-2.5 min-w-0 max-w-full text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
                aria-label="Filter by hiring cycle"
                title="Filter by hiring cycle"
              >
                <option value="">All cycles</option>
                {cycles.map(({ cycle, count }) => (
                  <option key={cycle} value={cycle}>{cycle} ({count})</option>
                ))}
              </select>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {filtered.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void selectAllMatching()}
                  disabled={loadingAll}
                  title="Tick every applicant matching the current filters (loads them all first if needed)"
                >
                  {loadingAll ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <CheckSquare size={13} className="mr-1.5" />}
                  Select all {hasMore ? 'matching' : `(${filtered.length})`}
                </Button>
              )}
              {roleFilter !== 'all' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void scheduleAllInRole(roleFilter)}
                  disabled={scheduling}
                  title={`Move every PENDING ${ROLE_LABEL[roleFilter] ?? roleFilter} applicant to Interview scheduled and send invites`}
                >
                  {scheduling ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />}
                  Schedule all pending in {ROLE_LABEL[roleFilter] ?? roleFilter}
                </Button>
              )}
            </div>
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
              <Button
                size="sm"
                onClick={() => openCompose([...selected])}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                title={`Message the ${selected.size} selected applicant(s)`}
              >
                <MessageSquare size={13} className="mr-1.5" />
                Message
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-64 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 items-start">
              {STATUSES.map((s) => (
                <DSCard key={s} padded={false} className="flex flex-col min-h-[240px] overflow-hidden">
                  {/* Column header — status on the left, live count on the right */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
                    <Pill tone={COL_TONE[s]} size="sm">{COL_LABEL[s]}</Pill>
                    <span className="shrink-0 inline-flex items-center justify-center h-[18px] min-w-[26px] px-1.5 rounded-[5px] border border-[var(--border-default)] bg-[var(--surface-soft)] text-[11px] font-mono tabular-nums text-[var(--ds-text-3)]">
                      {grouped[s].length}
                    </span>
                  </div>

                  {/* Card list — scrolls inside the column */}
                  <div className="flex flex-col gap-2.5 p-3 max-h-[60vh] overflow-y-auto">
                    {grouped[s].length === 0 ? (
                      <div className="rounded-[8px] border border-dashed border-[var(--border-default)] py-6 text-center text-[11.5px] text-[var(--ds-text-3)]">
                        No {COL_LABEL[s].toLowerCase()}
                      </div>
                    ) : (
                      grouped[s].map((a) => {
                        const booked = bookingsByApp.get(a.id);
                        return (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setPicked(a)}
                            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setPicked(a); } }}
                            className={cn(
                              'text-left p-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-soft)]',
                              'hover:border-[var(--border-default)] hover:bg-[var(--surface-elev)] hover:shadow-[var(--shadow-sm)]',
                              'transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                              moving === a.id && 'opacity-50 pointer-events-none',
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span onClick={(ev) => ev.stopPropagation()} className="shrink-0">
                                <input
                                  type="checkbox"
                                  checked={selected.has(a.id)}
                                  onChange={() => toggleSelect(a.id)}
                                  onClick={(ev) => ev.stopPropagation()}
                                  aria-label={`Select ${a.name}`}
                                  title={`Select ${a.name}`}
                                  className="accent-[var(--accent)] cursor-pointer"
                                />
                              </span>
                              <Avatar name={a.name} size={24} />
                              <span className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate flex-1 min-w-0">{a.name}</span>
                              <span
                                aria-hidden="true"
                                title={COL_LABEL[s]}
                                className="size-[7px] shrink-0 rounded-full"
                                style={{ backgroundColor: COL_DOT[s] }}
                              />
                            </div>
                            <div className="mt-1.5 min-w-0 text-[11px] text-[var(--ds-text-3)] truncate">
                              {ROLE_LABEL[a.applyingRole] ?? a.applyingRole} · {a.year} · {a.department}
                            </div>
                            {booked && (
                              <div className="mt-1.5 flex min-w-0">
                                <Pill tone="accent" size="xs" className="max-w-full min-w-0" title={`Booked: ${booked.slot.venue ?? 'venue TBD'}`}>
                                  <span className="min-w-0 truncate">Booked {formatSlotRangeIst(booked.slot.startsAt, booked.slot.endsAt)}</span>
                                </Pill>
                              </div>
                            )}
                            <div className="mt-2.5 pt-2.5 border-t border-[var(--border-subtle)]" onClick={(ev) => ev.stopPropagation()}>
                              <select
                                value=""
                                disabled={moving === a.id}
                                onChange={(ev) => { const next = ev.target.value; if (next) moveTo(a.id, next as Status); }}
                                aria-label={`Move ${a.name} to another status`}
                                className="w-full h-7 min-w-0 max-w-full px-2 text-[12px] text-[var(--ds-text-2)] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[7px] outline-none cursor-pointer hover:border-[var(--border-strong)] focus:border-[var(--accent)] disabled:opacity-50"
                              >
                                <option value="">Move to…</option>
                                {STATUSES.filter((st) => st !== s).map((st) => (
                                  <option key={st} value={st}>{COL_LABEL[st]}</option>
                                ))}
                              </select>
                            </div>
                          </div>
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
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-lg max-h-[85vh] overflow-y-auto">
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
              {picked.cvLink && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-1.5">CV / Resume</div>
                  <a
                    href={picked.cvLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 h-8 rounded-[7px] border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                  >
                    <FileText size={13} /> Open CV <ExternalLink size={12} />
                  </a>
                </div>
              )}
              {picked.whyJoin && (
                <DetailAnswer label="Why join" value={picked.whyJoin} />
              )}
              {teamQuestionsFor(picked.applyingRole).map((q) => {
                const value = q.key === 'teamQuestion1' ? picked.teamQuestion1 : picked.teamQuestion2;
                return value ? <DetailAnswer key={q.key} label={q.label} value={value} /> : null;
              })}
              <div className="text-[11.5px] text-[var(--ds-text-3)] font-mono" title={new Date(picked.createdAt).toISOString()}>
                applied {formatDate(picked.createdAt, 'long')}
              </div>

              {/* Message history for this applicant */}
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Message history</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCompose([picked.id])}
                  >
                    <MessageSquare size={12} className="mr-1.5" /> Message
                  </Button>
                </div>
                {messagesLoading ? (
                  <div className="h-8 bg-[var(--surface-soft)] rounded-[8px] animate-pulse" />
                ) : messages.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ds-text-3)] italic">No messages sent yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                    {messages.map((m) => (
                      <li key={m.id} className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-2.5">
                        <div className="text-[12.5px] font-semibold text-[var(--ds-text-1)]">{m.subject}</div>
                        <MessageBody className="mt-1 [&_p]:text-[12px]" children={m.body} />
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {m.emailSent && <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--ds-text-3)]"><Mail size={11} /> Email</span>}
                          {m.bellSent && <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--ds-text-3)]"><MessageSquare size={11} /> In-app</span>}
                          <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums ml-auto">{formatDate(m.createdAt, 'long')}</span>
                          {m.createdBy?.name && <span className="text-[10.5px] text-[var(--ds-text-3)]">· {m.createdBy.name}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2 items-center">
            {picked && (
              <select
                value=""
                onChange={(e) => { const next = e.target.value; if (next) { moveTo(picked.id, next as Status); setPicked(null); } }}
                aria-label="Move to status"
                className="mr-auto h-8 px-2 min-w-0 max-w-full text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Move to…</option>
                {STATUSES.filter((s) => s !== picked.status).map((s) => (
                  <option key={s} value={s}>{COL_LABEL[s]}</option>
                ))}
              </select>
            )}
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

      {/* Bulk message composer */}
      <Dialog open={composeOpen} onOpenChange={(o) => !o && !sending && setComposeOpen(false)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare size={16} /> Message {composeIds.length} applicant{composeIds.length === 1 ? '' : 's'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 text-[13px]">
            {composeError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[12.5px]">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{composeError}</span>
              </div>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-[var(--ds-text-2)]">Subject <span className="text-[var(--danger)]">*</span></span>
              <Input value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} maxLength={200} placeholder="e.g. Your interview room change" className="h-10" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-[var(--ds-text-2)]">Message <span className="text-[var(--danger)]">*</span></span>
              <Textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} rows={6} maxLength={5000} placeholder="Write your note to the selected applicants…" />
              <span className="text-[11.5px] text-[var(--ds-text-3)]">Supports Markdown and basic HTML — bold, lists, links, images.</span>
            </label>
            {msgBody.trim() && (
              <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3">
                <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-1.5">Preview</div>
                <MessageBody children={msgBody} />
              </div>
            )}
            <div className="flex items-center gap-5 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={msgEmail} onChange={(e) => setMsgEmail(e.target.checked)} />
                <Mail size={13} className="text-[var(--ds-text-3)]" /> <span className="text-[12.5px]">Email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={msgBell} onChange={(e) => setMsgBell(e.target.checked)} />
                <MessageSquare size={13} className="text-[var(--ds-text-3)]" /> <span className="text-[12.5px]">In-app notification</span>
              </label>
            </div>
            <p className="text-[11.5px] text-[var(--ds-text-3)]">
              Recipients without a club account can't receive the in-app notification — email still reaches them. Applicants see the message on their dashboard too.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setComposeOpen(false)} disabled={sending}>Cancel</Button>
            <Button size="sm" onClick={sendMessage} disabled={sending || composeIds.length === 0} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
              {sending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={13} className="mr-1.5" />}
              Send to {composeIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
