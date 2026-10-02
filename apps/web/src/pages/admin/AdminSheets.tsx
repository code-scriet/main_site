// Admin · curated problem sheets ("topic ladders"). The management home for sheets
// — including drafts proposed by CORE_MEMBERs (which previously had no admin surface
// to publish or edit). Embedded as the "Sheets" tab of the coding hub.
//   - List every sheet (drafts included) with publish/unpublish, edit, delete.
//   - Create / edit via one dialog; the problem pool is the FULL catalog (incl.
//     unpublished) so admins can build any ladder.
// Wires the previously-unused api.updateProblemSheet.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, Pencil, Trash2, Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, type Problem, type ProblemSheetSummary } from '@/lib/api';
import { DSCard, Difficulty, EmptyState, Pill, Section } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

function SheetEditorDialog({
  open, mode, sheet, problems, token, onClose, onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  sheet: ProblemSheetSummary | null;
  problems: Problem[];
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [seedKey, setSeedKey] = useState<string | null>(null);

  // When editing, load the sheet detail to seed the ordered picked list.
  const detailQ = useQuery({
    queryKey: ['problem-sheet', sheet?.slug],
    queryFn: () => api.getProblemSheet(sheet!.slug, token),
    enabled: open && mode === 'edit' && Boolean(sheet?.slug),
  });

  // Seed once per (open target). create → blank; edit → from summary + detail items.
  const targetKey = open ? `${mode}:${sheet?.id ?? 'new'}:${detailQ.data ? 'd' : 'n'}` : null;
  if (targetKey !== seedKey) {
    setSeedKey(targetKey);
    if (!open) {
      // closed — leave state, it'll re-seed on next open
    } else if (mode === 'create') {
      setTitle(''); setDescription(''); setIsPublished(false); setPicked([]); setSearch('');
    } else if (sheet) {
      setTitle(sheet.title);
      setDescription(sheet.description ?? '');
      setIsPublished(sheet.isPublished);
      setSearch('');
      if (detailQ.data?.sheet) setPicked(detailQ.data.sheet.items.map((i) => i.id));
    }
  }

  const filtered = useMemo(
    () => problems.filter((p) => !search.trim() || p.title.toLowerCase().includes(search.toLowerCase())),
    [problems, search],
  );
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), description: description.trim() || null, isPublished, problemIds: picked };
      return mode === 'create'
        ? api.createProblemSheet(payload, token)
        : api.updateProblemSheet(sheet!.id, payload, token);
    },
    onSuccess: () => { toast.success(mode === 'create' ? 'Sheet created' : 'Sheet updated'); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  });

  const canSave = title.trim().length >= 3 && picked.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New problem sheet' : 'Edit sheet'}</DialogTitle>
        </DialogHeader>
        {mode === 'edit' && detailQ.isLoading ? (
          <div className="py-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /></div>
        ) : (
          <div className="space-y-4">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sheet title (e.g. Arrays: easy → hard)" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this sheet is for…" rows={2} />
            <label className="flex items-center gap-2 text-[13px] text-[var(--ds-text-2)]">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
              Published (visible to members)
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
                    {!p.isPublished && <Pill tone="warning" size="xs">Draft</Pill>}
                    <Difficulty level={p.difficulty} />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-[var(--ds-text-3)]">Selection order becomes the ladder order.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {mode === 'create' ? 'Create sheet' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSheets() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; sheet: ProblemSheetSummary | null } | null>(null);

  const sheetsQ = useQuery({
    queryKey: ['admin-sheets'],
    queryFn: () => api.getProblemSheets(token!),
    enabled: Boolean(token),
  });
  // Shares the hub's catalog cache key so it doesn't double-fetch the catalog.
  const problemsQ = useQuery({
    queryKey: ['admin-problems'],
    queryFn: () => api.adminGetProblems(token!),
    enabled: Boolean(token),
  });
  const sheets = sheetsQ.data?.sheets ?? [];
  const problems: Problem[] = useMemo(() => problemsQ.data?.problems ?? [], [problemsQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-sheets'] });
    qc.invalidateQueries({ queryKey: ['problem-sheets'] }); // member Practice-tab list
  };

  const publishMut = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) => api.updateProblemSheet(id, { isPublished }, token!),
    onSuccess: (_d, v) => { toast.success(v.isPublished ? 'Sheet published' : 'Sheet unpublished'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteProblemSheet(id, token!),
    onSuccess: () => { toast.success('Sheet deleted'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete'),
  });
  const busy = publishMut.isPending || deleteMut.isPending;

  const draftCount = sheets.filter((s) => !s.isPublished).length;

  return (
    <div className="flex flex-col gap-5">
      <Section
        eyebrow="Sheets"
        title={`Topic ladders${draftCount ? ` · ${draftCount} draft${draftCount === 1 ? '' : 's'}` : ''}`}
        action={<Button size="sm" onClick={() => setEditor({ mode: 'create', sheet: null })}><Plus size={13} className="mr-1" /> New sheet</Button>}
      >
        {sheetsQ.isLoading ? (
          <div className="h-20 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : sheets.length === 0 ? (
          <DSCard padded><EmptyState icon={<ListChecks size={18} />} title="No sheets yet" body="Create a ladder, or publish a member's proposed draft when one lands here." /></DSCard>
        ) : (
          <DSCard padded={false}>
            <div className="divide-y divide-[var(--border-subtle)]">
              {sheets.map((s) => (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{s.title}</div>
                    {s.description && <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">{s.description}</div>}
                  </div>
                  <span className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums whitespace-nowrap">{s.total} problems</span>
                  {s.isPublished ? <Pill tone="success" size="xs">Published</Pill> : <Pill tone="warning" size="xs">Draft</Pill>}
                  <button
                    onClick={() => publishMut.mutate({ id: s.id, isPublished: !s.isPublished })}
                    disabled={busy}
                    title={s.isPublished ? 'Unpublish' : 'Publish'}
                    aria-label={s.isPublished ? 'Unpublish' : 'Publish'}
                    className={cn('size-7 rounded-[6px] flex items-center justify-center disabled:opacity-40 text-[var(--ds-text-3)]', s.isPublished ? 'hover:bg-[var(--warning-bg)] hover:text-[var(--warning)]' : 'hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)]')}
                  >
                    {s.isPublished ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button onClick={() => setEditor({ mode: 'edit', sheet: s })} disabled={busy} title="Edit" aria-label="Edit" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center disabled:opacity-40">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => { if (confirm(`Delete "${s.title}"?`)) deleteMut.mutate(s.id); }} disabled={busy} title="Delete" aria-label="Delete" className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center disabled:opacity-40">
                    <Trash2 size={12} />
                  </button>
                  {busy && <Loader2 size={11} className="animate-spin text-[var(--ds-text-3)]" />}
                </div>
              ))}
            </div>
          </DSCard>
        )}
        <p className="text-[11.5px] text-[var(--ds-text-3)] mt-2 inline-flex items-center gap-1">
          <Check size={11} /> Member-proposed sheets arrive here as drafts — review and publish them when ready.
        </p>
      </Section>

      <SheetEditorDialog
        open={Boolean(editor)}
        mode={editor?.mode ?? 'create'}
        sheet={editor?.sheet ?? null}
        problems={problems}
        token={token ?? ''}
        onClose={() => setEditor(null)}
        onSaved={invalidate}
      />
    </div>
  );
}
