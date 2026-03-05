// ---------------------------------------------------------------------------
// Shared Types for Execution Engines
// ---------------------------------------------------------------------------

/**
 * The result of executing code in any engine (client-side or cloud).
 * Matches the shape returned by the backend /api/execute endpoint.
 */
export interface ExecutionResult {
  /** Language identifier (e.g. 'javascript', 'python', 'cpp') */
  language: string;
  /** Version string (e.g. 'browser', 'Python 3.12', 'tsc 5.6.2') */
  version: string;
  /** Which execution provider ran the code */
  provider: 'client' | 'codescriet';
  /** Runtime execution output */
  run: {
    stdout: string;
    stderr: string;
    /** Exit code (0 = success) */
    code: number;
    /** Signal name if killed (e.g. 'SIGTERM'), null otherwise */
    signal: string | null;
    /** Combined output (usually same as stdout, kept for compat) */
    output: string;
  };
  /** Optional compile step output (for compiled languages) */
  compile?: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
  };
}

/**
 * Request sent to the backend execution proxy.
 */
export interface CloudExecutionRequest {
  language: string;
  code: string;
  stdin?: string;
}

/**
 * Execution tier: where code actually runs.
 */
export type ExecutionTier = 'client' | 'cloud';

/**
 * Execution mode preference.
 * - 'auto' — device detection decides (low-end → cloud, else client first → fallback)
 * - 'client' — force client-side (will error if unsupported)
 * - 'cloud' — force cloud via backend proxy
 */
export type ExecutionMode = 'auto' | 'client' | 'cloud';

/**
 * Languages that support client-side execution (Tier 1).
 */
export const CLIENT_SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'python',
  'web',
]);

/**
 * Languages that support cloud execution (Tier 2).
 * Must match the COMPILERS map in execute-server.js.
 */
export const CLOUD_SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'python',
  'cpp',
  'c',
  'java',
  'typescript',
]);
