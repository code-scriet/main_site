// Shared user-detail body. Mounted in two shells: the slide-over Sheet from
// /admin/users and the full-page route at /admin/users/:id. Tabs cover the
// material surface: Overview, Profile (edit), Activity (Events/Certificates/
// QOTD/Quiz/Playground), Blocks, Audit, Danger zone. The "Activity" tabs are
// rendered as a single panel with sections so the sheet stays scrollable.

import { useEffect, useState } from 'react';
import { Award, BookOpen, Calendar, ChevronRight, Code, Flame, Loader2, Mail, ShieldAlert, ShieldOff, Sparkles, Trash2, UserCog, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/context/AuthContext';
import { api, type UserBlock, type UserBlockFeature } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { getRoleBadge, relativeTime } from '@/lib/userBadges';
import { useUserAdminActions, useUserAudit, useUserBlocks, useUserFull } from '@/hooks/useUserDetail';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';

interface Props {
  userId: string;
}

const BLOCK_FEATURES: UserBlockFeature[] = ['EVENT', 'PLAYGROUND', 'QOTD', 'QUIZ', 'NETWORK'];

export function UserDetailContent({ userId }: Props) {
  const detail = useUserFull(userId);
  const blocks = useUserBlocks(userId);
  const user = detail.data?.user;
  const perms = useAdminPermissions(user ? { id: user.id, email: user.email, role: user.role } : null);

  if (detail.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }
  if (detail.isError || !user) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {extractApiErrorMessage(detail.error, 'Failed to load user detail')}
      </div>
    );
  }

  const badge = getRoleBadge(user.role);
  const RoleIcon = badge.icon;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-soft)] text-lg font-medium text-[var(--ds-text-2)]">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            (user.name || '?').slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--ds-text-1)]">{user.name}</h2>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
              <RoleIcon className="h-3 w-3" /> {badge.label}
            </span>
            {user.isDeleted && <Badge variant="destructive">Deleted</Badge>}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-[var(--ds-text-3)]">{user.email}</div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
            Last seen {relativeTime(user.lastLoginAt)}
            {user.lastLoginIp && perms.isSuperAdmin && ` · ${user.lastLoginIp}`}
            {' · '}
            Joined {relativeTime(user.createdAt)}
          </div>
        </div>
      </header>

      <UserDetailTabs perms={perms} userId={userId} blocks={blocks.data ?? []} blocksLoading={blocks.isLoading} />
    </div>
  );
}

function UserDetailTabs({ perms, userId, blocks, blocksLoading }: { perms: ReturnType<typeof useAdminPermissions>; userId: string; blocks: UserBlock[]; blocksLoading: boolean }) {
  const [tab, setTab] = useState<string>('overview');
  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="flex w-full flex-wrap gap-1">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="blocks">Blocks</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
        {perms.canMutate && <TabsTrigger value="danger">Danger</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="space-y-4 pt-3">
        <OverviewTab userId={userId} />
      </TabsContent>
      <TabsContent value="profile" className="space-y-4 pt-3">
        <ProfileTab userId={userId} />
      </TabsContent>
      <TabsContent value="activity" className="space-y-4 pt-3">
        <ActivityTab userId={userId} />
      </TabsContent>
      <TabsContent value="blocks" className="space-y-4 pt-3">
        <BlocksTab userId={userId} blocks={blocks} isLoading={blocksLoading} />
      </TabsContent>
      <TabsContent value="audit" className="space-y-4 pt-3">
        <AuditTab userId={userId} />
      </TabsContent>
      {perms.canMutate && (
        <TabsContent value="danger" className="space-y-4 pt-3">
          <DangerTab userId={userId} />
        </TabsContent>
      )}
    </Tabs>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────
function OverviewTab({ userId }: { userId: string }) {
  const detail = useUserFull(userId);
  const actions = useUserAdminActions(userId);
  const user = detail.data?.user;
  const counts = detail.data?.counts;
  const perms = useAdminPermissions(user ? { id: user.id, email: user.email, role: user.role } : null);

  if (!user || !counts) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard icon={<Flame className="h-4 w-4 text-orange-500" />} label="Current streak" value={user.currentStreak ?? 0} />
        <StatCard icon={<Sparkles className="h-4 w-4 text-amber-500" />} label="Longest streak" value={user.longestStreak ?? 0} />
        <StatCard icon={<Calendar className="h-4 w-4 text-emerald-500" />} label="Events" value={counts.eventRegistrations} />
        <StatCard icon={<Award className="h-4 w-4 text-violet-500" />} label="Certificates" value={counts.certificates} />
        <StatCard icon={<Code className="h-4 w-4 text-sky-500" />} label="Playground runs" value={counts.executions} />
        <StatCard icon={<Zap className="h-4 w-4 text-pink-500" />} label="Quiz games" value={counts.quizParticipants} />
      </div>

      {perms.canMutate && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-[var(--ds-text-3)]">Streak controls:</span>
          <Button
            variant="outline"
            size="sm"
            disabled={actions.resetStreak.isPending}
            onClick={() =>
              actions.resetStreak.mutate(undefined, {
                onSuccess: () => toast.success('Streak reset to 0'),
                onError: (e) => toast.error(extractApiErrorMessage(e, 'Failed')),
              })
            }
          >
            Reset to 0
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={actions.restoreStreak.isPending}
            onClick={() =>
              actions.restoreStreak.mutate(undefined, {
                onSuccess: () => toast.success('Streak restored to longest'),
                onError: (e) => toast.error(extractApiErrorMessage(e, 'Failed')),
              })
            }
          >
            Restore longest ({user.longestStreak ?? 0})
          </Button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-[var(--ds-text-1)]">{value}</div>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────
function ProfileTab({ userId }: { userId: string }) {
  const detail = useUserFull(userId);
  const user = detail.data?.user;
  const { token } = useAuth();
  const qc = useQueryClient();
  const perms = useAdminPermissions(user ? { id: user.id, email: user.email, role: user.role } : null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name ?? '',
        bio: user.bio ?? '',
        phone: user.phone ?? '',
        course: user.course ?? '',
        branch: user.branch ?? '',
        year: user.year ?? '',
        githubUrl: user.githubUrl ?? '',
        linkedinUrl: user.linkedinUrl ?? '',
        twitterUrl: user.twitterUrl ?? '',
        websiteUrl: user.websiteUrl ?? '',
      });
    }
  }, [user]);

  if (!user) return null;

  const fields: Array<{ key: string; label: string; multiline?: boolean }> = [
    { key: 'name', label: 'Name' },
    { key: 'bio', label: 'Bio', multiline: true },
    { key: 'phone', label: 'Phone' },
    { key: 'course', label: 'Course' },
    { key: 'branch', label: 'Branch' },
    { key: 'year', label: 'Year' },
    { key: 'githubUrl', label: 'GitHub' },
    { key: 'linkedinUrl', label: 'LinkedIn' },
    { key: 'twitterUrl', label: 'Twitter' },
    { key: 'websiteUrl', label: 'Website' },
  ];

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.updateUser(userId, form, token);
      toast.success('Profile updated');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['admin-user-full', userId] });
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">Email cannot be changed from this surface.</div>
        {perms.canActOnTarget && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
            </Button>
          </div>
        )}
      </div>
      <dl className="space-y-2">
        <FieldRow label="Email" value={user.email} readOnly />
        {fields.map((f) => (
          <FieldRow
            key={f.key}
            label={f.label}
            value={form[f.key] ?? ''}
            readOnly={!editing}
            multiline={f.multiline}
            onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))}
          />
        ))}
      </dl>
    </div>
  );
}

function FieldRow({
  label,
  value,
  readOnly,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  multiline?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-[var(--border-subtle)] px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-[var(--ds-text-3)]">{label}</dt>
      <dd>
        {readOnly ? (
          <span className="text-sm text-[var(--ds-text-2)]">{value || <span className="text-[var(--ds-text-3)]">—</span>}</span>
        ) : multiline ? (
          <Textarea value={value} onChange={(e) => onChange?.(e.target.value)} rows={3} className="text-sm" />
        ) : (
          <Input value={value} onChange={(e) => onChange?.(e.target.value)} className="text-sm" />
        )}
      </dd>
    </div>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────
function ActivityTab({ userId }: { userId: string }) {
  const detail = useUserFull(userId);
  const data = detail.data;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <Section title="Recent events" icon={<Calendar className="h-4 w-4" />}>
        {data.eventRegistrations.length === 0 ? (
          <Empty>No event registrations yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {data.eventRegistrations.slice(0, 25).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--ds-text-1)]">{r.event.title}</div>
                  <div className="text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
                    {new Date(r.timestamp).toLocaleDateString()} · {r.registrationType === 'GUEST' ? 'Guest' : 'Participant'}
                    {r.attended ? ' · Attended' : ''}
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Certificates" icon={<Award className="h-4 w-4" />}>
        {data.certificates.length === 0 ? (
          <Empty>No certificates issued.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {data.certificates.slice(0, 15).map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--ds-text-1)]">{c.eventName}</div>
                  <div className="text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
                    {c.certId} · {c.type}
                    {c.isRevoked ? ' · Revoked' : ''}
                  </div>
                </div>
                <span className="text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">{relativeTime(c.issuedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="QOTD submissions" icon={<BookOpen className="h-4 w-4" />}>
        {data.qotdSubmissions.length === 0 ? (
          <Empty>No QOTD submissions.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {data.qotdSubmissions.slice(0, 15).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0 truncate">{s.qotd?.question ?? '—'}</div>
                <span className="ml-3 shrink-0 text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
                  {s.qotd?.difficulty}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Quiz participations" icon={<Zap className="h-4 w-4" />}>
        {data.quizParticipants.length === 0 ? (
          <Empty>No quiz games played.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {data.quizParticipants.slice(0, 15).map((q) => (
              <li key={q.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0 truncate font-medium">{q.quiz.title}</div>
                <span className="text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
                  Score {q.finalScore}
                  {q.finalRank != null ? ` · Rank ${q.finalRank}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Playground usage (30d)" icon={<Code className="h-4 w-4" />}>
        {data.playgroundUsage.length === 0 ? (
          <Empty>No playground activity.</Empty>
        ) : (
          <div className="flex h-16 items-end gap-1">
            {data.playgroundUsage.slice().reverse().map((u) => {
              const max = Math.max(...data.playgroundUsage.map((x) => x.count), 1);
              return (
                <div
                  key={u.usageDate}
                  title={`${new Date(u.usageDate).toLocaleDateString()} — ${u.count}`}
                  className="flex-1 rounded-t bg-sky-500/70"
                  style={{ height: `${Math.max(8, (u.count / max) * 64)}px` }}
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-[var(--ds-text-3)]">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-[var(--border-subtle)] px-3 py-4 text-center text-xs text-[var(--ds-text-3)]">{children}</div>;
}

// ─── Blocks ───────────────────────────────────────────────────────────────
function BlocksTab({ userId, blocks, isLoading }: { userId: string; blocks: UserBlock[]; isLoading: boolean }) {
  const detail = useUserFull(userId);
  const user = detail.data?.user;
  const perms = useAdminPermissions(user ? { id: user.id, email: user.email, role: user.role } : null);
  const actions = useUserAdminActions(userId);
  const [feature, setFeature] = useState<UserBlockFeature>('EVENT');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState<string>('');

  const submit = () => {
    actions.block.mutate(
      {
        feature,
        reason: reason || null,
        expiresAt: expires ? new Date(expires).toISOString() : null,
      },
      {
        onSuccess: () => {
          toast.success(`Blocked from ${feature.toLowerCase()}`);
          setReason('');
          setExpires('');
        },
        onError: (e) => toast.error(extractApiErrorMessage(e, 'Failed to block')),
      },
    );
  };

  return (
    <div className="space-y-4">
      {perms.canMutate && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3">
          <div className="text-xs font-medium text-zinc-500 dark:text-[var(--ds-text-3)]">Add or refresh a block</div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-zinc-500 dark:text-[var(--ds-text-3)]">Feature</span>
              <select
                value={feature}
                onChange={(e) => setFeature(e.target.value as UserBlockFeature)}
                className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3 text-sm"
              >
                {BLOCK_FEATURES.map((f) => (
                  <option key={f} value={f}>
                    {f.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-zinc-500 dark:text-[var(--ds-text-3)]">Reason (optional)</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Internal note" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-zinc-500 dark:text-[var(--ds-text-3)]">Expires (optional)</span>
              <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
            <Button onClick={submit} disabled={actions.block.isPending}>
              {actions.block.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Apply
            </Button>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-[var(--ds-text-3)]">Active blocks</div>
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : !blocks || blocks.length === 0 ? (
          <Empty>This user has no blocks.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)]">
            {blocks.map((b) => {
              const expired = b.expiresAt && new Date(b.expiresAt).getTime() < Date.now();
              return (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                  <ShieldOff className={`h-4 w-4 ${expired ? 'text-[var(--ds-text-3)]' : 'text-red-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--ds-text-1)]">
                      {b.feature.toLowerCase()}
                      {expired && <span className="ml-2 text-xs text-zinc-500">(expired)</span>}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
                      {b.reason ? `${b.reason} · ` : ''}
                      since {relativeTime(b.blockedAt)}
                      {b.expiresAt ? ` · until ${new Date(b.expiresAt).toLocaleString()}` : ''}
                    </div>
                  </div>
                  {perms.canMutate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        actions.unblock.mutate(b.feature, {
                          onSuccess: () => toast.success('Block removed'),
                          onError: (e) => toast.error(extractApiErrorMessage(e, 'Failed to unblock')),
                        })
                      }
                      disabled={actions.unblock.isPending}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Audit ────────────────────────────────────────────────────────────────
function AuditTab({ userId }: { userId: string }) {
  const [as, setAs] = useState<'actor' | 'target'>('target');
  const audit = useUserAudit(userId, as);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={as === 'target' ? 'default' : 'outline'} onClick={() => setAs('target')}>
          As target
        </Button>
        <Button size="sm" variant={as === 'actor' ? 'default' : 'outline'} onClick={() => setAs('actor')}>
          As actor
        </Button>
      </div>
      {audit.isLoading ? (
        <Skeleton className="h-32" />
      ) : !audit.data || audit.data.entries.length === 0 ? (
        <Empty>No audit entries.</Empty>
      ) : (
        <ul className="space-y-2">
          {audit.data.entries.map((e) => (
            <li key={e.id} className="rounded-md border border-[var(--border-subtle)] px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[var(--ds-text-1)]">{e.action}</span>
                <span className="text-xs text-zinc-500">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">
                {e.entity}
                {e.entityId ? ` #${e.entityId.slice(0, 8)}` : ''}
              </div>
              {Boolean(e.metadata && typeof e.metadata === 'object' && Object.keys(e.metadata).length > 0) && (
                <pre className="mt-2 overflow-x-auto rounded bg-[var(--surface-soft)] p-2 text-[11px] text-[var(--ds-text-2)]">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Danger zone ──────────────────────────────────────────────────────────
function DangerTab({ userId }: { userId: string }) {
  const detail = useUserFull(userId);
  const user = detail.data?.user;
  const actions = useUserAdminActions(userId);
  const perms = useAdminPermissions(user ? { id: user.id, email: user.email, role: user.role } : null);
  const [confirm, setConfirm] = useState<null | 'force-logout' | 'password-reset' | 'soft-delete' | 'restore' | 'hard-delete'>(null);
  const [typed, setTyped] = useState('');

  if (!user) return null;

  const close = () => {
    setConfirm(null);
    setTyped('');
  };
  const exec = async () => {
    try {
      if (confirm === 'force-logout') {
        await actions.forceLogout.mutateAsync();
        toast.success('All sessions revoked');
      } else if (confirm === 'password-reset') {
        await actions.sendReset.mutateAsync();
        toast.success('Password-reset email sent');
      } else if (confirm === 'soft-delete') {
        await actions.softDelete.mutateAsync();
        toast.success('User soft-deleted');
      } else if (confirm === 'restore') {
        await actions.restore.mutateAsync();
        toast.success('User restored');
      } else if (confirm === 'hard-delete') {
        await actions.hardDelete.mutateAsync();
        toast.success('User hard-deleted');
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Action failed'));
    } finally {
      close();
    }
  };

  const needsTyped = confirm === 'soft-delete' || confirm === 'hard-delete';
  const typedOk = !needsTyped || typed.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Every action below writes an audit entry. Some are irreversible.
      </div>

      <DangerRow
        icon={<UserCog className="h-4 w-4" />}
        title="Force logout"
        description="Increments the user's tokenVersion. All existing JWTs and cookies become invalid; they must sign in again."
        disabled={!perms.canMutate}
        onClick={() => setConfirm('force-logout')}
      />
      <DangerRow
        icon={<Mail className="h-4 w-4" />}
        title="Send password-reset email"
        description="Generates a 30-minute single-use reset link and emails it to the user. Their existing sessions stay valid until they use the link."
        disabled={!perms.canMutate}
        onClick={() => setConfirm('password-reset')}
      />
      {!user.isDeleted ? (
        <DangerRow
          icon={<Trash2 className="h-4 w-4 text-red-500" />}
          title="Soft delete"
          description="Marks the account as deleted, force-logs them out, and blocks every feature. Reversible by super admin."
          disabled={!perms.canSoftDelete}
          onClick={() => setConfirm('soft-delete')}
          variant="destructive"
        />
      ) : (
        <DangerRow
          icon={<ShieldAlert className="h-4 w-4 text-emerald-500" />}
          title="Restore"
          description="Re-enables the account and removes auto-blocks created on soft-delete. Manual blocks are preserved."
          disabled={!perms.canRestore}
          onClick={() => setConfirm('restore')}
        />
      )}
      {perms.canHardDelete && (
        <DangerRow
          icon={<Trash2 className="h-4 w-4 text-red-600" />}
          title="Hard delete"
          description="Permanently removes the user row. Refuses if the user owns events, announcements, polls, problems, invitations, or led teams (Restrict FKs)."
          disabled={!perms.canHardDelete}
          onClick={() => setConfirm('hard-delete')}
          variant="destructive"
        />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'force-logout' && 'Force-log out this user?'}
              {confirm === 'password-reset' && 'Send a password-reset email?'}
              {confirm === 'soft-delete' && 'Soft delete this user?'}
              {confirm === 'restore' && 'Restore this user?'}
              {confirm === 'hard-delete' && 'Hard delete this user permanently?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'force-logout' && 'All active sessions across all devices will be revoked. The user must sign in again.'}
              {confirm === 'password-reset' && `An email will be sent to ${user.email} with a 30-minute reset link.`}
              {confirm === 'soft-delete' && 'The user will be marked deleted, logged out, and blocked from every feature. A super admin can restore them.'}
              {confirm === 'restore' && 'The account will be re-enabled. Auto-blocks created on soft-delete will be removed.'}
              {confirm === 'hard-delete' && 'This action cannot be undone. The user row will be deleted from the database.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsTyped && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-500">
                Type <span className="font-mono font-semibold">{user.email}</span> to confirm.
              </div>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </div>
          )}
          <Separator />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={close}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={exec} disabled={!typedOk}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DangerRow({
  icon, title, description, onClick, disabled, variant,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'destructive';
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--ds-text-1)]">{title}</div>
        <div className="text-xs text-zinc-500 dark:text-[var(--ds-text-3)]">{description}</div>
      </div>
      <Button variant={variant === 'destructive' ? 'destructive' : 'outline'} size="sm" onClick={onClick} disabled={disabled}>
        Run
      </Button>
    </div>
  );
}
