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
import { executeJavaScript } from './jsEngine';
import { executeTypeScript } from './tsEngine';
import { executePython, type StatusCallback } from './pyodideEngine';
import { executeHtml } from './htmlEngine';
import { executeViaCloud } from './wandboxClient'; // file kept for compat, calls our backend

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
  const { language, code, stdin, mode = 'auto', signal, onStatus } = options;

  // --- Determine which tier to use ---
  const tier = resolveTier(language, mode);

  if (tier === 'client') {
    try {
      const result = await executeClientSide(language, code, stdin, signal, onStatus);
      return { ...result, tier: 'client', fellBack: false };
    } catch (err) {
      // If user explicitly chose client and it failed, don't fallback
      if (mode === 'client') {
        throw err;
      }

      // Auto mode — fallback to cloud
      const fallbackReason = err instanceof Error ? err.message : 'Client execution failed';
      console.warn(`[ExecutionRouter] Client-side failed for ${language}, falling back to cloud:`, fallbackReason);

      if (CLOUD_SUPPORTED_LANGUAGES.has(language)) {
        onStatus?.('Client-side failed, running on cloud...');
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
): Promise<ExecutionResult> {
  switch (language) {
    case 'javascript':
      return executeJavaScript(code, stdin, signal);

    case 'typescript':
      onStatus?.('Transpiling TypeScript...');
      return executeTypeScript(code, stdin, signal);

    case 'python':
      return executePython(code, stdin, signal, onStatus);

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
 * Format execution output for display
 */
export function formatOutput(result: ExecutionResult): {
  output: string;
  error: string;
  exitCode: number;
  hasError: boolean;
} {
  const output = result.run.stdout || '';
  const stderr = result.run.stderr || '';
  const compileError = result.compile?.stderr || '';
  const exitCode = result.run.code;

  const error = compileError || stderr;
  const hasError = exitCode !== 0 || !!compileError || !!stderr;

  return { output, error, exitCode, hasError };
}

/**
 * Calculate execution time string
 */
export function calculateExecutionTime(startTime: number, endTime: number): string {
  const duration = endTime - startTime;
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(2)}s`;
}
