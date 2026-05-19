// Dashboard v2 — Announcements list.
// Pinned strip on top, priority colours, URGENT animates with `.slow-ping`.
// Polls listed in a separate Section (drawn from public polls).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Bookmark, Paperclip, Link as LinkIcon, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type Announcement } from '@/lib/api';
import { DSCard, EmptyState, Pill, SegmentedTabs, Section } from '@/components/dash';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TabId = 'announcements' | 'polls';
const PRIORITY_TONE: Record<Announcement['priority'], 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', URGENT: 'danger',
};

export default function DashboardAnnouncements() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>('announcements');
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  // CORE_MEMBER and above (matches POST/PUT/DELETE guards on the announcements router).
  const canManageAnnouncements = Boolean(
    user && (user.role === 'CORE_MEMBER' || user.role === 'ADMIN' || user.role === 'PRESIDENT' || user.isSuperAdmin),
  );

  const announcementsQ = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.getAnnouncements(),
  });
  const pollsQ = useQuery({
    queryKey: ['polls', 'public'],
    queryFn: () => api.getPolls(undefined, token ?? undefined),
  });

  // Optimistic delete with rollback on error — HEAD parity.
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteAnnouncement(id, token!),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['announcements'] });
      const prev = qc.getQueryData<Announcement[]>(['announcements']);
      if (prev) qc.setQueryData<Announcement[]>(['announcements'], prev.filter((a) => a.id !== id));
      return { prev };
    },
    onSuccess: () => {
      toast.success('Announcement deleted');
      setDeleteTarget(null);
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['announcements'], ctx.prev);
      toast.error('Failed to delete announcement');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const all = announcementsQ.data ?? [];
  const pinned = useMemo(() => all.filter((a) => a.pinned), [all]);
  const rest = useMemo(() => all.filter((a) => !a.pinned), [all]);
  const polls = (pollsQ.data ?? []).filter((p) => p.isPublished !== false);

  const handleEdit = (a: Announcement) => navigate(`/dashboard/announcements/${a.slug || a.id}/edit`);
  const handleDelete = (a: Announcement) => setDeleteTarget(a);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Announcements</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">
            Pinned items first; URGENT pings until acknowledged. Polls live on the second tab.
          </p>
        </div>
        <SegmentedTabs
          items={[
            { value: 'announcements', label: 'Announcements', count: all.length },
            { value: 'polls', label: 'Polls', count: polls.length },
          ]}
          value={tab}
          onChange={(v) => setTab(v as TabId)}
        />
      </div>

      {tab === 'announcements' ? (
        <>
          {announcementsQ.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
              ))}
            </div>
          ) : all.length === 0 ? (
            <DSCard padded>
              <EmptyState icon={<Megaphone size={18} />} title="No announcements yet" body="The team posts updates here — check back soon." />
            </DSCard>
          ) : (
            <>
              {pinned.length > 0 && (
                <Section eyebrow="Pinned" title={`${pinned.length} highlighted`}>
                  <div className="grid md:grid-cols-2 gap-3">
                    {pinned.map((a) => (
                      <AnnouncementCard
                        key={a.id}
                        ann={a}
                        onOpen={() => navigate(`/announcements/${a.slug || a.id}`)}
                        pinned
                        canManage={canManageAnnouncements}
                        onEdit={() => handleEdit(a)}
                        onDelete={() => handleDelete(a)}
                      />
                    ))}
                  </div>
                </Section>
              )}
              {rest.length > 0 && (
                <Section eyebrow="Recent" title="All announcements">
                  <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                    {rest.map((a) => (
                      <AnnouncementRow
                        key={a.id}
                        ann={a}
                        onOpen={() => navigate(`/announcements/${a.slug || a.id}`)}
                        canManage={canManageAnnouncements}
                        onEdit={() => handleEdit(a)}
                        onDelete={() => handleDelete(a)}
                      />
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {pollsQ.isLoading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-32 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
              ))}
            </div>
          ) : polls.length === 0 ? (
            <DSCard padded>
              <EmptyState title="No polls active" body="When admins open a poll, you'll see it here." />
            </DSCard>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {polls.map((p) => (
                <DSCard
                  key={p.id}
                  padded
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/polls/${p.slug}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14.5px] font-semibold leading-snug">{p.question}</h3>
                    <Pill tone="success" size="xs" dot>Live</Pill>
                  </div>
                  <div className="text-[12px] text-[var(--ds-text-3)] mt-2 font-mono tabular-nums">
                    {(p.totalVotes ?? 0).toLocaleString()} votes
                  </div>
                </DSCard>
              ))}
            </div>
          )}
        </>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The announcement is removed for everyone. There&apos;s no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {deleteMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AnnouncementCard({
  ann, onOpen, pinned, canManage, onEdit, onDelete,
}: {
  ann: Announcement;
  onOpen: () => void;
  pinned?: boolean;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const priority = ann.priority;
  return (
    <DSCard padded hover className="cursor-pointer relative overflow-hidden group" onClick={onOpen}>
      {priority === 'URGENT' && (
        <span className="absolute top-3 right-3 flex">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--danger)] opacity-60 slow-ping" />
          <span className="relative inline-flex size-[8px] rounded-full bg-[var(--danger)]" />
        </span>
      )}
      {canManage && (
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            className="size-6 rounded-[5px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]"
            title="Edit announcement"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="size-6 rounded-[5px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--danger)]"
            title="Delete announcement"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Pill tone={PRIORITY_TONE[priority]} size="xs">{priority}</Pill>
        {pinned && <Pill tone="accent" size="xs" icon={<Bookmark size={9} />}>Pinned</Pill>}
        <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
          {new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </span>
      </div>
      <h3 className="text-[14.5px] font-semibold leading-snug">{ann.title}</h3>
      {ann.shortDescription && (
        <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1.5 leading-snug line-clamp-2">{ann.shortDescription}</p>
      )}
      <div className="flex items-center gap-3 mt-3 text-[11px] text-[var(--ds-text-3)]">
        {ann.attachments && ann.attachments.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip size={11} />
            {ann.attachments.length}
          </span>
        )}
        {ann.links && ann.links.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <LinkIcon size={11} />
            {ann.links.length}
          </span>
        )}
      </div>
    </DSCard>
  );
}

function AnnouncementRow({
  ann, onOpen, canManage, onEdit, onDelete,
}: {
  ann: Announcement;
  onOpen: () => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const priority = ann.priority;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="w-full py-3 flex items-start gap-3 -mx-2 px-2 rounded-[6px] hover:bg-[var(--surface-soft)] text-left transition-colors"
      >
        <span
          className={cn(
            'w-[3px] self-stretch rounded-full shrink-0 mt-0.5',
            priority === 'URGENT' && 'bg-[var(--danger)]',
            priority === 'HIGH' && 'bg-[var(--warning)]',
            priority === 'MEDIUM' && 'bg-[var(--info)]',
            priority === 'LOW' && 'bg-[var(--ds-text-3)] opacity-50',
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <Pill tone={PRIORITY_TONE[priority]} size="xs">{priority}</Pill>
            <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
              {new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="text-[13.5px] font-medium leading-snug">{ann.title}</div>
          {ann.shortDescription && (
            <p className="text-[12px] text-[var(--ds-text-3)] mt-1 line-clamp-1">{ann.shortDescription}</p>
          )}
        </div>
      </button>
      {canManage && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="size-6 rounded-[5px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]"
            title="Edit announcement"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="size-6 rounded-[5px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--danger)]"
            title="Delete announcement"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
