import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clipboard, Copy, FileCode2, Lock, Maximize2, Play, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, type Problem, type ProblemContextType, type ProblemLanguage, type ProblemSubmission, type TestRunResult } from '@/lib/api';
import { BASE_MONACO_EDITOR_OPTIONS, registerMonacoEmmet } from '@/lib/monacoEditor';
import { Markdown } from '@/components/ui/markdown';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';

type SolverTab = 'overview' | 'question' | 'tests' | 'solution';
type TestPanel = 'public' | 'private';

interface ProblemSolverShellProps {
  problem: Problem;
  context: {
    type: ProblemContextType;
    key: string;
    submitEnabled: boolean;
    deadlineLabel?: string;
    practice?: boolean;
  };
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
      className="w-full rounded-md border border-gray-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className={`text-sm font-semibold ${complete ? 'text-emerald-700' : 'text-gray-600'}`}>
          {total > 0 ? `${passed}/${total} Passed` : hidden ? 'No private result' : 'No result'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={complete ? 'h-full bg-emerald-500' : 'h-full bg-blue-500'} style={{ width: `${ratio}%` }} />
      </div>
    </button>
  );
}

function CodeBlock({ title, value }: { title: string; value: string }) {
  const [full, setFull] = useState(false);
  return (
    <div className={full ? 'fixed inset-6 z-50 flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-2xl' : 'rounded-md border border-gray-200 bg-white'}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Copy"
            onClick={() => navigator.clipboard.writeText(value)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={full ? 'Close fullscreen' : 'Fullscreen'}
            onClick={() => setFull((next) => !next)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <pre className={full ? 'min-h-0 flex-1 overflow-auto p-4 text-sm' : 'max-h-72 overflow-auto p-3 text-sm'}>
        {value || ' '}
      </pre>
    </div>
  );
}

export function ProblemSolverShell({ problem, context }: ProblemSolverShellProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const allowedLanguages = useMemo<ProblemLanguage[]>(
    () => (problem.allowedLanguages?.length ? problem.allowedLanguages : ['PYTHON']) as ProblemLanguage[],
    [problem.allowedLanguages],
  );
  const [tab, setTab] = useState<SolverTab>('overview');
  const [testPanel, setTestPanel] = useState<TestPanel>('public');
  const [languageIntent, setLanguage] = useState<ProblemLanguage>(allowedLanguages[0]);
  // Render-time clamp: if the persisted language slips out of allowedLanguages
  // (e.g. the problem owner restricted the set), fall back to the first allowed
  // entry. Avoids the cascading-render trap of syncing via an effect.
  const language: ProblemLanguage = allowedLanguages.includes(languageIntent)
    ? languageIntent
    : allowedLanguages[0];
  const [fontSize, setFontSize] = useState(14);
  const [lastRun, setLastRun] = useState<TestRunResult | null>(null);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null);

  const submissionQuery = useQuery({
    queryKey: ['problem-submission', problem.id, context.type, context.key],
    queryFn: () => api.getMyProblemSubmission(problem.id, context.type, context.key, token!),
    enabled: Boolean(token),
  });

  const latestSubmission = submissionQuery.data?.submission ?? null;
  const { publicVerdicts, privateVerdicts } = getVerdicts(latestSubmission);
  const sampleTests = problem.sampleTests ?? [];
  const privateTotal = latestSubmission ? privateVerdicts.length : 0;
  const meta = LANGUAGE_META[language];
  const currentDraftKey = useMemo(() => draftKey(problem.id, language), [problem.id, language]);

  // Reset-state-during-render pattern (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // Whenever currentDraftKey rolls (problem or language change), recompute the
  // initial editor contents from localStorage / the most recent submission and
  // discard whatever the user was typing under the old key.
  const [loadedKey, setLoadedKey] = useState(currentDraftKey);
  const [code, setCode] = useState(() => {
    const saved = localStorage.getItem(currentDraftKey);
    const submittedCode = latestSubmission?.language === language ? latestSubmission.code : '';
    return saved ?? submittedCode ?? '';
  });
  if (loadedKey !== currentDraftKey) {
    setLoadedKey(currentDraftKey);
    const saved = localStorage.getItem(currentDraftKey);
    const submittedCode = latestSubmission?.language === language ? latestSubmission.code : '';
    setCode(saved ?? submittedCode ?? '');
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      localStorage.setItem(currentDraftKey, code.slice(0, 100_000));
    }, 500);
    return () => window.clearTimeout(handle);
  }, [code, currentDraftKey]);

  const runMutation = useMutation({
    mutationFn: () => api.runProblem(problem.id, {
      language,
      code,
      contextType: context.type,
      contextKey: context.key,
    }, token!),
    onSuccess: (result) => {
      setLastRun(result);
      setTab('tests');
      setTestPanel('public');
      const passed = countPassed(result.perTestVerdicts);
      toast.success(`${passed}/${result.perTestVerdicts.length} public tests passed`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Test run failed'),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.submitProblem(problem.id, { language, code, contextType: context.type, contextKey: context.key }, token!),
    onSuccess: async (result) => {
      toast.success(`Submitted. Verdict: ${verdictLabel(result.verdict)}`);
      await queryClient.invalidateQueries({ queryKey: ['problem-submission', problem.id, context.type, context.key] });
      if (context.type === 'QOTD') {
        // Keep leaderboards + streak widget consistent with the server-side
        // cache bust we now issue on /submit.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['qotd', 'leaderboard', 'daily', context.key] }),
          queryClient.invalidateQueries({ queryKey: ['qotd', 'leaderboard', 'total'] }),
          queryClient.invalidateQueries({ queryKey: ['qotd-stats'] }),
        ]);
      }
      setTab('overview');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Submit failed'),
  });

  const publicRunById = new Map((lastRun?.perTestVerdicts ?? []).map((test) => [test.testId, test]));
  const publicSubmissionById = new Map(publicVerdicts.map((test) => [test.testId, test]));
  const selectedPublic = sampleTests.find((test) => test.id === selectedPublicId) ?? sampleTests[0];
  const publicPassed = latestSubmission ? countPassed(publicVerdicts) : countPassed(lastRun?.perTestVerdicts ?? []);
  const publicTotal = latestSubmission ? publicVerdicts.length : (lastRun?.perTestVerdicts.length ?? sampleTests.length);
  const privatePassed = countPassed(privateVerdicts);
  const submitDisabled = !context.submitEnabled || !token || submitMutation.isPending || runMutation.isPending;

  return (
    <div className="min-h-[720px] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      {context.practice && (
        <div className="border-b border-blue-200 bg-blue-50 px-5 py-3 text-sm font-medium text-blue-800">
          Practice mode - submissions do not count toward leaderboards.
        </div>
      )}
      <div className="grid min-h-[720px] grid-cols-1 lg:grid-cols-[45%_55%]">
        <section className="border-b border-gray-200 bg-white lg:border-b-0 lg:border-r">
          <div className="flex border-b border-gray-200">
            {(['overview', 'question', 'tests', 'solution'] as SolverTab[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`flex-1 px-3 py-3 text-sm font-semibold capitalize ${tab === item ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                {item === 'tests' ? 'Test Cases' : item}
              </button>
            ))}
          </div>

          <div className="h-[660px] overflow-auto p-5">
            {tab === 'overview' && (
              <div className="space-y-5">
                {context.deadlineLabel && (
                  <div className={`rounded-md border px-4 py-3 text-sm font-medium ${context.submitEnabled ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                    {context.deadlineLabel}
                  </div>
                )}
                <div className="flex items-center gap-5">
                  <div className="grid h-28 w-28 place-items-center rounded-full border-[10px] border-blue-500 bg-white">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{latestSubmission ? latestSubmission.score : '-'}</div>
                      <div className="text-xs font-semibold text-gray-500">/ 100</div>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{problem.title}</h2>
                    <p className="mt-1 text-sm text-gray-600">{verdictLabel(latestSubmission?.verdict)}</p>
                    {latestSubmission?.submittedAt && (
                      <p className="mt-2 text-xs text-gray-500">Submitted on {new Date(latestSubmission.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
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
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{problem.difficulty}</span>
                  {problem.tags?.map((tag) => (
                    <span key={tag} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{tag}</span>
                  ))}
                </div>
                <Markdown>{problem.body || ''}</Markdown>
              </div>
            )}

            {tab === 'tests' && (
              <div className="space-y-4">
                <div className="flex rounded-md bg-gray-100 p-1">
                  <button type="button" onClick={() => setTestPanel('public')} className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${testPanel === 'public' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    Public Tests ({publicPassed}/{publicTotal})
                  </button>
                  <button type="button" onClick={() => setTestPanel('private')} className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${testPanel === 'private' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
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
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${verdict?.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : verdict ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600'} ${selectedPublic?.id === test.id ? 'ring-2 ring-blue-300' : ''}`}
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
                      <div key={test.testId} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3">
                        <span className="text-sm font-semibold text-gray-800">Private Case {index + 1}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${test.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {test.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {test.passed ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                    )) : (
                      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
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
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <FileCode2 className="h-4 w-4" />
                    {problem.referenceLanguage ? LANGUAGE_META[problem.referenceLanguage].label : 'Reference Solution'}
                  </div>
                  <CodeBlock title="Solution" value={problem.referenceSolution} />
                </div>
              ) : (
                <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-8 text-center">
                  <div>
                    <Lock className="mx-auto h-10 w-10 text-gray-400" />
                    <p className="mt-4 text-base font-semibold text-gray-900">Solution unlocks after the deadline once you have submitted at least 2 times.</p>
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        <section className="flex min-h-[720px] flex-col bg-[#101214]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={(event) => {
                  // Flush the in-flight buffer for the current draft before
                  // switching — the reset-state-during-render block in the
                  // component body will pick up the new draft on next render.
                  localStorage.setItem(currentDraftKey, code.slice(0, 100_000));
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
              <button type="button" disabled={!token || runMutation.isPending} onClick={() => runMutation.mutate()} className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50">
                <Play className="h-4 w-4" />
                Test Run
              </button>
              <button type="button" disabled={submitDisabled} onClick={() => submitMutation.mutate()} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Send className="h-4 w-4" />
                Submit
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {/* Wrap Monaco so a render crash doesn't take down the whole shell.
                The user's code lives in localStorage under currentDraftKey, so
                even on crash they can recover by reloading. */}
            <SectionErrorBoundary
              label="Editor"
              fallbackMessage="The editor crashed. Your code is preserved in this browser — reload the page to continue."
              resetKey={currentDraftKey}
            >
              <Editor
                height="100%"
                language={meta.monaco}
                theme="vs-dark"
                value={code}
                beforeMount={registerMonacoEmmet}
                options={{ ...BASE_MONACO_EDITOR_OPTIONS, fontSize }}
                onChange={(value) => setCode(value ?? '')}
              />
            </SectionErrorBoundary>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ProblemSolverShell;
