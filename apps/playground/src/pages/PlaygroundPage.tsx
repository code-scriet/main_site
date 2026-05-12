import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toolbar } from '@/components/playground/Toolbar';
import { CodeEditor } from '@/components/playground/CodeEditor';
import { OutputPanel } from '@/components/playground/OutputPanel';
import { ProblemPanel } from '@/components/playground/ProblemPanel';
import { LanguageSidebar } from '@/components/playground/LanguageSidebar';
import { Navbar } from '@/components/playground/Navbar';
import { ProblemRails } from '@/components/problems/ProblemRails';
import { QOTDSolverShell, buildQOTDLeaderboardHref, type QOTDSolverContext } from '@/components/problems/QOTDSolverShell';
import { PracticeProblemsBrowser } from '@/components/problems/PracticeProblemsBrowser';
import { usePlayground } from '@/context/PlaygroundContext';
import { mainApi, type ProblemDetail } from '@/lib/mainApi';
import { cn } from '@/lib/utils';

type Mode =
  | { kind: 'free' }
  | { kind: 'qotd-loading'; qotd: string }
  | { kind: 'qotd-error'; qotd: string; reason: string }
  | { kind: 'problem-loading'; problemId: string }
  | { kind: 'problem-error'; problemId: string; reason: string }
  | { kind: 'practice-browser' }
  | { kind: 'solver'; problem: ProblemDetail; context: QOTDSolverContext };

function istTodayKey(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export default function PlaygroundPage() {
  const { showProblemPanel } = usePlayground();
  const [searchParams, setSearchParams] = useSearchParams();

  const qotdParam = searchParams.get('qotd');
  const problemParam = searchParams.get('problem');
  const practiceParam = searchParams.get('practice');

  const today = istTodayKey();

  const qotdQuery = useQuery({
    queryKey: ['playground-qotd', qotdParam, today],
    queryFn: async () => {
      if (qotdParam === 'today') {
        const detail = await mainApi.getTodayQOTD();
        return detail;
      }
      if (!qotdParam) return null;
      // Fetch history once and locate the requested day's QOTD.
      const history = await mainApi.getQOTDHistory(60);
      return history.find((entry) => entry.date.slice(0, 10) === qotdParam) ?? null;
    },
    enabled: Boolean(qotdParam),
  });

  const todayKeyForPractice = today;
  const qotdProblemId = qotdQuery.data?.problemId ?? undefined;
  const qotdDateKey = qotdQuery.data?.date ? qotdQuery.data.date.slice(0, 10) : qotdParam;
  const isQotdScored = qotdParam === 'today' || (qotdDateKey === today);

  const qotdProblemQuery = useQuery({
    queryKey: ['playground-qotd-problem', qotdProblemId, isQotdScored, qotdDateKey, todayKeyForPractice],
    queryFn: () => mainApi.getProblem(qotdProblemId!, {
      contextType: isQotdScored ? 'QOTD' : 'PRACTICE',
      contextKey: isQotdScored ? (qotdQuery.data?.id ?? '') : todayKeyForPractice,
    }),
    enabled: Boolean(qotdProblemId),
  });

  const standaloneProblemQuery = useQuery({
    queryKey: ['playground-standalone-problem', problemParam, todayKeyForPractice],
    queryFn: () => mainApi.getProblem(problemParam!, { contextType: 'PRACTICE', contextKey: todayKeyForPractice }),
    enabled: Boolean(problemParam),
  });

  const mode = useMemo<Mode>(() => {
    if (practiceParam === '1' && !qotdParam && !problemParam) {
      return { kind: 'practice-browser' };
    }
    if (qotdParam) {
      if (qotdQuery.isLoading || qotdProblemQuery.isLoading) return { kind: 'qotd-loading', qotd: qotdParam };
      if (qotdQuery.isError) {
        return { kind: 'qotd-error', qotd: qotdParam, reason: qotdQuery.error instanceof Error ? qotdQuery.error.message : 'Could not load QOTD' };
      }
      if (!qotdQuery.data || !qotdQuery.data.id) {
        return { kind: 'qotd-error', qotd: qotdParam, reason: qotdParam === 'today' ? 'No QOTD has been published for today.' : `No QOTD found for ${qotdParam}.` };
      }
      if (!qotdQuery.data.problemId) {
        return { kind: 'qotd-error', qotd: qotdParam, reason: 'This QOTD is a legacy link-only entry and cannot be solved in the playground.' };
      }
      if (qotdProblemQuery.isError) {
        return { kind: 'qotd-error', qotd: qotdParam, reason: qotdProblemQuery.error instanceof Error ? qotdProblemQuery.error.message : 'Could not load the problem.' };
      }
      if (!qotdProblemQuery.data) {
        return { kind: 'qotd-loading', qotd: qotdParam };
      }
      const context: QOTDSolverContext = isQotdScored
        ? {
            type: 'QOTD',
            key: qotdQuery.data.id,
            submitEnabled: true,
            practice: false,
            modeLabel: 'QOTD · Scored',
            deadlineLabel: 'Scored QOTD — closes at end of today (IST).',
            leaderboardHref: buildQOTDLeaderboardHref(),
          }
        : {
            type: 'PRACTICE',
            key: todayKeyForPractice,
            submitEnabled: true,
            practice: true,
            modeLabel: `QOTD · Practice (${qotdDateKey ?? 'past'})`,
            leaderboardHref: buildQOTDLeaderboardHref(),
          };
      return { kind: 'solver', problem: qotdProblemQuery.data.problem, context };
    }
    if (problemParam) {
      if (standaloneProblemQuery.isLoading) return { kind: 'problem-loading', problemId: problemParam };
      if (standaloneProblemQuery.isError) {
        return { kind: 'problem-error', problemId: problemParam, reason: standaloneProblemQuery.error instanceof Error ? standaloneProblemQuery.error.message : 'Could not load the problem.' };
      }
      if (!standaloneProblemQuery.data) {
        return { kind: 'problem-error', problemId: problemParam, reason: 'Problem not found or not available for practice.' };
      }
      const context: QOTDSolverContext = {
        type: 'PRACTICE',
        key: todayKeyForPractice,
        submitEnabled: true,
        practice: true,
        modeLabel: 'Practice',
      };
      return { kind: 'solver', problem: standaloneProblemQuery.data.problem, context };
    }
    return { kind: 'free' };
  }, [
    practiceParam,
    qotdParam,
    problemParam,
    qotdQuery.data,
    qotdQuery.isLoading,
    qotdQuery.isError,
    qotdProblemQuery.data,
    qotdProblemQuery.isLoading,
    qotdProblemQuery.isError,
    standaloneProblemQuery.data,
    standaloneProblemQuery.isLoading,
    standaloneProblemQuery.isError,
    isQotdScored,
    qotdDateKey,
    todayKeyForPractice,
  ]);

  const clearMode = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('qotd');
    next.delete('problem');
    next.delete('practice');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const enterPracticeBrowser = useCallback(() => {
    const next = new URLSearchParams();
    next.set('practice', '1');
    setSearchParams(next, { replace: false });
  }, [setSearchParams]);

  const enterProblem = useCallback(
    (problemId: string) => {
      const next = new URLSearchParams();
      next.set('problem', problemId);
      setSearchParams(next, { replace: false });
    },
    [setSearchParams],
  );

  const inProblemMode =
    mode.kind === 'solver' ||
    mode.kind === 'qotd-loading' ||
    mode.kind === 'problem-loading' ||
    mode.kind === 'qotd-error' ||
    mode.kind === 'problem-error' ||
    mode.kind === 'practice-browser';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Navbar />
      <Toolbar
        problemMode={inProblemMode}
        onExitProblem={clearMode}
        onOpenPractice={enterPracticeBrowser}
      />
      {!inProblemMode && <ProblemRails onOpenPractice={enterPracticeBrowser} />}

      <div className="flex-1 flex overflow-hidden">
        <div className="hidden md:block">
          <LanguageSidebar onOpenPractice={enterPracticeBrowser} />
        </div>

        <div className="flex-1 overflow-hidden">
          {mode.kind === 'qotd-loading' || mode.kind === 'problem-loading' ? (
            <div className="grid h-full place-items-center text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : mode.kind === 'qotd-error' || mode.kind === 'problem-error' ? (
            <div className="grid h-full place-items-center p-6">
              <div className="max-w-md text-center">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-foreground">
                  {mode.kind === 'qotd-error' ? "Couldn't open this QOTD" : "Couldn't open this problem"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{mode.reason}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={clearMode}>
                    Back to playground
                  </Button>
                  <Button variant="default" onClick={enterPracticeBrowser}>
                    Browse practice problems
                  </Button>
                </div>
              </div>
            </div>
          ) : mode.kind === 'practice-browser' ? (
            <PracticeProblemsBrowser
              onSelectProblem={(problem) => enterProblem(problem.id)}
              onClose={clearMode}
            />
          ) : mode.kind === 'solver' ? (
            <QOTDSolverShell problem={mode.problem} context={mode.context} onExit={clearMode} />
          ) : (
            <PanelGroup direction="horizontal" className="h-full">
              {showProblemPanel && (
                <>
                  <Panel defaultSize={25} minSize={20} maxSize={40} className="hidden md:block">
                    <ProblemPanel />
                  </Panel>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-amber-500/50 transition-colors" />
                </>
              )}

              <Panel defaultSize={showProblemPanel ? 45 : 60} minSize={30}>
                <div className="h-full border-r border-border">
                  <CodeEditor />
                </div>
              </Panel>

              <PanelResizeHandle className="w-1 bg-border hover:bg-amber-500/50 transition-colors" />

              <Panel defaultSize={30} minSize={25}>
                <OutputPanel />
              </Panel>
            </PanelGroup>
          )}
        </div>
      </div>

      {showProblemPanel && !inProblemMode && (
        <div className={cn('md:hidden fixed inset-0 z-50 bg-background', 'flex flex-col')}>
          <ProblemPanel />
        </div>
      )}
    </div>
  );
}
