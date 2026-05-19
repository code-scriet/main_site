// Dashboard v2 — Manage QOTD.
// 3-mode picker (pick existing / create inline / legacy text-only) + 30-day calendar grid.
// Pixel-port of screen-admin2.jsx:915 (ManageQotdScreen).

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, FileText, Loader2, Check, ChevronLeft, ChevronRight, Link as LinkIcon,
  Trash2, Pause, Play, BookOpen, BookOpenCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type Problem, type QOTDHistoryEntry } from '@/lib/api';
import { DSCard, EmptyState, Field, Pill, Section } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

type Mode = 'pick' | 'create' | 'legacy';
type Status = 'live' | 'published' | 'scheduled' | 'held' | 'empty';

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dayCellStatus(date: Date, history: QOTDHistoryEntry[]): { status: Status; qotd: QOTDHistoryEntry | null } {
  const iso = toIsoDate(date);
  const today = new Date();
  const isToday = toIsoDate(today) === iso;
  const past = date < today && !isToday;
  const matched = history.find((q) => q.date.slice(0, 10) === iso);
  if (matched) {
    if (matched.heldBy) return { status: 'held', qotd: matched };
    if (isToday && matched.isPublished) return { status: 'live', qotd: matched };
    if (!matched.isPublished && !past) return { status: 'scheduled', qotd: matched };
    return { status: 'published', qotd: matched };
  }
  return { status: 'empty', qotd: null };
}

export default function CreateQOTD() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>('pick');
  const [problemSearch, setProblemSearch] = useState('');
  const [problemId, setProblemId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(toIsoDate(new Date()));
  const [publishTime, setPublishTime] = useState<string>('00:00');
  const [publishToPractice, setPublishToPractice] = useState(true);
  const [legacyQuestion, setLegacyQuestion] = useState('');
  const [legacyLink, setLegacyLink] = useState('');
  const [calMonth, setCalMonth] = useState(() => new Date());

  const isDirty = (mode === 'pick' && Boolean(problemId)) || (mode === 'legacy' && (legacyQuestion.trim().length > 0 || legacyLink.trim().length > 0));
  useUnsavedChangesWarning(isDirty);

  // E10 — returning from /dashboard/problems/new?qotd=1: CreateProblem redirects to
  // /dashboard/qotd?problemId=<newId>. Pre-select that problem in pick mode + restore the
  // pending date from localStorage so the admin can schedule with one click.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const incomingId = searchParams.get('problemId');
    if (!incomingId) return;
    let pendingDate = '';
    try { pendingDate = localStorage.getItem('pendingQOTDDate') ?? ''; } catch { /* ignore */ }
    setMode('pick');
    setProblemId(incomingId);
    if (pendingDate) setDate(pendingDate);
    try { localStorage.removeItem('pendingQOTDDate'); } catch { /* ignore */ }
    const next = new URLSearchParams(searchParams);
    next.delete('problemId');
    setSearchParams(next, { replace: true });
    toast.success('Problem ready — review and click Schedule to publish as QOTD');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hold dialog (CAT 34): mandatory reason textarea before holding a published QOTD.
  const [holdTarget, setHoldTarget] = useState<QOTDHistoryEntry | null>(null);
  const [holdReason, setHoldReason] = useState('');
  // Delete dialog (CAT 41): named confirmation before destructive delete.
  const [deleteTarget, setDeleteTarget] = useState<QOTDHistoryEntry | null>(null);
  // Per-row spinner (CAT 4).
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ['qotd-history-admin'],
    queryFn: () => api.getQOTDHistory(60, 0, { includeUnpublished: true, token: token! }),
    enabled: Boolean(token),
  });
  const problemsQ = useQuery({
    queryKey: ['admin-problems-for-qotd'],
    queryFn: () => api.adminGetProblems(token!),
    enabled: Boolean(token) && mode === 'pick',
  });
  const problems: Problem[] = useMemo(() => problemsQ.data?.problems ?? [], [problemsQ.data]);
  const history = historyQ.data ?? [];

  const filteredProblems = useMemo(() => {
    if (!problemSearch.trim()) return problems.slice(0, 20);
    return problems
      .filter((p) => p.title.toLowerCase().includes(problemSearch.toLowerCase()) || p.tags?.some((t) => t.toLowerCase().includes(problemSearch.toLowerCase())))
      .slice(0, 20);
  }, [problems, problemSearch]);

  // Compose calendar grid
  const calDays = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const first = new Date(year, month, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // Monday = 0
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date | null; status: Status; qotd: QOTDHistoryEntry | null }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, status: 'empty', qotd: null });
    for (let d = 1; d <= totalDays; d++) {
      const cellDate = new Date(year, month, d);
      const { status, qotd } = dayCellStatus(cellDate, history);
      cells.push({ date: cellDate, status, qotd });
    }
    return cells;
  }, [calMonth, history]);

  const monthLabel = calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const publishedCount = history.filter((q) => q.isPublished).length;
  const scheduledCount = history.filter((q) => !q.isPublished && !q.heldBy).length;

  const scheduleMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Not authenticated');
      const body: Parameters<typeof api.createQOTD>[0] = mode === 'pick'
        ? { date, problemId: problemId!, publishNow: false }
        : mode === 'legacy'
        ? { date, question: legacyQuestion.trim(), problemLink: legacyLink.trim() || undefined }
        : { date };
      void publishTime; void publishToPractice;
      await api.createQOTD(body, token);
    },
    onSuccess: () => {
      toast.success('QOTD scheduled');
      qc.invalidateQueries({ queryKey: ['qotd-history-admin'] });
      setProblemId(null);
      setLegacyQuestion('');
      setLegacyLink('');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to schedule'),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => api.publishQOTD(id, token!),
    onMutate: (id) => { setRowBusy(id); },
    onSuccess: () => { toast.success('QOTD published'); qc.invalidateQueries({ queryKey: ['qotd-history-admin'] }); },
    onError: (e: Error) => toast.error(e.message || 'Failed to publish'),
    onSettled: () => setRowBusy(null),
  });
  const holdMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.holdQOTD(id, reason, token!),
    onMutate: ({ id }) => { setRowBusy(id); },
    onSuccess: () => {
      toast.success('QOTD held');
      setHoldTarget(null);
      setHoldReason('');
      qc.invalidateQueries({ queryKey: ['qotd-history-admin'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to hold'),
    onSettled: () => setRowBusy(null),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteQOTD(id, token!),
    onMutate: (id) => { setRowBusy(id); },
    onSuccess: () => {
      toast.success('QOTD deleted');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['qotd-history-admin'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete'),
    onSettled: () => setRowBusy(null),
  });
  const publishPracticeMut = useMutation({
    mutationFn: (id: string) => api.publishQOTDToPractice(id, token!),
    onMutate: (id) => { setRowBusy(id); },
    onSuccess: () => { toast.success('Published to practice catalog'); qc.invalidateQueries({ queryKey: ['qotd-history-admin'] }); },
    onError: (e: Error) => toast.error(e.message || 'Failed to publish to practice'),
    onSettled: () => setRowBusy(null),
  });
  const unpublishPracticeMut = useMutation({
    mutationFn: (id: string) => api.unpublishQOTDFromPractice(id, token!),
    onMutate: (id) => { setRowBusy(id); },
    onSuccess: () => { toast.success('Removed from practice catalog'); qc.invalidateQueries({ queryKey: ['qotd-history-admin'] }); },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove from practice'),
    onSettled: () => setRowBusy(null),
  });

  const canSchedule = mode === 'pick' ? Boolean(problemId) : mode === 'legacy' ? Boolean(legacyQuestion.trim()) : false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Manage</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Question of the day</h1>
        </div>
        <Pill tone="neutral" size="sm">
          <span className="font-mono tabular-nums">{publishedCount}</span> published
          {' · '}
          <span className="font-mono tabular-nums ml-1">{scheduledCount}</span> scheduled
        </Pill>
      </div>

      {/* Mode picker */}
      <div className="grid sm:grid-cols-3 gap-2">
        {([
          { id: 'pick', icon: Search, title: 'Pick existing problem', body: 'Schedule a published problem for a date.' },
          { id: 'create', icon: Plus, title: 'Create new problem', body: 'Author inline, scheduled in one go.' },
          { id: 'legacy', icon: FileText, title: 'Legacy text-only', body: 'A question + a problem link, no judging.' },
        ] as const).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              'p-4 rounded-[10px] border text-left transition-all',
              mode === m.id
                ? 'bg-[var(--accent-subtle)]/40 border-[var(--accent)] ring-2 ring-[var(--accent-ring)]'
                : 'bg-[var(--bg-raised)] border-[var(--border-subtle)] hover:border-[var(--border-default)]',
            )}
          >
            <div className={cn(
              'size-8 rounded-[8px] flex items-center justify-center mb-2',
              mode === m.id ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--surface-soft)] text-[var(--ds-text-2)]',
            )}>
              <m.icon size={15} />
            </div>
            <div className="text-[13.5px] font-semibold">{m.title}</div>
            <div className="text-[11.5px] text-[var(--ds-text-3)] mt-1 leading-snug">{m.body}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        {/* Form */}
        <DSCard padded className="lg:col-span-7 flex flex-col gap-3">
          <div className="text-[13.5px] font-semibold">
            {mode === 'pick' ? 'Schedule existing' : mode === 'create' ? 'New problem inline' : 'Quick text question'}
          </div>

          {mode === 'pick' && (
            <>
              <Field label="Problem" required>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                  <Input
                    value={problemSearch}
                    onChange={(e) => setProblemSearch(e.target.value)}
                    placeholder="Search by title or tag…"
                    className="pl-8 h-9"
                  />
                </div>
              </Field>
              <div className="border border-[var(--border-subtle)] rounded-[8px] max-h-[200px] overflow-y-auto bg-[var(--surface-soft)]/40">
                {problemsQ.isLoading ? (
                  <div className="p-4 text-[12px] text-[var(--ds-text-3)] text-center">Loading…</div>
                ) : filteredProblems.length === 0 ? (
                  <div className="p-4 text-[12px] text-[var(--ds-text-3)] text-center">No problems match</div>
                ) : (
                  filteredProblems.map((p) => (
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Publish time" hint="defaults to 00:00 IST"><Input type="time" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} /></Field>
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={publishToPractice} onChange={(e) => setPublishToPractice(e.target.checked)} />
                Publish to practice catalog after the day ends
              </label>
            </>
          )}

          {mode === 'create' && (
            <div className="text-[12.5px] text-[var(--ds-text-3)] space-y-2">
              <p>
                Use the{' '}
                <button
                  type="button"
                  onClick={() => {
                    // Persist the picked date so we can offer one-click scheduling after the
                    // admin finishes authoring the new problem. CreateProblem clears this on save.
                    try { localStorage.setItem('pendingQOTDDate', date); } catch { /* quota */ }
                    navigate('/dashboard/problems/new?qotd=1');
                  }}
                  className="text-[var(--accent)] hover:underline"
                >
                  Create problem stepper
                </button>
                , then come back — we&apos;ll prompt you to schedule it as QOTD for {date}.
              </p>
              <p className="text-[11.5px]">
                Tip: this is the same as picking an existing problem in the &ldquo;Schedule existing&rdquo; mode once you publish the new problem.
              </p>
            </div>
          )}

          {mode === 'legacy' && (
            <>
              <Field label="Question" required>
                <Input value={legacyQuestion} onChange={(e) => setLegacyQuestion(e.target.value)} placeholder="What is the time complexity of heap-build?" />
              </Field>
              <Field label="Problem link" hint="Optional · LeetCode / HackerRank / etc.">
                <div className="relative">
                  <LinkIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                  <Input value={legacyLink} onChange={(e) => setLegacyLink(e.target.value)} placeholder="https://…" className="pl-8" />
                </div>
              </Field>
              <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button size="sm" onClick={() => scheduleMut.mutate()} disabled={!canSchedule || scheduleMut.isPending}>
              {scheduleMut.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Schedule <Check size={13} className="ml-1" />
            </Button>
          </div>
        </DSCard>

        {/* Calendar */}
        <DSCard padded className="lg:col-span-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13.5px] font-semibold">{monthLabel}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)]">
                <ChevronLeft size={12} />
              </button>
              <button onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)]">
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 mb-2 text-[10px] text-[var(--ds-text-3)] uppercase tracking-[0.06em] font-semibold text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calDays.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={!c.date}
                onClick={() => {
                  if (!c.date) return;
                  setDate(toIsoDate(c.date));
                }}
                className={cn(
                  'aspect-square rounded-[6px] relative flex items-center justify-center text-[11.5px] font-medium border transition-colors',
                  !c.date && 'opacity-0 pointer-events-none',
                  c.status === 'live' && 'bg-[var(--accent)] text-white border-transparent ring-2 ring-[var(--accent-ring)]',
                  c.status === 'published' && 'bg-[var(--accent-subtle)] text-[var(--accent)] border-transparent',
                  c.status === 'scheduled' && 'bg-[var(--surface-soft)] text-[var(--ds-text-1)] border-dashed border-[var(--border-strong)]',
                  c.status === 'held' && 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
                  c.status === 'empty' && 'bg-transparent text-[var(--ds-text-3)] border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]',
                )}
                title={c.qotd?.question}
              >
                <span className="font-mono tabular-nums">{c.date?.getDate()}</span>
                {c.status === 'live' && <span className="absolute -top-0.5 -right-0.5 size-[6px] rounded-full bg-white live-dot" />}
              </button>
            ))}
          </div>
          <hr className="border-0 h-px bg-[var(--border-subtle)] my-3" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10.5px]">
            {([
              ['Live now', 'bg-[var(--accent)]'],
              ['Published', 'bg-[var(--accent-subtle)] border border-[var(--accent)]/30'],
              ['Scheduled', 'bg-[var(--surface-soft)] border border-dashed border-[var(--border-strong)]'],
              ['Held', 'bg-[var(--warning-bg)] border border-[var(--warning-border)]'],
            ] as const).map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-[3px]', c)} />
                <span className="text-[var(--ds-text-3)]">{l}</span>
              </div>
            ))}
          </div>
        </DSCard>
      </div>

      {/* Recent history with actions */}
      <Section eyebrow="History" title={`${history.length} entries`}>
        {historyQ.isLoading ? (
          <div className="h-24 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : history.length === 0 ? (
          <DSCard padded><EmptyState icon={<BookOpen size={18} />} title="No QOTDs yet" /></DSCard>
        ) : (
          <DSCard padded={false}>
            <div className="divide-y divide-[var(--border-subtle)]">
              {history.slice(0, 12).map((q) => (
                <div key={q.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="font-mono tabular-nums text-[12px] text-[var(--ds-text-3)] w-[88px]">
                    {new Date(q.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="flex-1 truncate text-[13px] font-medium">{q.question}</span>
                  <Pill tone={q.isPublished && !q.heldBy ? 'success' : q.heldBy ? 'warning' : 'neutral'} size="xs">
                    {q.heldBy ? 'Held' : q.isPublished ? 'Published' : 'Scheduled'}
                  </Pill>
                  {rowBusy === q.id && <Loader2 size={11} className="animate-spin text-[var(--ds-text-3)]" />}
                  {!q.isPublished && (
                    <button onClick={() => publishMut.mutate(q.id)} disabled={rowBusy === q.id} title="Publish" className="size-7 rounded-[6px] hover:bg-[var(--accent-subtle)] text-[var(--ds-text-3)] hover:text-[var(--accent)] flex items-center justify-center disabled:opacity-40">
                      <Play size={11} />
                    </button>
                  )}
                  {q.isPublished && !q.heldBy && (
                    <button onClick={() => { setHoldTarget(q); setHoldReason(''); }} disabled={rowBusy === q.id} title="Hold" className="size-7 rounded-[6px] hover:bg-[var(--warning-bg)] text-[var(--ds-text-3)] hover:text-[var(--warning)] flex items-center justify-center disabled:opacity-40">
                      <Pause size={11} />
                    </button>
                  )}
                  {q.problemId && !q.problem?.isPublished && (
                    <button onClick={() => publishPracticeMut.mutate(q.id)} disabled={rowBusy === q.id} title="Publish to practice catalog" aria-label="Publish to practice catalog" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center disabled:opacity-40">
                      <BookOpen size={11} />
                    </button>
                  )}
                  {q.problemId && q.problem?.isPublished && (
                    <button onClick={() => unpublishPracticeMut.mutate(q.id)} disabled={rowBusy === q.id} title="Remove from practice catalog" aria-label="Remove from practice catalog" className="size-7 rounded-[6px] hover:bg-[var(--warning-bg)] text-[var(--ds-text-3)] hover:text-[var(--warning)] flex items-center justify-center disabled:opacity-40">
                      <BookOpenCheck size={11} />
                    </button>
                  )}
                  <button onClick={() => setDeleteTarget(q)} disabled={rowBusy === q.id} title="Delete" className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center disabled:opacity-40">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </DSCard>
        )}
      </Section>

      <AlertDialog open={Boolean(holdTarget)} onOpenChange={(o) => { if (!o) { setHoldTarget(null); setHoldReason(''); } }}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Hold this QOTD?</AlertDialogTitle>
            <AlertDialogDescription>
              The question stops accepting submissions immediately. Add a short reason so other admins know why.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field label="Reason" required>
            <textarea
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. solution leaked on a public channel"
              className="w-full px-3 py-2 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] resize-y"
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => holdTarget && holdReason.trim() && holdMut.mutate({ id: holdTarget.id, reason: holdReason.trim() })}
              disabled={!holdReason.trim() || holdMut.isPending}
              className="bg-[var(--warning)] hover:opacity-90 text-white"
            >
              {holdMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Hold
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this QOTD?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the QOTD entry for{' '}
              {deleteTarget && new Date(deleteTarget.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
              The underlying problem (if any) stays in the catalog. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
