// Contest arena (Phase D) — the multi-problem DSA contestant experience. Lists the
// round's problems (difficulty, weight share, your best score, verdict), hosts the
// existing QOTDSolverShell for the selected problem in CONTEST context, shows a
// server-authoritative timer + live round score, and runs the proctor engine.
//
// DSA only (IMAGE_TARGET rounds use the build editor in CompetitionPage). Proctoring
// here is lock-only: a DSA draft is preserved locally, and auto-submitting an
// in-progress solution would waste an attempt / record broken code — so on an away-trip
// we lock (server-enforced) rather than force-submit. The lock overlay blocks work
// until an admin unlocks.

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, ChevronLeft, Clock, Loader2, Trophy } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { mainApi, type ContestRoundProblem } from '@/lib/mainApi';
import { QOTDSolverShell, type QOTDSolverContext } from '@/components/problems/QOTDSolverShell';
import { useProctor } from '@/hooks/useProctor';
import { useContestSocket } from '@/hooks/useContestSocket';
import { Button } from '@/components/ui/button';
import { getMainSiteOrigin } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MAIN_SITE_URL = getMainSiteOrigin();

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function difficultyTone(difficulty: string): string {
  const d = difficulty.toUpperCase();
  if (d === 'EASY') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (d === 'HARD') return 'text-red-600 bg-red-50 border-red-200';
  return 'text-amber-600 bg-amber-50 border-amber-200';
}

export default function ContestArenaPage() {
  const { roundId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { token, isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  // Round (problems + status + timer). Polls while active so scores/verdicts in the
  // nav and the timer/status stay fresh as the contestant submits.
  const roundQuery = useQuery({
    queryKey: ['contest-arena-round', roundId],
    queryFn: () => mainApi.getCompetitionRound(roundId),
    enabled: Boolean(roundId && token),
    refetchInterval: (q) => (q.state.data?.status === 'ACTIVE' || q.state.data?.status === 'DRAFT' ? 15_000 : false),
  });
  const round = roundQuery.data;

  // Default-select the ?problem= deep link, else the first problem.
  useEffect(() => {
    if (!round || selectedId) return;
    const wanted = searchParams.get('problem');
    const fromDeepLink = wanted && round.problems.some((p) => p.id === wanted) ? wanted : null;
    setSelectedId(fromDeepLink ?? round.problems[0]?.id ?? null);
  }, [round, selectedId, searchParams]);

  // IMAGE_TARGET rounds are solved in the build editor (CompetitionPage at
  // /competition/:roundId), not the DSA arena. Redirect there in an effect — never during
  // render (a render-time location.replace re-fires every render + double-runs in StrictMode).
  useEffect(() => {
    if (round && round.roundType !== 'DSA') window.location.replace(`/competition/${round.id}`);
  }, [round]);

  // Server-authoritative clock offset + 1s local countdown.
  useEffect(() => {
    if (!round?.serverTime) return;
    setClockOffsetMs(new Date(round.serverTime).getTime() - Date.now());
    setRemainingSeconds(round.remainingSeconds ?? null);
  }, [round?.serverTime, round?.remainingSeconds]);

  useEffect(() => {
    if (!round || round.status !== 'ACTIVE' || !round.startedAt) return;
    const startMs = new Date(round.startedAt).getTime();
    const id = window.setInterval(() => {
      const now = Date.now() + clockOffsetMs;
      setRemainingSeconds(Math.max(0, round.duration - Math.floor((now - startMs) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [round, clockOffsetMs]);

  const selectedProblem = round?.problems.find((p) => p.id === selectedId) ?? null;

  // Problem detail for the selected problem in CONTEST context.
  const problemQuery = useQuery({
    queryKey: ['contest-arena-problem', selectedId, roundId],
    queryFn: () => mainApi.getProblem(selectedId!, { contextType: 'CONTEST', contextKey: roundId }),
    enabled: Boolean(selectedId && roundId),
  });

  const isActive = round?.status === 'ACTIVE';

  const [tab, setTab] = useState<'problems' | 'leaderboard' | 'clarifications'>('problems');

  const leaderboardQuery = useQuery({
    queryKey: ['contest-arena-leaderboard', roundId],
    queryFn: () => mainApi.getContestLeaderboard(roundId),
    enabled: Boolean(roundId) && tab === 'leaderboard',
    refetchInterval: tab === 'leaderboard' && isActive ? 15_000 : false,
  });
  const clarificationsQuery = useQuery({
    queryKey: ['contest-arena-clarifications', roundId],
    queryFn: () => mainApi.getContestClarifications(roundId),
    enabled: Boolean(roundId) && tab === 'clarifications',
    refetchInterval: tab === 'clarifications' && isActive ? 20_000 : false,
  });
  const clarificationCount = clarificationsQuery.data?.clarifications.length ?? 0;

  const { locked: proctorLocked, awayMsLeft, inFullscreen, enterFullscreen, applyProctorPush } = useProctor({
    roundId,
    enabled: Boolean(round?.proctored) && isActive,
    // DSA proctor is lock-only (no auto-submit — see file header) but enforces the
    // fullscreen + copy-paste lockdown on a proctored round.
    fullscreen: Boolean(round?.proctored) && isActive,
    blockPaste: Boolean(round?.proctored) && isActive,
    // Paste / fullscreen-exit get a budget server-side: warn first, lock only on repeat.
    onWarn: ({ kind, remaining }) => {
      const left = remaining === null ? 'Repeated violations' : remaining <= 0 ? 'Your next violation' : `${remaining} more`;
      toast.warning(
        kind === 'COPY_PASTE' ? 'Pasting is disabled in this proctored round' : 'Stay in fullscreen for this proctored round',
        { description: `${left} will lock your session.` },
      );
    },
  });
  const needsFullscreen = Boolean(round?.proctored) && isActive && !inFullscreen && !proctorLocked;

  // Live push (no reloads): leaderboard/clarifications update their query caches in place,
  // first-solves pop a balloon toast, and a status change re-syncs the round (lobby →
  // synced start, lock, finish).
  const queryClient = useQueryClient();
  const problemTitleById = useMemo(
    () => new Map((round?.problems ?? []).map((p) => [p.id, p.title])),
    [round?.problems],
  );
  useContestSocket(roundId, Boolean(round) && round?.status !== 'FINISHED', {
    onLeaderboard: (data) => queryClient.setQueryData(['contest-arena-leaderboard', roundId], data),
    onClarification: (c) => {
      queryClient.setQueryData<{ clarifications: Array<{ id: string; message: string; createdAt: string }> }>(
        ['contest-arena-clarifications', roundId],
        (old) => ({ clarifications: [c, ...(old?.clarifications ?? []).filter((x) => x.id !== c.id)] }),
      );
      toast.info('📢 Clarification', { description: c.message });
    },
    onFirstSolve: (d) => toast(`🎈 First solve!`, { description: `${d.userName} solved ${problemTitleById.get(d.problemId) ?? 'a problem'}` }),
    onStatus: (status) => {
      if (status !== round?.status) {
        if (status === 'ACTIVE') toast.success('The contest has started — good luck!');
        void roundQuery.refetch();
      }
    },
    // Admin lock/unlock pushed live → reflect it instantly (the heartbeat poll is the
    // up-to-15s fallback). A fresh unlock clears the overlay without the contestant waiting.
    onProctor: (d) => applyProctorPush(d.locked, d.lockReason),
  });

  // Live round score = Σ(best% × normalized problem weight), capped 0–100.
  const { roundScore, weightShare } = useMemo(() => {
    const problems = round?.problems ?? [];
    const totalWeight = problems.reduce((sum, p) => sum + (p.points || 0), 0) || 1;
    const share = new Map(problems.map((p) => [p.id, (p.points || 0) / totalWeight]));
    const score = problems.reduce((sum, p) => sum + (p.submission?.score ?? 0) * (share.get(p.id) ?? 0), 0);
    return { roundScore: Math.round(Math.min(100, score) * 10) / 10, weightShare: share };
  }, [round]);

  const solverContext = useMemo<QOTDSolverContext>(() => ({
    type: 'CONTEST',
    key: roundId,
    submitEnabled: isActive && !proctorLocked,
    practice: false,
    modeLabel: round?.title ? `Contest · ${round.title}` : 'Contest',
    deadlineLabel: isActive
      ? 'Live contest round — submissions are judged and ranked.'
      : 'This round is not accepting submissions right now.',
  }), [roundId, isActive, proctorLocked, round]);

  function verdictDot(p: ContestRoundProblem): string {
    if (p.submission?.verdict === 'ACCEPTED') return 'bg-emerald-500';
    if (p.submission && p.submission.score > 0) return 'bg-amber-500';
    if (p.submission) return 'bg-red-500';
    return 'bg-zinc-300 dark:bg-zinc-600';
  }

  if (!isAuthenticated) {
    return (
      <CenteredCard tone="warn" title="Sign in required">
        Please sign in from the main site to enter this contest.
      </CenteredCard>
    );
  }
  if (roundQuery.isLoading) {
    return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="h-9 w-9 animate-spin text-primary" /></div>;
  }
  if (roundQuery.isError || !round) {
    return (
      <CenteredCard tone="error" title="Unable to load round">
        {roundQuery.error instanceof Error ? roundQuery.error.message : 'This round is unavailable or you are not registered.'}
      </CenteredCard>
    );
  }
  // IMAGE_TARGET rounds redirect to the build editor (handled by the effect above).
  if (round.roundType !== 'DSA') {
    return (
      <CenteredCard tone="warn" title="Build round">
        This is a build round — opening the build editor…
      </CenteredCard>
    );
  }

  // Lobby: before the admin starts the round, everyone waits here. The socket's
  // contest:status ACTIVE event refetches the round → the arena appears for all at once
  // (synced start). No polling needed for the flip.
  if (round.status === 'DRAFT') {
    return (
      <div className="h-screen flex items-center justify-center bg-warmwhite dark:bg-inknight px-4">
        <div className="max-w-lg w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-8 text-center space-y-4">
          <Trophy className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">{round.title}</h1>
          <p className="text-sm text-muted-foreground">
            {round.problems.length} problem{round.problems.length === 1 ? '' : 's'} · {Math.round(round.duration / 60)} minutes
            {round.penaltyModel === 'ICPC' ? ' · ICPC penalty' : ''}
            {round.proctored ? ' · proctored' : ''}
          </p>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-warmwhite dark:bg-zinc-900/40 p-4 space-y-1">
            <p className="text-lg font-semibold">Waiting for the contest to start…</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              You'll start automatically the moment the admin begins the round.
            </p>
          </div>
          {round.proctored && (
            <p className="text-[11px] text-amber-600">This round is proctored: stay in this window and in fullscreen, and don't paste — leaving locks your session.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-warmwhite dark:bg-inknight">
      {/* Header */}
      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-4 flex items-center justify-between gap-3 bg-warmwhite dark:bg-inknight">
        <div className="min-w-0 flex items-center gap-2">
          <a href={`${MAIN_SITE_URL}/competition/${round.id}/results`} className="size-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500" aria-label="Back to results">
            <ChevronLeft className="h-4 w-4" />
          </a>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-zinc-950 dark:text-zinc-50">{round.title}</p>
            <p className="text-[11px] text-zinc-500 truncate">DSA contest · {round.problems.length} problem{round.problems.length === 1 ? '' : 's'}{round.penaltyModel === 'ICPC' ? ' · ICPC penalty' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-zinc-400">Score</p>
            <p className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />{roundScore}
            </p>
          </div>
          <div className="text-center min-w-[84px]">
            {isActive ? (
              <>
                <p className="text-[10px] uppercase tracking-wide text-zinc-400 inline-flex items-center gap-1"><Clock className="h-3 w-3" />Time left</p>
                <p className={cn('font-mono text-lg font-bold', (remainingSeconds ?? 0) <= 60 ? 'text-red-500 animate-pulse' : (remainingSeconds ?? 0) <= 300 ? 'text-amber-500' : 'text-emerald-600')}>
                  {remainingSeconds === null ? '—' : remainingSeconds <= 0 ? "TIME'S UP" : formatClock(remainingSeconds)}
                </p>
              </>
            ) : (
              <p className="font-mono text-sm font-semibold text-muted-foreground">{round.status}</p>
            )}
          </div>
        </div>
      </div>

      {/* Status banner for non-active rounds — tells the contestant what's happening and
          (when finished) links to the published results, so they're never stuck staring
          at a read-only editor with no guidance. */}
      {!isActive && (round.status === 'LOCKED' || round.status === 'JUDGING' || round.status === 'FINISHED') && (
        <div className={cn(
          'px-3 sm:px-4 py-2 text-sm flex items-center gap-2 border-b',
          round.status === 'FINISHED'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900'
            : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
        )}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {round.status === 'LOCKED' && 'This round is locked — submissions are closed and being prepared for judging.'}
            {round.status === 'JUDGING' && 'Judging is in progress. Final results will appear shortly.'}
            {round.status === 'FINISHED' && 'This round has finished and results are published.'}
          </span>
          {round.status === 'FINISHED' && (
            <a href={`${MAIN_SITE_URL}/competition/${round.id}/results`} target="_blank" rel="noreferrer" className="font-semibold underline shrink-0">
              View full results
            </a>
          )}
        </div>
      )}

      {/* Tab strip */}
      <div className="h-9 border-b border-zinc-200 dark:border-zinc-800 px-2 flex items-center gap-1 bg-warmwhite dark:bg-inknight">
        {([['problems', 'Problems'], ['leaderboard', 'Leaderboard'], ['clarifications', `Clarifications${clarificationCount ? ` (${clarificationCount})` : ''}`]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'h-7 px-3 rounded-md text-[12.5px] font-medium transition-colors',
              tab === id ? 'bg-amber-100 text-amber-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'leaderboard' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {leaderboardQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
          ) : leaderboardQuery.data?.frozen ? (
            <div className="max-w-md mx-auto text-center py-12 text-sm text-muted-foreground">🔒 The leaderboard is frozen for the final minutes of the round.</div>
          ) : (
            <table className="w-full max-w-3xl mx-auto text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-2 pr-3 w-12">#</th>
                  <th className="py-2 pr-3">Participant</th>
                  <th className="py-2 pr-3 text-right">Score</th>
                  {leaderboardQuery.data?.penaltyModel === 'ICPC' && <th className="py-2 pr-3 text-right">Penalty</th>}
                </tr>
              </thead>
              <tbody>
                {(leaderboardQuery.data?.results ?? []).map((row) => (
                  <tr key={row.userId} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <td className="py-2 pr-3 font-mono font-semibold">{row.rank}</td>
                    <td className="py-2 pr-3 truncate">{row.userName}</td>
                    <td className="py-2 pr-3 text-right font-mono font-semibold">{row.totalScore}</td>
                    {leaderboardQuery.data?.penaltyModel === 'ICPC' && <td className="py-2 pr-3 text-right font-mono text-zinc-500">{row.penalty}</td>}
                  </tr>
                ))}
                {(leaderboardQuery.data?.results.length ?? 0) === 0 && (
                  <tr><td colSpan={4} className="py-10 text-center text-zinc-400">No scores yet.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      ) : tab === 'clarifications' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-2">
            {(clarificationsQuery.data?.clarifications ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-warmwhite dark:bg-zinc-900/40 p-3">
                <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{c.message}</p>
                <p className="text-[11px] text-zinc-400 mt-1">{new Date(c.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {clarificationCount === 0 && !clarificationsQuery.isLoading && (
              <p className="text-center text-sm text-zinc-400 py-10">No clarifications yet.</p>
            )}
          </div>
        </div>
      ) : (
      <div className="flex-1 min-h-0 flex">
        {/* Problem navigator */}
        <aside className="w-[230px] shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-warmwhite dark:bg-inknight">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] font-semibold text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">Problems</div>
          {round.problems.map((p, index) => {
            const best = p.submission?.score ?? null;
            const isPicked = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5 transition-colors',
                  isPicked ? 'bg-amber-50 dark:bg-zinc-800/60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40',
                )}
              >
                <span className={cn('size-2 rounded-full shrink-0', verdictDot(p))} />
                <span className="font-mono text-[11px] text-zinc-400 w-4 shrink-0">{index + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{p.title}</span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn('text-[9.5px] uppercase font-semibold px-1 py-px rounded border', difficultyTone(p.difficulty))}>{p.difficulty}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">{Math.round((weightShare.get(p.id) ?? 0) * 100)}%</span>
                  </span>
                </span>
                <span className="font-mono text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">{best ?? '–'}</span>
              </button>
            );
          })}
        </aside>

        {/* Solver */}
        <main className="flex-1 min-w-0 overflow-hidden">
          {!selectedProblem ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Select a problem to begin.</div>
          ) : problemQuery.isLoading ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : problemQuery.isError || !problemQuery.data ? (
            <div className="h-full flex items-center justify-center text-sm text-red-600 px-4 text-center">
              {problemQuery.error instanceof Error ? problemQuery.error.message : 'Could not load this problem.'}
            </div>
          ) : (
            <QOTDSolverShell key={selectedProblem.id} problem={problemQuery.data.problem} context={solverContext} />
          )}
        </main>
      </div>
      )}

      {/* Proctor: fullscreen gate — browsers require a user gesture, so we prompt rather
          than auto-request. Until they enter fullscreen, work is blocked by this overlay. */}
      {needsFullscreen && (
        <div className="fixed inset-0 z-[65] bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-400 bg-card p-6 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <h2 className="text-xl font-semibold">Fullscreen required</h2>
            <p className="text-sm text-muted-foreground">
              This round is proctored. Enter fullscreen to continue — leaving fullscreen, switching tabs, or pasting will lock your session.
            </p>
            <Button onClick={enterFullscreen} className="bg-amber-400 text-amber-950 hover:bg-amber-300">Enter fullscreen &amp; continue</Button>
          </div>
        </div>
      )}

      {/* Proctor: away-countdown warning */}
      {awayMsLeft !== null && !proctorLocked && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] rounded-lg border border-amber-400 bg-amber-50 text-amber-900 px-4 py-2 text-sm font-medium shadow-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Return to the contest — you'll be locked in {Math.ceil(awayMsLeft / 1000)}s
        </div>
      )}
      {/* Proctor: locked overlay */}
      {proctorLocked && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-red-400 bg-card p-6 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold">Session locked</h2>
            <p className="text-sm text-muted-foreground">
              You left the contest window. Your session is locked and run/submit are disabled.
              Your code is saved — contact an invigilator to unlock and resume.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CenteredCard({ tone, title, children }: { tone: 'warn' | 'error'; title: string; children: React.ReactNode }) {
  return (
    <div className="h-screen flex items-center justify-center bg-background px-4">
      <div className={cn('max-w-md w-full rounded-xl border p-6 text-center space-y-3', tone === 'error' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50')}>
        <AlertCircle className={cn('h-8 w-8 mx-auto', tone === 'error' ? 'text-red-500' : 'text-amber-500')} />
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        <p className="text-sm text-zinc-600">{children}</p>
      </div>
    </div>
  );
}
