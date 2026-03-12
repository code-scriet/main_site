// ---------------------------------------------------------------------------
// Execution Router — The single entry point for running code
// ---------------------------------------------------------------------------
//
// Architecture:
//
//   Tier 1 — Client-side (no network):
//     • JavaScript  → Web Worker sandbox (jsEngine)
//     • TypeScript  → Browser tsc transpile + Web Worker (tsEngine)
//     • Python      → Pyodide WASM in Worker (pyodideEngine)
//     • HTML/CSS/JS → Sandboxed iframe (htmlEngine, rendered by UI)
//
//   Tier 2 — Cloud (via Cloudflare Worker proxy):
//     • All above languages + C, C++, Java
//     • Proxied through execute-server.js → CF Worker → upstream compiler
//
// Flow:
//   1. Check execution mode (auto | client | cloud)
//   2. If 'auto' — detect device capabilities
//   3. If client-side is supported for this language AND device is capable:
//      a. Try Tier 1
//      b. On failure → fallback to Tier 2
//   4. Otherwise → go directly to Tier 2
//
// ---------------------------------------------------------------------------

import type { ExecutionResult, ExecutionMode, ExecutionTier } from './types';
import { CLIENT_SUPPORTED_LANGUAGES, CLOUD_SUPPORTED_LANGUAGES } from './types';
import { isLowEndDevice, supportsWebWorkers } from './deviceDetection';
import { executeJavaScript, type InteractiveCallbacks } from './jsEngine';
import { executeTypeScript } from './tsEngine';
import { executePython, isPyodideReady, type StatusCallback } from './pyodideEngine';
import { isTypeScriptReady } from './tsEngine';
import { executeHtml } from './htmlEngine';
import { executeViaCloud } from './wandboxClient'; // file kept for compat, calls our backend

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * If client-side execution takes longer than this, abort it and fall back to
 * cloud execution. Applies to Python, JS, and TS in 'auto' mode.
 *
 * Uses a map so Python gets a longer cold-start budget (Pyodide ~15 MB
 * WASM download on first run) while JS/TS still fall back quickly.
 */
const CLIENT_TIMEOUT_DEFAULT_MS = 4_000;
const CLIENT_TIMEOUT_BY_LANG: Record<string, number> = {
  python: 15_000, // Pyodide needs time to download+init (~3-8s first time)
};

function getClientTimeout(language: string): number {
  return CLIENT_TIMEOUT_BY_LANG[language] ?? CLIENT_TIMEOUT_DEFAULT_MS;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExecuteOptions {
  language: string;
  code: string;
  stdin?: string;
  /** Execution mode — defaults to 'auto' */
  mode?: ExecutionMode;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Callback for status messages (e.g. "Loading Python runtime...") */
  onStatus?: StatusCallback;
  /** Callbacks for interactive input and streaming output */
  interactive?: InteractiveCallbacks;
}

export interface ExecuteResult extends ExecutionResult {
  /** Which tier actually ran the code */
  tier: ExecutionTier;
  /** If Tier 1 failed and we fell back to Tier 2 */
  fellBack?: boolean;
  /** Why fallback happened */
  fallbackReason?: string;
}

/**
 * Execute code using the optimal strategy for the given language and device.
 */
export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
  const { language, code, stdin, mode = 'auto', signal, onStatus, interactive } = options;

  // --- Determine which tier to use ---
  const tier = resolveTier(language, mode);

  if (tier === 'client') {
    try {
      let result: ExecutionResult;

      if (mode === 'client' || !CLOUD_SUPPORTED_LANGUAGES.has(language)) {
        // Explicit client mode or no cloud fallback available — run without timeout
        result = await executeClientSide(language, code, stdin, signal, onStatus, interactive);
      } else {
        // Auto mode — if the engine is already warm, run directly (no timeout
        // race). This avoids the 4s cloud-fallback penalty on repeat runs.
        const engineWarm =
          (language === 'javascript') ||
          (language === 'python' && isPyodideReady()) ||
          (language === 'typescript' && isTypeScriptReady());

        if (engineWarm) {
          result = await executeClientSide(language, code, stdin, signal, onStatus, interactive);
        } else {
          // Engine cold — race client execution against a timeout.
          // If client takes too long, abort local and fall back to cloud.
          const localAbort = new AbortController();
          let timeoutId: ReturnType<typeof setTimeout> | null = null;

          const onParentAbort = () => localAbort.abort();
          if (signal) {
            if (signal.aborted) {
              localAbort.abort();
            } else {
              signal.addEventListener('abort', onParentAbort, { once: true });
            }
          }

          try {
            const timeout = getClientTimeout(language);
            result = await Promise.race([
              executeClientSide(language, code, stdin, localAbort.signal, onStatus, interactive),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                  localAbort.abort();
                  reject(new Error('__CLIENT_TIMEOUT__'));
                }, timeout);
              }),
            ]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
            if (signal) signal.removeEventListener('abort', onParentAbort);
          }
        }
      }

      return { ...result, tier: 'client', fellBack: false };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Client execution failed';

      // If user explicitly chose client and it failed, don't fallback
      if (mode === 'client') {
        throw err;
      }

      // Auto mode — fallback to cloud (including timeout fallback)
      const isTimeout = errorMsg === '__CLIENT_TIMEOUT__';
      const fallbackReason = isTimeout
        ? `Client-side took too long, falling back to cloud`
        : errorMsg;
      console.warn(`[ExecutionRouter] ${fallbackReason}`);

      if (CLOUD_SUPPORTED_LANGUAGES.has(language)) {
        onStatus?.(isTimeout ? 'Taking too long locally, running on cloud...' : 'Client-side failed, running on cloud...');
        const cloudResult = await executeViaCloud({ language, code, stdin }, signal);
        return {
          ...cloudResult,
          tier: 'cloud',
          fellBack: true,
          fallbackReason,
        };
      }

      // No cloud support either — re-throw
      throw err;
    }
  }

  // --- Cloud execution ---
  if (!CLOUD_SUPPORTED_LANGUAGES.has(language)) {
    throw new Error(
      `Language '${language}' is not supported for cloud execution. ` +
      `Supported: ${[...CLOUD_SUPPORTED_LANGUAGES].join(', ')}`
    );
  }

  onStatus?.('Running on cloud...');
  const cloudResult = await executeViaCloud({ language, code, stdin }, signal);
  return { ...cloudResult, tier: 'cloud', fellBack: false };
}

// ---------------------------------------------------------------------------
// Tier Resolution
// ---------------------------------------------------------------------------

function resolveTier(language: string, mode: ExecutionMode): ExecutionTier {
  // Forced modes
  if (mode === 'client') return 'client';
  if (mode === 'cloud') return 'cloud';

  // HTML/CSS/JS is always client-side (it's just an iframe)
  if (language === 'web') return 'client';

  // Auto mode — check device & language support
  if (!CLIENT_SUPPORTED_LANGUAGES.has(language)) {
    return 'cloud'; // C, C++, Java → always cloud
  }

  if (!supportsWebWorkers()) {
    return 'cloud'; // No Workers → can't run client-side
  }

  // For JS, always prefer client (lightweight Worker, no heavy downloads)
  if (language === 'javascript') {
    return 'client';
  }

  // For Python/TypeScript — check device capability
  // These need to download large runtimes (Pyodide ~15MB, TSC ~3MB)
  if (isLowEndDevice()) {
    return 'cloud';
  }

  return 'client';
}

// ---------------------------------------------------------------------------
// Client-Side Dispatch
// ---------------------------------------------------------------------------

async function executeClientSide(
  language: string,
  code: string,
  stdin?: string,
  signal?: AbortSignal,
  onStatus?: StatusCallback,
  interactive?: InteractiveCallbacks,
): Promise<ExecutionResult> {
  switch (language) {
    case 'javascript':
      return executeJavaScript(code, stdin, signal, interactive);

    case 'typescript':
      onStatus?.('Transpiling TypeScript...');
      return executeTypeScript(code, stdin, signal, interactive);

    case 'python':
      return executePython(code, stdin, signal, onStatus, interactive);

    case 'web':
      return executeHtml(code, stdin, signal);

    default:
      throw new Error(`No client-side engine for language: ${language}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers — re-exported for convenience
// ---------------------------------------------------------------------------

export { isLowEndDevice, getDeviceInfo } from './deviceDetection';
export type { ExecutionResult, ExecutionMode, ExecutionTier } from './types';

/**
 * Format execution output for display.
 *
 * Key logic:
 * - If stdout has content, the program ran — show output even if stderr exists
 * - stderr from compiled languages often contains warnings, not errors
 * - Only treat as error if: compile error with no output, OR no output at all with stderr
 */
export function formatOutput(result: ExecutionResult): {
  output: string;
  error: string;
  exitCode: number;
  hasError: boolean;
  warning: string;
} {
  const output = result.run.stdout || '';
  const stderr = result.run.stderr || '';
  const compileError = result.compile?.stderr || '';
  const exitCode = result.run.code;

  const withLocationHeader = (text: string) => {
    if (!text) return text;
    const location = extractLocation(text);
    if (!location) return text;
    if (/^Location:\s+/im.test(text)) return text;
    return `Location: ${location}\n${text}`;
  };

  // Compilation error with no output = real error
  if (compileError && !output) {
    return { output: '', error: withLocationHeader(compileError), exitCode, hasError: true, warning: '' };
  }

  // Program produced output — it ran successfully
  if (output) {
    // stderr alongside output is a warning (e.g. compiler warnings, runtime logs)
    const warning = stderr || (compileError && exitCode === 0 ? compileError : '');
    // Only mark as error if exit code is non-zero AND there's stderr
    const hasError = exitCode !== 0 && !!stderr;
    return {
      output,
      error: hasError ? withLocationHeader(stderr) : '',
      exitCode,
      hasError,
      warning: withLocationHeader(warning),
    };
  }

  // No output — check if there's an error
  if (stderr) {
    return { output: '', error: withLocationHeader(stderr), exitCode, hasError: true, warning: '' };
  }

  // No output, no error — program ran with empty output
  return { output: '', error: '', exitCode, hasError: false, warning: '' };
}

function extractLocation(text: string): string | null {
  // Python traceback style: File "main.py", line 7
  const pythonMatch = text.match(/File\s+"[^"]+",\s*line\s+(\d+)/i);
  if (pythonMatch) return `line ${pythonMatch[1]}`;

  // TypeScript diagnostics style: TS1005: (3:14)
  const tsParenMatch = text.match(/\((\d+):(\d+)\)/);
  if (tsParenMatch) return `line ${tsParenMatch[1]}, column ${tsParenMatch[2]}`;

  // GCC/Clang/Java/JS stack style: file:line:column
  const fileLineColMatch = text.match(/(?:^|\s)(?:[A-Za-z0-9_./\\-]+):(\d+):(\d+)(?:\b|\))/m);
  if (fileLineColMatch) return `line ${fileLineColMatch[1]}, column ${fileLineColMatch[2]}`;

  // Generic "line N"
  const genericLineMatch = text.match(/\bline\s+(\d+)\b/i);
  if (genericLineMatch) return `line ${genericLineMatch[1]}`;

  return null;
}

/**
 * Calculate execution time string
 */
export function calculateExecutionTime(startTime: number, endTime: number): string {
  const duration = endTime - startTime;
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(2)}s`;
}
