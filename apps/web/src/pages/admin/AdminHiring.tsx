// Dashboard v2 — Admin · Hiring Applications.
// Kanban (PENDING → INTERVIEW_SCHEDULED → SELECTED → REJECTED) with click-to-move + detail dialog.
// Pixel-port of screen-stubs.jsx:241 + brief §7.14.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Download, Mail, Phone, GraduationCap, Eye, AlertCircle, Briefcase, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar, DSCard, EmptyState, Pill, SegmentedTabs } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateUtils';

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
  userId?: string;
  createdAt: string;
}

const STATUSES = ['PENDING', 'INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED'] as const;
type Status = typeof STATUSES[number];

const COL_LABEL: Record<Status, string> = {
  PENDING: 'Pending',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};

const COL_TONE: Record<Status, 'warning' | 'info' | 'success' | 'danger'> = {
  PENDING: 'warning',
  INTERVIEW_SCHEDULED: 'info',
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

export default function AdminHiring() {
  const { token } = useAuth();
  const [apps, setApps] = useState<HiringApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'' | Status>('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<HiringApplication | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [applicationToDelete, setApplicationToDelete] = useState<HiringApplication | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '100');
      const res = await fetch(`${API_URL}/hiring/applications?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load applications');
      const data = await res.json();
      setApps(data.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, roleFilter, statusFilter]);

  useEffect(() => { void load(); }, [load]);

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
    const g: Record<Status, HiringApplication[]> = { PENDING: [], INTERVIEW_SCHEDULED: [], SELECTED: [], REJECTED: [] };
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
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={downloading}>
            {downloading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Download size={13} className="mr-1.5" />}
            Export XLSX
          </Button>
        </div>
      </div>

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
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-64 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />)}
        </div>
      ) : (
        <div className="grid lg:grid-cols-4 gap-3">
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
                  grouped[s].map((a) => (
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
                        <Avatar name={a.name} size={24} />
                        <span className="text-[13px] font-medium truncate flex-1">{a.name}</span>
                      </div>
                      <div className="mt-1.5 text-[11px] text-[var(--ds-text-3)]">
                        {ROLE_LABEL[a.applyingRole] ?? a.applyingRole} · {a.year} · {a.department}
                      </div>
                      {STATUSES.filter((st) => st !== s).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 pt-2 border-t border-[var(--border-subtle)]">
                          {STATUSES.filter((st) => st !== s).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); moveTo(a.id, st); }}
                              className={cn(
                                'text-[10px] font-medium px-1.5 h-5 rounded-[5px] border transition-colors',
                                COL_TONE[st] === 'warning' && 'text-[var(--warning)] border-[var(--warning-border)] hover:bg-[var(--warning-bg)]',
                                COL_TONE[st] === 'info' && 'text-[var(--info)] border-[var(--info-border)] hover:bg-[var(--info-bg)]',
                                COL_TONE[st] === 'success' && 'text-[var(--success)] border-[var(--success-border)] hover:bg-[var(--success-bg)]',
                                COL_TONE[st] === 'danger' && 'text-[var(--danger)] border-[var(--danger-border)] hover:bg-[var(--danger-bg)]',
                              )}
                            >
                              → {COL_LABEL[st]}
                            </button>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
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
              <div className="flex items-center gap-2"><Pill tone={COL_TONE[picked.status as Status] ?? 'neutral'} size="sm">{COL_LABEL[picked.status as Status] ?? picked.status}</Pill><Pill tone="accent" size="sm">{ROLE_LABEL[picked.applyingRole] ?? picked.applyingRole}</Pill></div>
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
