import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toolbar } from '@/components/playground/Toolbar';
import { CodeEditor } from '@/components/playground/CodeEditor';
import { OutputPanel, StdinPanel } from '@/components/playground/OutputPanel';
import { ProblemPanel } from '@/components/playground/ProblemPanel';
import { LanguageSidebar } from '@/components/playground/LanguageSidebar';
import { StatusStrip } from '@/components/playground/StatusStrip';
import { Navbar } from '@/components/playground/Navbar';
import { MobileActionBar } from '@/components/playground/MobileActionBar';
import { MobileKeyBar } from '@/components/playground/MobileKeyBar';
import { QOTDSolverShell, buildQOTDLeaderboardHref, type QOTDSolverContext } from '@/components/problems/QOTDSolverShell';
import { PracticeProblemsBrowser } from '@/components/problems/PracticeProblemsBrowser';
import { usePlayground } from '@/context/PlaygroundContext';
import { useEditorHistory, EditorHistoryProvider, type EditorHistory } from '@/hooks/useEditorHistory';
import { useIsCompact, useIsMobile } from '@/hooks/useMediaQuery';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { usePlaygroundActions } from '@/hooks/usePlaygroundActions';
import { useTheme } from '@/context/ThemeContext';
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

/** Phone layout: one pane at a time. */
type MobilePane = 'code' | 'output' | 'input';

function istTodayKey(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export default function PlaygroundPage() {
  // Shared between the sibling Toolbar (buttons) and CodeEditor (editor instance).
  const editorHistory = useEditorHistory();

  return (
    <EditorHistoryProvider value={editorHistory}>
      <PlaygroundPageInner editorHistory={editorHistory} />
    </EditorHistoryProvider>
  );
}

/**
 * Split from the exported component so the toolbar-action hooks (which read the
 * editor-history context) run *inside* the provider.
 */
function PlaygroundPageInner({ editorHistory }: { editorHistory: EditorHistory }) {
  const { showProblemPanel, language } = usePlayground();
  const { toggleTheme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  // `lg` — matches the breakpoint QOTDSolverShell switches its own layout on.
  const isCompact = useIsCompact();
  const [mobilePane, setMobilePane] = useState<MobilePane>('code');
  // `web` has no stdin — if the user was on the Input pane when switching to it,
  // fall back to the preview instead of showing a dead pane.
  const effectivePane: MobilePane = language.id === 'web' && mobilePane === 'input' ? 'output' : mobilePane;

  const qotdParam = searchParams.get('qotd');
  const problemParam = searchParams.get('problem');
  const practiceParam = searchParams.get('practice');
  // DSA contest solve: ?contest=<roundId>&problem=<problemId>. The problem is loaded
  // and judged in the CONTEST context (contextKey = roundId) so submissions count
  // toward the round's results/leaderboard — without this the playground falls back
  // to PRACTICE and the solve never reaches the contest.
  const contestParam = searchParams.get('contest');
  // Admin "reopen a past QOTD" private link: ?qotd=<date>&reopen=<token>. When set,
  // the past day is solved as a SCORED QOTD (not practice) and the token rides along
  // on run/submit so the server accepts it and streak/marks/leaderboard all update.
  const reopenParam = searchParams.get('reopen');

  const today = istTodayKey();

  const qotdQuery = useQuery({
    queryKey: ['playground-qotd', qotdParam, today],
    queryFn: async () => {
      if (qotdParam === 'today') {
        const detail = await mainApi.getTodayQOTD();
        return detail;
      }
      if (!qotdParam) return null;
      // Resolve the exact requested day directly (robust to age — a reopened past
      // QOTD older than the recent-history window must still load).
      return await mainApi.getQOTDByDate(qotdParam);
    },
    enabled: Boolean(qotdParam),
  });

  const todayKeyForPractice = today;
  const qotdProblemId = qotdQuery.data?.problemId ?? undefined;
  const qotdDateKey = qotdQuery.data?.date ? qotdQuery.data.date.slice(0, 10) : qotdParam;
  // A reopen link targets a past day; treat it as a scored QOTD so it counts.
  const isReopen = Boolean(reopenParam) && Boolean(qotdParam) && qotdParam !== 'today';
  const isQotdScored = qotdParam === 'today' || qotdDateKey === today || isReopen;

  const qotdProblemQuery = useQuery({
    queryKey: ['playground-qotd-problem', qotdProblemId, isQotdScored, qotdDateKey, todayKeyForPractice],
    queryFn: () => mainApi.getProblem(qotdProblemId!, {
      contextType: isQotdScored ? 'QOTD' : 'PRACTICE',
      contextKey: isQotdScored ? (qotdQuery.data?.id ?? '') : todayKeyForPractice,
    }),
    enabled: Boolean(qotdProblemId),
  });

  const standaloneProblemQuery = useQuery({
    queryKey: ['playground-standalone-problem', problemParam, contestParam, todayKeyForPractice],
    queryFn: () => mainApi.getProblem(
      problemParam!,
      contestParam
        ? { contextType: 'CONTEST', contextKey: contestParam }
        : { contextType: 'PRACTICE', contextKey: todayKeyForPractice },
    ),
    enabled: Boolean(problemParam),
  });

  // Resolve the round (status + title) for a contest solve so we can gate submit on
  // ACTIVE and label the solver. Access errors surface via the problem query above.
  const competitionRoundQuery = useQuery({
    queryKey: ['playground-contest-round', contestParam],
    queryFn: () => mainApi.getCompetitionRound(contestParam!),
    enabled: Boolean(contestParam) && Boolean(problemParam),
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
            modeLabel: isReopen ? `QOTD · Reopened (${qotdDateKey ?? 'past'})` : 'QOTD · Scored',
            deadlineLabel: isReopen
              ? 'Reopened by an admin — each solve is sent for admin acceptance before it counts.'
              : 'Scored QOTD — closes at end of today (IST).',
            leaderboardHref: buildQOTDLeaderboardHref(),
            reopenToken: isReopen ? (reopenParam ?? undefined) : undefined,
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
      if (contestParam) {
        // DSA contest solve — submissions are judged in the CONTEST context and count
        // toward this round. Wait for the round status before rendering so submit
        // is only enabled while the round is live (the server is the real gate).
        if (competitionRoundQuery.isLoading) return { kind: 'problem-loading', problemId: problemParam };
        const round = competitionRoundQuery.data;
        const isActive = round?.status === 'ACTIVE';
        // A failed round fetch (transient/network) is not the same as a closed round —
        // submit stays disabled either way, but the label shouldn't claim the round is
        // closed when we simply couldn't read its status.
        const roundUnreadable = competitionRoundQuery.isError || !round;
        const context: QOTDSolverContext = {
          type: 'CONTEST',
          key: contestParam,
          submitEnabled: isActive,
          practice: false,
          modeLabel: round?.title ? `Contest · ${round.title}` : 'Contest',
          deadlineLabel: isActive
            ? 'Live contest round — submissions are judged and ranked.'
            : roundUnreadable
              ? "Couldn't load this round's status — you can run code, but submissions are disabled."
              : 'This contest round is not accepting submissions right now.',
        };
        return { kind: 'solver', problem: standaloneProblemQuery.data.problem, context };
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
    contestParam,
    competitionRoundQuery.data,
    competitionRoundQuery.isLoading,
    competitionRoundQuery.isError,
    qotdQuery.data,
    qotdQuery.isLoading,
    qotdQuery.isError,
    qotdQuery.error,
    qotdProblemQuery.data,
    qotdProblemQuery.isLoading,
    qotdProblemQuery.isError,
    qotdProblemQuery.error,
    standaloneProblemQuery.data,
    standaloneProblemQuery.isLoading,
    standaloneProblemQuery.isError,
    standaloneProblemQuery.error,
    isQotdScored,
    isReopen,
    reopenParam,
    qotdDateKey,
    todayKeyForPractice,
  ]);

  const clearMode = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('qotd');
    next.delete('problem');
    next.delete('practice');
    next.delete('reopen');
    next.delete('contest');
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

  const actions = usePlaygroundActions();

  // Registered once, here, rather than inside the toolbar — the mobile layout
  // does not render the toolbar, and two registrations would double-fire Run.
  // In problem mode the free-playground editor is unmounted, so every action
  // that targets it is withheld (running would execute a stale buffer and burn
  // a daily quota unit; resetting would edit a disposed Monaco model).
  useKeyboardShortcuts({
    onRun: inProblemMode ? undefined : () => { if (!actions.isRunning) void actions.runCode(); },
    onSave: inProblemMode ? undefined : () => { void actions.saveSnippet(); },
    onReset: inProblemMode ? undefined : actions.resetCode,
    onCopy: inProblemMode ? undefined : () => { void actions.copyCode(); },
    onToggleTheme: toggleTheme,
  });

  const freeEditorStack = (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <CodeEditor />
      </div>
      <StatusStrip />
    </div>
  );

  const paneTab = (pane: MobilePane, label: string) => (
    <button
      key={pane}
      type="button"
      role="tab"
      aria-selected={effectivePane === pane}
      onClick={() => setMobilePane(pane)}
      className={cn(
        'h-9 flex-1 rounded-full px-3 text-[12.5px] font-semibold transition',
        effectivePane === pane
          ? 'bg-amber-400 text-amber-950'
          : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-app flex-col overflow-hidden bg-background">
      <Navbar />
      {/* Hidden on a phone: its twelve controls collapse into an unreadable
          overlapping row there, and every one of them is reachable from the
          bottom action bar or the nav sheet. Also hidden in problem mode
          below `lg` — the compact solver renders its own header with Back, so
          this row would just be a duplicate stealing 44px from a landscape
          phone, where vertical space is the scarcest thing on screen. */}
      {!isMobile && !(isCompact && inProblemMode) && (
        <Toolbar
          actions={actions}
          problemMode={inProblemMode}
          onExitProblem={clearMode}
          onOpenPractice={enterPracticeBrowser}
        />
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden md:block">
          <LanguageSidebar onOpenPractice={enterPracticeBrowser} />
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
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
          ) : isMobile ? (
            /* ── Phone: one pane at a time + a thumb-reachable action bar ── */
            <div className="flex h-full min-h-0 flex-col">
              <div
                role="tablist"
                aria-label="Playground panes"
                className="flex shrink-0 items-center gap-1 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
              >
                {paneTab('code', 'Code')}
                {paneTab('output', language.id === 'web' ? 'Preview' : 'Output')}
                {language.id !== 'web' && paneTab('input', 'Input')}
              </div>

              {effectivePane === 'code' ? (
                <>
                  <div className="min-h-0 flex-1">
                    <CodeEditor />
                  </div>
                  <MobileKeyBar
                    onInsert={editorHistory.insertText}
                    onIndent={editorHistory.indent}
                    onOutdent={editorHistory.outdent}
                    onUndo={editorHistory.undo}
                    onRedo={editorHistory.redo}
                    canUndo={editorHistory.canUndo}
                    canRedo={editorHistory.canRedo}
                  />
                </>
              ) : effectivePane === 'output' ? (
                <div className="min-h-0 flex-1">
                  <OutputPanel showStdin={false} />
                </div>
              ) : (
                <div className="min-h-0 flex-1">
                  <StdinPanel alwaysOpen />
                </div>
              )}

              <StatusStrip />
              <MobileActionBar actions={actions} onOpenPractice={enterPracticeBrowser} />
            </div>
          ) : (
            <div className="h-full">
              <PanelGroup direction="horizontal" className="h-full">
                {showProblemPanel && (
                  <>
                    <Panel defaultSize={25} minSize={20} maxSize={40}>
                      <ProblemPanel />
                    </Panel>
                    <PanelResizeHandle className="w-1 bg-zinc-200 hover:bg-amber-500/50 transition-colors dark:bg-zinc-800" />
                  </>
                )}

                <Panel defaultSize={showProblemPanel ? 45 : 60} minSize={30}>
                  <div className="h-full border-r border-zinc-200 dark:border-zinc-800">{freeEditorStack}</div>
                </Panel>

                <PanelResizeHandle className="w-1 bg-zinc-200 hover:bg-amber-500/50 transition-colors dark:bg-zinc-800" />

                <Panel defaultSize={30} minSize={25}>
                  <OutputPanel />
                </Panel>
              </PanelGroup>
            </div>
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
