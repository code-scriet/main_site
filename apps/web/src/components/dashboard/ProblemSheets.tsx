// S-09 — curated problem sheets ("topic ladders") in the Practice tab.
// Members see published sheets with live progress; CORE_MEMBER+ can create them
// and admins can delete. Progress is computed server-side from PRACTICE-context
// accepted submissions, so there's no per-user state to load here.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, ArrowUpRight, Check, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type Problem } from '@/lib/api';
import { DSCard, Difficulty, MonoChip, Pill, ProgressBar } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { cn } from '@/lib/utils';

export function ProblemSheets({ problems, canAuthor }: { problems: Problem[]; canAuthor: boolean }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const sheetsQ = useQuery({
    queryKey: ['problem-sheets'],
    queryFn: () => api.getProblemSheets(token ?? undefined),
  });
  const sheets = sheetsQ.data?.sheets ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteProblemSheet(id, token!),
    onSuccess: () => { toast.success('Sheet deleted'); qc.invalidateQueries({ queryKey: ['problem-sheets'] }); },
    onError: () => toast.error('Delete failed'),
  });

  // Nothing to show for plain members until a sheet exists.
  if (sheetsQ.isLoading || (sheets.length === 0 && !canAuthor)) return null;

  return (
    <DSCard padded>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-[var(--accent)]" />
          <h3 className="text-[14.5px] font-semibold">Curated sheets</h3>
          <span className="text-[11.5px] text-[var(--ds-text-3)]">topic ladders, easy → hard</span>
        </div>
        {canAuthor && (
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus size={13} className="mr-1" /> New sheet
          </Button>
        )}
      </div>

      {sheets.length === 0 ? (
        <p className="text-[13px] text-[var(--ds-text-3)]">No sheets yet. Create one to give freshers a path through the problem bank.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sheets.map((s) => (
            <div
              key={s.id}
              className="rounded-[12px] border border-[var(--border-subtle)] p-4 hover:border-[var(--border-strong)] transition-colors cursor-pointer"
              onClick={() => setOpenSlug(s.slug)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-[14px] leading-snug">{s.title}</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!s.isPublished && <Pill tone="warning" size="xs">Draft</Pill>}
                  {canAuthor && (
                    <button
                      title="Delete sheet"
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${s.title}"?`)) deleteMut.mutate(s.id); }}
                      className="text-[var(--ds-text-3)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              {s.description && <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1 line-clamp-2">{s.description}</p>}
              <div className="mt-3">
                <ProgressBar value={s.solved} max={Math.max(1, s.total)} tone={s.total > 0 && s.solved === s.total ? 'success' : 'accent'} />
                <div className="mt-1.5 text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">{s.solved} / {s.total} solved</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SheetDetailDialog slug={openSlug} onClose={() => setOpenSlug(null)} />
      {canAuthor && (
        <CreateSheetDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          problems={problems}
          onCreated={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ['problem-sheets'] }); }}
        />
      )}
    </DSCard>
  );
}

function SheetDetailDialog({ slug, onClose }: { slug: string | null; onClose: () => void }) {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ['problem-sheet', slug],
    queryFn: () => api.getProblemSheet(slug!, token ?? undefined),
    enabled: Boolean(slug),
  });
  const sheet = q.data?.sheet;
  return (
    <Dialog open={Boolean(slug)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sheet?.title ?? 'Sheet'}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="py-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /></div>
        ) : !sheet ? (
          <p className="text-[13px] text-[var(--ds-text-3)]">Sheet not found.</p>
        ) : (
          <div className="space-y-4">
            {sheet.description && <p className="text-[13px] text-[var(--ds-text-2)]">{sheet.description}</p>}
            <div>
              <ProgressBar value={sheet.solved} max={Math.max(1, sheet.total)} tone={sheet.total > 0 && sheet.solved === sheet.total ? 'success' : 'accent'} />
              <div className="mt-1.5 text-[12px] text-[var(--ds-text-3)] font-mono tabular-nums">{sheet.solved} / {sheet.total} solved</div>
            </div>
            <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
              {sheet.items.map((it, i) => (
                <li key={it.id} className="flex items-center gap-3 py-2.5">
                  <span className={cn('shrink-0 grid place-items-center w-6 h-6 rounded-full text-[11px] font-mono', it.solved ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--surface-soft)] text-[var(--ds-text-3)]')}>
                    {it.solved ? <Check size={13} /> : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{it.title}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Difficulty level={it.difficulty} />
                      {it.tags.slice(0, 2).map((t) => <MonoChip key={t}>{t}</MonoChip>)}
                    </div>
                  </div>
                  <a
                    href={getPlaygroundLaunchUrl(`/?problem=${encodeURIComponent(it.slug || it.id)}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
                  >
                    {it.solved ? 'Review' : 'Solve'} <ArrowUpRight size={12} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateSheetDialog({
  open, onClose, problems, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  problems: Problem[];
  onCreated: () => void;
}) {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () => problems.filter((p) => !search.trim() || p.title.toLowerCase().includes(search.toLowerCase())),
    [problems, search],
  );

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const reset = () => { setTitle(''); setDescription(''); setIsPublished(false); setPicked([]); setSearch(''); };

  const save = async () => {
    if (!token) return;
    if (title.trim().length < 3) { toast.error('Title must be at least 3 characters'); return; }
    if (picked.length === 0) { toast.error('Add at least one problem'); return; }
    setSaving(true);
    try {
      await api.createProblemSheet({ title: title.trim(), description: description.trim() || null, isPublished, problemIds: picked }, token);
      toast.success('Sheet created');
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New problem sheet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sheet title (e.g. Arrays: easy → hard)" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this sheet is for…" rows={2} />
          <label className="flex items-center gap-2 text-[13px] text-[var(--ds-text-2)]">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            Publish now (admins only — otherwise saved as a draft)
          </label>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12.5px] font-medium">Problems <span className="text-[var(--ds-text-3)]">({picked.length} picked)</span></span>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-7 max-w-[180px] text-[12px]" />
            </div>
            <div className="max-h-[260px] overflow-y-auto rounded-[10px] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
              {filtered.length === 0 ? (
                <p className="p-3 text-[12.5px] text-[var(--ds-text-3)]">No problems match.</p>
              ) : filtered.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[var(--surface-soft)]">
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className="flex-1 min-w-0 text-[13px] truncate">{p.title}</span>
                  <Difficulty level={p.difficulty} />
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-[var(--ds-text-3)]">Pick in the order you want them shown — selection order becomes the ladder order.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Create sheet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
