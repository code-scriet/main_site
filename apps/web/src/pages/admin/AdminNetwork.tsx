// Dashboard v2 — Admin · Network Management.
// Stats row + pending verification list + verified profile grid + reject/edit dialogs.
// Pixel-port of screen-admin2.jsx:284 (AdminNetworkScreen) with real /api/network/admin data.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Star, MoreHorizontal, Linkedin, Github, ExternalLink, X, Check, Globe, Download, UserMinus, Trash2, Edit3, Eye, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type NetworkProfile, type NetworkEvent, type NetworkProfileInput } from '@/lib/api';
import {
  Avatar, DSCard, EmptyState, SegmentedTabs, Section,
} from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ViewProfileDialog } from '@/components/admin/network/ViewProfileDialog';
import { EditProfileDialog } from '@/components/admin/network/EditProfileDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dateUtils';

const NULLABLE_PROFILE_FIELDS = new Set([
  'bio', 'profilePhoto', 'phone', 'linkedinUsername', 'twitterUsername', 'githubUsername', 'personalWebsite',
  'connectionNote', 'passoutYear', 'degree', 'branch', 'rollNumber', 'achievements',
  'currentLocation', 'vision', 'story', 'expertise', 'adminNotes', 'rejectionReason',
]);

// Connection-category groups for the Verified filter dropdown.
// Mirrors HEAD's `connectionCategory: 'ANY' | 'PROFESSIONAL' | 'ALUMNI'`.
type ConnectionCategory = 'ANY' | 'PROFESSIONAL' | 'ALUMNI';
const PROFESSIONAL_TYPES = new Set(['GUEST_SPEAKER', 'GMEET_SESSION', 'EVENT_JUDGE', 'MENTOR', 'INDUSTRY_PARTNER', 'OTHER']);
const ALUMNI_TYPES = new Set(['ALUMNI']);

export default function AdminNetwork() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [verifyFilter, setVerifyFilter] = useState<'all' | 'featured'>('all');
  const [connectionCategory, setConnectionCategory] = useState<ConnectionCategory>('ANY');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<NetworkProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deletePendingTarget, setDeletePendingTarget] = useState<{ id: string; name: string } | null>(null);
  // View / edit / export wiring restored from HEAD (E6).
  const [viewProfile, setViewProfile] = useState<NetworkProfile | null>(null);
  const [editTarget, setEditTarget] = useState<NetworkProfile | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editEvents, setEditEvents] = useState<NetworkEvent[]>([]);
  const [exporting, setExporting] = useState(false);

  // Pending NETWORK-role users that have NOT created a profile yet — restored from HEAD
  const pendingUsersQ = useQuery({
    queryKey: ['network-pending-users'],
    queryFn: () => api.getNetworkPendingUsers(token!),
    enabled: Boolean(token),
  });

  const revertMut = useMutation({
    mutationFn: (userId: string) => api.revertPendingNetworkUser(userId, token!),
    onSuccess: () => {
      toast.success('User reverted to USER role');
      qc.invalidateQueries({ queryKey: ['network-pending-users'] });
    },
    onError: () => toast.error('Revert failed'),
  });
  const deletePendingMut = useMutation({
    mutationFn: (userId: string) => api.deletePendingNetworkUser(userId, token!),
    onSuccess: () => {
      toast.success('User deleted');
      qc.invalidateQueries({ queryKey: ['network-pending-users'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const pendingQ = useQuery({
    queryKey: ['network-pending'],
    queryFn: () => api.getNetworkPending(token!),
    enabled: Boolean(token),
  });
  const allQ = useQuery({
    queryKey: ['network-all', 'VERIFIED'],
    queryFn: () => api.getNetworkAll(token!, 'VERIFIED'),
    enabled: Boolean(token),
  });
  const statsQ = useQuery({
    queryKey: ['network-stats'],
    queryFn: () => api.getNetworkStats(token!),
    enabled: Boolean(token),
  });

  const verifyMut = useMutation({
    mutationFn: (id: string) => api.verifyNetworkProfile(id, token!),
    onSuccess: () => {
      toast.success('Profile verified');
      qc.invalidateQueries({ queryKey: ['network-pending'] });
      qc.invalidateQueries({ queryKey: ['network-all'] });
      qc.invalidateQueries({ queryKey: ['network-stats'] });
    },
    onError: () => toast.error('Failed to verify'),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.rejectNetworkProfile(id, reason, token!),
    onSuccess: () => {
      toast.success('Profile rejected');
      setRejectTarget(null);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['network-pending'] });
      qc.invalidateQueries({ queryKey: ['network-stats'] });
    },
    onError: () => toast.error('Failed to reject'),
  });

  // Inline edit save — mirrors HEAD's handleEditSubmit. Convert blanks to null for nullable
  // fields, coerce numeric fields, send only changed entries via `updateNetworkProfileAdmin`.
  const editSaveMut = useMutation({
    mutationFn: async () => {
      if (!editTarget || !token) throw new Error('not authenticated');
      const updates: Partial<NetworkProfileInput> & Record<string, unknown> = {};
      for (const [key, value] of Object.entries(editForm)) {
        if (key === 'connectedSince' || key === 'passoutYear' || key === 'displayOrder') continue;
        if (value === '' && NULLABLE_PROFILE_FIELDS.has(key)) {
          (updates as Record<string, unknown>)[key] = null;
        } else {
          (updates as Record<string, unknown>)[key] = value;
        }
      }
      if (editForm.connectedSince) {
        const parsed = parseInt(editForm.connectedSince, 10);
        if (Number.isFinite(parsed)) updates.connectedSince = parsed;
      }
      if (editForm.passoutYear) {
        const parsed = parseInt(editForm.passoutYear, 10);
        if (Number.isFinite(parsed)) updates.passoutYear = parsed;
      }
      if (editForm.displayOrder !== undefined && editForm.displayOrder !== '') {
        const parsed = parseInt(editForm.displayOrder, 10);
        if (Number.isFinite(parsed)) updates.displayOrder = parsed;
      }
      // `events` is accepted by the admin update route even though it's not on `NetworkProfileInput`.
      (updates as Record<string, unknown>).events = editEvents;
      await api.updateNetworkProfileAdmin(editTarget.id, updates, token);
    },
    onSuccess: () => {
      toast.success('Profile updated');
      setEditTarget(null);
      setEditForm({});
      setEditEvents([]);
      qc.invalidateQueries({ queryKey: ['network-all'] });
      qc.invalidateQueries({ queryKey: ['network-pending'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save changes'),
  });

  const openEdit = (profile: NetworkProfile) => {
    setEditTarget(profile);
    setEditForm({
      fullName: profile.fullName ?? '',
      designation: profile.designation ?? '',
      company: profile.company ?? '',
      industry: profile.industry ?? '',
      bio: profile.bio ?? '',
      profilePhoto: profile.profilePhoto ?? '',
      phone: profile.phone ?? '',
      linkedinUsername: profile.linkedinUsername ?? '',
      twitterUsername: profile.twitterUsername ?? '',
      githubUsername: profile.githubUsername ?? '',
      personalWebsite: profile.personalWebsite ?? '',
      connectionType: profile.connectionType ?? '',
      connectionNote: profile.connectionNote ?? '',
      connectedSince: profile.connectedSince ? String(profile.connectedSince) : '',
      passoutYear: profile.passoutYear ? String(profile.passoutYear) : '',
      degree: profile.degree ?? '',
      branch: profile.branch ?? '',
      rollNumber: profile.rollNumber ?? '',
      currentLocation: profile.currentLocation ?? '',
      achievements: profile.achievements ?? '',
      vision: profile.vision ?? '',
      story: profile.story ?? '',
      expertise: profile.expertise ?? '',
      adminNotes: profile.adminNotes ?? '',
      displayOrder: String(profile.displayOrder ?? 0),
    });
    setEditEvents(Array.isArray(profile.events) ? (profile.events as NetworkEvent[]) : []);
  };

  const handleExportExcel = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (connectionCategory !== 'ANY') params.set('category', connectionCategory);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const res = await fetch(`${apiUrl}/network/admin/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `network-${connectionCategory.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel exported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const stats = useMemo(() => {
    const verified = statsQ.data?.totalVerified ?? allQ.data?.counts?.VERIFIED ?? 0;
    const pending = statsQ.data?.totalPending ?? allQ.data?.counts?.PENDING ?? (pendingQ.data?.length ?? 0);
    const rejected = allQ.data?.counts?.REJECTED ?? 0;
    return [
      { l: 'Verified', v: verified, tone: 'var(--success)' },
      { l: 'Pending', v: pending, tone: 'var(--warning)' },
      { l: 'Rejected', v: rejected, tone: 'var(--ds-text-3)' },
    ];
  }, [statsQ.data, allQ.data, pendingQ.data]);

  const pending = pendingQ.data ?? [];
  const allVerified = allQ.data?.profiles ?? [];
  const verifiedFiltered = useMemo(() => {
    return allVerified
      .filter((p) => (verifyFilter === 'featured' ? p.isFeatured : true))
      .filter((p) => {
        if (connectionCategory === 'ANY') return true;
        const ct = p.connectionType ?? '';
        if (connectionCategory === 'PROFESSIONAL') return PROFESSIONAL_TYPES.has(ct);
        return ALUMNI_TYPES.has(ct);
      })
      .filter((p) =>
        !search.trim()
          ? true
          : (p.fullName + ' ' + p.designation + ' ' + p.company).toLowerCase().includes(search.toLowerCase()),
      );
  }, [allVerified, verifyFilter, connectionCategory, search]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin · Network</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Network management</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Alumni and industry guests visible on the public network page.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => void handleExportExcel()} disabled={exporting}>
            {exporting ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Download size={13} className="mr-1.5" />}
            Export Excel{connectionCategory !== 'ANY' ? ` (${connectionCategory.toLowerCase()})` : ''}
          </Button>
          <Button size="sm" asChild>
            <a href="/join-our-network" target="_blank" rel="noreferrer">
              <Plus size={13} className="mr-1.5" />
              Invite member
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-y-3 border-y border-[var(--border-subtle)] py-4">
        {stats.map((s, i) => (
          <div key={s.l} className={cn(i > 0 && 'border-l border-[var(--border-subtle)] pl-5')}>
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{s.l}</div>
            <div className="text-[24px] font-semibold tabular-nums leading-none mt-1.5" style={{ color: s.tone }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Pending NETWORK-role users with no profile yet — restored from HEAD */}
      {((pendingUsersQ.data as { users?: Array<{ id: string; name: string; email: string; createdAt: string; avatar?: string | null }> } | undefined)?.users ?? []).length > 0 && (
        <Section eyebrow="Pending users" title={`${((pendingUsersQ.data as { users?: unknown[] } | undefined)?.users ?? []).length} chose NETWORK at signup but never completed a profile`}>
          <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {((pendingUsersQ.data as { users?: Array<{ id: string; name: string; email: string; createdAt: string; avatar?: string | null }> } | undefined)?.users ?? []).map((u: { id: string; name: string; email: string; createdAt: string; avatar?: string | null }) => (
              <div key={u.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <Avatar name={u.name} src={u.avatar ?? undefined} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{u.name}</div>
                  <div className="text-[11px] text-[var(--ds-text-3)] truncate">{u.email}</div>
                </div>
                <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums hidden sm:inline">
                  joined {relativeTime(u.createdAt)}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => revertMut.mutate(u.id)}
                    disabled={revertMut.isPending}
                  >
                    <UserMinus size={11} className="mr-1.5" />
                    Revert to USER
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeletePendingTarget({ id: u.id, name: u.name })}
                    disabled={deletePendingMut.isPending}
                    className="text-[var(--ds-text-3)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section eyebrow="Pending verification" title={`${pending.length} awaiting review`}>
        {pendingQ.isLoading ? (
          <div className="h-24 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : pending.length === 0 ? (
          <DSCard padded>
            <EmptyState title="Nothing pending" body="When a network signup arrives, it shows here for verification." />
          </DSCard>
        ) : (
          <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {pending.map((p) => (
              <div key={p.id} className="py-3 flex items-center gap-3 flex-wrap">
                <Avatar name={p.fullName} src={p.profilePhoto} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium">{p.fullName}</span>
                    <span className="text-[12px] text-[var(--ds-text-3)]">·</span>
                    <span className="text-[12.5px] text-[var(--ds-text-2)] truncate">
                      {p.designation}{p.company ? `, ${p.company}` : ''}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">
                    <span className="font-mono">
                      {p.passoutYear ? `Alum '${String(p.passoutYear).slice(-2)}` : p.connectionType?.replace(/_/g, ' ')}
                      {p.branch && ` · ${p.branch}`}
                    </span>
                    {p.createdAt && <span> · applied {relativeTime(p.createdAt as unknown as string)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.slug && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/network/${p.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink size={11} className="mr-1" />
                        View
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setRejectTarget(p); setRejectReason(''); }}
                    className="text-[var(--danger)] hover:bg-[var(--danger-bg)] border-[var(--danger-border)]"
                  >
                    <X size={11} className="mr-1" />
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => verifyMut.mutate(p.id)} disabled={verifyMut.isPending}>
                    <Check size={11} className="mr-1" />
                    Verify
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        eyebrow="Verified"
        title={`${allVerified.length} active`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-[220px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search verified…"
                className="pl-8 h-8 text-[13px]"
              />
            </div>
            <SegmentedTabs
              items={[
                { value: 'ANY', label: 'All' },
                { value: 'PROFESSIONAL', label: 'Industry' },
                { value: 'ALUMNI', label: 'Alumni' },
              ]}
              value={connectionCategory}
              onChange={(v) => setConnectionCategory(v as ConnectionCategory)}
            />
            <SegmentedTabs
              items={[
                { value: 'all', label: 'All' },
                { value: 'featured', label: 'Featured' },
              ]}
              value={verifyFilter}
              onChange={(v) => setVerifyFilter(v as 'all' | 'featured')}
            />
          </div>
        }
      >
        {allQ.isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />)}
          </div>
        ) : verifiedFiltered.length === 0 ? (
          <DSCard padded>
            <EmptyState title="No verified profiles" body="Verify a pending profile to populate the public network page." />
          </DSCard>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {verifiedFiltered.map((p) => (
              <DSCard key={p.id} padded hover className="cursor-pointer" onClick={() => setViewProfile(p)}>
                <div className="flex items-start gap-3">
                  <Avatar name={p.fullName} src={p.profilePhoto} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold leading-tight truncate">{p.fullName}</span>
                      {p.isFeatured && <Star size={11} className="text-[var(--warning)] fill-current shrink-0" />}
                    </div>
                    <div className="text-[12px] text-[var(--ds-text-2)] mt-0.5 truncate">{p.designation}</div>
                    <div className="text-[11.5px] text-[var(--ds-text-3)] font-mono mt-0.5 truncate">
                      {p.company}
                      {p.passoutYear ? ` · Alum '${String(p.passoutYear).slice(-2)}` : ''}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                      {p.linkedinUsername && (
                        <a href={`https://linkedin.com/in/${p.linkedinUsername}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="size-5 rounded-[5px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]">
                          <Linkedin size={11} />
                        </a>
                      )}
                      {p.githubUsername && (
                        <a href={`https://github.com/${p.githubUsername}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="size-5 rounded-[5px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]">
                          <Github size={11} />
                        </a>
                      )}
                      {p.personalWebsite && (
                        <a href={p.personalWebsite} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="size-5 rounded-[5px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]">
                          <Globe size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Actions for ${p.fullName}`}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onSelect={() => setViewProfile(p)}>
                        <Eye className="mr-2 h-3.5 w-3.5" /> View profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openEdit(p)}>
                        <Edit3 className="mr-2 h-3.5 w-3.5" /> Edit
                      </DropdownMenuItem>
                      {p.slug && (
                        <DropdownMenuItem onSelect={() => window.open(`/network/${p.slug}`, '_blank')}>
                          <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open public page
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => { setRejectTarget(p); setRejectReason(''); }}
                        className="text-[var(--danger)] focus:text-[var(--danger)]"
                      >
                        <X className="mr-2 h-3.5 w-3.5" /> Revoke verification
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </DSCard>
            ))}
          </div>
        )}
      </Section>

      {/* Delete pending user confirm (replaces window.confirm). */}
      <AlertDialog open={Boolean(deletePendingTarget)} onOpenChange={(o) => !o && setDeletePendingTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletePendingTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account is removed permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePendingTarget) {
                  deletePendingMut.mutate(deletePendingTarget.id);
                  setDeletePendingTarget(null);
                }
              }}
              disabled={deletePendingMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View / Edit dialogs (restored from HEAD — E6). */}
      <ViewProfileDialog
        profile={viewProfile}
        actionLoading={verifyMut.isPending || rejectMut.isPending}
        onClose={() => setViewProfile(null)}
        onEdit={(profile) => { setViewProfile(null); openEdit(profile); }}
        onVerify={(profile) => verifyMut.mutate(profile.id)}
        onReject={(profile) => { setViewProfile(null); setRejectTarget(profile); setRejectReason(''); }}
      />
      <EditProfileDialog
        target={editTarget}
        form={editForm}
        onFormChange={setEditForm}
        events={editEvents}
        onAddEvent={() => setEditEvents((prev) => [...prev, { title: '', description: '', date: '', imageUrl: '' }])}
        onUpdateEvent={(index, field, value) => setEditEvents((prev) => prev.map((ev, i) => (i === index ? { ...ev, [field]: value } : ev)))}
        onRemoveEvent={(index) => setEditEvents((prev) => prev.filter((_, i) => i !== index))}
        saving={editSaveMut.isPending}
        onCancel={() => { setEditTarget(null); setEditForm({}); setEditEvents([]); }}
        onSave={() => editSaveMut.mutate()}
      />

      {/* Reject dialog */}
      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
          <DialogHeader>
            <DialogTitle>Reject network application</DialogTitle>
            <DialogDescription>
              {rejectTarget?.fullName} will receive the rejection reason by email. They can re-apply later.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional but recommended)"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => rejectTarget && rejectMut.mutate({ id: rejectTarget.id, reason: rejectReason })}
              disabled={rejectMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
