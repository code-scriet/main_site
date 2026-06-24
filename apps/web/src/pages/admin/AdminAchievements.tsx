// Dashboard v2 — Admin · Achievements.
// Card grid. Featured toggles inline. Editing happens in a dialog (markdown body + image url).
// Pixel-port of screen-admin2.jsx:559 (AdminAchievementsScreen).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Star, Loader2, Eye } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type Achievement } from '@/lib/api';
import { DSCard, EmptyState, Field, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface EditState {
  id?: string;
  title: string;
  shortDescription: string;
  description: string;
  content: string;
  eventName: string;
  achievedBy: string;
  date: string;
  imageUrl: string;
  imageGallery: string; // newline- or comma-separated URLs in the textarea
  tags: string;
  featured: boolean;
}

const EMPTY: EditState = {
  title: '', shortDescription: '', description: '', content: '', eventName: '',
  achievedBy: '', date: new Date().toISOString().slice(0, 10),
  imageUrl: '', imageGallery: '', tags: '', featured: false,
};

const COVERS = [
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-orange-600',
  'from-pink-500 to-rose-600',
  'from-violet-500 to-fuchsia-600',
];

export default function AdminAchievements() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<EditState>(EMPTY);
  const [deleting, setDeleting] = useState<Achievement | null>(null);

  const q = useQuery({
    queryKey: ['admin-achievements'],
    queryFn: () => api.getAchievements({ limit: 200, includeContent: true }),
  });

  const items = useMemo(() => (q.data ?? []).slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [q.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      // Accept newline- AND comma-separated pastes (the upload tool's "Copy all"
      // hands back comma-joined URLs, and users paste those straight in). Split on
      // newlines, or on a comma/whitespace run that PRECEDES another http(s) URL —
      // the lookahead means commas inside a Cloudinary transform URL
      // (…/upload/c_fill,w_200/…) are never mistaken for a separator. Trailing
      // commas/space on each entry are stripped.
      const gallery = edit.imageGallery
        .split(/\n+|[,\s]+(?=https?:\/\/)/)
        .map((u) => u.trim().replace(/[,\s]+$/, ''))
        .filter(Boolean);
      const payload: Partial<Achievement> = {
        title: edit.title.trim(),
        shortDescription: edit.shortDescription.trim() || undefined,
        description: edit.description.trim(),
        content: edit.content.trim() || undefined,
        eventName: edit.eventName.trim() || undefined,
        achievedBy: edit.achievedBy.trim(),
        date: edit.date,
        imageUrl: edit.imageUrl.trim().replace(/[,\s]+$/, '') || undefined,
        imageGallery: gallery.length ? gallery : undefined,
        tags: edit.tags.split(',').map((t) => t.trim()).filter(Boolean),
        featured: edit.featured,
      };
      if (edit.id) await api.updateAchievement(edit.id, payload, token!);
      else await api.createAchievement(payload, token!);
    },
    onSuccess: () => {
      toast.success(edit.id ? 'Achievement updated' : 'Achievement added');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-achievements'] });
    },
    onError: () => toast.error('Save failed'),
  });
  const featureMut = useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) => api.updateAchievement(id, { featured }, token!),
    onMutate: async ({ id, featured }) => {
      await qc.cancelQueries({ queryKey: ['admin-achievements'] });
      const prev = qc.getQueryData<Achievement[]>(['admin-achievements']);
      if (prev) {
        qc.setQueryData<Achievement[]>(['admin-achievements'], (old) =>
          (old ?? []).map((a) => (a.id === id ? { ...a, featured } : a)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['admin-achievements'], ctx.prev);
      toast.error('Failed to update featured state');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-achievements'] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteAchievement(id, token!),
    onSuccess: () => {
      toast.success('Achievement removed');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admin-achievements'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const openCreate = () => { setEdit(EMPTY); setOpen(true); };
  const openEdit = (a: Achievement) => {
    setEdit({
      id: a.id,
      title: a.title,
      shortDescription: a.shortDescription || '',
      description: a.description,
      content: a.content || '',
      eventName: a.eventName || '',
      achievedBy: a.achievedBy,
      date: a.date.slice(0, 10),
      imageUrl: a.imageUrl || '',
      imageGallery: (a.imageGallery ?? []).join('\n'),
      tags: (a.tags ?? []).join(', '),
      featured: a.featured ?? false,
    });
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Achievements</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Curated milestones shown on the public site.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="/achievements" target="_blank" rel="noreferrer">
              <Eye size={13} className="mr-1.5" />
              Preview public
            </a>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus size={13} className="mr-1.5" />
            Add achievement
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-[220px] bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Star size={18} />}
            title="No achievements yet"
            body="Add your first milestone — hackathon wins, placements, press, anything worth celebrating."
            action={<Button size="sm" onClick={openCreate}>Add achievement</Button>}
          />
        </DSCard>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((a, i) => (
            <DSCard key={a.id} padded={false} hover className="overflow-hidden group">
              <div className={`aspect-[2/1] bg-gradient-to-br relative ${COVERS[i % COVERS.length]}`}>
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" loading="lazy" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute top-2 left-2 flex gap-1.5">
                  {a.featured && <Pill tone="warning" size="xs" icon={<Star size={9} />}>Featured</Pill>}
                </div>
                <button
                  className="absolute top-2 right-2 size-7 rounded-[6px] bg-black/30 backdrop-blur opacity-0 group-hover:opacity-100 text-white flex items-center justify-center transition-opacity"
                  onClick={() => openEdit(a)}
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
              </div>
              <div className="p-4">
                <div className="text-[13.5px] font-semibold leading-snug line-clamp-2">{a.title}</div>
                {a.shortDescription && (
                  <p className="text-[11.5px] text-[var(--ds-text-3)] mt-1 line-clamp-2">{a.shortDescription}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
                    {new Date(a.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={a.featured ?? false} onCheckedChange={(checked) => featureMut.mutate({ id: a.id, featured: checked })} />
                    <button onClick={() => setDeleting(a)} className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center" title="Delete">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            </DSCard>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit.id ? 'Edit achievement' : 'Add achievement'}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Title" required className="sm:col-span-2"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Short description" hint="One-line summary on cards" className="sm:col-span-2"><Input value={edit.shortDescription} onChange={(e) => setEdit({ ...edit, shortDescription: e.target.value })} placeholder="One-line summary" /></Field>
            <Field label="Description" required hint="Markdown supported" className="sm:col-span-2">
              <textarea
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                className="w-full h-[120px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                placeholder="Short summary shown on detail header"
              />
            </Field>
            <Field label="Full content" hint="Long-form story / detail body (Markdown)" className="sm:col-span-2">
              <textarea
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
                className="w-full h-[180px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                placeholder="Optional rich body for the detail page"
              />
            </Field>
            <Field label="Event name (optional)"><Input value={edit.eventName} onChange={(e) => setEdit({ ...edit, eventName: e.target.value })} /></Field>
            <Field label="Achieved by"><Input value={edit.achievedBy} onChange={(e) => setEdit({ ...edit, achievedBy: e.target.value })} placeholder="Names or 'code.scriet'" /></Field>
            <Field label="Date" required><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Cover image URL"><Input value={edit.imageUrl} onChange={(e) => setEdit({ ...edit, imageUrl: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Image gallery" hint="One per line or comma-separated · up to 30 images" className="sm:col-span-2">
              <textarea
                value={edit.imageGallery}
                onChange={(e) => setEdit({ ...edit, imageGallery: e.target.value })}
                className="w-full h-[100px] p-2.5 text-[12.5px] font-mono bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                placeholder={'https://res.cloudinary.com/…/img1.jpg\nhttps://res.cloudinary.com/…/img2.jpg'}
              />
            </Field>
            <Field label="Tags" hint="comma-separated" className="sm:col-span-2"><Input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder="hackathon, top-5, ml" /></Field>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Switch checked={edit.featured} onCheckedChange={(v) => setEdit({ ...edit, featured: v })} />
              <span className="text-[13px]">Featured (pinned on the public page)</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !edit.title.trim() || !edit.description.trim() || !edit.achievedBy.trim()}>
              {saveMut.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This removes the achievement from the public Achievements page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              disabled={deleteMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// silence unused-import
void Section;
