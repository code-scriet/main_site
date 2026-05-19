// Dashboard v2 — Admin · Credits.
// Two-pane: list grouped by category (left), editor for selected credit (right).
// Pixel-port of screen-admin2.jsx:601 (AdminCreditsScreen).

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, GripVertical, Loader2, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type Credit } from '@/lib/api';
import { DSCard, EmptyState, Field, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

const CATEGORIES = ['Founding', 'Platform', 'Design', 'Events', 'Content', 'Infrastructure', 'Special Thanks'];

interface EditState {
  id?: string;
  title: string;
  description: string;
  category: string;
  teamMemberId: string;
  order: number;
}

const EMPTY: EditState = { title: '', description: '', category: CATEGORIES[0], teamMemberId: '', order: 0 };

export default function AdminCredits() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>(EMPTY);
  const [deleting, setDeleting] = useState<Credit | null>(null);
  // Filter the team-member assignee picker by name or role (HEAD parity, E15).
  const [memberFilter, setMemberFilter] = useState('');
  // Toggle a free-text category mode for entries outside the preset list.
  const [customCategoryMode, setCustomCategoryMode] = useState(false);

  const q = useQuery({
    queryKey: ['admin-credits'],
    queryFn: () => api.getCredits(),
  });
  const teamQ = useQuery({
    queryKey: ['admin-team', 'compact'],
    queryFn: () => api.getTeam(undefined, { compact: true }),
  });

  const filteredMembers = useMemo(() => {
    const all = teamQ.data ?? [];
    const q = memberFilter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((m) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
  }, [teamQ.data, memberFilter]);

  const all = q.data ?? [];

  // Local-mutable ordering. Hydrates from server data on first load and on refetch.
  // Saved as a batch via `api.reorderCredits` when "Save order" is clicked.
  const [localOrder, setLocalOrder] = useState<Array<{ id: string; order: number }>>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  useEffect(() => {
    setLocalOrder(all.map((c) => ({ id: c.id, order: c.order ?? 0 })));
    setOrderDirty(false);
  }, [q.dataUpdatedAt]);

  const grouped = useMemo(() => {
    const orderMap = new Map(localOrder.map((o) => [o.id, o.order]));
    const m: Record<string, Credit[]> = {};
    for (const c of all) {
      const cat = c.category || 'Other';
      m[cat] = m[cat] ?? [];
      m[cat].push(c);
    }
    for (const k of Object.keys(m)) {
      m[k].sort(
        (a, b) => (orderMap.get(a.id) ?? a.order ?? 999) - (orderMap.get(b.id) ?? b.order ?? 999),
      );
    }
    return m;
  }, [all, localOrder]);

  const moveCredit = (id: string, direction: 'up' | 'down') => {
    const credit = all.find((c) => c.id === id);
    if (!credit) return;
    const siblings = (grouped[credit.category] ?? []).map((c) => c.id);
    const idx = siblings.indexOf(id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;
    // swap orders between this credit and its neighbor
    const a = id;
    const b = siblings[targetIdx];
    setLocalOrder((prev) => {
      const orderMap = new Map(prev.map((o) => [o.id, o.order]));
      const oa = orderMap.get(a) ?? 0;
      const ob = orderMap.get(b) ?? 0;
      orderMap.set(a, ob);
      orderMap.set(b, oa);
      return Array.from(orderMap.entries()).map(([id, order]) => ({ id, order }));
    });
    setOrderDirty(true);
  };

  const saveOrderMut = useMutation({
    mutationFn: () => api.reorderCredits(localOrder, token!),
    onSuccess: () => {
      toast.success('Order saved');
      setOrderDirty(false);
      qc.invalidateQueries({ queryKey: ['admin-credits'] });
    },
    onError: () => toast.error('Reorder failed'),
  });

  const sel = useMemo(() => all.find((c) => c.id === selectedId) ?? null, [all, selectedId]);

  const editDirty = useMemo(() => {
    if (!sel) {
      // creating new — dirty if any field has content
      return Boolean(edit.title.trim() || edit.description.trim() || edit.teamMemberId);
    }
    return (
      edit.title.trim() !== sel.title ||
      (edit.description.trim() || '') !== (sel.description || '') ||
      edit.category !== sel.category ||
      (edit.teamMemberId || '') !== (sel.teamMemberId || '') ||
      edit.order !== (sel.order ?? 0)
    );
  }, [edit, sel]);

  const pick = (c: Credit) => {
    setSelectedId(c.id);
    setEdit({
      id: c.id,
      title: c.title,
      description: c.description || '',
      category: c.category,
      teamMemberId: c.teamMemberId || '',
      order: c.order ?? 0,
    });
  };
  const createNew = () => {
    setSelectedId(null);
    setEdit({ ...EMPTY, order: all.length });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Partial<Credit> = {
        title: edit.title.trim(),
        description: edit.description.trim() || undefined,
        category: edit.category,
        teamMemberId: edit.teamMemberId || undefined,
        order: edit.order,
      };
      if (edit.id) await api.updateCredit(edit.id, payload, token!);
      else await api.createCredit(payload, token!);
    },
    onSuccess: () => {
      toast.success(edit.id ? 'Credit saved' : 'Credit added');
      qc.invalidateQueries({ queryKey: ['admin-credits'] });
    },
    onError: () => toast.error('Save failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteCredit(id, token!),
    onSuccess: () => {
      toast.success('Credit removed');
      setDeleting(null);
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ['admin-credits'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  useUnsavedChangesWarning((editDirty || orderDirty) && !saveMut.isPending && !saveOrderMut.isPending);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Credits</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">The public Credits page is sourced here. Drag to reorder within a category.</p>
        </div>
        <div className="flex items-center gap-2">
          {orderDirty && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveOrderMut.mutate()}
              disabled={saveOrderMut.isPending}
            >
              {saveOrderMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Save size={13} className="mr-1.5" />}
              Save order
            </Button>
          )}
          <Button size="sm" onClick={createNew}>
            <Plus size={13} className="mr-1.5" />
            Add credit
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        <DSCard padded={false} className="lg:col-span-7">
          <div className="px-3 py-2.5 flex items-center justify-between border-b border-[var(--border-subtle)]">
            <div className="text-[13px] font-semibold">All credits</div>
            <Pill tone="neutral" size="xs">{all.length} total</Pill>
          </div>
          {q.isLoading ? (
            <div className="p-6 animate-pulse text-[12px] text-[var(--ds-text-3)] text-center">Loading…</div>
          ) : all.length === 0 ? (
            <EmptyState icon={<BookOpen size={18} />} title="No credits yet" body="Add the founders + the contributors that built it." />
          ) : (
            <div>
              {Object.entries(grouped).map(([cat, list]) => (
                <div key={cat}>
                  <div className="px-4 py-2 bg-[var(--surface-soft)]/50 border-b border-[var(--border-subtle)]">
                    <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{cat}</span>
                  </div>
                  {list.map((c, i) => (
                    <div
                      key={c.id}
                      className={cn(
                        'w-full px-4 py-3 flex items-center gap-3 border-b border-[var(--border-subtle)] transition-colors',
                        selectedId === c.id ? 'bg-[var(--accent-subtle)]/40' : 'hover:bg-[var(--surface-soft)]',
                      )}
                    >
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveCredit(c.id, 'up'); }}
                          disabled={i === 0}
                          className="size-4 rounded-[3px] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ChevronUp size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveCredit(c.id, 'down'); }}
                          disabled={i === list.length - 1}
                          className="size-4 rounded-[3px] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ChevronDown size={11} />
                        </button>
                      </div>
                      <GripVertical size={14} className="text-[var(--ds-text-3)] shrink-0 opacity-50" />
                      <button
                        type="button"
                        onClick={() => pick(c)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="text-[13px] font-medium">{c.title}</div>
                        {c.description && <div className="text-[12px] text-[var(--ds-text-3)] mt-0.5 truncate">{c.description}</div>}
                      </button>
                      {c.teamMember && <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono truncate max-w-[120px]">{c.teamMember.name}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </DSCard>

        <DSCard padded className="lg:col-span-5 sticky top-[72px] self-start">
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-3">
            {sel ? 'Editing' : edit.id !== undefined ? 'Editing' : 'New credit'}
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Title" required><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Category" hint={customCategoryMode ? 'Type anything; will appear verbatim on the public page' : 'Pick a preset or type a custom one'}>
              {customCategoryMode ? (
                <div className="flex gap-2">
                  <Input
                    value={edit.category}
                    onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                    placeholder="Custom category name"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setCustomCategoryMode(false); setEdit({ ...edit, category: CATEGORIES[0] }); }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={CATEGORIES.includes(edit.category) ? edit.category : CATEGORIES[0]}
                    onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                    className="flex-1 h-9 px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button type="button" size="sm" variant="outline" onClick={() => setCustomCategoryMode(true)}>
                    + Custom
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Linked team member" hint="Optional — type to filter by name or role">
              <Input
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                placeholder="Filter members…"
                className="mb-2"
              />
              <select
                value={edit.teamMemberId}
                onChange={(e) => setEdit({ ...edit, teamMemberId: e.target.value })}
                className="h-9 w-full px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
                size={filteredMembers.length > 6 ? 6 : undefined}
              >
                <option value="">— none —</option>
                {filteredMembers.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
              </select>
              {filteredMembers.length === 0 && memberFilter.trim() && (
                <span className="text-[11px] text-[var(--ds-text-3)] mt-1">No team members match.</span>
              )}
            </Field>
            <Field label="Description">
              <textarea
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                className="w-full h-[88px] p-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
                placeholder="Optional longer description"
              />
            </Field>
            <Field label="Order" hint="lower = higher in the list"><Input type="number" value={edit.order} onChange={(e) => setEdit({ ...edit, order: Number(e.target.value) || 0 })} /></Field>
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
              {sel ? (
                <Button size="sm" variant="outline" onClick={() => setDeleting(sel)} className="text-[var(--danger)] border-[var(--danger-border)] hover:bg-[var(--danger-bg)]">
                  <Trash2 size={11} className="mr-1.5" />
                  Delete
                </Button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={createNew}>Reset</Button>
                <Button
                  size="sm"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || !edit.title.trim()}
                >
                  {saveMut.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                  {edit.id ? 'Save' : 'Add'}
                </Button>
              </div>
            </div>
          </div>
        </DSCard>
      </div>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This removes the credit from the public Credits page.</AlertDialogDescription>
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

// silence unused
void Section;
