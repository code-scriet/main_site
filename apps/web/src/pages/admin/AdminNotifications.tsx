// Dashboard v3 — Admin · Notifications composer + broadcast history.
// New surface (no existing page). Sends in-app notifications to the bell menu, audience-targeted.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Send, Loader2, AlertCircle, Trash2, Link as LinkIcon, History, CheckCircle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type NotifAudience, type BroadcastRow } from '@/lib/api';
import { Avatar, DSCard, EmptyState, Field, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dateUtils';

const AUDIENCES: Array<{ value: NotifAudience; label: string; description: string }> = [
  { value: 'ALL', label: 'Everyone', description: 'All signed-in users (students, network, admins).' },
  { value: 'USERS', label: 'Students', description: 'Regular and member students; excludes NETWORK role.' },
  { value: 'NETWORK', label: 'Network', description: 'Users with the NETWORK role.' },
  { value: 'ALUMNI', label: 'Alumni only', description: 'Verified network profiles with connectionType=ALUMNI.' },
  { value: 'NETWORK_AND_ALUMNI', label: 'Network + Alumni', description: 'Anyone in the verified network table.' },
  { value: 'CORE_MEMBER', label: 'Core members', description: 'CORE_MEMBER, ADMIN, PRESIDENT.' },
  { value: 'ADMIN', label: 'Admins only', description: 'ADMIN + PRESIDENT.' },
  { value: 'CUSTOM', label: 'Custom', description: 'Specific user IDs or role list.' },
];

const ICONS = ['bell', 'inbox', 'award', 'zap', 'megaphone', 'calendar', 'terminal', 'shield', 'star', 'trophy'] as const;

export default function AdminNotifications() {
  const { token } = useAuth();
  const qc = useQueryClient();

  const [audience, setAudience] = useState<NotifAudience>('ALL');
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [customUserIdsRaw, setCustomUserIdsRaw] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [icon, setIcon] = useState<string>('bell');
  const [expiresAt, setExpiresAt] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BroadcastRow | null>(null);

  const historyQ = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: () => api.listAdminBroadcasts(token!),
    enabled: Boolean(token),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const audienceUserIds = audience === 'CUSTOM'
        ? customUserIdsRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
        : undefined;
      if (audience === 'CUSTOM' && audienceUserIds!.length === 0 && customRoles.length === 0) {
        throw new Error('For CUSTOM audience, specify at least one user ID or role.');
      }
      return api.composeNotification({
        audience,
        audienceRoles: audience === 'CUSTOM' && customRoles.length > 0 ? customRoles : undefined,
        audienceUserIds,
        category: 'admin',
        icon,
        title: title.trim(),
        body: body.trim() || undefined,
        link: link.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }, token!);
    },
    onSuccess: () => {
      toast.success('Notification broadcasted');
      setConfirm(false); setError(null);
      setTitle(''); setBody(''); setLink('');
      setCustomUserIdsRaw(''); setCustomRoles([]);
      qc.invalidateQueries({ queryKey: ['admin-broadcasts'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e: Error) => setError(e.message || 'Failed to send'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteAdminBroadcast(id, token!),
    onSuccess: () => {
      toast.success('Broadcast deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admin-broadcasts'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const toggleRole = (role: string) => {
    setCustomRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  };

  const ALL_ROLES = ['USER', 'MEMBER', 'NETWORK', 'CORE_MEMBER', 'ADMIN', 'PRESIDENT'];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Notifications</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 max-w-prose">
            Send an in-app notification to the bell menu. Targeted by audience. Email flow is separate
            (use <a href="/admin/mail" className="text-[var(--accent)] hover:underline">Send mail</a> for that).
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-4">
        <DSCard padded className="lg:col-span-7 flex flex-col gap-4">
          <div>
            <div className="text-[12px] font-medium text-[var(--ds-text-2)] mb-1.5">Audience</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAudience(a.value)}
                  className={cn(
                    'p-3 rounded-[10px] border text-left transition-all',
                    audience === a.value
                      ? 'bg-[var(--accent-subtle)]/40 border-[var(--accent)] ring-2 ring-[var(--accent-ring)]'
                      : 'bg-[var(--bg-raised)] border-[var(--border-subtle)] hover:border-[var(--border-default)]',
                  )}
                >
                  <div className="text-[12.5px] font-semibold">{a.label}</div>
                  <div className="text-[10.5px] text-[var(--ds-text-3)] mt-0.5 leading-snug">{a.description}</div>
                </button>
              ))}
            </div>
            {audience === 'CUSTOM' && (
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <Field label="Target user IDs" hint="comma or whitespace-separated UUIDs">
                  <textarea
                    value={customUserIdsRaw}
                    onChange={(e) => setCustomUserIdsRaw(e.target.value)}
                    placeholder="user-id-1, user-id-2"
                    className="w-full h-[64px] p-2.5 text-[12px] font-mono bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                  />
                </Field>
                <Field label="OR target roles">
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleRole(r)}
                        className={cn(
                          'text-[11px] font-medium px-2 h-7 rounded-[6px] border transition-colors',
                          customRoles.includes(r)
                            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]'
                            : 'border-[var(--border-default)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
                        )}
                      >
                        {r.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}
          </div>

          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Room change for the hackathon" maxLength={200} />
          </Field>

          <Field label="Body" hint="Plain text, max 2000 chars">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full h-[120px] p-3 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
              placeholder="One or two sentences. The bell shows this under the title."
              maxLength={2000}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Link" hint="Optional · clicking the bell item opens this">
              <div className="relative">
                <LinkIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/dashboard/events" className="pl-8" />
              </div>
            </Field>
            <Field label="Expires at" hint="Optional · hides from feed after this time">
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          </div>

          <Field label="Icon">
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={cn(
                    'text-[11px] font-mono font-medium px-2 h-7 rounded-[6px] border transition-colors',
                    icon === ic
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]'
                      : 'border-[var(--border-default)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </Field>
        </DSCard>

        {/* Preview + summary */}
        <DSCard padded={false} className="lg:col-span-5 sticky top-[72px] self-start">
          <div className="px-4 h-9 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-sunken)]">
            <span className="text-[11.5px] font-medium text-[var(--ds-text-3)]">Preview</span>
            <Bell size={12} className="text-[var(--ds-text-3)]" />
          </div>
          <div className="p-4">
            <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3 flex items-start gap-2.5">
              <div className="size-7 rounded-[8px] bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)] text-[10px] font-mono">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium leading-tight">{title || 'Title goes here'}</div>
                {body && <div className="text-[11.5px] text-[var(--ds-text-3)] mt-1 line-clamp-3">{body}</div>}
                <div className="text-[10.5px] text-[var(--ds-text-3)] mt-1.5 font-mono">just now</div>
              </div>
              <span className="size-[6px] rounded-full bg-[var(--accent)] mt-1 shrink-0" />
            </div>
            <div className="mt-4 space-y-2 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-text-3)]">Audience</span>
                <span className="font-medium">{AUDIENCES.find((a) => a.value === audience)?.label}</span>
              </div>
              {audience === 'CUSTOM' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ds-text-3)]">User IDs</span>
                    <span className="font-mono tabular-nums">{customUserIdsRaw.split(/[\s,]+/).filter(Boolean).length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ds-text-3)]">Roles</span>
                    <span className="font-mono tabular-nums">{customRoles.length}</span>
                  </div>
                </>
              )}
              {link && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-text-3)]">Link</span>
                  <span className="font-mono truncate max-w-[160px]" title={link}>{link}</span>
                </div>
              )}
              {expiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-text-3)]">Expires</span>
                  <span className="font-mono">{new Date(expiresAt).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
            <Button
              size="sm"
              className="w-full mt-4"
              disabled={!title.trim() || sendMut.isPending}
              onClick={() => setConfirm(true)}
            >
              <Send size={13} className="mr-1.5" />
              Send notification
            </Button>
          </div>
        </DSCard>
      </div>

      {/* History */}
      <Section eyebrow="History" title={historyQ.isLoading ? 'Loading…' : `${historyQ.data?.length ?? 0} broadcasts`}>
        {historyQ.isLoading ? (
          <div className="h-24 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : (historyQ.data?.length ?? 0) === 0 ? (
          <DSCard padded><EmptyState icon={<History size={18} />} title="No broadcasts yet" body="Your sent notifications + auto-generated event/problem broadcasts appear here." /></DSCard>
        ) : (
          <DSCard padded={false}>
            <div className="divide-y divide-[var(--border-subtle)]">
              {(historyQ.data ?? []).map((b) => (
                <div key={b.id} className="px-4 py-3 flex items-start gap-3">
                  {b.createdBy ? <Avatar name={b.createdBy.name} src={b.createdBy.avatar} size={28} /> : <div className="size-7 rounded-[8px] bg-[var(--surface-soft)] flex items-center justify-center"><Bell size={13} className="text-[var(--ds-text-3)]" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Pill tone="accent" size="xs">{b.audience.replace(/_/g, ' ')}</Pill>
                      <Pill tone="neutral" size="xs">{b.source.replace(/_/g, ' ').toLowerCase()}</Pill>
                      <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums ml-auto">{relativeTime(b.createdAt)}</span>
                    </div>
                    <div className="text-[13px] font-medium">{b.title}</div>
                    {b.body && <p className="text-[12px] text-[var(--ds-text-3)] mt-0.5 line-clamp-2">{b.body}</p>}
                    {b.link && <a href={b.link} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--accent)] hover:underline font-mono mt-1 inline-block truncate max-w-[260px]">{b.link}</a>}
                  </div>
                  <button onClick={() => setDeleting(b)} className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          </DSCard>
        )}
      </Section>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Broadcast this notification?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{AUDIENCES.find((a) => a.value === audience)?.label}</span> will see it
              in their bell menu within seconds. There&apos;s no recall — you can delete after sending but recipients may already have read it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
              {sendMut.isPending ? <><Loader2 size={13} className="mr-1.5 animate-spin" />Sending…</> : <><CheckCircle size={13} className="mr-1.5" />Send</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>Recipients keep what they already saw; future fetches won&apos;t show it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMut.mutate(deleting.id)} className="bg-[var(--danger)] hover:opacity-90 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
