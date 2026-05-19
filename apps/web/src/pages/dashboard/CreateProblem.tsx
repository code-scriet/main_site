import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import { useAuth } from '@/context/AuthContext';
import { api, type ProblemInput, type ProblemLanguage, type ProblemTestCase } from '@/lib/api';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { ArrowLeft, ArrowRight, BookOpen, Check, FileCode2, Loader2, Plus, Save, Trash2 } from 'lucide-react';

const LANGUAGES: ProblemLanguage[] = ['PYTHON', 'JAVASCRIPT', 'CPP', 'JAVA'];

function emptyCase(prefix: string, index: number): ProblemTestCase {
  return { id: `${prefix}-${index}`, input: '', expectedOutput: '' };
}

const blankInput = (): ProblemInput => ({
  slug: '',
  title: '',
  body: '## Problem\n\nDescribe the task, expected input format, output format, and constraints.\n\n### Example\n\n```\ninput\n```\n\n```\noutput\n```',
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
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

type Step = 'basics' | 'statement' | 'tests' | 'solution' | 'review';

const STEPS: Array<{ id: Step; label: string; description: string }> = [
  { id: 'basics', label: 'Basics', description: 'Title, difficulty, languages' },
  { id: 'statement', label: 'Statement', description: 'Problem description (markdown)' },
  { id: 'tests', label: 'Tests', description: 'Sample + hidden test cases' },
  { id: 'solution', label: 'Solution', description: 'Optional reference solution' },
  { id: 'review', label: 'Review', description: 'Confirm and save' },
];

function CaseList({
  title,
  description,
  cases,
  prefix,
  onChange,
}: {
  title: string;
  description: string;
  cases: ProblemTestCase[];
  prefix: string;
  onChange: (next: ProblemTestCase[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...cases, emptyCase(prefix, cases.length + 1)])}
          className="h-8"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add case
        </Button>
      </div>
      {cases.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          No {prefix} cases yet. Add at least one.
        </p>
      )}
      <ol className="space-y-3">
        {cases.map((test, index) => (
          <li key={`${test.id}-${index}`} className="rounded-md border border-border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[var(--warning-bg)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--warning)] dark:bg-amber-500/10 dark:text-amber-300">
                #{index + 1}
              </span>
              <Input
                value={test.id}
                onChange={(event) => onChange(cases.map((item, i) => (i === index ? { ...item, id: event.target.value.trim() || item.id } : item)))}
                className="h-8 w-40 text-xs"
                placeholder="case-id"
              />
              <Input
                value={test.label ?? ''}
                onChange={(event) => onChange(cases.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))}
                className="h-8 min-w-0 flex-1 text-xs"
                placeholder="Optional label"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(cases.filter((_, i) => i !== index))}
                className="h-8 w-8 text-destructive hover:text-destructive"
                title="Remove case"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Input</Label>
                <Textarea
                  value={test.input}
                  onChange={(event) => onChange(cases.map((item, i) => (i === index ? { ...item, input: event.target.value } : item)))}
                  className="mt-1 min-h-24 font-mono text-xs"
                  placeholder="stdin or input fixture"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Expected output</Label>
                <Textarea
                  value={test.expectedOutput}
                  onChange={(event) => onChange(cases.map((item, i) => (i === index ? { ...item, expectedOutput: event.target.value } : item)))}
                  className="mt-1 min-h-24 font-mono text-xs"
                  placeholder="Exact expected stdout"
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function CreateProblem() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { id: editingId } = useParams();
  // E10 — when CreateQOTD redirected here with ?qotd=1, hand the new problem back to
  // /dashboard/qotd?problemId=<id> after save so the admin can schedule with one click.
  const [createSearchParams] = useSearchParams();
  const qotdHandoff = createSearchParams.get('qotd') === '1';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT' || user?.isSuperAdmin === true;

  const [step, setStep] = useState<Step>('basics');
  const [form, setForm] = useState<ProblemInput>(blankInput);
  const [tagsText, setTagsText] = useState('');
  const [loading, setLoading] = useState(Boolean(editingId));
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const skipDirtyRef = useRef(true);

  useUnsavedChangesWarning(isDirty && !saving);

  useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setIsDirty(true);
  }, [form, tagsText]);

  useEffect(() => {
    if (!editingId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await api.getProblem(editingId, { token });
        if (cancelled) return;
        const problem = detail.problem;
        skipDirtyRef.current = true;
        setForm({
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
        });
        skipDirtyRef.current = true;
        setTagsText((problem.tags ?? []).join(', '));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load problem');
        navigate('/dashboard/coding');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, token, navigate]);

  const issues = useMemo(() => {
    const list: string[] = [];
    if (form.title.trim().length < 3) list.push('Title must be at least 3 characters');
    if (form.slug.trim().length < 3) list.push('Slug is required (auto-fills from title)');
    if (form.body.trim().length < 20) list.push('Problem statement looks too short');
    if (form.allowedLanguages.length === 0) list.push('Pick at least one language');
    if (form.sampleTests.length === 0) list.push('Add at least one sample test');
    if (form.hiddenTests.length === 0) list.push('Add at least one hidden test');
    form.sampleTests.forEach((test, index) => {
      if (!test.expectedOutput.trim()) list.push(`Sample test #${index + 1} is missing expected output`);
    });
    form.hiddenTests.forEach((test, index) => {
      if (!test.expectedOutput.trim()) list.push(`Hidden test #${index + 1} is missing expected output`);
    });
    return list;
  }, [form]);

  const canAdvance = (target: Step) => {
    // Allow jumping back freely; advancing requires basic completeness.
    if (target === 'basics') return true;
    if (target === 'statement') return form.title.trim().length >= 3 && form.slug.trim().length >= 3;
    if (target === 'tests') return form.body.trim().length >= 20;
    if (target === 'solution') return form.sampleTests.every((test) => test.expectedOutput.trim()) && form.hiddenTests.every((test) => test.expectedOutput.trim());
    if (target === 'review') return issues.length === 0;
    return true;
  };

  const goNext = () => {
    const order = STEPS.map((entry) => entry.id);
    const index = order.indexOf(step);
    const next = order[index + 1];
    if (!next) return;
    if (!canAdvance(next)) {
      toast.error('Fill required fields before continuing');
      return;
    }
    setStep(next);
  };

  const goPrev = () => {
    const order = STEPS.map((entry) => entry.id);
    const index = order.indexOf(step);
    const prev = order[Math.max(0, index - 1)];
    setStep(prev);
  };

  const handleSave = async () => {
    if (!token) return;
    if (issues.length > 0) {
      toast.error(issues[0]);
      return;
    }
    const payload: ProblemInput = {
      ...form,
      tags: tagsText
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      slug: slugify(form.slug || form.title),
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.updateProblem(editingId, payload, 'manual', token);
        toast.success('Problem updated');
      } else {
        const response = await api.createProblem(payload, token);
        toast.success(isAdmin && form.isPublished ? 'Problem created and published' : 'Problem saved — admins will review before publishing');
        if (response.problem?.id) {
          // If we came from CreateQOTD via ?qotd=1, bounce back so the admin can finish
          // scheduling. Otherwise stay on the edit page for further iteration.
          if (qotdHandoff) {
            navigate(`/dashboard/qotd?problemId=${response.problem.id}`, { replace: true });
          } else {
            navigate(`/dashboard/problems/${response.problem.id}/edit`, { replace: true });
          }
        }
      }
      setIsDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save problem');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="outline" className="mb-2 border-amber-400/40 bg-[var(--warning-bg)] text-[var(--warning)] dark:bg-amber-500/10 dark:text-amber-300">
              <FileCode2 className="mr-1 h-3 w-3" />
              {editingId ? 'Edit problem' : 'Create problem'}
            </Badge>
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              {editingId ? form.title || 'Edit problem' : 'Author a new coding problem'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              Walk through the steps below. {isAdmin ? 'You can publish directly from the review step.' : 'Once you save, an admin will review the problem and publish it.'}
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate('/dashboard/coding')} className="h-9">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to coding
          </Button>
        </div>
      </motion.div>

      <Card>
        <CardContent className="grid gap-2 p-2 sm:grid-cols-5">
          {STEPS.map((entry, index) => {
            const active = step === entry.id;
            const reachable = canAdvance(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => reachable && setStep(entry.id)}
                className={`rounded-md border px-3 py-2 text-left transition ${active
                    ? 'border-amber-400/60 bg-amber-400/10 text-[var(--warning)] dark:text-amber-300'
                    : reachable
                      ? 'border-border bg-card hover:border-amber-400/40 hover:bg-amber-400/5'
                      : 'cursor-not-allowed border-border bg-muted/40 opacity-70'
                  }`}
                disabled={!reachable}
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[10px] text-amber-950">
                    {index + 1}
                  </span>
                  {entry.label}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{entry.description}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {step === 'basics' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basics</CardTitle>
            <CardDescription>The header and metadata learners see first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                      slug: prev.slug || slugify(event.target.value),
                    }))
                  }
                  placeholder="Two Sum, Balanced Brackets, …"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(event) => setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))}
                  placeholder="two-sum"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Used in URLs — lowercase, hyphenated.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Difficulty</Label>
                <select
                  value={form.difficulty}
                  onChange={(event) => setForm((prev) => ({ ...prev, difficulty: event.target.value as ProblemInput['difficulty'] }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <div>
                <Label>Time limit (ms)</Label>
                <Input
                  type="number"
                  min={500}
                  max={10000}
                  value={form.timeLimitMs}
                  onChange={(event) => setForm((prev) => ({ ...prev, timeLimitMs: Number(event.target.value) || 2000 }))}
                />
              </div>
              <div>
                <Label>Default submit cap</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.defaultSubmitCap}
                  onChange={(event) => setForm((prev) => ({ ...prev, defaultSubmitCap: Number(event.target.value) || 5 }))}
                />
              </div>
            </div>

            <div>
              <Label>Tags</Label>
              <Input
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="arrays, hashing, two-pointers"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Comma-separated. Helps learners discover the problem.</p>
            </div>

            <div>
              <Label>Allowed languages</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {LANGUAGES.map((language) => {
                  const active = form.allowedLanguages.includes(language);
                  return (
                    <button
                      key={language}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          allowedLanguages: active
                            ? prev.allowedLanguages.filter((entry) => entry !== language)
                            : [...prev.allowedLanguages, language],
                        }))
                      }
                      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${active
                          ? 'border-amber-400 bg-amber-400/10 text-[var(--warning)] dark:text-amber-300'
                          : 'border-border bg-card text-muted-foreground hover:border-amber-400/40'
                        }`}
                    >
                      {language}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'statement' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Problem statement</CardTitle>
            <CardDescription>Markdown. Include input, output, constraints, and at least one example.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              <Textarea
                value={form.body}
                onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                className="min-h-[420px] font-mono text-xs"
              />
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Preview</p>
                <Markdown>{form.body || '_Statement preview appears here._'}</Markdown>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'tests' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test cases</CardTitle>
            <CardDescription>
              Sample tests are visible to learners. Hidden tests grade submissions — keep them comprehensive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <CaseList
              title="Sample tests"
              description="Shown to learners — use 1–3 representative cases."
              prefix="sample"
              cases={form.sampleTests}
              onChange={(next) => setForm((prev) => ({ ...prev, sampleTests: next }))}
            />
            <CaseList
              title="Hidden tests"
              description="Graded silently. Cover edge cases, large inputs, off-by-ones."
              prefix="hidden"
              cases={form.hiddenTests}
              onChange={(next) => setForm((prev) => ({ ...prev, hiddenTests: next }))}
            />
          </CardContent>
        </Card>
      )}

      {step === 'solution' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reference solution</CardTitle>
            <CardDescription>Optional — reveals to learners after they submit twice past the deadline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[200px_1fr]">
              <div>
                <Label>Reference language</Label>
                <select
                  value={form.referenceLanguage ?? form.allowedLanguages[0]}
                  onChange={(event) => setForm((prev) => ({ ...prev, referenceLanguage: event.target.value as ProblemLanguage }))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {LANGUAGES.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Solution code</Label>
                <Textarea
                  value={form.referenceSolution ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, referenceSolution: event.target.value }))}
                  className="mt-1 min-h-[260px] font-mono text-xs"
                  placeholder="// Optional canonical solution"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & save</CardTitle>
            <CardDescription>
              {isAdmin ? 'Choose publish-on-save or keep as draft for review.' : 'Submission goes to an admin for publishing.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4 text-sm">
              <p className="font-semibold text-foreground">{form.title || 'Untitled problem'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                /{form.slug || 'auto-slug-from-title'} · {form.difficulty} · {form.allowedLanguages.join(', ') || 'no languages'}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {form.sampleTests.length} sample test{form.sampleTests.length === 1 ? '' : 's'} · {form.hiddenTests.length} hidden test{form.hiddenTests.length === 1 ? '' : 's'}
              </p>
            </div>

            {issues.length > 0 ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
                <p className="font-semibold">Resolve these before saving:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                <p className="inline-flex items-center gap-2 font-semibold">
                  <Check className="h-4 w-4" />
                  Ready to save.
                </p>
              </div>
            )}

            {isAdmin && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(event) => setForm((prev) => ({ ...prev, isPublished: event.target.checked }))}
                  className="h-4 w-4 rounded border-input"
                />
                Publish immediately (visible in QOTD / Competition pickers)
              </label>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={goPrev} disabled={step === 'basics'}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        {step !== 'review' ? (
          <Button onClick={goNext} className="bg-amber-500 text-white hover:bg-amber-400">
            Next
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving || issues.length > 0} className="bg-amber-500 text-white hover:bg-amber-400">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {editingId ? 'Save changes' : isAdmin && form.isPublished ? 'Save & publish' : 'Save problem'}
          </Button>
        )}
      </div>

      {!editingId && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4 text-amber-500" />
            Tip: most great problems include a worked example, edge cases (empty, large, repeated values), and one tricky hidden case.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
