// Edit an UNPUBLISHED QOTD (proposal or scheduled) in place — swap the linked
// problem, move the date / publish time, or fix legacy text. The server rejects
// edits to a published/held QOTD, so this dialog is only opened for those rows.
// Keeps the flow intuitive (no delete-and-recreate just to fix a date).

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Problem, type QOTDHistoryEntry } from '@/lib/api';
import { DSCard, Field, Pill } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

function istTimeOf(iso?: string | null): string {
  if (!iso) return '00:00';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '00:00';
  return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function EditQOTDDialog({
  target,
  token,
  onClose,
  onSaved,
}: {
  target: QOTDHistoryEntry | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // A problem-backed QOTD edits its linked problem + schedule; a legacy text-only
  // QOTD (no problemId) edits its question + link.
  const isLegacy = Boolean(target) && !target?.problemId;
  const isScheduled = Boolean(target?.publishAt);

  const [problemId, setProblemId] = useState<string | null>(target?.problemId ?? null);
  const [date, setDate] = useState<string>(target?.date ? target.date.slice(0, 10) : '');
  const [publishTime, setPublishTime] = useState<string>(istTimeOf(target?.publishAt));
  const [question, setQuestion] = useState<string>(target?.question ?? '');
  const [problemLink, setProblemLink] = useState<string>(target?.problemLink ?? '');
  const [search, setSearch] = useState('');

  // Re-seed local state whenever a different row is opened.
  const seededFor = useMemo(() => target?.id ?? null, [target?.id]);
  const [seedKey, setSeedKey] = useState<string | null>(null);
  if (seededFor !== seedKey) {
    setSeedKey(seededFor);
    setProblemId(target?.problemId ?? null);
    setDate(target?.date ? target.date.slice(0, 10) : '');
    setPublishTime(istTimeOf(target?.publishAt));
    setQuestion(target?.question ?? '');
    setProblemLink(target?.problemLink ?? '');
    setSearch('');
  }

  const problemsQ = useQuery({
    queryKey: ['problems-for-qotd-edit'],
    queryFn: () => api.adminGetProblems(token),
    enabled: Boolean(target) && !isLegacy,
  });
  const problems: Problem[] = useMemo(() => problemsQ.data?.problems ?? [], [problemsQ.data]);
  const filtered = useMemo(() => {
    if (!search.trim()) return problems.slice(0, 20);
    const q = search.toLowerCase();
    return problems.filter((p) => p.title.toLowerCase().includes(q) || p.tags?.some((t) => t.toLowerCase().includes(q))).slice(0, 20);
  }, [problems, search]);

  const save = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('No QOTD selected');
      const data = isLegacy
        ? { question: question.trim(), problemLink: problemLink.trim() || undefined, date }
        : { problemId: problemId ?? undefined, date, ...(isScheduled ? { publishTime } : {}) };
      return api.updateQOTD(target.id, data, token);
    },
    onSuccess: () => {
      toast.success('QOTD updated');
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update QOTD'),
  });

  const canSave = isLegacy ? question.trim().length >= 5 && Boolean(date) : Boolean(problemId) && Boolean(date);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit QOTD{isScheduled ? ' · scheduled' : ' · proposal'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {isLegacy ? (
            <>
              <Field label="Question" required>
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What is the time complexity of heap-build?" />
              </Field>
              <Field label="Problem link" hint="Optional">
                <Input value={problemLink} onChange={(e) => setProblemLink(e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </>
          ) : (
            <>
              <Field label="Problem" required>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or tag…" className="pl-8 h-9" />
                </div>
              </Field>
              <DSCard padded={false} className="max-h-[200px] overflow-y-auto">
                {problemsQ.isLoading ? (
                  <div className="p-4 text-[12px] text-[var(--ds-text-3)] text-center">Loading…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-4 text-[12px] text-[var(--ds-text-3)] text-center">No problems match</div>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProblemId(p.id)}
                      className={cn(
                        'w-full px-3 py-2 flex items-center gap-2 border-b border-[var(--border-subtle)] last:border-b-0 text-left transition-colors',
                        problemId === p.id ? 'bg-[var(--accent-subtle)]/40' : 'hover:bg-[var(--surface-soft)]',
                      )}
                    >
                      <span className="text-[12.5px] font-medium flex-1 truncate">{p.title}</span>
                      <Pill tone="neutral" size="xs">{p.difficulty}</Pill>
                      {problemId === p.id && <Check size={12} className="text-[var(--accent)]" />}
                    </button>
                  ))
                )}
              </DSCard>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                {isScheduled && (
                  <Field label="Publish time" hint="IST"><Input type="time" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} /></Field>
                )}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EditQOTDDialog;
