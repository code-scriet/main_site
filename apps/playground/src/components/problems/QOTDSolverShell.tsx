import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import {
  CheckCircle2,
  Clipboard,
  Copy,
  FileCode2,
  Hourglass,
  Lock,
  MailQuestion,
  Maximize2,
  Play,
  Send,
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
import { BASE_MONACO_EDITOR_OPTIONS, registerMonacoEmmet } from '@/lib/monacoEditor';
import { getMainSiteOrigin } from '@/lib/utils';

type SolverTab = 'overview' | 'question' | 'tests' | 'solution';
type TestPanel = 'public' | 'private';

export interface QOTDSolverContext {
  type: ProblemContextType;
  key: string;
  submitEnabled: boolean;
  deadlineLabel?: string;
  practice?: boolean;
  modeLabel: string;
  leaderboardHref?: string;
}

export interface QOTDSolverShellProps {
  problem: ProblemDetail;
  context: QOTDSolverContext;
  onExit?: () => void;
}

const LANGUAGE_META: Record<ProblemLanguage, { label: string; filename: string; monaco: string }> = {
  PYTHON: { label: 'Python', filename: 'Main.py', monaco: 'python' },
  JAVASCRIPT: { label: 'JavaScript', filename: 'index.js', monaco: 'javascript' },
  CPP: { label: 'C++', filename: 'main.cpp', monaco: 'cpp' },
  JAVA: { label: 'Java', filename: 'Main.java', monaco: 'java' },
};

function draftKey(problemId: string, language: ProblemLanguage) {
  return `problem_draft:v1:${problemId}:${language}`;
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
      className="w-full rounded-md border border-gray-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</span>
        <span className={`text-sm font-semibold ${complete ? 'text-emerald-600' : 'text-gray-600 dark:text-gray-300'}`}>
          {total > 0 ? `${passed}/${total} Passed` : hidden ? 'No private result' : 'No result'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={complete ? 'h-full bg-emerald-500' : 'h-full bg-blue-500'} style={{ width: `${ratio}%` }} />
      </div>
    </button>
  );
}

function CodeBlock({ title, value }: { title: string; value: string }) {
  const [full, setFull] = useState(false);
  return (
    <div className={full ? 'fixed inset-6 z-50 flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-2xl dark:bg-gray-900 dark:border-gray-700' : 'rounded-md border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700'}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</span>
        <div className="flex items-center gap-1">
          <button type="button" title="Copy" onClick={() => navigator.clipboard.writeText(value)} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" title={full ? 'Close fullscreen' : 'Fullscreen'} onClick={() => setFull((next) => !next)} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <pre className={full ? 'min-h-0 flex-1 overflow-auto p-4 text-sm text-gray-900 dark:text-gray-100' : 'max-h-72 overflow-auto p-3 text-sm text-gray-900 dark:text-gray-100'}>
        {value || ' '}
      </pre>
    </div>
  );
}

export function QOTDSolverShell({ problem, context, onExit }: QOTDSolverShellProps) {
  const queryClient = useQueryClient();
  const allowedLanguages = useMemo<ProblemLanguage[]>(
    () => (problem.allowedLanguages?.length ? problem.allowedLanguages : (['PYTHON'] as ProblemLanguage[])),
    [problem.allowedLanguages],
  );
  const [tab, setTab] = useState<SolverTab>('overview');
  const [testPanel, setTestPanel] = useState<TestPanel>('public');
  const [language, setLanguage] = useState<ProblemLanguage>(allowedLanguages[0]);
  const [fontSize, setFontSize] = useState(14);
  const [code, setCode] = useState('');
  const [lastRun, setLastRun] = useState<TestRunResult | null>(null);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null);
  const [remainingCap, setRemainingCap] = useState<number | null>(null);
  const [submitCap, setSubmitCap] = useState<number>(problem.defaultSubmitCap ?? 5);
  const [remainingDaily, setRemainingDaily] = useState<number | null>(null);
  const loadedKeyRef = useRef('');

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

  useEffect(() => {
    if (!allowedLanguages.includes(language)) {
      setLanguage(allowedLanguages[0]);
    }
  }, [allowedLanguages, language]);

  useEffect(() => {
    if (loadedKeyRef.current === currentDraftKey) return;
    const saved = localStorage.getItem(currentDraftKey);
    const submittedCode = latestSubmission?.language === language ? latestSubmission.code : '';
    setCode(saved ?? submittedCode ?? '');
    loadedKeyRef.current = currentDraftKey;
  }, [currentDraftKey, language, latestSubmission]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      localStorage.setItem(currentDraftKey, code.slice(0, 100_000));
    }, 500);
    return () => window.clearTimeout(handle);
  }, [code, currentDraftKey]);

  const runMutation = useMutation({
    mutationFn: () => mainApi.runProblem(problem.id, {
      language,
      code,
      contextType: context.type,
      contextKey: context.key,
    }),
    onSuccess: (result) => {
      setLastRun(result);
      setRemainingDaily(result.remainingDailyQuota);
      setTab('tests');
      setTestPanel('public');
      const passed = countPassed(result.perTestVerdicts);
      toast.success(`${passed}/${result.perTestVerdicts.length} public tests passed`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Test run failed'),
  });

  const submitMutation = useMutation({
    mutationFn: () => mainApi.submitProblem(problem.id, { language, code, contextType: context.type, contextKey: context.key }),
    onSuccess: async (result) => {
      toast.success(`Submitted. Verdict: ${verdictLabel(result.verdict)}`);
      setRemainingCap(result.remainingSubmits);
      setRemainingDaily(result.remainingDailyQuota);
      await queryClient.invalidateQueries({ queryKey: ['qotd-shell-submission', problem.id, context.type, context.key] });
      setTab('overview');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Submit failed'),
  });

  const requestCapMutation = useMutation({
    mutationFn: () =>
      mainApi.requestSubmitCap(problem.id, {
        contextType: context.type,
        contextKey: context.key,
        note: window.prompt('Add a brief note for the admin (optional):') ?? undefined,
      }),
    onSuccess: () => toast.success('Request sent — admin will review it shortly.'),
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
  const submitDisabled = !context.submitEnabled || submitMutation.isPending || runMutation.isPending || capExhausted;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Top mode bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
            context.type === 'QOTD' && !context.practice
              ? 'bg-amber-100 text-amber-800'
              : context.type === 'CONTEST'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}>
            {context.modeLabel}
          </span>
          <h2 className="truncate text-base font-bold text-gray-900 dark:text-gray-100">{problem.title}</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {problem.difficulty}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {remainingCap !== null && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              capExhausted
                ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200'
                : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
            }`}>
              <Hourglass className="h-3.5 w-3.5" />
              Submits: {Math.max(0, submitCap - remainingCap)}/{submitCap}
            </span>
          )}
          {remainingDaily !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              Daily quota left: {remainingDaily}
            </span>
          )}
          {capExhausted && (
            pendingRequestOnServer ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                <MailQuestion className="h-3.5 w-3.5" />
                Request pending review
              </span>
            ) : (
              <button
                type="button"
                disabled={requestCapMutation.isPending}
                onClick={() => requestCapMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
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
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300"
            >
              <Trophy className="h-3.5 w-3.5" />
              Leaderboard
            </a>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Exit problem
            </button>
          )}
        </div>
      </div>

      {context.practice && (
        <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          Practice mode — submissions do not count toward leaderboards.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[45%_55%]">
        <section className="min-h-0 overflow-hidden border-b border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700 lg:border-b-0 lg:border-r">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {(['overview', 'question', 'tests', 'solution'] as SolverTab[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`flex-1 px-3 py-3 text-sm font-semibold capitalize ${tab === item ? 'border-b-2 border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-gray-800 dark:text-gray-400'}`}
              >
                {item === 'tests' ? 'Test Cases' : item}
              </button>
            ))}
          </div>

          <div className="h-[calc(100%-49px)] overflow-auto p-5">
            {tab === 'overview' && (
              <div className="space-y-5">
                {context.deadlineLabel && (
                  <div className={`rounded-md border px-4 py-3 text-sm font-medium ${context.submitEnabled ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'}`}>
                    {context.deadlineLabel}
                  </div>
                )}
                <div className="flex items-center gap-5">
                  <div className="grid h-28 w-28 place-items-center rounded-full border-[10px] border-blue-500 bg-white dark:bg-gray-900">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{latestSubmission ? latestSubmission.score : '-'}</div>
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">/ 100</div>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{problem.title}</h2>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{verdictLabel(latestSubmission?.verdict)}</p>
                    {latestSubmission?.submittedAt && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Submitted on {new Date(latestSubmission.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                    )}
                  </div>
                </div>
                <ResultBar label="Public Tests" passed={publicPassed} total={publicTotal} onClick={() => { setTab('tests'); setTestPanel('public'); }} />
                <ResultBar label="Private Tests" passed={privatePassed} total={privateTotal} hidden onClick={() => { setTab('tests'); setTestPanel('private'); }} />
              </div>
            )}

            {tab === 'question' && (
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{problem.difficulty}</span>
                  {problem.tags?.map((tag) => (
                    <span key={tag} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{tag}</span>
                  ))}
                </div>
                <div className="whitespace-pre-wrap font-sans text-sm leading-6 text-gray-800 dark:text-gray-200">{problem.body}</div>
              </div>
            )}

            {tab === 'tests' && (
              <div className="space-y-4">
                <div className="flex rounded-md bg-gray-100 p-1 dark:bg-gray-800">
                  <button type="button" onClick={() => setTestPanel('public')} className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${testPanel === 'public' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                    Public Tests ({publicPassed}/{publicTotal})
                  </button>
                  <button type="button" onClick={() => setTestPanel('private')} className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${testPanel === 'private' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                    Private Tests ({privatePassed}/{privateTotal})
                  </button>
                </div>

                {testPanel === 'public' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {sampleTests.map((test, index) => {
                        const verdict = publicRunById.get(test.id) ?? publicSubmissionById.get(test.id);
                        return (
                          <button
                            key={test.id}
                            type="button"
                            onClick={() => setSelectedPublicId(test.id)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${verdict?.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : verdict ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300'} ${selectedPublic?.id === test.id ? 'ring-2 ring-blue-300' : ''}`}
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
                      <p className="text-sm text-gray-500">No public cases are configured.</p>
                    )}
                  </div>
                )}

                {testPanel === 'private' && (
                  <div className="space-y-3">
                    {privateVerdicts.length ? privateVerdicts.map((test, index) => (
                      <div key={test.testId} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Private Case {index + 1}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${test.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {test.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {test.passed ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                    )) : (
                      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
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
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    <FileCode2 className="h-4 w-4" />
                    {problem.referenceLanguage ? LANGUAGE_META[problem.referenceLanguage].label : 'Reference Solution'}
                  </div>
                  <CodeBlock title="Solution" value={problem.referenceSolution} />
                </div>
              ) : (
                <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-8 text-center dark:border-gray-700 dark:bg-gray-900">
                  <div>
                    <Lock className="mx-auto h-10 w-10 text-gray-400" />
                    <p className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">Solution unlocks after the deadline once you have submitted at least 2 times.</p>
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-[#101214]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={(event) => {
                  localStorage.setItem(currentDraftKey, code.slice(0, 100_000));
                  loadedKeyRef.current = '';
                  setLanguage(event.target.value as ProblemLanguage);
                }}
                className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none"
              >
                {allowedLanguages.map((item) => (
                  <option key={item} value={item} className="text-gray-900">{LANGUAGE_META[item].label}</option>
                ))}
              </select>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gray-200">{meta.filename}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" title="Decrease font size" onClick={() => setFontSize((value) => Math.max(12, value - 1))} className="rounded-md bg-white/10 px-2 py-1 text-sm font-bold text-white hover:bg-white/20">-</button>
              <button type="button" title="Increase font size" onClick={() => setFontSize((value) => Math.min(22, value + 1))} className="rounded-md bg-white/10 px-2 py-1 text-sm font-bold text-white hover:bg-white/20">+</button>
              <button type="button" title="Copy code" onClick={() => navigator.clipboard.writeText(code)} className="rounded-md bg-white/10 p-2 text-white hover:bg-white/20"><Copy className="h-4 w-4" /></button>
              <button type="button" title="Paste code" onClick={async () => setCode(await navigator.clipboard.readText())} className="rounded-md bg-white/10 p-2 text-white hover:bg-white/20"><Clipboard className="h-4 w-4" /></button>
              <button
                type="button"
                disabled={runMutation.isPending}
                onClick={() => runMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Test Run
              </button>
              <button
                type="button"
                disabled={submitDisabled}
                onClick={() => submitMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                title={capExhausted ? 'Submit cap reached — request more from the top bar' : undefined}
              >
                <Send className="h-4 w-4" />
                Submit
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              language={meta.monaco}
              theme="vs-dark"
              value={code}
              beforeMount={registerMonacoEmmet}
              options={{ ...BASE_MONACO_EDITOR_OPTIONS, fontSize }}
              onChange={(value) => setCode(value ?? '')}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

export function buildQOTDLeaderboardHref(): string {
  return `${getMainSiteOrigin()}/qotd/leaderboard`;
}

export default QOTDSolverShell;
