// Dashboard v3 — Admin · Event Registrations detail (per-event drill-down).
// Full table + filters + bulk ops + custom fields + per-row delete + export.

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Search, Download, Mail, Trash2, ChevronDown, ChevronRight,
  ExternalLink, ScanLine, CalendarDays, MapPin, Users, Award, Loader2,
  Lock, Unlock, XCircle, Filter, RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type EventAdminRegistration, type Event as EventT, type EventRegistrationExportFilters, type RegistrationType } from '@/lib/api';
import { Avatar, DSCard, EmptyState, Field, Pill, SegmentedTabs, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AdminEventInvitations from '@/components/events/AdminEventInvitations';
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
function exportFiltersActive(f: ExportFilterState): boolean {
  return Boolean(
    f.registrationType || (f.year ?? '').trim() || (f.branch ?? '').trim()
    || (f.course ?? '').trim() || (f.userRole ?? '').trim() || (f.search ?? '').trim(),
  );
}
function countExportFilters(f: ExportFilterState): number {
  let n = 0;
  if (f.registrationType) n++;
  if ((f.year ?? '').trim()) n++;
  if ((f.branch ?? '').trim()) n++;
  if ((f.course ?? '').trim()) n++;
  if ((f.userRole ?? '').trim()) n++;
  if ((f.search ?? '').trim()) n++;
  return n;
}

type StatusFilter = 'all' | 'attended' | 'absent';
type TypeFilter = 'all' | 'PARTICIPANT' | 'GUEST';

function fmt(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminEventRegistrationDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam: 'registrations' | 'invitations' =
    searchParams.get('tab') === 'invitations' ? 'invitations' : 'registrations';
  const setTab = (next: 'registrations' | 'invitations') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'invitations') params.set('tab', 'invitations');
    else params.delete('tab');
    setSearchParams(params, { replace: true });
  };

  // Only PRESIDENT or superAdmin can delete an entire event (HEAD parity).
  const canDeleteEvent = user?.isSuperAdmin === true || user?.role === 'PRESIDENT';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [typeF, setTypeF] = useState<TypeFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<EventAdminRegistration | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  // Seed the dialog from the visible-table filters so "Export filtered view" matches what
  // the admin sees on screen.
  const [exportFilters, setExportFilters] = useState<ExportFilterState>(DEFAULT_EXPORT_FILTERS);
  const setExportFilter = <K extends keyof ExportFilterState>(key: K, value: ExportFilterState[K]) => {
    setExportFilters((prev) => ({ ...prev, [key]: value }));
  };
  const [deletingEventTarget, setDeletingEventTarget] = useState<{ id: string; title: string } | null>(null);
  // Admin team controls — restored from HEAD
  const [dissolveTarget, setDissolveTarget] = useState<{ id: string; teamName: string } | null>(null);

  const deleteEventMut = useMutation({
    mutationFn: () => api.deleteEvent(eventId!, token!),
    onSuccess: () => {
      toast.success('Event deleted');
      navigate('/admin/event-registrations');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to delete event'),
  });
  const toggleLockMut = useMutation({
    mutationFn: (teamId: string) => api.adminToggleTeamLock(teamId, token!),
    onSuccess: () => {
      toast.success('Team lock toggled');
      qc.invalidateQueries({ queryKey: ['admin-event-teams', eventId] });
    },
    onError: () => toast.error('Toggle failed'),
  });
  const dissolveMut = useMutation({
    mutationFn: (teamId: string) => api.adminDissolveTeam(teamId, token!),
    onSuccess: () => {
      toast.success('Team dissolved');
      setDissolveTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-event-teams', eventId] });
      qc.invalidateQueries({ queryKey: ['admin-event-regs-detail', eventId] });
    },
    onError: () => toast.error('Dissolve failed'),
  });

  const eventQ = useQuery({
    queryKey: ['admin-event-detail', eventId],
    queryFn: () => api.getEvent(eventId!),
    enabled: Boolean(eventId),
  });
  const regsQ = useQuery({
    queryKey: ['admin-event-regs-detail', eventId],
    queryFn: () => api.getEventRegistrations(eventId!, token!),
    enabled: Boolean(eventId && token),
  });
  const teamsQ = useQuery({
    queryKey: ['admin-event-teams', eventId],
    queryFn: () => api.getEventTeams(eventId!, token!),
    enabled: Boolean(eventId && token),
  });

  const event = eventQ.data as EventT | undefined;
  const regs = (regsQ.data ?? []) as EventAdminRegistration[];

  const isAttended = (r: EventAdminRegistration): boolean => {
    const rr = r as unknown as { attended?: boolean; dayAttendances?: Array<{ attended: boolean }> };
    if (rr.attended) return true;
    if (rr.dayAttendances && rr.dayAttendances.some((d) => d.attended)) return true;
    return false;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regs.filter((r) => {
      if (typeF !== 'all' && r.registrationType !== typeF) return false;
      if (status === 'attended' && !isAttended(r)) return false;
      if (status === 'absent' && isAttended(r)) return false;
      if (!q) return true;
      const u = r.user;
      return (u.name + ' ' + u.email + ' ' + (u.branch ?? '') + ' ' + (u.year ?? '')).toLowerCase().includes(q);
    });
  }, [regs, search, status, typeF]);

  const stats = useMemo(() => {
    const total = regs.length;
    const participants = regs.filter((r) => r.registrationType === 'PARTICIPANT').length;
    const guests = regs.filter((r) => r.registrationType === 'GUEST').length;
    const attended = regs.filter(isAttended).length;
    return { total, participants, guests, attended };
  }, [regs]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkMarkMut = useMutation({
    mutationFn: (ids: string[]) => api.bulkUpdateAttendance(ids, 'mark', token!),
    onSuccess: () => { toast.success('Marked attended'); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['admin-event-regs-detail', eventId] }); },
    onError: () => toast.error('Bulk mark failed'),
  });
  const bulkUnmarkMut = useMutation({
    mutationFn: (ids: string[]) => api.bulkUpdateAttendance(ids, 'unmark', token!),
    onSuccess: () => { toast.success('Unmarked'); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['admin-event-regs-detail', eventId] }); },
    onError: () => toast.error('Bulk unmark failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteEventRegistration(eventId!, id, token!),
    onSuccess: () => { toast.success('Registration removed'); setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-event-regs-detail', eventId] }); },
    onError: () => toast.error('Delete failed'),
  });

  // Seed dialog from the current visible-table filters when opening, so the admin's
  // "filtered view" is the natural default for export.
  const openExportDialog = () => {
    const seeded: ExportFilterState = {
      format: exportFilters.format,
      registrationType: typeF === 'all' ? undefined : (typeF as RegistrationType),
      year: exportFilters.year,
      branch: exportFilters.branch,
      course: exportFilters.course,
      userRole: exportFilters.userRole,
      search: search.trim() || exportFilters.search || '',
    };
    setExportFilters(seeded);
    setExportDialogOpen(true);
  };

  const handleExport = async () => {
    if (!token || !eventId) return;
    setExporting(true);
    setExportDialogOpen(false);
    try {
      const { format, ...rest } = exportFilters;
      const cleanFilters: EventRegistrationExportFilters = {};
      if (rest.registrationType) cleanFilters.registrationType = rest.registrationType;
      if (rest.year?.trim()) cleanFilters.year = rest.year.trim();
      if (rest.branch?.trim()) cleanFilters.branch = rest.branch.trim();
      if (rest.course?.trim()) cleanFilters.course = rest.course.trim();
      if (rest.userRole?.trim()) cleanFilters.userRole = rest.userRole.trim();
      if (rest.search?.trim()) cleanFilters.search = rest.search.trim();
      const blob = await api.exportEventRegistrations(eventId, token, { format, filters: cleanFilters });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(event?.slug || eventId)}-registrations.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      const filterCount = countExportFilters(exportFilters);
      toast.success(filterCount > 0 ? `Exported ${filterCount}-filter view` : 'Export downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (eventQ.isLoading) {
    return <div className="h-64 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />;
  }
  if (!event) {
    return <DSCard padded><EmptyState title="Event not found" body="It may have been deleted." action={<Button size="sm" onClick={() => navigate('/admin/event-registrations')}>Back to list</Button>} /></DSCard>;
  }

  const teams = (teamsQ.data as { teams?: Array<{ id: string; teamName: string; inviteCode?: string; isLocked: boolean; leaderId: string; members: Array<{ user: { id: string; name: string; email: string; avatar?: string | null } }> }> } | undefined)?.teams ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={() => navigate('/admin/event-registrations')}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]"
        >
          <ArrowLeft size={12} /> Back to events
        </button>
        <div className="flex items-end justify-between gap-3 flex-wrap mt-2">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Pill
                tone={event.status === 'ONGOING' ? 'success' : event.status === 'UPCOMING' ? 'info' : 'neutral'}
                size="sm"
                dot={event.status === 'ONGOING'}
              >
                {event.status}
              </Pill>
              {event.teamRegistration && <Pill tone="neutral" size="sm">Team event</Pill>}
              {event.eventType && <Pill tone="neutral" size="sm">{event.eventType}</Pill>}
            </div>
            <h1 className="text-[24px] font-semibold tracking-tight">{event.title}</h1>
            <div className="text-[12.5px] text-[var(--ds-text-3)] mt-1 flex items-center gap-3 flex-wrap font-mono tabular-nums">
              <span className="inline-flex items-center gap-1"><CalendarDays size={11} />{new Date(event.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {event.venue && <span className="inline-flex items-center gap-1"><MapPin size={11} />{event.venue}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" asChild>
              <a href={`/events/${event.slug || event.id}`} target="_blank" rel="noreferrer"><ExternalLink size={11} className="mr-1.5" />Public page</a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/events/${event.id}/edit`)}>Edit event</Button>
            <Button size="sm" onClick={() => navigate(`/admin/events/${event.id}/attendance`)}>
              <ScanLine size={11} className="mr-1.5" />
              Open scanner
            </Button>
            {canDeleteEvent && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeletingEventTarget({ id: event.id, title: event.title })}
                className="text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                title="Delete the entire event and every registration"
              >
                <Trash2 size={11} className="mr-1.5" />
                Delete event
              </Button>
            )}
          </div>
        </div>

        {/* Tabs — registrations vs invitations (HEAD parity). */}
        <div className="mt-4">
          <SegmentedTabs
            items={[
              { value: 'registrations', label: 'Registrations' },
              { value: 'invitations', label: 'Invitations' },
            ]}
            value={tabParam}
            onChange={(v) => setTab(v as 'registrations' | 'invitations')}
          />
        </div>
      </div>

      {tabParam === 'invitations' && token && (
        <AdminEventInvitations eventId={eventId!} eventTitle={event.title} token={token} />
      )}

      {tabParam === 'registrations' && (
      <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 border-y border-[var(--border-subtle)] py-4">
        {[
          { l: 'Total', v: stats.total, c: 'var(--ds-text-1)' },
          { l: 'Participants', v: stats.participants, c: 'var(--ds-text-1)' },
          { l: 'Guests', v: stats.guests, c: 'var(--info)' },
          { l: 'Attended', v: stats.attended, c: 'var(--success)' },
        ].map((s, i) => (
          <div key={s.l} className={cn(i > 0 && 'md:border-l md:border-[var(--border-subtle)] md:pl-5')}>
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{s.l}</div>
            <div className="text-[24px] font-semibold tabular-nums leading-none mt-1.5" style={{ color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-[300px] flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, branch…" className="pl-8 h-8 text-[13px]" />
        </div>
        <SegmentedTabs
          items={[
            { value: 'all', label: 'All' },
            { value: 'attended', label: 'Attended' },
            { value: 'absent', label: 'Absent' },
          ]}
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
        />
        <SegmentedTabs
          items={[
            { value: 'all', label: 'Everyone' },
            { value: 'PARTICIPANT', label: 'Participants' },
            { value: 'GUEST', label: 'Guests' },
          ]}
          value={typeF}
          onChange={(v) => setTypeF(v as TypeFilter)}
        />
        <Button size="sm" variant="ghost" onClick={openExportDialog} disabled={exporting} className="ml-auto" aria-label="Export registrations">
          {exporting ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Download size={11} className="mr-1.5" />}
          Export
          {exportFiltersActive(exportFilters) && (
            <Pill tone="accent" size="xs" className="ml-1.5">{countExportFilters(exportFilters)}</Pill>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/admin/events/${event.id}/attendance`)}>
          <Mail size={11} className="mr-1.5" />
          Email absentees
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[var(--accent-subtle)]/40 border border-[var(--accent-ring)] text-[12.5px]">
          <span className="font-medium text-[var(--accent)]">{selected.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => bulkMarkMut.mutate(Array.from(selected))} disabled={bulkMarkMut.isPending}>Mark attended</Button>
          <Button size="sm" variant="outline" onClick={() => bulkUnmarkMut.mutate(Array.from(selected))} disabled={bulkUnmarkMut.isPending}>Unmark</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <DSCard padded={false}>
        {regsQ.isLoading ? (
          <div className="p-6 animate-pulse space-y-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-[var(--surface-soft)] rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Users size={18} />} title="No registrations match" body="Try clearing filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold">
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="px-3 py-2.5 w-[36px]">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="size-4" />
                  </th>
                  <th className="px-4 py-2.5">Member</th>
                  <th className="px-4 py-2.5 w-[90px]">Type</th>
                  <th className="px-4 py-2.5 w-[100px]">Branch</th>
                  <th className="px-4 py-2.5 w-[60px]">Year</th>
                  <th className="px-4 py-2.5 w-[160px]">Registered</th>
                  <th className="px-4 py-2.5 w-[110px]">Attended</th>
                  <th className="px-4 py-2.5 w-[100px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const at = isAttended(r);
                  const isExpanded = expanded.has(r.id);
                  const hasCustomFields = r.customFieldResponses && r.customFieldResponses.length > 0;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]">
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="size-4" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.user.name} src={r.user.avatar} size={28} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">{r.user.name}</span>
                                {hasCustomFields && (
                                  <button onClick={() => toggleExpand(r.id)} className="size-5 rounded-[4px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)]">
                                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                  </button>
                                )}
                              </div>
                              <div className="text-[11px] text-[var(--ds-text-3)] truncate">{r.user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={r.registrationType === 'GUEST' ? 'info' : 'neutral'} size="xs">
                            {r.registrationType === 'GUEST' ? `Guest · ${r.invitation?.role ?? ''}` : 'Participant'}
                          </Pill>
                        </td>
                        <td className="px-4 py-3 text-[var(--ds-text-2)] truncate">{r.user.branch ?? '—'}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-[var(--ds-text-3)]">{r.user.year ?? '—'}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-[var(--ds-text-3)] text-[11.5px]">{fmt(r.timestamp)}</td>
                        <td className="px-4 py-3">
                          {at ? <Pill tone="success" size="xs">Yes</Pill> : <Pill tone="neutral" size="xs">No</Pill>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => setDeleting(r)} title="Remove" className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && hasCustomFields && (
                        <tr className="bg-[var(--surface-soft)]/30">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
                              {(r.customFieldResponses ?? []).map((f, i) => (
                                <div key={i} className="flex flex-col gap-0.5">
                                  <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{f.label ?? `Field ${i + 1}`}</span>
                                  <span className="text-[var(--ds-text-2)] whitespace-pre-wrap break-words">{f.value || <em>empty</em>}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DSCard>

      {event.teamRegistration && (
        <Section eyebrow="Teams" title={`${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`}>
          {teamsQ.isLoading ? (
            <div className="h-24 bg-[var(--surface-soft)] rounded animate-pulse" />
          ) : teams.length === 0 ? (
            <DSCard padded><EmptyState icon={<Users size={18} />} title="No teams yet" /></DSCard>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teams.map((t) => (
                <DSCard key={t.id} padded>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[13.5px] font-semibold truncate">{t.teamName}</div>
                    {t.isLocked && <Pill tone="warning" size="xs">Locked</Pill>}
                  </div>
                  <div className="text-[11.5px] text-[var(--ds-text-3)] font-mono mb-2">
                    {t.inviteCode && <span>code <span className="text-[var(--ds-text-2)]">{t.inviteCode}</span> · </span>}
                    {t.members.length} {t.members.length === 1 ? 'member' : 'members'}
                  </div>
                  <div className="flex -space-x-1 mb-3">
                    {t.members.slice(0, 5).map((m) => (
                      <Avatar key={m.user.id} name={m.user.name} src={m.user.avatar} size={22} className="ring-2 ring-[var(--bg-raised)]" />
                    ))}
                  </div>
                  {/* Admin team actions — restored from HEAD */}
                  <div className="flex items-center gap-1.5 pt-3 border-t border-[var(--border-subtle)]">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleLockMut.mutate(t.id)}
                      disabled={toggleLockMut.isPending}
                      className="flex-1"
                    >
                      {t.isLocked ? <Unlock size={11} className="mr-1.5" /> : <Lock size={11} className="mr-1.5" />}
                      {t.isLocked ? 'Unlock' : 'Lock'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDissolveTarget({ id: t.id, teamName: t.teamName })}
                      className="text-[var(--ds-text-3)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                    >
                      <XCircle size={11} className="mr-1.5" />
                      Dissolve
                    </Button>
                  </div>
                </DSCard>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Cert wizard shortcut */}
      <Section eyebrow="Certificates" title="Issue certificates for attendees">
        <DSCard padded>
          <div className="flex items-center gap-3 flex-wrap">
            <Award size={18} className="text-[var(--accent)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium">Bulk-issue certificates</div>
              <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">
                Run the cert wizard from the attendance hub. Filter by minimum attended days, pick template + signatories, preview before sending.
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(`/admin/events/${event.id}/attendance?tab=certificates`)}>
              <Award size={11} className="mr-1.5" />
              Open cert wizard
            </Button>
          </div>
        </DSCard>
      </Section>
      </>
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their registration will be cancelled and their attendance record (if any) deleted. They&apos;ll get a free seat back. There&apos;s no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              disabled={deleteMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dissolve team confirm — restored from HEAD */}
      <AlertDialog open={Boolean(dissolveTarget)} onOpenChange={(o) => !o && setDissolveTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Dissolve &ldquo;{dissolveTarget?.teamName}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              All team members will be unregistered from this event. There&apos;s no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dissolveTarget && dissolveMut.mutate(dissolveTarget.id)}
              disabled={dissolveMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {dissolveMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Dissolve team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Filter size={14} />
              Export — {event.title}
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
                onChange={(v) => setExportFilter('format', v as ExportFormat)}
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
                      onClick={() => setExportFilter('registrationType', opt.value)}
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
              <Input value={exportFilters.year ?? ''} onChange={(ev) => setExportFilter('year', ev.target.value)} placeholder="3rd Year" />
            </Field>
            <Field label="Branch" hint="exact match">
              <Input value={exportFilters.branch ?? ''} onChange={(ev) => setExportFilter('branch', ev.target.value)} placeholder="CSE" />
            </Field>
            <Field label="Course" hint="exact match">
              <Input value={exportFilters.course ?? ''} onChange={(ev) => setExportFilter('course', ev.target.value)} placeholder="BTech" />
            </Field>
            <Field label="User role">
              <Input value={exportFilters.userRole ?? ''} onChange={(ev) => setExportFilter('userRole', ev.target.value)} placeholder="USER" />
            </Field>
            <Field label="Search" hint="name or email substring" className="sm:col-span-2">
              <Input value={exportFilters.search ?? ''} onChange={(ev) => setExportFilter('search', ev.target.value)} placeholder="alice@example.com" />
            </Field>
          </div>
          <DialogFooter className="flex items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExportFilters(DEFAULT_EXPORT_FILTERS)}
              disabled={!exportFiltersActive(exportFilters) && exportFilters.format === 'xlsx'}
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

      {/* Delete entire event — PRESIDENT / superAdmin only. Cascades on the server. */}
      <AlertDialog
        open={Boolean(deletingEventTarget)}
        onOpenChange={(o) => !o && setDeletingEventTarget(null)}
      >
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingEventTarget?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the event, every registration, every guest invitation, and every team. Certificates already issued stay valid. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEventMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEventMut.mutate()}
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

