import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Code, Loader2, Plus, ExternalLink, Pause, Play, BookOpenCheck, EyeOff, Pencil, FileCode2, Link2, Pen, Users, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/dateUtils';
import { Link } from 'react-router-dom';
import { api, type Problem, type ProblemInput, type ProblemLanguage } from '@/lib/api';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { toast } from 'sonner';

interface QOTD {
  id: string;
  date: string;
  question: string;
  problemLink: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'EASY' | 'MEDIUM' | 'HARD';
  problemId?: string | null;
  problem?: Problem | null;
  isPublished?: boolean;
  publishAt?: string | null;
  publishedAt?: string | null;
  heldBy?: string | null;
  holdReason?: string | null;
}

function istTodayKey(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

const difficultyColors = {
  Easy: 'success',
  Medium: 'warning',
  Hard: 'destructive',
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'destructive',
} as const;

const blankProblem = (): ProblemInput => ({
  slug: '',
  title: '',
  body: '# Problem\n\nDescribe the challenge.',
  difficulty: 'EASY',
  tags: [],
  allowedLanguages: ['PYTHON'],
  timeLimitMs: 2000,
  defaultSubmitCap: 5,
  sampleTests: [{ id: 'sample-1', input: '', expectedOutput: '' }],
  hiddenTests: [{ id: 'hidden-1', input: '', expectedOutput: '' }],
  referenceSolution: '',
  referenceLanguage: 'PYTHON',
  isPublished: false,
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

function hasInvalidTestCase(test: { input?: string; expectedOutput?: string }) {
  const input = test.input?.trim() ?? '';
  const expectedOutput = test.expectedOutput?.trim() ?? '';
  return !expectedOutput || (!input && !expectedOutput);
}

export default function CreateQOTD() {
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [recentQOTDs, setRecentQOTDs] = useState<QOTD[]>([]);
  const [problemCatalog, setProblemCatalog] = useState<Problem[]>([]);
  const [mode, setMode] = useState<'existing' | 'inline' | 'legacy'>('existing');
  const [problemId, setProblemId] = useState('');
  const [newProblem, setNewProblem] = useState<ProblemInput>(blankProblem);
  
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    question: '',
    problemLink: '',
    difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard',
  });
  const [publishNow, setPublishNow] = useState(true);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const publishedProblems = problemCatalog;

  const loadRecentQOTDs = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // Use allSettled so a problem-catalog fetch failure doesn't silently
      // strip the inline-create dropdown when the history loaded fine (or
      // vice versa). Surface each failure as its own toast so the admin
      // knows which call broke.
      const [historyResult, problemsResult] = await Promise.allSettled([
        api.getQOTDHistory(15, undefined, { includeUnpublished: true, token }),
        api.adminGetProblems(token),
      ]);
      if (historyResult.status === 'fulfilled') {
        setRecentQOTDs(historyResult.value);
      } else {
        toast.error(historyResult.reason instanceof Error ? historyResult.reason.message : 'Failed to load QOTD history');
      }
      if (problemsResult.status === 'fulfilled') {
        setProblemCatalog(problemsResult.value.problems);
      } else {
        toast.error(problemsResult.reason instanceof Error ? problemsResult.reason.message : 'Failed to load problem catalog');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load recent QOTDs');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRecentQOTDs();
  }, [loadRecentQOTDs]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const runRowAction = async (id: string, action: () => Promise<unknown>, successMessage: string) => {
    if (!token) return;
    try {
      setRowBusy(id);
      await action();
      toast.success(successMessage);
      await loadRecentQOTDs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setRowBusy(null);
    }
  };

  const handlePublishNow = (qotd: QOTD) => runRowAction(qotd.id, () => api.publishQOTD(qotd.id, token!), 'QOTD published');
  const handleHold = (qotd: QOTD) => {
    const reason = window.prompt('Why are you holding this QOTD? (optional)') ?? undefined;
    return runRowAction(qotd.id, () => api.holdQOTD(qotd.id, reason || undefined, token!), 'QOTD held');
  };
  const handlePublishToPractice = (qotd: QOTD) =>
    runRowAction(qotd.id, () => api.publishQOTDToPractice(qotd.id, token!), 'Published to practice catalog');
  const handleUnpublishFromPractice = (qotd: QOTD) =>
    runRowAction(qotd.id, () => api.unpublishQOTDFromPractice(qotd.id, token!), 'Removed from practice catalog');
  const handleDelete = (qotd: QOTD) => {
    const dateLabel = String(qotd.date).slice(0, 10);
    if (!window.confirm(`Delete QOTD for ${dateLabel}? This removes the QOTD entry only — the underlying problem (if any) stays in the catalog. This cannot be undone.`)) return;
    return runRowAction(qotd.id, () => api.deleteQOTD(qotd.id, token!), 'QOTD deleted');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'legacy' && (!form.question.trim() || !form.problemLink.trim())) {
      toast.error('Please fill in all required legacy fields');
      return;
    }
    if (mode === 'existing' && !problemId) {
      toast.error('Please select a problem');
      return;
    }
    if (mode === 'inline' && (!newProblem.title.trim() || !newProblem.slug.trim())) {
      toast.error('Please add a title and slug for the inline problem');
      return;
    }
    if (
      mode === 'inline' &&
      [...newProblem.sampleTests, ...newProblem.hiddenTests].some(hasInvalidTestCase)
    ) {
      toast.error('Sample and hidden test expected outputs are required');
      return;
    }

    if (!token) {
      toast.error('You need to sign in to create a QOTD');
      return;
    }

    try {
      setSaving(true);
      const payload: Parameters<typeof api.createQOTD>[0] = mode === 'existing'
        ? { date: form.date, problemId, publishNow }
        : mode === 'inline'
          ? { date: form.date, newProblem, publishNow }
          : {
              date: form.date,
              question: form.question.trim(),
              problemLink: form.problemLink.trim(),
              difficulty: form.difficulty,
              publishNow,
            };
      await api.createQOTD(payload, token);

      toast.success('QOTD created successfully');
      setForm({
        date: new Date().toISOString().split('T')[0],
        question: '',
        problemLink: '',
        difficulty: 'Medium',
      });
      setProblemId('');
      setNewProblem(blankProblem());
      setShowForm(false);
      await loadRecentQOTDs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create QOTD');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2 border-amber-400/40 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <Code className="mr-1 h-3 w-3" />
            QOTD scheduler
          </Badge>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Question of the Day</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Pick the day's challenge from your judged problem catalog, write a quick one-off, or just drop in an external link.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/dashboard/problems/new">
            <Button variant="outline">
              <FileCode2 className="h-4 w-4 mr-2" />
              Create problem
            </Button>
          </Link>
          <Link to="/admin/problems">
            <Button variant="outline">
              <Code className="h-4 w-4 mr-2" />
              Manage problems
            </Button>
          </Link>
          <Button onClick={() => setShowForm(!showForm)} className="bg-amber-500 text-white hover:bg-amber-400">
            <Plus className="h-4 w-4 mr-2" />
            {showForm ? 'Close form' : 'Create QOTD'}
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-amber-600" />
                Create New QOTD
              </CardTitle>
              <CardDescription>Add a new problem for members to solve</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="qotd-date">Date *</Label>
                    <Input
                      id="qotd-date"
                      name="date"
                      type="date"
                      value={form.date}
                      onChange={(e) => {
                        handleChange(e);
                        // When user picks a future date, default to scheduled (publishNow=false)
                        setPublishNow(e.target.value <= istTodayKey());
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qotd-difficulty">Difficulty *</Label>
                    <select
                      id="qotd-difficulty"
                      name="difficulty"
                      value={form.difficulty}
                      onChange={handleChange}
                      className="w-full h-10 px-3 py-2 border border-input rounded-md bg-background text-sm"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={publishNow}
                    onChange={(e) => setPublishNow(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-amber-900">Publish immediately</span>
                    <p className="text-xs text-amber-800">
                      {publishNow
                        ? form.date > istTodayKey()
                          ? `Will go live now, but only appears as "today's QOTD" once ${form.date} arrives in IST.`
                          : 'Goes live as soon as you click create.'
                        : `Stays as a draft. Will auto-publish at midnight IST on ${form.date} unless an admin holds it.`}
                    </p>
                  </div>
                </label>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">How are you sourcing today's question?</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      { value: 'existing', label: 'Pick existing problem', description: 'Reuse a judged problem from the catalog.', icon: FileCode2 },
                      { value: 'inline', label: 'Quick inline problem', description: 'A lightweight one-shot — for richer authoring use Create Problem.', icon: Pen },
                      { value: 'legacy', label: 'External link only', description: 'Just a title and a LeetCode/HackerRank URL.', icon: Link2 },
                    ].map(({ value, label, description, icon: Icon }) => {
                      const active = mode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setMode(value as typeof mode)}
                          className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition ${active
                              ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-400/30 dark:bg-amber-500/10'
                              : 'border-border bg-card hover:border-amber-300'
                            }`}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-semibold">
                            <Icon className="h-3.5 w-3.5 text-amber-500" />
                            {label}
                          </span>
                          <span className="text-[11px] leading-snug text-muted-foreground">{description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {mode === 'existing' && (
                  <div className="space-y-2 rounded-md border border-border bg-card p-3">
                    <Label htmlFor="qotd-existing-problem">Problem *</Label>
                    {publishedProblems.length > 0 ? (
                      <select
                        id="qotd-existing-problem"
                        value={problemId}
                        onChange={(event) => setProblemId(event.target.value)}
                        className="w-full h-10 px-3 py-2 border border-input rounded-md bg-background text-sm"
                        required
                      >
                        <option value="">Select a problem…</option>
                        {publishedProblems.map((problem) => (
                          <option key={problem.id} value={problem.id}>{problem.title} ({problem.difficulty})</option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                        <p className="font-semibold">No published problems yet.</p>
                        <p className="mt-1 text-xs">
                          Author one with rich validation, then publish from the Problems page.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link to="/dashboard/problems/new" className="inline-flex h-8 items-center gap-1 rounded bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-400">
                            <Plus className="h-3 w-3" /> Create problem
                          </Link>
                          <Link to="/admin/problems" className="inline-flex h-8 items-center gap-1 rounded border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                            Open Problems admin
                          </Link>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Only published problems appear here. Publish drafts from the Problems page first.
                    </p>
                  </div>
                )}

                {mode === 'inline' && (
                  <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inline-problem-title">Problem title *</Label>
                        <Input
                          id="inline-problem-title"
                          value={newProblem.title}
                          onChange={(event) => setNewProblem((prev) => ({ ...prev, title: event.target.value, slug: prev.slug || slugify(event.target.value) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inline-problem-slug">Slug *</Label>
                        <Input
                          id="inline-problem-slug"
                          value={newProblem.slug}
                          onChange={(event) => setNewProblem((prev) => ({ ...prev, slug: slugify(event.target.value) }))}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <select value={newProblem.difficulty} onChange={(event) => setNewProblem((prev) => ({ ...prev, difficulty: event.target.value as ProblemInput['difficulty'] }))} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="EASY">Easy</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HARD">Hard</option>
                      </select>
                      <Input type="number" min={500} max={10000} value={newProblem.timeLimitMs} onChange={(event) => setNewProblem((prev) => ({ ...prev, timeLimitMs: Number(event.target.value) }))} />
                      <Input type="number" min={1} max={100} value={newProblem.defaultSubmitCap} onChange={(event) => setNewProblem((prev) => ({ ...prev, defaultSubmitCap: Number(event.target.value) }))} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['PYTHON', 'JAVASCRIPT', 'CPP', 'JAVA'] as ProblemLanguage[]).map((language) => (
                        <label key={language} className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={newProblem.allowedLanguages.includes(language)}
                            onChange={(event) => setNewProblem((prev) => ({
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
                    <textarea
                      value={newProblem.body}
                      onChange={(event) => setNewProblem((prev) => ({ ...prev, body: event.target.value }))}
                      className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <textarea
                        value={newProblem.sampleTests[0]?.input ?? ''}
                        onChange={(event) => setNewProblem((prev) => ({ ...prev, sampleTests: [{ ...(prev.sampleTests[0] ?? { id: 'sample-1', expectedOutput: '' }), input: event.target.value }] }))}
                        placeholder="Sample input"
                        className="min-h-[90px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                      />
                      <textarea
                        value={newProblem.sampleTests[0]?.expectedOutput ?? ''}
                        onChange={(event) => setNewProblem((prev) => ({ ...prev, sampleTests: [{ ...(prev.sampleTests[0] ?? { id: 'sample-1', input: '' }), expectedOutput: event.target.value }] }))}
                        placeholder="Sample expected output"
                        className="min-h-[90px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                      />
                      <textarea
                        value={newProblem.hiddenTests[0]?.input ?? ''}
                        onChange={(event) => setNewProblem((prev) => ({ ...prev, hiddenTests: [{ ...(prev.hiddenTests[0] ?? { id: 'hidden-1', expectedOutput: '' }), input: event.target.value }] }))}
                        placeholder="Hidden input"
                        className="min-h-[90px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                      />
                      <textarea
                        value={newProblem.hiddenTests[0]?.expectedOutput ?? ''}
                        onChange={(event) => setNewProblem((prev) => ({ ...prev, hiddenTests: [{ ...(prev.hiddenTests[0] ?? { id: 'hidden-1', input: '' }), expectedOutput: event.target.value }] }))}
                        placeholder="Hidden expected output"
                        className="min-h-[90px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                      />
                    </div>
                  </div>
                )}

                {mode === 'legacy' && <div className="space-y-2">
                  <Label htmlFor="qotd-problem-link">Problem Link *</Label>
                  <Input
                    id="qotd-problem-link"
                    name="problemLink"
                    type="url"
                    value={form.problemLink}
                    onChange={handleChange}
                    placeholder="https://leetcode.com/problems/..."
                    required
                  />
                </div>}

                {mode === 'legacy' && <div className="space-y-2">
                  <Label htmlFor="qotd-question">Question / Description *</Label>
                  <textarea
                    id="qotd-question"
                    name="question"
                    value={form.question}
                    onChange={handleChange}
                    placeholder="Describe the problem or add a brief summary..."
                    className="w-full min-h-[100px] px-3 py-2 border border-input rounded-md bg-background text-sm"
                    required
                  />
                </div>}

                <div className="flex gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create QOTD'
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent QOTDs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent QOTDs</CardTitle>
          <CardDescription>Previously created questions of the day</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            </div>
          ) : recentQOTDs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Code className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No QOTDs created yet.</p>
              <p className="text-sm">Create the first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentQOTDs.map((qotd, index) => {
                const today = istTodayKey();
                const qotdDateKey = String(qotd.date).slice(0, 10);
                const isPast = qotdDateKey < today;
                const isFuture = qotdDateKey > today;
                const isPublished = qotd.isPublished !== false;
                const isHeld = Boolean(qotd.heldBy);
                const problemPracticePublished = qotd.problem?.isPublished === true;
                const status = isHeld
                  ? { label: 'Held', tone: 'bg-rose-100 text-rose-800 border-rose-300' }
                  : !isPublished
                    ? { label: isFuture ? 'Scheduled' : 'Draft', tone: 'bg-gray-100 text-gray-700 border-gray-300' }
                    : isPast && problemPracticePublished
                      ? { label: 'Published · in Practice', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
                      : { label: 'Published', tone: 'bg-blue-100 text-blue-800 border-blue-300' };
                const playgroundHref = qotd.problemId ? getPlaygroundLaunchUrl(`/?qotd=${encodeURIComponent(qotdDateKey)}`) : null;
                const busy = rowBusy === qotd.id;
                return (
                  <motion.div
                    key={qotd.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.05, 0.3) }}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm text-gray-500">{formatDate(qotd.date)}</span>
                          <Badge variant={difficultyColors[qotd.difficulty]}>{qotd.difficulty}</Badge>
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>
                            {status.label}
                          </span>
                          {!qotd.problemId && (
                            <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              Legacy
                            </span>
                          )}
                        </div>
                        <p className="text-amber-900 line-clamp-1">{qotd.problem?.title ?? qotd.question}</p>
                        {isHeld && qotd.holdReason && (
                          <p className="mt-1 text-xs text-rose-700">Hold reason: {qotd.holdReason}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {playgroundHref && (
                          <a href={playgroundHref} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" disabled={busy} aria-label={`Open QOTD on ${formatDate(qotd.date)}`}>
                              <Code className="h-4 w-4 mr-1" />
                              Open
                            </Button>
                          </a>
                        )}
                        {qotd.problemId && (
                          <Link to={`/admin/problems?submissionsFor=${qotd.problemId}&contextType=QOTD&contextKey=${qotd.id}`}>
                            <Button variant="ghost" size="sm" disabled={busy} aria-label={`View submissions for QOTD on ${formatDate(qotd.date)}`}>
                              <Users className="h-4 w-4 mr-1" />
                              Submissions
                            </Button>
                          </Link>
                        )}
                        {qotd.problemId && (
                          <Link to={`/admin/problems?problemId=${qotd.problemId}`}>
                            <Button variant="ghost" size="sm" disabled={busy} aria-label="Edit underlying problem">
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit problem
                            </Button>
                          </Link>
                        )}
                        {!qotd.problemId && (
                          <a href={qotd.problemLink} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" disabled={busy} aria-label={`Open link for QOTD on ${formatDate(qotd.date)}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        {!isPublished && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void handlePublishNow(qotd)}
                            title={isFuture ? `Approves this QOTD so it goes live automatically on ${qotdDateKey} (IST).` : 'Publish so users can see it immediately.'}
                          >
                            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                            {isFuture ? `Approve for ${qotdDateKey}` : 'Publish Now'}
                          </Button>
                        )}
                        {isPublished && isFuture && (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleHold(qotd)}>
                            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Pause className="h-4 w-4 mr-1" />}
                            Hold
                          </Button>
                        )}
                        {isPast && qotd.problemId && !problemPracticePublished && (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => void handlePublishToPractice(qotd)}>
                            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <BookOpenCheck className="h-4 w-4 mr-1" />}
                            Publish to Practice
                          </Button>
                        )}
                        {isPast && qotd.problemId && problemPracticePublished && (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleUnpublishFromPractice(qotd)}>
                            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <EyeOff className="h-4 w-4 mr-1" />}
                            Remove from Practice
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleDelete(qotd)}
                          className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          aria-label={`Delete QOTD for ${qotdDateKey}`}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
