// Dashboard v2 — Admin · Problems.
// Counts strip + filter bar + table with publish-toggle per row + Create/Edit/Delete + Bulk import.
// Pixel-port of screen-admin2.jsx:85 (AdminProblemsScreen).

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2, Pencil, Loader2, MoreHorizontal, ExternalLink, FileUp, ListChecks, CalendarPlus, Trophy, Copy, RefreshCw, Code2, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  api,
  type Problem,
  type ProblemSubmission,
  type SubmissionVerdict,
  type CompetitionRound,
} from '@/lib/api';
import { DSCard, Difficulty, EmptyState, MonoChip, NumericPromptDialog, Pill, SegmentedTabs } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BulkImportCard } from '@/components/admin/problems/BulkImportCard';

type DiffFilter = 'ALL' | 'EASY' | 'MEDIUM' | 'HARD';

const VERDICTS: SubmissionVerdict[] = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'TIME_LIMIT_EXCEEDED',
  'RUNTIME_ERROR',
  'COMPILATION_ERROR',
  'JUDGE_ERROR',
  'PENDING',
];

function verdictTone(v: SubmissionVerdict): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (v === 'ACCEPTED') return 'success';
  if (v === 'WRONG_ANSWER' || v === 'RUNTIME_ERROR' || v === 'COMPILATION_ERROR') return 'danger';
  if (v === 'TIME_LIMIT_EXCEEDED') return 'warning';
  if (v === 'JUDGE_ERROR') return 'info';
  return 'neutral';
}

export default function AdminProblems({ embedded = false }: { embedded?: boolean } = {}) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [diff, setDiff] = useState<DiffFilter>('ALL');

  // Deep-link: external links land here with `?problemId=<id>` (e.g. notification clicks).
  // Routing to the canonical edit page consumes the param once and strips it.
  useEffect(() => {
    const targetId = searchParams.get('problemId');
    if (!targetId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('problemId');
    setSearchParams(next, { replace: true });
    navigate(`/dashboard/problems/${targetId}/edit`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [deleting, setDeleting] = useState<Problem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Restored from HEAD — three admin tools:
  // 1. View submissions + override verdict / score
  // 2. Set problem as QOTD (with optional publish-now)
  // 3. Append problem to a competition round
  const [submissionsTarget, setSubmissionsTarget] = useState<Problem | null>(null);
  const [qotdTarget, setQotdTarget] = useState<Problem | null>(null);
  const [qotdDate, setQotdDate] = useState<string>(() =>
    new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [qotdPublishNow, setQotdPublishNow] = useState(true);
  const [contestTarget, setContestTarget] = useState<Problem | null>(null);
  const [contestEventId, setContestEventId] = useState<string>('');
  const [contestRoundId, setContestRoundId] = useState<string>('');
  const [contestPoints, setContestPoints] = useState<number>(100);
  // Rejudge job tracking — polls until complete (HEAD parity, E8).
  const [rejudgeJob, setRejudgeJob] = useState<{ problemId: string; jobId: string } | null>(null);

  const q = useQuery({
    queryKey: ['admin-problems'],
    queryFn: () => api.adminGetProblems(token!),
    enabled: Boolean(token),
  });
  const all: Problem[] = q.data?.problems ?? [];
  const filtered = useMemo(() => {
    return all
      .filter((p) => (publishedOnly ? p.isPublished : true))
      .filter((p) => (diff === 'ALL' ? true : p.difficulty === diff))
      .filter((p) =>
        !search.trim()
          ? true
          : p.title.toLowerCase().includes(search.toLowerCase()) ||
            p.slug.toLowerCase().includes(search.toLowerCase()) ||
            p.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase())),
      );
  }, [all, publishedOnly, diff, search]);

  const counts = useMemo(() => ({
    published: all.filter((p) => p.isPublished).length,
    draft: all.filter((p) => !p.isPublished).length,
    legacy: 0,
  }), [all]);

  const publishMut = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      api.setProblemPublished(id, isPublished, token!),
    onMutate: async ({ id, isPublished }) => {
      await qc.cancelQueries({ queryKey: ['admin-problems'] });
      const prev = qc.getQueryData<{ problems: Problem[] }>(['admin-problems']);
      if (prev) {
        qc.setQueryData<{ problems: Problem[] }>(['admin-problems'], {
          ...prev,
          problems: prev.problems.map((p) => (p.id === id ? { ...p, isPublished } : p)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['admin-problems'], ctx.prev);
      toast.error('Failed to toggle publish');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-problems'] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteProblem(id, token!),
    onSuccess: () => {
      toast.success('Problem deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admin-problems'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete'),
  });

  // Duplicate problem — fetches the source, appends -copy-<hash> to the slug, saves as draft.
  // Mirrors HEAD's duplicateMutation. Navigates to the new edit page on success.
  const duplicateMut = useMutation({
    mutationFn: async (source: Problem) => {
      const detail = await api.getProblem(source.id, { token: token! });
      const src = detail.problem;
      const baseSlug = (src.slug || 'problem').slice(0, 100);
      const newSlug = `${baseSlug}-copy-${Date.now().toString(36).slice(-5)}`;
      const created = await api.createProblem({
        slug: newSlug,
        title: `${src.title} (copy)`,
        body: src.body ?? '',
        difficulty: src.difficulty,
        tags: src.tags ?? [],
        allowedLanguages: src.allowedLanguages ?? ['PYTHON'],
        timeLimitMs: src.timeLimitMs ?? 2000,
        defaultSubmitCap: src.defaultSubmitCap ?? 5,
        sampleTests: src.sampleTests ?? [],
        hiddenTests: src.hiddenTests ?? [],
        referenceSolution: src.referenceSolution ?? '',
        referenceLanguage: src.referenceLanguage ?? src.allowedLanguages?.[0] ?? 'PYTHON',
        isPublished: false,
      }, token!);
      return created.problem;
    },
    onSuccess: (newProblem) => {
      toast.success(`Duplicated as "${newProblem.title}"`);
      qc.invalidateQueries({ queryKey: ['admin-problems'] });
      if (newProblem.id) navigate(`/dashboard/problems/${newProblem.id}/edit`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to duplicate'),
  });

  // Manual rejudge — queues a job server-side; jobQuery polls until complete.
  const rejudgeMut = useMutation({
    mutationFn: (problemId: string) => api.adminRejudgeProblem(problemId, undefined, token!),
    onSuccess: (data, problemId) => {
      setRejudgeJob({ problemId, jobId: data.jobId });
      toast.success('Rejudge queued — running…');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to queue rejudge'),
  });

  const jobQuery = useQuery({
    queryKey: ['problem-rejudge', rejudgeJob?.problemId, rejudgeJob?.jobId],
    queryFn: () => api.adminRejudgeStatus(rejudgeJob!.problemId, rejudgeJob!.jobId, token!),
    enabled: Boolean(rejudgeJob && token),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'complete' || status === 'failed' ? false : 1500;
    },
  });

  // When the job finishes, surface a toast and clear the tracking state.
  useEffect(() => {
    if (!jobQuery.data || !rejudgeJob) return;
    if (jobQuery.data.status === 'complete') {
      toast.success(`Rejudge complete (${jobQuery.data.processed ?? 0} of ${jobQuery.data.total ?? 0})`);
      qc.invalidateQueries({ queryKey: ['admin-problems'] });
      setRejudgeJob(null);
    } else if (jobQuery.data.status === 'failed') {
      toast.error('Rejudge failed');
      setRejudgeJob(null);
    }
  }, [jobQuery.data, rejudgeJob, qc]);

  // QOTD scheduling
  const useAsQotdMut = useMutation({
    mutationFn: async () => {
      if (!qotdTarget) throw new Error('no target');
      return api.createQOTD({ date: qotdDate, problemId: qotdTarget.id, publishNow: qotdPublishNow }, token!);
    },
    onSuccess: () => {
      toast.success(qotdPublishNow ? 'QOTD scheduled and published' : 'QOTD scheduled as draft');
      setQotdTarget(null);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create QOTD'),
  });

  // Contest append — list events + DSA rounds, then update the picked round's problems
  const eventsQ = useQuery({
    queryKey: ['admin-events-for-contest'],
    queryFn: () => api.getEvents(),
    enabled: Boolean(contestTarget),
    staleTime: 30_000,
  });
  const contestRoundsQ = useQuery({
    queryKey: ['admin-contest-rounds', contestEventId],
    queryFn: () => api.getCompetitionRoundsAdmin(contestEventId, token!),
    enabled: Boolean(contestTarget && contestEventId && token),
  });
  const eligibleRounds = useMemo<CompetitionRound[]>(() => {
    const rounds = (contestRoundsQ.data?.rounds ?? []) as CompetitionRound[];
    return rounds.filter((r) => r.roundType === 'DSA' && (r.status === 'DRAFT' || r.status === 'LOCKED'));
  }, [contestRoundsQ.data?.rounds]);

  const addToContestMut = useMutation({
    mutationFn: async () => {
      if (!contestTarget || !contestRoundId) throw new Error('no target');
      const round = await api.getCompetitionRound(contestRoundId, token!);
      const existing = ((round.problems ?? []) as Array<{ problemId?: string; problem?: { id?: string }; displayOrder?: number; points?: number }>).map(
        (link, idx) => ({
          problemId: link.problemId ?? link.problem?.id ?? '',
          displayOrder: link.displayOrder ?? idx,
          points: link.points ?? 100,
        }),
      ).filter((e) => e.problemId);
      if (existing.some((e) => e.problemId === contestTarget.id)) {
        throw new Error('Already in this round');
      }
      const next = [
        ...existing,
        { problemId: contestTarget.id, displayOrder: existing.length, points: contestPoints },
      ];
      return api.updateCompetitionRound(contestRoundId, { problems: next }, token!);
    },
    onSuccess: () => {
      toast.success('Problem added to contest round');
      setContestTarget(null);
      setContestEventId('');
      setContestRoundId('');
      setContestPoints(100);
      qc.invalidateQueries({ queryKey: ['admin-contest-rounds'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add to contest'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        {embedded ? <div /> : (
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
            <h1 className="text-[24px] font-semibold tracking-tight mt-1">Problems</h1>
            <p className="text-[13px] text-[var(--ds-text-3)] mt-1">The full catalog of practice + competition problems.</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen((o) => !o)}>
            <FileUp size={13} className="mr-1.5" />
            {bulkOpen ? 'Hide bulk import' : 'Bulk import'}
          </Button>
          <Button size="sm" onClick={() => navigate('/dashboard/problems/new')}>
            <Plus size={13} className="mr-1.5" />
            Create problem
          </Button>
        </div>
      </div>

      {bulkOpen && token && (
        <BulkImportCard
          token={token}
          onImported={() => qc.invalidateQueries({ queryKey: ['admin-problems'] })}
        />
      )}

      <div className="grid grid-cols-3 gap-y-3 border-y border-[var(--border-subtle)] py-4">
        {([
          ['Published', counts.published, 'var(--success)'],
          ['Draft', counts.draft, 'var(--warning)'],
          ['Legacy', counts.legacy, 'var(--ds-text-3)'],
        ] as Array<[string, number, string]>).map(([k, v, c], i) => (
          <div key={k} className={cn(i > 0 && 'border-l border-[var(--border-subtle)] pl-5')}>
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{k}</div>
            <div className="text-[24px] font-semibold tabular-nums leading-none mt-1.5" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-[280px] flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search problems…" className="pl-8 h-8 text-[13px]" />
        </div>
        <SegmentedTabs
          items={[
            { value: 'ALL', label: 'All' },
            { value: 'EASY', label: 'Easy' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'HARD', label: 'Hard' },
          ]}
          value={diff}
          onChange={(v) => setDiff(v as DiffFilter)}
        />
        <label className="flex items-center gap-2 text-[12.5px] ml-auto">
          <Switch checked={publishedOnly} onCheckedChange={setPublishedOnly} />
          Published only
        </label>
      </div>

      <DSCard padded={false}>
        {q.isLoading ? (
          <div className="p-6 animate-pulse space-y-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-[var(--surface-soft)] rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No problems match" body="Try a different filter or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold">
                <tr>
                  <th className="px-4 py-2.5 w-[40px]">#</th>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5 w-[100px]">Difficulty</th>
                  <th className="px-4 py-2.5">Tags</th>
                  <th className="px-4 py-2.5 w-[140px]">Languages</th>
                  <th className="px-4 py-2.5 w-[100px]">Published</th>
                  <th className="px-4 py-2.5 w-[100px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]">
                    <td className="px-4 py-3 font-mono tabular-nums text-[var(--ds-text-3)]">{String(i + 1).padStart(3, '0')}</td>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/dashboard/coding?tab=practice&problem=${p.slug}`}
                          className="truncate max-w-[280px] hover:underline hover:text-[var(--accent)]"
                          title="Open public problem page"
                        >
                          {p.title}
                        </Link>
                        <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono">{p.slug}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Difficulty level={p.difficulty} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(p.tags ?? []).slice(0, 3).map((t) => <MonoChip key={t}>{t}</MonoChip>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11.5px] text-[var(--ds-text-3)] font-mono">
                      {(p.allowedLanguages ?? []).map((l) => l.toLowerCase().slice(0, 4)).join(' · ')}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={p.isPublished}
                        onCheckedChange={(checked) => publishMut.mutate({ id: p.id, isPublished: checked })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {rejudgeJob?.problemId === p.id ? (
                          <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-[6px] bg-[var(--accent-subtle)]/40 text-[10.5px] text-[var(--accent)] font-mono tabular-nums" aria-live="polite">
                            <Loader2 size={10} className="animate-spin" />
                            {jobQuery.data?.processed ?? 0}/{jobQuery.data?.total ?? '…'}
                          </span>
                        ) : null}
                        <button onClick={() => setSubmissionsTarget(p)} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" title="View submissions" aria-label="View submissions">
                          <ListChecks size={11} />
                        </button>
                        <button onClick={() => setQotdTarget(p)} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" title="Set as QOTD" aria-label="Set as QOTD">
                          <CalendarPlus size={11} />
                        </button>
                        <button onClick={() => setContestTarget(p)} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" title="Add to contest" aria-label="Add to contest">
                          <Trophy size={11} />
                        </button>
                        <button onClick={() => duplicateMut.mutate(p)} disabled={duplicateMut.isPending} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center disabled:opacity-50" title="Duplicate" aria-label="Duplicate problem">
                          {duplicateMut.isPending && duplicateMut.variables?.id === p.id ? <Loader2 size={11} className="animate-spin" /> : <Copy size={11} />}
                        </button>
                        <button onClick={() => rejudgeMut.mutate(p.id)} disabled={Boolean(rejudgeJob) || rejudgeMut.isPending} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center disabled:opacity-50" title="Rejudge all submissions" aria-label="Rejudge all submissions">
                          <RefreshCw size={11} />
                        </button>
                        <button onClick={() => navigate(`/dashboard/problems/${p.id}/edit`)} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" title="Edit problem" aria-label="Edit problem">
                          <Pencil size={11} />
                        </button>
                        <a href={`/dashboard/coding?tab=practice&problem=${p.slug}`} target="_blank" rel="noreferrer" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" title="Open public page" aria-label="Open public page">
                          <ExternalLink size={11} />
                        </a>
                        <button onClick={() => setDeleting(p)} className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center" title="Delete problem" aria-label="Delete problem">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DSCard>

      {/* Submissions + override dialog */}
      <Dialog open={Boolean(submissionsTarget)} onOpenChange={(o) => !o && setSubmissionsTarget(null)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submissions · {submissionsTarget?.title}</DialogTitle>
          </DialogHeader>
          {submissionsTarget && token && (
            <SubmissionsTable problemId={submissionsTarget.id} token={token} />
          )}
        </DialogContent>
      </Dialog>

      {/* Set as QOTD dialog */}
      <Dialog open={Boolean(qotdTarget)} onOpenChange={(o) => !o && setQotdTarget(null)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
          <DialogHeader>
            <DialogTitle>Set as QOTD · {qotdTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] block mb-1">Date</label>
              <Input type="date" value={qotdDate} onChange={(e) => setQotdDate(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <Switch checked={qotdPublishNow} onCheckedChange={setQotdPublishNow} />
              Publish immediately
            </label>
            <p className="text-[11.5px] text-[var(--ds-text-3)]">
              If unchecked, the QOTD is created as draft and the publish scheduler picks it up on the chosen date.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setQotdTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={() => useAsQotdMut.mutate()} disabled={useAsQotdMut.isPending || !qotdDate}>
              {useAsQotdMut.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to contest dialog */}
      <Dialog open={Boolean(contestTarget)} onOpenChange={(o) => !o && setContestTarget(null)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-md">
          <DialogHeader>
            <DialogTitle>Add to contest · {contestTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] block mb-1">Event</label>
              <select
                value={contestEventId}
                onChange={(e) => { setContestEventId(e.target.value); setContestRoundId(''); }}
                className="h-9 w-full px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
              >
                <option value="">— pick event —</option>
                {(eventsQ.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] block mb-1">DSA round (DRAFT or LOCKED)</label>
              <select
                value={contestRoundId}
                onChange={(e) => setContestRoundId(e.target.value)}
                disabled={!contestEventId || contestRoundsQ.isLoading}
                className="h-9 w-full px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)] disabled:opacity-50"
              >
                <option value="">— pick round —</option>
                {eligibleRounds.map((r) => (
                  <option key={r.id} value={r.id}>{r.title} · {r.status}</option>
                ))}
              </select>
              {contestEventId && eligibleRounds.length === 0 && !contestRoundsQ.isLoading && (
                <p className="text-[11.5px] text-[var(--ds-text-3)] mt-1">No DRAFT/LOCKED DSA rounds on this event.</p>
              )}
            </div>
            <div>
              <label className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] block mb-1">Points</label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={contestPoints}
                onChange={(e) => setContestPoints(Math.max(1, Number(e.target.value) || 100))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setContestTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={() => addToContestMut.mutate()} disabled={addToContestMut.isPending || !contestRoundId}>
              {addToContestMut.isPending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Append
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This removes the problem permanently. Submissions and counter records will cascade.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
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

// Submissions table for a single problem with per-row verdict + score override.
// Restored from HEAD — the admin tool that lets us correct judge mistakes.
function SubmissionsTable({ problemId, token }: { problemId: string; token: string }) {
  const qc = useQueryClient();
  const [scoreTarget, setScoreTarget] = useState<ProblemSubmission | null>(null);
  const [codeTarget, setCodeTarget] = useState<ProblemSubmission | null>(null);
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ['admin-problem-submissions', problemId],
    queryFn: () => api.adminGetProblemSubmissions(problemId, { limit: 200 }, token),
  });
  const overrideMut = useMutation({
    mutationFn: ({ submission, verdict, score }: { submission: ProblemSubmission; verdict?: SubmissionVerdict; score?: number }) =>
      api.adminOverrideSubmission(
        problemId,
        submission.id,
        { verdict, score, notes: 'Manual override from admin Problems page' },
        token,
      ),
    onSuccess: () => {
      toast.success('Override saved');
      setScoreTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-problem-submissions', problemId] });
      qc.invalidateQueries({ queryKey: ['admin-problems'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Override failed'),
  });
  if (q.isLoading) return <Loader2 size={16} className="animate-spin text-[var(--ds-text-3)]" />;
  const subs = q.data?.submissions ?? [];
  if (subs.length === 0) return <EmptyState title="No submissions yet" />;
  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--border-subtle)]">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold bg-[var(--surface-soft)]/40">
          <tr>
            <th className="px-3 py-2.5">User</th>
            <th className="px-3 py-2.5">Context</th>
            <th className="px-3 py-2.5">Verdict</th>
            <th className="px-3 py-2.5">Score</th>
            <th className="px-3 py-2.5">Updated</th>
            <th className="px-3 py-2.5">Override</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id} className="border-t border-[var(--border-subtle)]">
              <td className="px-3 py-2.5 font-medium">{s.user?.name ?? s.userId.slice(0, 8)}</td>
              <td className="px-3 py-2.5 text-[var(--ds-text-3)] font-mono text-[11.5px]">
                {s.contextType}
                {s.contextKey ? ` · ${s.contextKey.slice(0, 8)}` : ''}
              </td>
              <td className="px-3 py-2.5"><Pill tone={verdictTone(s.verdict)} size="xs">{s.verdict}</Pill></td>
              <td className="px-3 py-2.5 font-mono tabular-nums">{s.score}</td>
              <td className="px-3 py-2.5 text-[var(--ds-text-3)] text-[11.5px]">
                {new Date(s.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setCopied(false); setCodeTarget(s); }}
                    className="h-7 px-2 inline-flex items-center gap-1 text-[11.5px] font-semibold bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] hover:bg-[var(--surface-soft)]"
                    title="View submitted code"
                  >
                    <Code2 size={12} /> Code
                  </button>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) overrideMut.mutate({ submission: s, verdict: e.target.value as SubmissionVerdict });
                      e.currentTarget.value = '';
                    }}
                    className="h-7 px-1.5 text-[11.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Verdict…</option>
                    {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setScoreTarget(s)}
                    className="h-7 px-2 text-[11.5px] font-semibold bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] hover:bg-[var(--surface-soft)]"
                  >
                    Score
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <NumericPromptDialog
        open={Boolean(scoreTarget)}
        onOpenChange={(o) => !o && setScoreTarget(null)}
        title="Override submission score"
        description={scoreTarget ? `${scoreTarget.user?.name ?? scoreTarget.userId.slice(0, 8)} · ${scoreTarget.verdict}` : undefined}
        label="Score"
        defaultValue={scoreTarget?.score ?? 0}
        min={0}
        max={100}
        confirmLabel="Save override"
        pending={overrideMut.isPending}
        onCommit={(value) => {
          if (!scoreTarget) return;
          overrideMut.mutate({ submission: scoreTarget, score: Math.max(0, Math.min(100, Math.round(value))) });
        }}
      />

      <Dialog open={Boolean(codeTarget)} onOpenChange={(o) => !o && setCodeTarget(null)}>
        <DialogContent data-dashboard="true" className="max-w-3xl bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <DialogHeader>
            <DialogTitle>Submission code · {codeTarget?.user?.name ?? codeTarget?.userId.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {codeTarget && (
            <div className="flex flex-col gap-3 min-h-0">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <Pill tone="neutral" size="xs">{codeTarget.language}</Pill>
                <Pill tone={verdictTone(codeTarget.verdict)} size="xs">{codeTarget.verdict}</Pill>
                <span className="text-[var(--ds-text-3)] font-mono tabular-nums">
                  {codeTarget.passedCount}/{codeTarget.totalCount} tests · score {codeTarget.score}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(codeTarget.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
                  }}
                  className="ml-auto h-7 px-2 inline-flex items-center gap-1 text-[11.5px] font-semibold bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] hover:bg-[var(--surface-soft)]"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-auto max-h-[55vh] rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3 text-[12.5px] leading-relaxed font-mono whitespace-pre">
                {codeTarget.code || '(empty submission)'}
              </pre>
              {codeTarget.compilerOutput && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-1">Compiler / runtime output</div>
                  <pre className="overflow-auto max-h-32 rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2.5 text-[11.5px] font-mono whitespace-pre-wrap text-[var(--danger)]">
                    {codeTarget.compilerOutput}
                  </pre>
                </div>
              )}
              {codeTarget.overrideNotes && (
                <p className="text-[11.5px] text-[var(--ds-text-3)]">Override note: {codeTarget.overrideNotes}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCodeTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// silence unused
void MoreHorizontal;
