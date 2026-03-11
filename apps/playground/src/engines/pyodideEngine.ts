// ---------------------------------------------------------------------------
// Python Client-Side Execution Engine — Pyodide WASM
// ---------------------------------------------------------------------------
// Runs Python code entirely in the browser using Pyodide (CPython compiled to
// WebAssembly). The Pyodide runtime is loaded lazily from CDN on first use
// and cached by the browser's HTTP cache for subsequent runs.
//
// KEY DESIGN: A single persistent Web Worker is reused across all executions.
// This means Pyodide only needs to initialise ONCE per page load (~3-5s first
// time, then instant thereafter). Each run message is paired with a unique
// correlation ID so responses can be matched back.
// ---------------------------------------------------------------------------

import type { ExecutionResult } from './types';

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js';

/** Max time to wait for a single Python execution (after runtime is ready) */
const EXEC_TIMEOUT_MS = 10_000;
/** Max time to wait for Pyodide to initially load */
const INIT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Worker code (runs in Web Worker context)
// ---------------------------------------------------------------------------
function buildPyodideWorkerCode(): string {
  return `
    // Persistent Pyodide Worker — initialises once, executes many times
    let pyodide = null;
    let initPromise = null;

    async function initPyodide() {
      if (pyodide) return pyodide;
      if (initPromise) return initPromise;
      initPromise = (async () => {
        importScripts('${PYODIDE_CDN}');
        pyodide = await loadPyodide({
          stdout: () => {},
          stderr: () => {},
        });
        return pyodide;
      })();
      return initPromise;
    }

    // Start loading immediately so it's ready when the first run arrives
    initPyodide().then(() => {
      self.postMessage({ type: 'ready' });
    }).catch(err => {
      self.postMessage({ type: 'init_error', error: String(err) });
    });

    self.onmessage = async (e) => {
      const { id, code, stdin } = e.data;

      // Ping — just confirm the worker is alive
      if (e.data.ping) {
        self.postMessage({ type: 'pong' });
        return;
      }

      try {
        self.postMessage({ type: 'status', id, message: 'Running code...' });
        const py = await initPyodide();

        // Setup stdout/stderr capture + stdin simulation
        const setupCode = \`
import sys, io, builtins

__stdout_capture = io.StringIO()
__stderr_capture = io.StringIO()
sys.stdout = __stdout_capture
sys.stderr = __stderr_capture

__original_input = builtins.input
__stdin_lines = \${JSON.stringify((stdin || '').split('\\n'))}.copy()
__stdin_index = [0]

def __patched_input(prompt=''):
    if prompt:
        sys.stdout.write(str(prompt))
    if __stdin_index[0] < len(__stdin_lines):
        line = __stdin_lines[__stdin_index[0]]
        __stdin_index[0] += 1
        return line
    raise EOFError('No more input available')

builtins.input = __patched_input
\`;
        py.runPython(setupCode);

        try {
          const wrappedCode = '__user_code = ' + JSON.stringify(code) + '\\n' +
            "exec(compile(__user_code, 'main.py', 'exec'))";
          py.runPython(wrappedCode);
        } finally {
          py.runPython('sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__; builtins.input = __original_input');
        }

        const stdout = py.runPython('__stdout_capture.getvalue()');
        const stderr = py.runPython('__stderr_capture.getvalue()');

        self.postMessage({
          type: 'result',
          id,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: stderr ? 1 : 0,
        });
      } catch (err) {
        const parts = [];
        if (err && typeof err.toString === 'function') {
          parts.push(String(err.toString()));
        }
        if (err && err.message) {
          parts.push(String(err.message));
        }
        if (err && err.stack) {
          parts.push(String(err.stack));
        }

        let errorMsg = parts
          .filter(Boolean)
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // If we only captured a bare label (e.g. "PythonError"), keep a
        // useful fallback so users still get context instead of just a type name.
        if (!errorMsg || /^[A-Za-z]+Error:?$/i.test(errorMsg)) {
          errorMsg = 'Python runtime error occurred. No traceback was returned by the runtime.';
        }

        // Try to reset stdout/stderr so next run starts clean
        try {
          const py = await initPyodide();
          py.runPython('import sys, builtins; sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__');
        } catch { /* ignore reset errors */ }

        self.postMessage({
          type: 'result',
          id,
          stdout: '',
          stderr: errorMsg,
          exitCode: 1,
        });
      }
    };
  `;
}

// ---------------------------------------------------------------------------
// Singleton Worker Management
// ---------------------------------------------------------------------------

interface PendingExecution {
  resolve: (result: ExecutionResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let singletonWorker: Worker | null = null;
let workerBlobUrl: string | null = null;
let workerReady = false;
let workerInitError: string | null = null;
let readyCallbacks: Array<() => void> = [];

/** Counter for correlation IDs */
let execIdCounter = 0;
const pendingExecutions = new Map<string, PendingExecution>();

function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([buildPyodideWorkerCode()], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

function handleWorkerMessage(e: MessageEvent) {
  const msg = e.data;

  if (msg.type === 'ready') {
    workerReady = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks = [];
    return;
  }

  if (msg.type === 'init_error') {
    workerInitError = msg.error;
    workerReady = true; // mark ready so waiters unblock (they'll get the error)
    readyCallbacks.forEach(cb => cb());
    readyCallbacks = [];
    return;
  }

  if (msg.type === 'pong') return;

  if (msg.type === 'status') return; // Could surface via callback in future

  if (msg.type === 'result' && msg.id) {
    const pending = pendingExecutions.get(msg.id);
    if (!pending) return;
    pendingExecutions.delete(msg.id);
    clearTimeout(pending.timer);

    pending.resolve({
      language: 'python',
      version: 'pyodide 0.27.0 (WASM)',
      provider: 'client',
      run: {
        stdout: msg.stdout || '',
        stderr: msg.stderr || '',
        code: msg.exitCode ?? 0,
        signal: null,
        output: msg.stdout || '',
      },
    });
  }
}

function handleWorkerError(err: ErrorEvent) {
  // Reject all pending + mark worker dead
  for (const [, pending] of pendingExecutions) {
    clearTimeout(pending.timer);
    pending.reject(new Error(`Pyodide worker error: ${err.message}`));
  }
  pendingExecutions.clear();

  // Destroy the worker so next call recreates it
  singletonWorker = null;
  workerReady = false;
  workerInitError = null;
}

function getOrCreateWorker(): Worker | null {
  if (singletonWorker) return singletonWorker;

  try {
    const worker = new Worker(getWorkerBlobUrl());
    worker.onmessage = handleWorkerMessage;
    worker.onerror = handleWorkerError;
    singletonWorker = worker;
    workerReady = false;
    workerInitError = null;
    return worker;
  } catch (err) {
    // Worker creation can fail if blob URLs are blocked (CSP) or in restricted environments.
    // Mark as errored so callers fall back to cloud.
    workerInitError = err instanceof Error ? err.message : 'Failed to create Web Worker';
    workerReady = true; // unblock any waiters
    readyCallbacks.forEach(cb => cb());
    readyCallbacks = [];
    console.warn('[Pyodide] Worker creation failed:', workerInitError);
    return null;
  }
}

/** Returns a promise that resolves once Pyodide is loaded in the worker */
function waitForReady(): Promise<void> {
  if (workerReady) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Pyodide failed to initialise within 30s'));
    }, INIT_TIMEOUT_MS);

    readyCallbacks.push(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type StatusCallback = (message: string) => void;

export async function executePython(
  code: string,
  stdin?: string,
  signal?: AbortSignal,
  onStatus?: StatusCallback,
): Promise<ExecutionResult> {
  // Ensure the singleton worker exists and Pyodide is loaded
  getOrCreateWorker();

  if (!workerReady) {
    onStatus?.('Loading Python runtime (first run only)...');
    try {
      await waitForReady();
    } catch (err) {
      return {
        language: 'python',
        version: 'pyodide 0.27.0 (WASM)',
        provider: 'client',
        run: {
          stdout: '',
          stderr: `Failed to load Python runtime: ${err instanceof Error ? err.message : String(err)}`,
          code: 1,
          signal: null,
          output: '',
        },
      };
    }
  }

  if (workerInitError) {
    return {
      language: 'python',
      version: 'pyodide 0.27.0 (WASM)',
      provider: 'client',
      run: {
        stdout: '',
        stderr: `Python runtime failed to load: ${workerInitError}`,
        code: 1,
        signal: null,
        output: '',
      },
    };
  }

  onStatus?.('Running code...');

  const execId = `exec-${++execIdCounter}`;

  return new Promise<ExecutionResult>((resolve, reject) => {
    // Per-execution timeout (after Pyodide is already loaded)
    const timer = setTimeout(() => {
      pendingExecutions.delete(execId);
      resolve({
        language: 'python',
        version: 'pyodide 0.27.0 (WASM)',
        provider: 'client',
        run: {
          stdout: '',
          stderr: 'Execution timed out (10s limit). Your code may have an infinite loop.',
          code: 1,
          signal: 'SIGTERM',
          output: '',
        },
      });
    }, EXEC_TIMEOUT_MS);

    pendingExecutions.set(execId, { resolve, reject, timer });

    // AbortSignal support
    if (signal) {
      signal.addEventListener('abort', () => {
        const pending = pendingExecutions.get(execId);
        if (pending) {
          pendingExecutions.delete(execId);
          clearTimeout(pending.timer);
          pending.reject(new Error('Execution cancelled'));
        }
      }, { once: true });
    }

    singletonWorker!.postMessage({ id: execId, code, stdin: stdin || '' });
  });
}

// ---------------------------------------------------------------------------
// Preload — call early to warm up Pyodide before the first run
// ---------------------------------------------------------------------------
export function preloadPyodide(): void {
  getOrCreateWorker(); // ensures the worker is created and starts loading
}

/** Returns true once Pyodide has finished loading in the persistent worker */
export function isPyodideReady(): boolean {
  return workerReady && !workerInitError;
}
