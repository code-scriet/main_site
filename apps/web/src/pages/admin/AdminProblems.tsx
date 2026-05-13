import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, FileJson, FileSpreadsheet, Loader2, PlayCircle, Plus, RefreshCcw, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, type Problem, type ProblemContextType, type ProblemInput, type ProblemLanguage, type ProblemSubmission, type ProblemTestCase, type SubmissionVerdict } from '@/lib/api';
import { Markdown } from '@/components/ui/markdown';
import { Button } from '@/components/ui/button';
import { PendingCapRequestsTray } from '@/components/problems/PendingCapRequestsTray';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

// ─── Bulk import helpers ────────────────────────────────────────────────
// CSV columns (header required, case-sensitive):
//   title,slug?,difficulty,tags?,allowedLanguages,timeLimitMs?,defaultSubmitCap?,body,sampleTests,hiddenTests,referenceSolution?,referenceLanguage?,isPublished?
// `sampleTests` and `hiddenTests` are JSON-encoded arrays of {id,input,expectedOutput,label?}.
// `tags` and `allowedLanguages` are pipe-delimited ("arrays|hashing", "PYTHON|JAVASCRIPT").

type BulkRowResult = { input: ProblemInput; warnings: string[] } | { error: string; row?: number };

function parseCsvLine(line: string): string[] {
  // RFC4180-lite parser: quoted fields with double-quote escaping, commas as separator.
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '"' && cell.length === 0) {
      quoted = true;
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function splitCsvRows(text: string): string[] {
  // Split on newlines while respecting quoted fields containing newlines.
  const rows: string[] = [];
  let buffer = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        buffer += '""';
        i++;
      } else {
        quoted = !quoted;
        buffer += ch;
      }
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (buffer.trim().length > 0) rows.push(buffer);
      buffer = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      buffer += ch;
    }
  }
  if (buffer.trim().length > 0) rows.push(buffer);
  return rows;
}

function coerceTests(value: unknown, prefix: string): ProblemTestCase[] {
  if (!Array.isArray(value)) return [];
  const result: ProblemTestCase[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const test = raw as Record<string, unknown>;
    result.push({
      id: typeof test.id === 'string' && test.id.trim() ? test.id.trim() : `${prefix}-${index + 1}`,
      input: typeof test.input === 'string' ? test.input : '',
      expectedOutput: typeof test.expectedOutput === 'string' ? test.expectedOutput : '',
      label: typeof test.label === 'string' ? test.label : undefined,
    });
  });
  return result;
}

function normalizeProblemPayload(raw: unknown, rowNumber: number): BulkRowResult {
  if (!raw || typeof raw !== 'object') {
    return { error: 'Row is not an object', row: rowNumber };
  }
  const value = raw as Record<string, unknown>;
  const warnings: string[] = [];
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) return { error: 'Missing title', row: rowNumber };

  const slug = typeof value.slug === 'string' && value.slug.trim() ? slugify(value.slug) : slugify(title);
  if (!slug) return { error: 'Could not derive a slug', row: rowNumber };

  const difficulty = String(value.difficulty ?? '').toUpperCase();
  if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
    return { error: `Invalid difficulty "${value.difficulty ?? ''}" — use EASY, MEDIUM, or HARD`, row: rowNumber };
  }

  const allowedLanguages = Array.isArray(value.allowedLanguages)
    ? value.allowedLanguages
    : typeof value.allowedLanguages === 'string'
      ? value.allowedLanguages.split('|').map((entry) => entry.trim()).filter(Boolean)
      : [];
  const languages = allowedLanguages
    .map((entry) => String(entry).toUpperCase())
    .filter((entry): entry is ProblemLanguage => LANGUAGES.includes(entry as ProblemLanguage));
  if (languages.length === 0) return { error: 'No valid allowedLanguages', row: rowNumber };

  const tags = Array.isArray(value.tags)
    ? value.tags
    : typeof value.tags === 'string'
      ? value.tags.split('|').map((entry) => entry.trim()).filter(Boolean)
      : [];

  const body = typeof value.body === 'string' ? value.body : '';
  if (body.trim().length < 10) warnings.push('Problem body is very short');

  const sampleTests = coerceTests(value.sampleTests, 'sample');
  const hiddenTests = coerceTests(value.hiddenTests, 'hidden');
  if (sampleTests.length === 0) return { error: 'sampleTests array missing or empty', row: rowNumber };
  if (hiddenTests.length === 0) return { error: 'hiddenTests array missing or empty', row: rowNumber };

  const timeLimitMs = Number(value.timeLimitMs);
  const defaultSubmitCap = Number(value.defaultSubmitCap);
  const referenceLanguage = typeof value.referenceLanguage === 'string'
    ? value.referenceLanguage.toUpperCase()
    : undefined;
  const referenceLanguageSafe = (LANGUAGES as readonly string[]).includes(referenceLanguage ?? '')
    ? (referenceLanguage as ProblemLanguage)
    : languages[0];

  const input: ProblemInput = {
    slug,
    title,
    body: body || `# ${title}\n\n_No description provided._`,
    difficulty: difficulty as ProblemInput['difficulty'],
    tags: tags.map((entry) => String(entry).trim()).filter(Boolean),
    allowedLanguages: languages,
    timeLimitMs: Number.isFinite(timeLimitMs) && timeLimitMs >= 500 ? Math.min(10_000, Math.floor(timeLimitMs)) : 2000,
    defaultSubmitCap: Number.isFinite(defaultSubmitCap) && defaultSubmitCap >= 1 ? Math.min(100, Math.floor(defaultSubmitCap)) : 5,
    sampleTests,
    hiddenTests,
    referenceSolution: typeof value.referenceSolution === 'string' ? value.referenceSolution : '',
    referenceLanguage: referenceLanguageSafe,
    isPublished: Boolean(value.isPublished) && String(value.isPublished).toLowerCase() !== 'false',
  };

  return { input, warnings };
}

function parseCsvText(text: string): BulkRowResult[] {
  const rows = splitCsvRows(text);
  if (rows.length === 0) return [{ error: 'CSV is empty' }];
  const header = parseCsvLine(rows[0]).map((cell) => cell.trim());
  return rows.slice(1).map((row, index) => {
    const cells = parseCsvLine(row);
    const payload: Record<string, unknown> = {};
    header.forEach((column, columnIndex) => {
      const raw = cells[columnIndex];
      if (raw === undefined || raw === '') return;
      if (column === 'sampleTests' || column === 'hiddenTests') {
        try {
          payload[column] = JSON.parse(raw);
        } catch {
          payload[column] = undefined;
        }
      } else if (column === 'tags' || column === 'allowedLanguages') {
        payload[column] = raw.split('|').map((entry) => entry.trim()).filter(Boolean);
      } else {
        payload[column] = raw;
      }
    });
    return normalizeProblemPayload(payload, index + 2);
  });
}

function parseJsonText(text: string): BulkRowResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return [{ error: `Invalid JSON: ${err instanceof Error ? err.message : 'parse failed'}` }];
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { problems?: unknown })?.problems) ? (parsed as { problems: unknown[] }).problems : [];
  if (list.length === 0) return [{ error: 'JSON must be an array of problems (or { "problems": [...] })' }];
  return list.map((item, index) => normalizeProblemPayload(item, index + 1));
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

function BulkImportCard({ token, onImported }: { token: string; onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<BulkRowResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ created: number; failed: number } | null>(null);

  const validCount = parsed.filter((row) => 'input' in row).length;
  const errorCount = parsed.length - validCount;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
    const isJson = file.name.toLowerCase().endsWith('.json') || file.type.includes('json');
    if (!isCsv && !isJson) {
      toast.error('Pick a .csv or .json file');
      event.target.value = '';
      return;
    }
    const rows = isCsv ? parseCsvText(text) : parseJsonText(text);
    setParsed(rows);
    setSummary(null);
    event.target.value = '';
    if (rows.length === 0) toast.error('No rows found in the file');
    else {
      const ok = rows.filter((row) => 'input' in row).length;
      const bad = rows.length - ok;
      toast.success(`Parsed ${rows.length} row${rows.length === 1 ? '' : 's'} — ${ok} ready, ${bad} need fixing`);
    }
  };

  const handleImport = async () => {
    if (validCount === 0) {
      toast.error('No valid rows to import');
      return;
    }
    setBusy(true);
    let created = 0;
    let failed = 0;
    for (const row of parsed) {
      if (!('input' in row)) continue;
      try {
        await api.createProblem(row.input, token);
        created += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.warn('[bulk-import] failed row', row.input.slug, err);
      }
    }
    setBusy(false);
    setSummary({ created, failed });
    if (created > 0) toast.success(`Created ${created} problem${created === 1 ? '' : 's'}${failed > 0 ? ` (${failed} failed)` : ''}`);
    else toast.error(`All ${failed} rows failed — check warnings`);
    if (created > 0) onImported();
  };

  const handleDownloadTemplate = () => {
    const sample = [
      ['title', 'slug', 'difficulty', 'tags', 'allowedLanguages', 'timeLimitMs', 'defaultSubmitCap', 'body', 'sampleTests', 'hiddenTests', 'referenceSolution', 'referenceLanguage', 'isPublished'].join(','),
      [
        '"Two Sum"',
        'two-sum',
        'EASY',
        'arrays|hashing',
        'PYTHON|JAVASCRIPT',
        '2000',
        '5',
        '"## Two Sum\n\nReturn indices…"',
        '"[{""id"":""s1"",""input"":""4 5\\n2 7 11 15\\n9"",""expectedOutput"":""0 1""}]"',
        '"[{""id"":""h1"",""input"":""..."",""expectedOutput"":""...""}]"',
        '',
        'PYTHON',
        'false',
      ].join(','),
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'problems-template.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Upload className="h-4 w-4 text-amber-500" />
            Bulk import problems
          </h2>
          <p className="text-sm text-muted-foreground">Upload a JSON array or CSV with one problem per row. Inputs are validated locally first.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-8 gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV template
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,application/json,text/csv"
            onChange={handleFile}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} size="sm" className="h-8 gap-1.5 bg-amber-500 text-white hover:bg-amber-400">
            <Upload className="h-3.5 w-3.5" />
            Choose file
          </Button>
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <FileJson className="h-3 w-3" /> {validCount} ready
            </span>
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {errorCount} need fixing
              </span>
            )}
          </div>

          <div className="max-h-48 overflow-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Title / slug</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.map((row, index) => (
                  <tr key={`row-${index}`}>
                    <td className="px-3 py-1.5 font-mono">{('row' in row && row.row) || index + 1}</td>
                    <td className="px-3 py-1.5">
                      {'input' in row ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">ready</span>
                      ) : (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">error</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-foreground">
                      {'input' in row ? (
                        <div>
                          <p className="font-semibold">{row.input.title}</p>
                          <p className="text-[11px] text-muted-foreground">/{row.input.slug}</p>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {'error' in row ? row.error : row.warnings.length ? row.warnings.join('; ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleImport} disabled={busy || validCount === 0} className="h-9 bg-amber-500 text-white hover:bg-amber-400">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Import {validCount} problem{validCount === 1 ? '' : 's'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setParsed([]); setSummary(null); }} className="h-9">
              Clear
            </Button>
            {summary && (
              <span className="text-xs text-muted-foreground">
                Last run: {summary.created} created, {summary.failed} failed.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
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
            <button type="button" title="Delete case" aria-label={`Delete ${title} case ${index + 1}`} onClick={() => onChange(cases.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-2 text-red-600 hover:bg-red-50">
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

function SubmissionRows({
  problem,
  token,
  contextType,
  contextKey,
  onClearFilter,
}: {
  problem: Problem;
  token: string;
  contextType?: ProblemContextType;
  contextKey?: string;
  onClearFilter?: () => void;
}) {
  const queryClient = useQueryClient();
  const hasFilter = Boolean(contextType && contextKey);
  const submissionsQuery = useQuery({
    queryKey: ['admin-problem-submissions', problem.id, contextType ?? null, contextKey ?? null],
    queryFn: () =>
      api.adminGetProblemSubmissions(
        problem.id,
        { limit: hasFilter ? 500 : 50, contextType, contextKey },
        token,
      ),
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
    <div className="space-y-2">
      {hasFilter && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            Filtering: <strong>{contextType}</strong>
            {contextKey ? <> · key <strong>{contextKey}</strong></> : null}
            {' · '}showing up to 500 submissions
          </span>
          {onClearFilter && (
            <button type="button" onClick={onClearFilter} className="font-semibold text-amber-800 hover:underline">
              Clear filter
            </button>
          )}
        </div>
      )}
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
  const [deleteTarget, setDeleteTarget] = useState<Problem | null>(null);

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
      setDeleteTarget(null);
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

  // Deep-link support: ?submissionsFor=<id>&contextType=<X>&contextKey=<Y>
  // auto-expands that problem's submissions panel with the context filter.
  const submissionsFor = searchParams.get('submissionsFor');
  const submissionsContextType = searchParams.get('contextType') as ProblemContextType | null;
  const submissionsContextKey = searchParams.get('contextKey');
  useEffect(() => {
    if (submissionsFor) setExpandedSubmissions(submissionsFor);
  }, [submissionsFor]);
  const clearSubmissionsFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('submissionsFor');
    next.delete('contextType');
    next.delete('contextKey');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
            <p className="text-xs text-gray-500">
              Unpublished problems will not appear in QOTD or competition pickers.
            </p>
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

      {token && (
        <BulkImportCard
          token={token}
          onImported={() => queryClient.invalidateQueries({ queryKey: ['admin-problems'] })}
        />
      )}

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
                      <button type="button" aria-label={`Edit ${problem.title}`} onClick={() => void editProblem(problem)} className="rounded p-2 text-blue-700 hover:bg-blue-50"><Edit3 className="h-4 w-4" /></button>
                      <button type="button" aria-label={`View submissions for ${problem.title}`} onClick={() => setExpandedSubmissions(expandedSubmissions === problem.id ? null : problem.id)} className="rounded p-2 text-gray-700 hover:bg-gray-50"><RefreshCcw className="h-4 w-4" /></button>
                      <button type="button" aria-label={`Delete ${problem.title}`} onClick={() => setDeleteTarget(problem)} className="rounded p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
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
            <SubmissionRows
              problem={problems.find((problem) => problem.id === expandedSubmissions)!}
              token={token}
              contextType={submissionsFor === expandedSubmissions && submissionsContextType ? submissionsContextType : undefined}
              contextKey={submissionsFor === expandedSubmissions && submissionsContextKey ? submissionsContextKey : undefined}
              onClearFilter={submissionsFor === expandedSubmissions ? clearSubmissionsFilter : undefined}
            />
          </div>
        )}
      </section>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete problem?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will delete "${deleteTarget.title}". This will also break any active QOTD or competition using this problem.`
                : 'This will delete the selected problem.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Problem'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
