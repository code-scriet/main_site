import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import {
  CheckCircle2,
  ChevronLeft,
  Clipboard,
  Copy,
  FileCode2,
  Hourglass,
  Info,
  Loader2,
  Lock,
  MailQuestion,
  Maximize2,
  Play,
  Send,
  SlidersHorizontal,
  Timer,
  Trophy,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  mainApi,
  type ProblemContextType,
  type ProblemDetail,
  type ProblemLanguage,
  type ProblemSubmission,
  type TestRunResult,
} from '@/lib/mainApi';
import { getEditorOptions, registerMonacoEmmet } from '@/lib/monacoEditor';
import { cn, getMainSiteOrigin } from '@/lib/utils';
import { MarkdownView } from '@/components/playground/MarkdownView';
import { EditorHistoryControls } from '@/components/playground/EditorHistoryControls';
import { MobileKeyBar } from '@/components/playground/MobileKeyBar';
import { MobileSheet } from '@/components/ui/mobile-sheet';
import { useEditorHistory } from '@/hooks/useEditorHistory';
import { useIsCompact, useTouchEditor } from '@/hooks/useMediaQuery';
import { useTheme } from '@/context/ThemeContext';

type SolverTab = 'overview' | 'question' | 'tests' | 'solution';
type TestPanel = 'public' | 'private';
/** Compact layout only: whether the single visible pane is the editor or the info panel. */
type CompactPane = 'code' | 'panel';

export interface QOTDSolverContext {
  type: ProblemContextType;
  key: string;
  submitEnabled: boolean;
  deadlineLabel?: string;
  practice?: boolean;
  modeLabel: string;
  leaderboardHref?: string;
  // Signed 'qotd_reopen' token — present when solving a past QOTD via a private
  // admin link; sent on run/submit so the past day is accepted and scored.
  reopenToken?: string;
}

export interface QOTDSolverShellProps {
  problem: ProblemDetail;
  context: QOTDSolverContext;
  onExit?: () => void;
}

// Each language ships an `ioHint` (one-line stdin/stdout contract shown above the
// editor) and a `starter` skeleton seeded on a fresh start. These problems are
// competitive-programming style — read from standard input, print to standard
// output — so people coming from LeetCode (who expect to fill in a function) get
// a working entry point and a clear pointer instead of a confusing harness error.
const LANGUAGE_META: Record<ProblemLanguage, { label: string; filename: string; monaco: string; ioHint: string; starter: string }> = {
  PYTHON: {
    label: 'Python',
    filename: 'Main.py',
    monaco: 'python',
    ioHint: 'Read from standard input (input() / sys.stdin) and print the answer with print(). No main() needed.',
    starter: `import sys

def solve():
    data = sys.stdin.buffer.read().split()
    # TODO: parse the input above and print your answer
    # example: n = int(data[0]); print(n)

solve()
`,
  },
  JAVASCRIPT: {
    label: 'JavaScript',
    filename: 'index.js',
    monaco: 'javascript',
    ioHint: 'Read all of standard input (fs.readFileSync(0)) and print the answer with console.log().',
    starter: `const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);
// TODO: parse the input above and print your answer
// example: const n = Number(data[0]); console.log(n);
`,
  },
  CPP: {
    label: 'C++',
    filename: 'main.cpp',
    monaco: 'cpp',
    ioHint: 'Define int main(). Read input with cin / scanf and print the answer with cout / printf.',
    starter: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // TODO: read input with cin and print your answer with cout
    // example: int n; cin >> n; cout << n << "\\n";
    return 0;
}
`,
  },
  JAVA: {
    label: 'Java',
    filename: 'Main.java',
    monaco: 'java',
    ioHint: 'Put your code in public class Main with a public static void main(String[] args). Read with Scanner, print with System.out.',
    starter: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // TODO: read input with sc and print your answer with System.out
        // example: int n = sc.nextInt(); System.out.println(n);
    }
}
`,
  },
};

function draftKey(problemId: string, language: ProblemLanguage) {
  return `problem_draft:v1:${problemId}:${language}`;
}

function activeTimerKey(problemId: string, contextType: string, contextKey: string) {
  return `qotd_active_ms:v1:${contextType}:${contextKey}:${problemId}`;
}

// Safe wrappers: localStorage can throw on quota exceeded, private-mode Safari,
// or when storage is disabled. We never want a write failure to crash the solve UI.
function safeLocalGet(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeLocalSet(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Swallow QuotaExceededError / SecurityError — solve flow must not break.
  }
}

function formatActiveDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Ticks once per second while the tab is visible, accumulating active solve
 * time keyed by (contextType, contextKey, problemId). The value is persisted
 * in localStorage so a reload doesn't reset the clock, and exposed via
 * `getElapsed()` for the submit payload.
 */
function useActiveTimer(problemId: string, contextType: string, contextKey: string) {
  const storageKey = useMemo(
    () => activeTimerKey(problemId, contextType, contextKey),
    [problemId, contextType, contextKey],
  );
  const [elapsed, setElapsed] = useState<number>(() => {
    const raw = safeLocalGet(storageKey);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  // Reset state when the keying tuple changes (different QOTD, same component).
  const loadedKeyRef = useRef(storageKey);
  if (loadedKeyRef.current !== storageKey) {
    loadedKeyRef.current = storageKey;
    const raw = safeLocalGet(storageKey);
    const parsed = raw ? Number(raw) : 0;
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setElapsed(next);
    elapsedRef.current = next;
  }

  useEffect(() => {
    let lastTick = document.visibilityState === 'visible' ? Date.now() : null;
    let writeAccumulator = 0;

    const tick = () => {
      if (document.visibilityState !== 'visible' || lastTick === null) return;
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      // Guard against device sleep / clock skew producing huge jumps.
      if (delta <= 0 || delta > 5_000) return;
      const next = elapsedRef.current + delta;
      elapsedRef.current = next;
      setElapsed(next);
      writeAccumulator += delta;
      if (writeAccumulator >= 5_000) {
        writeAccumulator = 0;
        safeLocalSet(storageKey, String(next));
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastTick = Date.now();
      } else {
        lastTick = null;
        // Persist the latest value the moment we lose visibility so a tab
        // close from a hidden state still preserves accurate solve time.
        safeLocalSet(storageKey, String(elapsedRef.current));
        writeAccumulator = 0;
      }
    };

    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      safeLocalSet(storageKey, String(elapsedRef.current));
    };
  }, [storageKey]);

  const getElapsed = useCallback(() => elapsedRef.current, []);
  return { elapsed, getElapsed };
}

function verdictLabel(verdict?: string | null) {
  if (!verdict) return 'Not attempted';
  return verdict.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function countPassed(tests: Array<{ passed: boolean }>) {
  return tests.filter((test) => test.passed).length;
}

function getVerdicts(submission?: ProblemSubmission | null) {
  const all = submission?.perTestVerdicts ?? [];
  return {
    publicVerdicts: all.filter((test) => !test.isHidden),
    privateVerdicts: all.filter((test) => test.isHidden),
  };
}

function ResultBar({ label, passed, total, hidden, onClick }: { label: string; passed: number; total: number; hidden?: boolean; onClick: () => void }) {
  const ratio = total > 0 ? Math.max(0, Math.min(100, (passed / total) * 100)) : 0;
  const complete = total > 0 && passed === total;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded border border-zinc-200 bg-white p-4 text-left transition hover:border-amber-400/60 hover:bg-amber-400/5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className={`text-sm font-semibold ${complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300'}`}>
          {total > 0 ? `${passed}/${total} Passed` : hidden ? 'No private result' : 'No result'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
        <div className={complete ? 'h-full bg-emerald-500' : 'h-full bg-amber-400'} style={{ width: `${ratio}%` }} />
      </div>
    </button>
  );
}

// Surfaces the judge's compiler / runtime output to the solver. Without this the
// student only saw a "Compilation Error" verdict and no reason — and the friendly
// entry-point hint produced server-side never reached them. Renders nothing when
// there's no output (e.g. a clean Accepted run).
function CompilerOutputPanel({ verdict, output }: { verdict?: string | null; output?: string | null }) {
  if (!output || !output.trim()) return null;
  const isError = verdict === 'COMPILATION_ERROR' || verdict === 'RUNTIME_ERROR' || verdict === 'JUDGE_ERROR' || verdict === 'TIME_LIMIT_EXCEEDED';
  const heading = verdict === 'COMPILATION_ERROR' ? 'Compiler output'
    : verdict === 'RUNTIME_ERROR' ? 'Runtime error'
    : verdict === 'TIME_LIMIT_EXCEEDED' ? 'Time limit exceeded'
    : 'Output';
  return (
    <div className={`overflow-hidden rounded border ${isError ? 'border-red-300 dark:border-red-700/50' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <div className={`border-b px-3 py-2 text-xs font-semibold ${isError ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-500/10 dark:text-red-300' : 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'}`}>
        {heading}
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[12px] leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">{output}</pre>
    </div>
  );
}

function CodeBlock({ title, value }: { title: string; value: string }) {
  const [full, setFull] = useState(false);
  return (
    <div className={full ? 'fixed inset-3 z-50 flex flex-col rounded border border-zinc-200 bg-white p-3 shadow-2xl sm:inset-6 sm:p-4 dark:bg-zinc-900 dark:border-zinc-800' : 'rounded border border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800'}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</span>
        <div className="flex items-center gap-1">
          <button type="button" title="Copy" aria-label={`Copy ${title}`} onClick={() => navigator.clipboard?.writeText(value)} className="grid h-9 w-9 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" title={full ? 'Close fullscreen' : 'Fullscreen'} aria-label={full ? 'Close fullscreen' : 'Fullscreen'} onClick={() => setFull((next) => !next)} className="grid h-9 w-9 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <pre className={full ? 'min-h-0 flex-1 overflow-auto p-4 font-mono text-[12.5px] text-zinc-900 dark:text-zinc-100' : 'max-h-72 overflow-auto p-3 font-mono text-[12.5px] text-zinc-900 dark:text-zinc-100'}>
        {value || ' '}
      </pre>
    </div>
  );
}

const PANEL_TABS: Array<{ id: SolverTab; label: string }> = [
  { id: 'question', label: 'Problem' },
  { id: 'overview', label: 'Result' },
  { id: 'tests', label: 'Tests' },
  { id: 'solution', label: 'Solution' },
];

export function QOTDSolverShell({ problem, context, onExit }: QOTDSolverShellProps) {
  const queryClient = useQueryClient();
  const allowedLanguages = useMemo<ProblemLanguage[]>(
    () => (problem.allowedLanguages?.length ? problem.allowedLanguages : (['PYTHON'] as ProblemLanguage[])),
    [problem.allowedLanguages],
  );
  const [tab, setTab] = useState<SolverTab>('question');
  const [testPanel, setTestPanel] = useState<TestPanel>('public');
  const [language, setLanguage] = useState<ProblemLanguage>(allowedLanguages[0]);
  const [fontSize, setFontSize] = useState(14);
  // Seed synchronously (local draft → else starter) so the Monaco model for the
  // first (problem, language) path is created with the right content and its
  // undo history starts clean. The render-phase seed below handles later switches.
  const [code, setCode] = useState(() => {
    const lang = allowedLanguages[0];
    const saved = safeLocalGet(draftKey(problem.id, lang));
    return saved && saved.length > 0 ? saved : LANGUAGE_META[lang].starter;
  });
  const [lastRun, setLastRun] = useState<TestRunResult | null>(null);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null);
  const [remainingCap, setRemainingCap] = useState<number | null>(null);
  const [submitCap, setSubmitCap] = useState<number>(problem.defaultSubmitCap ?? 5);
  const [remainingDaily, setRemainingDaily] = useState<number | null>(null);
  const [capRequestOpen, setCapRequestOpen] = useState(false);
  const [capRequestNote, setCapRequestNote] = useState('');
  const loadedKeyRef = useRef('');

  // Below `lg` the 45/55 split has no room for both panes, so the shell switches
  // to one visible pane at a time driven by a tab rail + a sticky action bar.
  const compact = useIsCompact();
  const touchEditor = useTouchEditor();
  const [compactPane, setCompactPane] = useState<CompactPane>('panel');
  const [metaOpen, setMetaOpen] = useState(false);
  const [ioHintOpen, setIoHintOpen] = useState(false);

  const { elapsed: activeElapsedMs, getElapsed: getActiveElapsedMs } = useActiveTimer(
    problem.id,
    context.type,
    context.key,
  );

  const submissionQuery = useQuery({
    queryKey: ['qotd-shell-submission', problem.id, context.type, context.key],
    queryFn: () => mainApi.getMySubmission(problem.id, context.type, context.key),
  });

  const latestSubmission = submissionQuery.data?.submission ?? null;
  const counterFromServer = submissionQuery.data?.counter ?? null;
  const pendingRequestOnServer = counterFromServer?.pendingRequest === true;
  const { publicVerdicts, privateVerdicts } = getVerdicts(latestSubmission);
  const sampleTests = problem.sampleTests ?? [];
  const privateTotal = latestSubmission ? privateVerdicts.length : 0;
  const meta = LANGUAGE_META[language];
  const currentDraftKey = useMemo(() => draftKey(problem.id, language), [problem.id, language]);
  const editorHistory = useEditorHistory();
  // `editorHistory` gets a fresh identity whenever canUndo/canRedo flip (i.e. on
  // edits), but `reset` itself is a stable callback — depend on it directly so
  // `handleReset` (and the keydown effect below) don't churn on every keystroke.
  const { reset: resetEditor } = editorHistory;

  // The starter for the *currently selected language* of *this question* — the
  // same skeleton the editor was seeded with, not a generic playground template.
  const starterCode = meta.starter;
  const atStarter = code === starterCode;

  const handleReset = useCallback(() => {
    if (atStarter) return;
    if (!window.confirm('Reset to the starter code for this question? Your editor draft will be replaced — you can undo with Ctrl/Cmd+Z. Any submitted solution is untouched.')) {
      return;
    }
    // Undoable replacement via Monaco's edit stack (never setValue). The change
    // flows through onChange → setCode → the draft auto-save, so the persisted
    // draft stays in sync.
    resetEditor(starterCode);
    toast.success('Reset to starter code');
  }, [atStarter, resetEditor, starterCode]);

  // Ctrl/Cmd+Shift+R → reset (matches the main Playground shortcut). Undo/redo
  // (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) are handled natively by Monaco.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleReset]);

  useEffect(() => {
    if (!allowedLanguages.includes(language)) {
      setLanguage(allowedLanguages[0]);
    }
  }, [allowedLanguages, language]);

  // Seed in a layout effect (never during render — setState-in-render is
  // unsupported and breaks under StrictMode/concurrent rendering) when the
  // (problem, language) context changes. A layout effect runs *before* the
  // Monaco wrapper's passive model-creation effect, so the model for the new
  // `path` is still born with the correct content — keeping each context's undo
  // history clean and preventing it from bleeding across questions/languages.
  useLayoutEffect(() => {
    if (loadedKeyRef.current === currentDraftKey) return;
    // A non-empty local draft is unsaved in-progress work → it wins. (An empty
    // value is ignored: the 500ms auto-save can persist "" during the loading
    // window, and treating that as a draft would mask the server submission.)
    const saved = safeLocalGet(currentDraftKey);
    if (saved && saved.length > 0) {
      loadedKeyRef.current = currentDraftKey;
      setCode(saved);
      return;
    }
    // No local draft (e.g. a different device — phone vs laptop): wait for the
    // server submission to load, then seed with the code that was actually
    // submitted so it's visible on any device. With no prior submission either,
    // seed the language's starter template so the solver starts from a working
    // stdin/stdout entry point.
    if (submissionQuery.isLoading) return;
    const submittedCode = latestSubmission?.language === language ? latestSubmission.code : '';
    loadedKeyRef.current = currentDraftKey;
    setCode(submittedCode || LANGUAGE_META[language].starter);
  }, [currentDraftKey, language, latestSubmission, submissionQuery.isLoading]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      // Don't persist an untouched starter as a "draft": a non-empty starter in
      // localStorage would later be treated as in-progress work and mask the
      // user's server submission on another device. Only real edits are saved.
      if (code === LANGUAGE_META[language].starter) return;
      safeLocalSet(currentDraftKey, code.slice(0, 100_000));
    }, 500);
    return () => window.clearTimeout(handle);
  }, [code, currentDraftKey, language]);

  const runMutation = useMutation({
    mutationFn: () => mainApi.runProblem(problem.id, {
      language,
      code,
      contextType: context.type,
      contextKey: context.key,
      reopenToken: context.reopenToken,
    }),
    onSuccess: (result) => {
      setLastRun(result);
      setRemainingDaily(result.remainingDailyQuota);
      setTab('tests');
      setTestPanel('public');
      // Compact layout: surface the results pane instead of leaving the user on
      // the editor wondering whether anything happened.
      setCompactPane('panel');
      const passed = countPassed(result.perTestVerdicts);
      toast.success(`${passed}/${result.perTestVerdicts.length} public tests passed`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Test run failed'),
  });

  const submitMutation = useMutation({
    mutationFn: () => mainApi.submitProblem(problem.id, {
      language,
      code,
      contextType: context.type,
      contextKey: context.key,
      activeMs: getActiveElapsedMs(),
      reopenToken: context.reopenToken,
    }),
    onSuccess: async (result) => {
      if (result.pendingAcceptance) {
        // Reopened past QOTD: judged ACCEPTED but held for admin acceptance. Nothing
        // counts (streak/marks/leaderboard) until an admin approves it.
        toast.success('Solved! Sent to an admin for acceptance — your streak and marks update once it\'s approved.');
      } else if (result.needsReview) {
        // Judging itself was down (upstream outage). The code was saved and the
        // attempt refunded; the student can ask for a manual review.
        toast.warning('Judging is temporarily unavailable. Your submission was saved — you can request a manual review.');
      } else {
        toast.success(`Submitted. Verdict: ${verdictLabel(result.verdict)}`);
      }
      setLastRun(null); // drop any prior test-run state so results reflect this submission
      setRemainingCap(result.remainingSubmits);
      setRemainingDaily(result.remainingDailyQuota);
      await queryClient.invalidateQueries({ queryKey: ['qotd-shell-submission', problem.id, context.type, context.key] });
      setTab('overview');
      setCompactPane('panel');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Submit failed'),
  });

  const appealMutation = useMutation({
    mutationFn: () =>
      mainApi.appealSubmission(problem.id, {
        contextType: context.type,
        contextKey: context.key,
        note: 'Judging was unavailable when I submitted.',
      }),
    onSuccess: async () => {
      toast.success('Appeal sent — an admin will review your submission.');
      await queryClient.invalidateQueries({ queryKey: ['qotd-shell-submission', problem.id, context.type, context.key] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to send appeal'),
  });

  const requestCapMutation = useMutation({
    mutationFn: () =>
      mainApi.requestSubmitCap(problem.id, {
        contextType: context.type,
        contextKey: context.key,
        note: capRequestNote.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success('Request sent — admin will review it shortly.');
      setCapRequestOpen(false);
      setCapRequestNote('');
      await queryClient.invalidateQueries({ queryKey: ['qotd-shell-submission', problem.id, context.type, context.key] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to request more submits'),
  });

  // Use server-supplied counter as the source of truth so the chip is correct
  // on first load (e.g., after the user already submitted N times today).
  useEffect(() => {
    if (counterFromServer) {
      setSubmitCap(counterFromServer.cap);
      setRemainingCap(counterFromServer.remaining);
    }
  }, [counterFromServer?.cap, counterFromServer?.remaining]);

  const publicRunById = new Map((lastRun?.perTestVerdicts ?? []).map((test) => [test.testId, test]));
  const publicSubmissionById = new Map(publicVerdicts.map((test) => [test.testId, test]));
  const selectedPublic = sampleTests.find((test) => test.id === selectedPublicId) ?? sampleTests[0];
  const publicPassed = latestSubmission ? countPassed(publicVerdicts) : countPassed(lastRun?.perTestVerdicts ?? []);
  const publicTotal = latestSubmission ? publicVerdicts.length : (lastRun?.perTestVerdicts.length ?? sampleTests.length);
  const privatePassed = countPassed(privateVerdicts);
  const capExhausted = remainingCap !== null && remainingCap <= 0;
  const runPending = runMutation.isPending;
  const submitPending = submitMutation.isPending;
  const submitDisabled = !context.submitEnabled || submitPending || runPending || capExhausted;

  const { editorTheme } = useTheme();

  const openPanelTab = useCallback((next: SolverTab) => {
    setTab(next);
    setCompactPane('panel');
  }, []);

  const handleLanguageChange = useCallback(
    (next: ProblemLanguage) => {
      // Persist the outgoing draft, but not an untouched starter (see the
      // auto-save effect) so it can't mask a server submission.
      if (code !== LANGUAGE_META[language].starter) safeLocalSet(draftKey(problem.id, language), code.slice(0, 100_000));
      loadedKeyRef.current = '';
      setLanguage(next);
    },
    [code, language, problem.id],
  );

  // ── Shared fragments (rendered by exactly one layout branch at a time) ──────

  const metaChips = (
    <>
      <span
        title="Active solve time — counts only while this tab is focused"
        className="inline-flex items-center gap-1.5 rounded border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
      >
        <Timer className="h-3.5 w-3.5" />
        {formatActiveDuration(activeElapsedMs)}
      </span>
      {remainingCap !== null && (
        <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-semibold ${
          capExhausted
            ? 'border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300'
            : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
        }`}>
          <Hourglass className="h-3.5 w-3.5" />
          Submits: {Math.max(0, submitCap - remainingCap)}/{submitCap}
        </span>
      )}
      {remainingDaily !== null && (
        <span className="inline-flex items-center gap-1.5 rounded border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          Daily quota left: {remainingDaily}
        </span>
      )}
      {capExhausted && (
        pendingRequestOnServer ? (
          <span className="inline-flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <MailQuestion className="h-3.5 w-3.5" />
            Request pending review
          </span>
        ) : (
          <button
            type="button"
            disabled={requestCapMutation.isPending}
            onClick={() => {
              setCapRequestOpen((open) => !open);
              setMetaOpen(false);
            }}
            className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded bg-amber-400 px-3 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-50"
          >
            <MailQuestion className="h-3.5 w-3.5" />
            Request more submits
          </button>
        )
      )}
      {context.leaderboardHref && (
        <a
          href={context.leaderboardHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[2.25rem] items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
        >
          <Trophy className="h-3.5 w-3.5" />
          Leaderboard
        </a>
      )}
    </>
  );

  /** The tab body. A plain function (not a component) so the element tree keeps
   *  its identity across renders and nothing inside remounts. */
  const renderPanelBody = () => (
    <>
      {tab === 'overview' && (
        <div className="space-y-5">
          {context.deadlineLabel && (
            <div className={`rounded border px-4 py-3 text-sm font-medium ${context.submitEnabled ? 'border-amber-400/30 bg-amber-400/10 text-amber-800 dark:text-amber-200' : 'border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
              {context.deadlineLabel}
            </div>
          )}
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-[9px] border-amber-400 bg-white sm:h-28 sm:w-28 sm:border-[10px] dark:bg-zinc-900">
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{latestSubmission ? latestSubmission.score : '-'}</div>
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">/ 100</div>
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-zinc-900 sm:text-xl dark:text-zinc-100">{problem.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{verdictLabel(latestSubmission?.verdict)}</p>
              {latestSubmission?.submittedAt && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Submitted on {new Date(latestSubmission.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
              )}
            </div>
          </div>
          <CompilerOutputPanel verdict={latestSubmission?.verdict} output={latestSubmission?.compilerOutput} />
          {latestSubmission?.reopenPending && (
            <div className="rounded border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">Solved via a reopen link — sent to an admin for acceptance.</p>
              <p className="mt-1 text-amber-700/90 dark:text-amber-300/80">
                Your code passed ({latestSubmission.passedCount}/{latestSubmission.totalCount}). It only counts toward your streak, marks &amp; leaderboard once an admin accepts it.
              </p>
            </div>
          )}
          {/* "Judging unavailable" is distinct from the reopen hold above — never show both. */}
          {!latestSubmission?.reopenPending && (latestSubmission?.needsReview || latestSubmission?.verdict === 'JUDGE_ERROR') && (
            <div className="rounded border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-800 dark:text-sky-200">
              {latestSubmission?.appealedAt ? (
                <p className="font-medium">Appeal submitted — an admin will review your submission and set the verdict manually.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="font-medium">Judging was temporarily unavailable, so this submission couldn’t be graded automatically. Your code is saved and your attempt was not used.</p>
                  <button
                    type="button"
                    onClick={() => appealMutation.mutate()}
                    disabled={appealMutation.isPending}
                    className="min-h-[2.5rem] self-start rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                  >
                    {appealMutation.isPending ? 'Sending…' : 'Request manual review'}
                  </button>
                </div>
              )}
            </div>
          )}
          <ResultBar label="Public Tests" passed={publicPassed} total={publicTotal} onClick={() => { setTab('tests'); setTestPanel('public'); }} />
          <ResultBar label="Private Tests" passed={privatePassed} total={privateTotal} hidden onClick={() => { setTab('tests'); setTestPanel('private'); }} />
        </div>
      )}

      {tab === 'question' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{problem.difficulty}</span>
            {problem.tags?.map((tag) => (
              <span key={tag} className="rounded border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">{tag}</span>
            ))}
          </div>
          <MarkdownView source={problem.body} />
        </div>
      )}

      {tab === 'tests' && (
        <div className="space-y-4">
          <div className="flex rounded border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
            <button type="button" onClick={() => setTestPanel('public')} className={`flex-1 rounded px-2 py-2 text-[13px] font-semibold transition sm:px-3 sm:text-sm ${testPanel === 'public' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
              Public ({publicPassed}/{publicTotal})
            </button>
            <button type="button" onClick={() => setTestPanel('private')} className={`flex-1 rounded px-2 py-2 text-[13px] font-semibold transition sm:px-3 sm:text-sm ${testPanel === 'private' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
              Private ({privatePassed}/{privateTotal})
            </button>
          </div>

          {testPanel === 'public' && (
            <div className="space-y-4">
              <CompilerOutputPanel
                verdict={lastRun ? (lastRun.compilerOutput ? 'COMPILATION_ERROR' : null) : latestSubmission?.verdict}
                output={lastRun ? lastRun.compilerOutput : latestSubmission?.compilerOutput}
              />
              <div className="flex flex-wrap gap-2">
                {sampleTests.map((test, index) => {
                  const verdict = publicRunById.get(test.id) ?? publicSubmissionById.get(test.id);
                  const selected = selectedPublic?.id === test.id;
                  return (
                    <button
                      key={test.id}
                      type="button"
                      onClick={() => setSelectedPublicId(test.id)}
                      className={`inline-flex min-h-[2.25rem] items-center gap-1 rounded border px-3 py-1 text-xs font-semibold transition ${verdict?.passed ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-300' : verdict ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700/50 dark:bg-red-500/10 dark:text-red-300' : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'} ${selected ? 'ring-2 ring-amber-400/50' : ''}`}
                    >
                      {verdict?.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : verdict ? <XCircle className="h-3.5 w-3.5" /> : null}
                      Case {index + 1}
                    </button>
                  );
                })}
              </div>
              {selectedPublic ? (
                <div className="space-y-3">
                  <CodeBlock title="Input" value={selectedPublic.input} />
                  <CodeBlock title="Expected Output" value={selectedPublic.expectedOutput} />
                  <CodeBlock title="Actual Output" value={(publicRunById.get(selectedPublic.id)?.actualOutput ?? publicSubmissionById.get(selectedPublic.id)?.actualOutput ?? '') as string} />
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No public cases are configured.</p>
              )}
            </div>
          )}

          {testPanel === 'private' && (
            <div className="space-y-3">
              {privateVerdicts.length ? privateVerdicts.map((test, index) => (
                <div key={test.testId} className="flex items-center justify-between rounded border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Private Case {index + 1}</span>
                  <span className={`inline-flex items-center gap-1 rounded border px-2.5 py-0.5 text-xs font-semibold ${test.passed ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-700/50 dark:bg-red-500/10 dark:text-red-300'}`}>
                    {test.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {test.passed ? 'Passed' : 'Failed'}
                  </span>
                </div>
              )) : (
                <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  Private verdicts appear after a submission.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'solution' && (
        problem.referenceSolution ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              <FileCode2 className="h-4 w-4" />
              {problem.referenceLanguage ? LANGUAGE_META[problem.referenceLanguage].label : 'Reference Solution'}
            </div>
            <CodeBlock title="Solution" value={problem.referenceSolution} />
          </div>
        ) : (
          <div className="grid min-h-[260px] place-items-center rounded border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center sm:min-h-[360px] sm:px-8 dark:border-zinc-700 dark:bg-zinc-900">
            <div>
              <Lock className="mx-auto h-10 w-10 text-zinc-400" />
              <p className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">Solution unlocks once you solve it — or, after the deadline has passed, once you have submitted at least twice.</p>
            </div>
          </div>
        )
      )}
    </>
  );

  const monacoEditor = (
    <Editor
      height="100%"
      // Per (problem, language) path → an isolated Monaco model + undo
      // stack for each question and language, so history never leaks.
      path={`problems/${problem.id}/${meta.filename}`}
      language={meta.monaco}
      theme={editorTheme}
      value={code}
      beforeMount={registerMonacoEmmet}
      onMount={editorHistory.handleMount}
      options={getEditorOptions({ touch: touchEditor, fontSize })}
      onChange={(value) => setCode(value ?? '')}
      loading={
        <div className="grid h-full place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
        </div>
      }
    />
  );

  const capRequestBanner = capRequestOpen && !pendingRequestOnServer && (
    <div className="shrink-0 border-b border-amber-400/40 bg-amber-400/10 px-3 py-3 sm:px-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            Request more attempts
          </label>
          <textarea
            value={capRequestNote}
            onChange={(event) => setCapRequestNote(event.target.value)}
            maxLength={300}
            className="mt-1 min-h-[68px] w-full rounded border border-amber-400/40 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-amber-400/40 dark:border-amber-400/30 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="Optional note for the admin"
          />
        </div>
        <button
          type="button"
          disabled={requestCapMutation.isPending}
          onClick={() => requestCapMutation.mutate()}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded bg-amber-400 px-4 text-sm font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-50 sm:h-9"
        >
          <Send className="h-4 w-4" />
          Send request
        </button>
      </div>
    </div>
  );

  // ── Compact (phone / small tablet) layout ──────────────────────────────────
  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-warmwhite text-zinc-900 dark:bg-inknight dark:text-zinc-100">
        {/* Header: one row, everything else lives behind the meta sheet. */}
        <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-zinc-200 px-1.5 dark:border-zinc-800">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              aria-label="Exit problem"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[13.5px] font-semibold leading-tight text-zinc-900 dark:text-zinc-100">{problem.title}</p>
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              {context.modeLabel} · {problem.difficulty}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 rounded border border-zinc-200 px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-600 sm:inline-flex dark:border-zinc-800 dark:text-zinc-300">
            <Timer className="h-3 w-3" />
            {formatActiveDuration(activeElapsedMs)}
          </span>
          <button
            type="button"
            onClick={() => setMetaOpen(true)}
            aria-label="Session details"
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800',
              capExhausted ? 'text-red-500' : 'text-zinc-500',
            )}
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>

        {context.practice && (
          <div className="shrink-0 border-b border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[12px] font-medium text-amber-800 dark:text-amber-200">
            Practice mode — submissions do not count toward leaderboards.
          </div>
        )}

        {capRequestBanner}

        {/* Pane rail: Code sits first so the primary action is one tap away. */}
        <div
          role="tablist"
          aria-label="Solver panes"
          className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200 px-1.5 py-1.5 no-scrollbar dark:border-zinc-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={compactPane === 'code'}
            onClick={() => setCompactPane('code')}
            className={cn(
              'h-9 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold transition',
              compactPane === 'code'
                ? 'bg-amber-400 text-amber-950'
                : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
            )}
          >
            Code
          </button>
          {PANEL_TABS.map((item) => {
            const active = compactPane === 'panel' && tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => openPanelTab(item.id)}
                className={cn(
                  'h-9 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold transition',
                  active
                    ? 'bg-amber-400 text-amber-950'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
                )}
              >
                {item.label}
                {item.id === 'tests' && (publicTotal > 0 || privateTotal > 0) && (
                  <span className="ml-1 font-mono text-[10.5px] opacity-80">{publicPassed}/{publicTotal}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Single visible pane */}
        {compactPane === 'code' ? (
          <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
              <select
                value={language}
                onChange={(event) => handleLanguageChange(event.target.value as ProblemLanguage)}
                aria-label="Language"
                className="h-9 min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-amber-400/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {allowedLanguages.map((item) => (
                  <option key={item} value={item}>{LANGUAGE_META[item].label}</option>
                ))}
              </select>
              <button type="button" aria-label="Decrease font size" onClick={() => setFontSize((value) => Math.max(12, value - 1))} className="grid h-9 w-9 shrink-0 place-items-center rounded border border-zinc-200 bg-white text-base font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">−</button>
              <button type="button" aria-label="Increase font size" onClick={() => setFontSize((value) => Math.min(24, value + 1))} className="grid h-9 w-9 shrink-0 place-items-center rounded border border-zinc-200 bg-white text-base font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">+</button>
              <button type="button" aria-label="Copy code" onClick={() => navigator.clipboard?.writeText(code)} className="grid h-9 w-9 shrink-0 place-items-center rounded border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"><Copy className="h-4 w-4" /></button>
              <button
                type="button"
                aria-label="Reset to starter code"
                disabled={atStarter}
                onClick={handleReset}
                className="h-9 shrink-0 rounded border border-zinc-200 bg-white px-2.5 text-[12px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Reset
              </button>
            </div>

            {/* I/O contract — collapsed by default on a phone so it doesn't eat
                a third of the editor, but one tap away and never hidden. */}
            <button
              type="button"
              onClick={() => setIoHintOpen((open) => !open)}
              aria-expanded={ioHintOpen}
              className="flex shrink-0 items-start gap-2 border-b border-zinc-200 bg-amber-50/70 px-3 py-2 text-left text-[12px] leading-snug text-zinc-600 dark:border-zinc-800 dark:bg-amber-400/10 dark:text-zinc-300"
            >
              <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className={ioHintOpen ? '' : 'truncate'}>
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">{meta.label} input/output:</span>{' '}
                {meta.ioHint}
              </span>
            </button>

            <div className="min-h-0 flex-1">{monacoEditor}</div>

            <MobileKeyBar
              onInsert={editorHistory.insertText}
              onIndent={editorHistory.indent}
              onOutdent={editorHistory.outdent}
              onUndo={editorHistory.undo}
              onRedo={editorHistory.redo}
              canUndo={editorHistory.canUndo}
              canRedo={editorHistory.canRedo}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{renderPanelBody()}</div>
        )}

        {/* Sticky action bar — Test Run + Submit are always one tap away, from
            any pane, and clear the iPhone home indicator via pb-safe. */}
        <div className="shrink-0 border-t border-zinc-200 bg-warmwhite px-3 pb-safe pt-2 dark:border-zinc-800 dark:bg-inknight">
          <div className="flex items-center gap-2 pb-2">
            <button
              type="button"
              disabled={runPending || submitPending}
              onClick={() => runMutation.mutate()}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white text-[15px] font-semibold text-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {runPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              {runPending ? 'Running…' : 'Test Run'}
            </button>
            <button
              type="button"
              disabled={submitDisabled}
              onClick={() => submitMutation.mutate()}
              title={capExhausted ? 'Submit cap reached — request more from the session menu' : undefined}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-400 text-[15px] font-semibold text-amber-950 shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            >
              {submitPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              {submitPending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>

        <MobileSheet open={metaOpen} onClose={() => setMetaOpen(false)} title="This solve session">
          <div className="space-y-4 p-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                {context.modeLabel}
              </span>
            </div>
            {context.deadlineLabel && (
              <p className={cn(
                'rounded border px-3 py-2 text-sm font-medium',
                context.submitEnabled
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-800 dark:text-amber-200'
                  : 'border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300',
              )}>
                {context.deadlineLabel}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">{metaChips}</div>
            {onExit && (
              <button
                type="button"
                onClick={() => { setMetaOpen(false); onExit(); }}
                className="h-11 w-full rounded border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Exit problem
              </button>
            )}
          </div>
        </MobileSheet>
      </div>
    );
  }

  // ── Desktop layout (lg and up) ─────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden bg-warmwhite text-zinc-900 dark:bg-inknight dark:text-zinc-100">
      {/* Top mode bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-warmwhite px-4 py-2 text-sm dark:border-zinc-800 dark:bg-inknight">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {context.modeLabel}
          </span>
          <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">{problem.title}</h2>
          <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {problem.difficulty}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {metaChips}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="rounded border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Exit problem
            </button>
          )}
        </div>
      </div>

      {context.practice && (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-800 dark:text-amber-200">
          Practice mode — submissions do not count toward leaderboards.
        </div>
      )}

      {capRequestBanner}

      <div className="grid min-h-0 flex-1 grid-cols-[45%_55%]">
        <section className="flex min-h-0 flex-col overflow-hidden border-r border-zinc-200 bg-warmwhite dark:bg-inknight dark:border-zinc-800">
          <div className="flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
            {(['question', 'overview', 'tests', 'solution'] as SolverTab[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`relative flex-1 px-3 py-3 text-sm font-semibold capitalize transition ${tab === item ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:text-zinc-400'}`}
              >
                {item === 'question' ? 'Problem' : item === 'overview' ? 'Submissions' : item === 'tests' ? 'Tests' : 'Solution'}
                {tab === item && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-amber-400" />}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">{renderPanelBody()}</div>
        </section>

        <section className="flex min-h-0 flex-col bg-zinc-50 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={(event) => handleLanguageChange(event.target.value as ProblemLanguage)}
                className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-amber-400/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {allowedLanguages.map((item) => (
                  <option key={item} value={item}>{LANGUAGE_META[item].label}</option>
                ))}
              </select>
              <span className="rounded border border-zinc-200 bg-white px-3 py-1 font-mono text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">{meta.filename}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" title="Decrease font size" onClick={() => setFontSize((value) => Math.max(12, value - 1))} className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">-</button>
              <button type="button" title="Increase font size" onClick={() => setFontSize((value) => Math.min(24, value + 1))} className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">+</button>
              <button type="button" title="Copy code" onClick={() => navigator.clipboard?.writeText(code)} className="rounded border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"><Copy className="h-4 w-4" /></button>
              <button type="button" title="Paste code" onClick={async () => setCode(await navigator.clipboard.readText())} className="rounded border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"><Clipboard className="h-4 w-4" /></button>
              <EditorHistoryControls
                variant="bordered"
                canUndo={editorHistory.canUndo}
                canRedo={editorHistory.canRedo}
                canReset={!atStarter}
                onUndo={editorHistory.undo}
                onRedo={editorHistory.redo}
                onReset={handleReset}
              />
              <button
                type="button"
                disabled={runPending || submitPending}
                onClick={() => runMutation.mutate()}
                className="inline-flex items-center gap-2 rounded border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {runPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Test Run
              </button>
              <button
                type="button"
                disabled={submitDisabled}
                onClick={() => submitMutation.mutate()}
                className="inline-flex items-center gap-2 rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-amber-950 shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)] hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                title={capExhausted ? 'Submit cap reached — request more from the top bar' : undefined}
              >
                {submitPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </button>
            </div>
          </div>
          {/* Always-visible I/O contract for the selected language. These problems
              are stdin/stdout style; this keeps LeetCode-style "just fill in a
              function" submissions from failing with a confusing harness error. */}
          <div className="flex items-start gap-2 border-b border-zinc-200 bg-amber-50/70 px-4 py-2 text-[12px] leading-snug text-zinc-600 dark:border-zinc-800 dark:bg-amber-400/10 dark:text-zinc-300">
            <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{meta.label} input/output:</span>{' '}
              {meta.ioHint}
            </span>
          </div>
          <div className="min-h-0 flex-1">{monacoEditor}</div>
        </section>
      </div>
    </div>
  );
}

export function buildQOTDLeaderboardHref(): string {
  return `${getMainSiteOrigin()}/qotd/leaderboard`;
}

export default QOTDSolverShell;
