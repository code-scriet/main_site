/**
 * CodeBox-backed execution for the OPPE site.
 *
 * Practice runs for compiled languages (Java / C / C++) have no browser
 * runtime, so they go to the club execution service — the same
 * execute-server that powers the playground (`POST /api/execute`), which
 * fans out to the self-hosted CodeBox (Judge0-compatible) with the
 * Cloudflare Worker chain as backstop.
 *
 * This endpoint allows anonymous callers under a per-IP quota, so OPPE
 * practice works with zero login — matching the Python path, which runs
 * fully client-side via @codescriet/judge-browser.
 */

import { normalizeOutput } from '@codescriet/problem-schema/normalize';

function stripTrailing(value: string | undefined, suffix: string): string {
  const v = (value || '').trim();
  if (suffix && v.toLowerCase().endsWith(suffix.toLowerCase())) {
    return v.slice(0, -suffix.length).replace(/\/+$/, '');
  }
  return v.replace(/\/+$/, '');
}

function execBase(): string {
  const configured = import.meta.env.VITE_OPPE_EXEC_URL as string | undefined;
  if (configured && configured.trim()) return stripTrailing(configured, '');
  if (import.meta.env.DEV) return 'http://localhost:5002';
  return 'https://playground-api.codescriet.dev';
}

/** OPPE bank language → execute-server language id. */
const OPPE_TO_EXEC: Record<string, string> = {
  JAVA: 'java',
  C: 'c',
  CPP: 'cpp',
  PYTHON: 'python',
  JAVASCRIPT: 'javascript',
};

export function execLanguageFor(oppeLanguage: string): string | null {
  return OPPE_TO_EXEC[oppeLanguage] || null;
}

export function isExecSupported(oppeLanguage: string): boolean {
  return execLanguageFor(oppeLanguage) !== null;
}

export interface ExecTestCase {
  id: string;
  input: string;
  expectedOutput: string;
}

export interface ExecVerdict {
  testId: string;
  passed: boolean;
  actualOutput?: string;
  runtimeMs?: number;
  error?: string;
  engine: 'cloud';
}

interface ExecuteResponse {
  success?: boolean;
  error?: string;
  data?: {
    run?: { stdout?: string; stderr?: string; code?: number };
    compile?: { stderr?: string; code?: number };
    provider?: string;
  };
  meta?: { durationMs?: number };
}

async function runOnce(
  execLanguage: string,
  code: string,
  stdin: string,
  signal?: AbortSignal,
): Promise<{ output: string; runtimeMs?: number; error?: string }> {
  // Java filenames are fixed by the backend (main.java/prog.java), so a
  // `public class Main` never compiles there. The playground uses the same
  // convention (package-private `class Main` starter): drop the `public`
  // modifier from top-level class declarations before submitting.
  // Semantically a no-op for stdin/stdout programs.
  const payload =
    execLanguage === 'java' ? code.replace(/^\s*public\s+class\s+/gm, 'class ') : code;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(`${execBase()}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ language: execLanguage, code: payload, stdin: stdin || '' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error(
          `Execution service returned a page instead of JSON — is it running at ${execBase()}?`,
        );
      }
      let message = `Execution service error (HTTP ${res.status})`;
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep default
      }
      throw new Error(message);
    }
    const json = (await res.json()) as ExecuteResponse;
    if (!json.success || !json.data) {
      throw new Error(json.error || 'Execution failed');
    }
    const compileErr = (json.data.compile?.stderr || '').trim();
    if (compileErr && (json.data.compile?.code || 0) !== 0) {
      return { output: '', runtimeMs: json.meta?.durationMs, error: compileErr };
    }
    const stdout = json.data.run?.stdout || '';
    const stderr = (json.data.run?.stderr || '').trim();
    const exitCode = json.data.run?.code ?? 0;
    if (exitCode !== 0 && !stdout) {
      return {
        output: '',
        runtimeMs: json.meta?.durationMs,
        error: stderr || `Runtime error (exit ${exitCode})`,
      };
    }
    // Non-zero exit WITH stdout (e.g. warnings on stderr): grade the stdout,
    // surface stderr as context on failure.
    return {
      output: stdout,
      runtimeMs: json.meta?.durationMs,
      error: exitCode !== 0 && stderr ? stderr : undefined,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Execution timed out (20s limit) — infinite loop?', { cause: e });
    }
    if (e instanceof TypeError) {
      throw new Error(`Cannot reach the execution service at ${execBase()}.`, { cause: e });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Grade a list of tests by running the code once per test stdin and
 * comparing normalised stdout — the same normalisation the server judge
 * uses (@codescriet/problem-schema).
 */
export async function gradeViaExec(
  oppeLanguage: string,
  code: string,
  tests: ExecTestCase[],
  options?: { onStatus?: (message: string) => void; signal?: AbortSignal },
): Promise<ExecVerdict[]> {
  const execLanguage = execLanguageFor(oppeLanguage);
  if (!execLanguage) {
    throw new Error(`${oppeLanguage} cannot run here yet — only Java, C, C++, Python and JavaScript are supported.`);
  }
  const verdicts: ExecVerdict[] = [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    options?.onStatus?.(`Running test ${i + 1}/${tests.length}…`);
    try {
      const result = await runOnce(execLanguage, code, t.input, options?.signal);
      if (result.error && !result.output) {
        verdicts.push({
          testId: t.id,
          passed: false,
          runtimeMs: result.runtimeMs,
          error: result.error,
          engine: 'cloud',
        });
        continue;
      }
      const passed = normalizeOutput(result.output) === normalizeOutput(t.expectedOutput);
      verdicts.push({
        testId: t.id,
        passed,
        actualOutput: passed ? undefined : result.output,
        runtimeMs: result.runtimeMs,
        error: passed ? result.error : result.error || undefined,
        engine: 'cloud',
      });
    } catch (e) {
      verdicts.push({
        testId: t.id,
        passed: false,
        error: e instanceof Error ? e.message : 'Execution failed',
        engine: 'cloud',
      });
      // A connectivity/timeout failure will hit every remaining test the
      // same way — stop early instead of burning quota.
      if (e instanceof Error && /Cannot reach|timed out|returned a page/.test(e.message)) {
        for (let j = i + 1; j < tests.length; j++) {
          verdicts.push({
            testId: tests[j].id,
            passed: false,
            error: 'Skipped — execution service unreachable.',
            engine: 'cloud',
          });
        }
        break;
      }
    }
  }
  return verdicts;
}
