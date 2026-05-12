import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Loader2, PlayCircle, Plus, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, type Problem, type ProblemInput, type ProblemLanguage, type ProblemSubmission, type ProblemTestCase, type SubmissionVerdict } from '@/lib/api';
import { Markdown } from '@/components/ui/markdown';
import { PendingCapRequestsTray } from '@/components/problems/PendingCapRequestsTray';

const LANGUAGES: ProblemLanguage[] = ['PYTHON', 'JAVASCRIPT', 'CPP', 'JAVA'];
const VERDICTS: SubmissionVerdict[] = ['ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'JUDGE_ERROR'];

const emptyCase = (prefix: string, index: number): ProblemTestCase => ({
  id: `${prefix}-${index}`,
  input: '',
  expectedOutput: '',
});

const blankProblem: ProblemInput = {
  slug: '',
  title: '',
  body: '# Problem\n\nDescribe the task, input format, output format, and constraints.',
  difficulty: 'EASY',
  tags: [],
  allowedLanguages: ['PYTHON'],
  timeLimitMs: 2000,
  defaultSubmitCap: 5,
  sampleTests: [emptyCase('sample', 1)],
  hiddenTests: [emptyCase('hidden', 1)],
  referenceSolution: '',
  referenceLanguage: 'PYTHON',
  isPublished: false,
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

function toInput(problem: Problem): ProblemInput {
  return {
    slug: problem.slug,
    title: problem.title,
    body: problem.body ?? '',
    difficulty: problem.difficulty,
    tags: problem.tags ?? [],
    allowedLanguages: problem.allowedLanguages ?? ['PYTHON'],
    timeLimitMs: problem.timeLimitMs ?? 2000,
    defaultSubmitCap: problem.defaultSubmitCap ?? 5,
    sampleTests: problem.sampleTests?.length ? problem.sampleTests : [emptyCase('sample', 1)],
    hiddenTests: problem.hiddenTests?.length ? problem.hiddenTests : [emptyCase('hidden', 1)],
    referenceSolution: problem.referenceSolution ?? '',
    referenceLanguage: problem.referenceLanguage ?? problem.allowedLanguages?.[0] ?? 'PYTHON',
    isPublished: problem.isPublished,
  };
}

function CaseEditor({ title, cases, onChange, prefix }: { title: string; cases: ProblemTestCase[]; prefix: string; onChange: (cases: ProblemTestCase[]) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">{title}</h3>
        <button type="button" onClick={() => onChange([...cases, emptyCase(prefix, cases.length + 1)])} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      {cases.map((test, index) => (
        <div key={`${test.id}-${index}`} className="rounded-md border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <input value={test.id} onChange={(event) => onChange(cases.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.target.value } : item))} className="w-40 rounded border border-gray-200 px-2 py-1 text-sm" />
            <input value={test.label ?? ''} placeholder="Label" onChange={(event) => onChange(cases.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm" />
            <button type="button" title="Delete case" onClick={() => onChange(cases.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-2 text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea value={test.input} placeholder="Input" onChange={(event) => onChange(cases.map((item, itemIndex) => itemIndex === index ? { ...item, input: event.target.value } : item))} className="min-h-28 rounded border border-gray-200 p-2 font-mono text-sm" />
            <textarea value={test.expectedOutput} placeholder="Expected output" onChange={(event) => onChange(cases.map((item, itemIndex) => itemIndex === index ? { ...item, expectedOutput: event.target.value } : item))} className="min-h-28 rounded border border-gray-200 p-2 font-mono text-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SubmissionRows({ problem, token }: { problem: Problem; token: string }) {
  const queryClient = useQueryClient();
  const submissionsQuery = useQuery({
    queryKey: ['admin-problem-submissions', problem.id],
    queryFn: () => api.adminGetProblemSubmissions(problem.id, { limit: 50 }, token),
  });

  const overrideMutation = useMutation({
    mutationFn: ({ submission, verdict, score }: { submission: ProblemSubmission; verdict?: SubmissionVerdict; score?: number }) =>
      api.adminOverrideSubmission(problem.id, submission.id, { verdict, score, notes: 'Manual override from admin Problems page' }, token),
    onSuccess: async () => {
      toast.success('Submission override saved');
      // Refresh the submissions list AND the parent problem-list query so the
      // per-problem submission count / latest-score columns reflect the new
      // verdict without a manual page refresh.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-problem-submissions', problem.id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-problems'] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Override failed'),
  });

  if (submissionsQuery.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
  const submissions = submissionsQuery.data?.submissions ?? [];

  return (
    <div className="overflow-auto rounded-md border border-gray-200">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">User</th>
            <th className="px-3 py-2">Context</th>
            <th className="px-3 py-2">Verdict</th>
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2">Updated</th>
            <th className="px-3 py-2">Override</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td className="px-3 py-2 font-medium text-gray-900">{submission.user?.name ?? submission.userId}</td>
              <td className="px-3 py-2 text-gray-600">{submission.contextType}</td>
              <td className="px-3 py-2">{submission.verdict}</td>
              <td className="px-3 py-2">{submission.score}</td>
              <td className="px-3 py-2 text-gray-500">{new Date(submission.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) overrideMutation.mutate({ submission, verdict: event.target.value as SubmissionVerdict });
                    }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">Verdict</option>
                    {VERDICTS.map((verdict) => <option key={verdict} value={verdict}>{verdict}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const value = window.prompt('Override score 0-100', String(submission.score));
                      if (value !== null) overrideMutation.mutate({ submission, score: Number(value) });
                    }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-50"
                  >
                    Score
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {submissions.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">No submissions yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminProblems() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemInput>(blankProblem);
  const [tagText, setTagText] = useState('');
  const [expandedSubmissions, setExpandedSubmissions] = useState<string | null>(null);
  const [job, setJob] = useState<{ problemId: string; jobId: string } | null>(null);

  const problemsQuery = useQuery({
    queryKey: ['admin-problems'],
    queryFn: () => api.adminGetProblems(token!),
    enabled: Boolean(token),
  });

  const jobQuery = useQuery({
    queryKey: ['problem-rejudge', job?.problemId, job?.jobId],
    queryFn: () => api.adminRejudgeStatus(job!.problemId, job!.jobId, token!),
    enabled: Boolean(token && job),
    refetchInterval: (query) => query.state.data?.status === 'complete' || query.state.data?.status === 'failed' ? false : 1500,
  });

  useEffect(() => {
    setTagText(form.tags.join(', '));
  }, [editingId]);

  const saveMutation = useMutation({
    mutationFn: async ({ rejudge }: { rejudge: boolean }) => {
      const input = { ...form, tags: tagText.split(',').map((tag) => tag.trim()).filter(Boolean) };
      const response = editingId
        ? await api.updateProblem(editingId, input, rejudge ? 'auto' : 'manual', token!)
        : await api.createProblem(input, token!);
      if (rejudge) {
        const queued = await api.adminRejudgeProblem(response.problem.id, undefined, token!);
        setJob({ problemId: response.problem.id, jobId: queued.jobId });
      }
      return response;
    },
    onSuccess: async () => {
      toast.success('Problem saved');
      await queryClient.invalidateQueries({ queryKey: ['admin-problems'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save problem'),
  });

  const deleteMutation = useMutation({
    mutationFn: (problemId: string) => api.deleteProblem(problemId, token!),
    onSuccess: async () => {
      toast.success('Problem deleted');
      await queryClient.invalidateQueries({ queryKey: ['admin-problems'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete problem'),
  });

  const editProblem = async (problem: Problem) => {
    if (!token) return;
    const detail = await api.getProblem(problem.id, { token });
    setEditingId(problem.id);
    setForm(toInput(detail.problem));
    setTagText((detail.problem.tags ?? []).join(', '));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Deep-link support: ?problemId=<id> auto-opens that problem in the editor.
  const deepLinkProblemId = searchParams.get('problemId');
  useEffect(() => {
    if (!deepLinkProblemId || !token) return;
    if (editingId === deepLinkProblemId) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await api.getProblem(deepLinkProblemId, { token });
        if (cancelled) return;
        setEditingId(detail.problem.id);
        setForm(toInput(detail.problem));
        setTagText((detail.problem.tags ?? []).join(', '));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Strip the query param once consumed so refresh doesn't re-trigger.
        const next = new URLSearchParams(searchParams);
        next.delete('problemId');
        setSearchParams(next, { replace: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to open problem');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepLinkProblemId, token, editingId, searchParams, setSearchParams]);

  const problems = problemsQuery.data?.problems ?? [];
  const languageOptions = useMemo(() => new Set(form.allowedLanguages), [form.allowedLanguages]);

  return (
    <div className="space-y-6">
      <PendingCapRequestsTray title="Pending submit-cap requests" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Problems</h1>
          <p className="text-gray-600">Catalog, tests, submissions, rejudge, and manual overrides.</p>
        </div>
        <button type="button" onClick={() => { setEditingId(null); setForm(blankProblem); setTagText(''); }} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          New Problem
        </button>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Problem' : 'New Problem'}</h2>
          {jobQuery.data && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Rejudge {jobQuery.data.status}: {jobQuery.data.processed}/{jobQuery.data.total}
            </span>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value, slug: prev.slug || slugify(event.target.value) }))} placeholder="Title" className="w-full rounded-md border border-gray-200 px-3 py-2" />
            <input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))} placeholder="slug" className="w-full rounded-md border border-gray-200 px-3 py-2" />
            <div className="grid gap-3 md:grid-cols-3">
              <select value={form.difficulty} onChange={(event) => setForm((prev) => ({ ...prev, difficulty: event.target.value as ProblemInput['difficulty'] }))} className="rounded-md border border-gray-200 px-3 py-2">
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
              <input type="number" min={500} max={10000} value={form.timeLimitMs} onChange={(event) => setForm((prev) => ({ ...prev, timeLimitMs: Number(event.target.value) }))} className="rounded-md border border-gray-200 px-3 py-2" />
              <input type="number" min={1} max={100} value={form.defaultSubmitCap} onChange={(event) => setForm((prev) => ({ ...prev, defaultSubmitCap: Number(event.target.value) }))} className="rounded-md border border-gray-200 px-3 py-2" />
            </div>
            <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="tags, comma separated" className="w-full rounded-md border border-gray-200 px-3 py-2" />
            <div className="flex flex-wrap gap-3">
              {LANGUAGES.map((language) => (
                <label key={language} className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={languageOptions.has(language)}
                    onChange={(event) => setForm((prev) => ({
                      ...prev,
                      allowedLanguages: event.target.checked
                        ? [...prev.allowedLanguages, language]
                        : prev.allowedLanguages.filter((item) => item !== language),
                    }))}
                  />
                  {language}
                </label>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((prev) => ({ ...prev, isPublished: event.target.checked }))} />
              Published
            </label>
            <textarea value={form.body} onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))} className="min-h-80 w-full rounded-md border border-gray-200 p-3 font-mono text-sm" />
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <Markdown>{form.body}</Markdown>
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <CaseEditor title="Sample Tests" prefix="sample" cases={form.sampleTests} onChange={(sampleTests) => setForm((prev) => ({ ...prev, sampleTests }))} />
          <CaseEditor title="Hidden Tests" prefix="hidden" cases={form.hiddenTests} onChange={(hiddenTests) => setForm((prev) => ({ ...prev, hiddenTests }))} />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[220px_1fr]">
          <select value={form.referenceLanguage ?? form.allowedLanguages[0]} onChange={(event) => setForm((prev) => ({ ...prev, referenceLanguage: event.target.value as ProblemLanguage }))} className="rounded-md border border-gray-200 px-3 py-2">
            {LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
          <textarea value={form.referenceSolution ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, referenceSolution: event.target.value }))} placeholder="Reference solution" className="min-h-40 rounded-md border border-gray-200 p-3 font-mono text-sm" />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ rejudge: false })} className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Save className="h-4 w-4" />
            Save without re-run
          </button>
          <button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ rejudge: true })} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <PlayCircle className="h-4 w-4" />
            Save & re-run all submissions
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Catalog</h2>
          {problemsQuery.isLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Problem</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Languages</th>
                <th className="px-4 py-3">Submissions</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {problems.map((problem) => (
                <tr key={problem.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{problem.title}</div>
                    <div className="text-xs text-gray-500">{problem.slug}</div>
                  </td>
                  <td className="px-4 py-3">{problem.difficulty}</td>
                  <td className="px-4 py-3">{problem.allowedLanguages.join(', ')}</td>
                  <td className="px-4 py-3">{problem.submissionCount ?? 0}</td>
                  <td className="px-4 py-3">{problem.isPublished ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void editProblem(problem)} className="rounded p-2 text-blue-700 hover:bg-blue-50"><Edit3 className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setExpandedSubmissions(expandedSubmissions === problem.id ? null : problem.id)} className="rounded p-2 text-gray-700 hover:bg-gray-50"><RefreshCcw className="h-4 w-4" /></button>
                      <button type="button" onClick={() => deleteMutation.mutate(problem.id)} className="rounded p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {problems.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No problems created yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {expandedSubmissions && token && (
          <div className="border-t border-gray-100 p-5">
            <SubmissionRows problem={problems.find((problem) => problem.id === expandedSubmissions)!} token={token} />
          </div>
        )}
      </section>
    </div>
  );
}
