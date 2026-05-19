// BulkImportCard — restored from HEAD AdminProblems.tsx during the v2 sweep recovery.
// Drag-drop CSV or JSON, validate each row, preview with per-row errors, then commit.
// Re-tones the HEAD card chrome to v2 tokens (DSCard, var(--*)).

import { useRef, useState, type ChangeEvent } from 'react';
import { FileJson, FileSpreadsheet, Upload, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DSCard, Pill } from '@/components/dash';
import { api, type ProblemInput, type ProblemLanguage, type ProblemTestCase } from '@/lib/api';

const LANGUAGES: ProblemLanguage[] = ['PYTHON', 'JAVASCRIPT', 'CPP', 'JAVA'];

type BulkRowResult =
  | { input: ProblemInput; warnings: string[]; row?: number }
  | { error: string; row?: number };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; }
      else { cell += ch; }
    } else if (ch === ',') { cells.push(cell); cell = ''; }
    else if (ch === '"' && cell.length === 0) { quoted = true; }
    else { cell += ch; }
  }
  cells.push(cell);
  return cells;
}

function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let buffer = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { buffer += '""'; i++; }
      else { quoted = !quoted; buffer += ch; }
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (buffer.trim().length > 0) rows.push(buffer);
      buffer = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else { buffer += ch; }
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
  if (!raw || typeof raw !== 'object') return { error: 'Row is not an object', row: rowNumber };
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
  const referenceLanguage = typeof value.referenceLanguage === 'string' ? value.referenceLanguage.toUpperCase() : undefined;
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
  return { input, warnings, row: rowNumber };
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
        try { payload[column] = JSON.parse(raw); } catch { payload[column] = undefined; }
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
  try { parsed = JSON.parse(text); }
  catch (err) {
    return [{ error: `Invalid JSON: ${err instanceof Error ? err.message : 'parse failed'}` }];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { problems?: unknown })?.problems)
      ? (parsed as { problems: unknown[] }).problems
      : [];
  if (list.length === 0) return [{ error: 'JSON must be an array of problems (or { "problems": [...] })' }];
  return list.map((item, index) => normalizeProblemPayload(item, index + 1));
}

export function BulkImportCard({ token, onImported }: { token: string; onImported: () => void }) {
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
    if (validCount === 0) { toast.error('No valid rows to import'); return; }
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
        // Only log to console in dev; in prod we surface the count via the summary toast.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[bulk-import] failed row', row.input.slug, err);
        }
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
    <DSCard padded>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ds-text-1)]">
            <Upload className="h-4 w-4 text-[var(--accent)]" />
            Bulk import problems
          </h2>
          <p className="text-[12.5px] text-[var(--ds-text-3)] mt-0.5">Upload a JSON array or CSV with one problem per row. Inputs are validated locally first.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-8 gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV template
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,.json,application/json,text/csv" onChange={handleFile} className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()} size="sm" className="h-8 gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Choose file
          </Button>
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Pill tone="success" size="xs">
              <FileJson className="h-3 w-3 mr-1" /> {validCount} ready
            </Pill>
            {errorCount > 0 && (
              <Pill tone="danger" size="xs">{errorCount} need fixing</Pill>
            )}
          </div>

          <div className="max-h-56 overflow-auto rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="text-[10px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold bg-[var(--surface-soft)] sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-[50px]">Row</th>
                  <th className="px-3 py-2 w-[80px]">Status</th>
                  <th className="px-3 py-2">Title / slug</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {parsed.map((row, index) => (
                  <tr key={`row-${index}`}>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--ds-text-3)]">{('row' in row && row.row) || index + 1}</td>
                    <td className="px-3 py-1.5">
                      {'input' in row
                        ? <Pill tone="success" size="xs">ready</Pill>
                        : <Pill tone="danger" size="xs">error</Pill>}
                    </td>
                    <td className="px-3 py-1.5">
                      {'input' in row ? (
                        <div>
                          <div className="text-[12.5px] font-medium text-[var(--ds-text-1)]">{row.input.title}</div>
                          <div className="text-[11px] text-[var(--ds-text-3)] font-mono">/{row.input.slug}</div>
                        </div>
                      ) : (
                        <span className="text-[var(--ds-text-3)] italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[12px]">
                      {'error' in row ? (
                        <span className="inline-flex items-start gap-1 text-[var(--danger)]">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          {row.error}
                        </span>
                      ) : row.warnings.length > 0 ? (
                        <span className="text-[var(--warning)]">{row.warnings.join('; ')}</span>
                      ) : (
                        <span className="text-[var(--ds-text-3)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11.5px] text-[var(--ds-text-3)]">
              {summary
                ? `Last run: ${summary.created} created, ${summary.failed} failed.`
                : `Click Import to create ${validCount} problem${validCount === 1 ? '' : 's'}.`}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setParsed([]); setSummary(null); }}>Clear</Button>
              <Button size="sm" onClick={handleImport} disabled={busy || validCount === 0}>
                {busy ? 'Importing…' : `Import ${validCount}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DSCard>
  );
}
