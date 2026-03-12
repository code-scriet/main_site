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
import type { InteractiveCallbacks } from './jsEngine';

const PYODIDE_CDN_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full';
const PYODIDE_CDN = `${PYODIDE_CDN_BASE}/pyodide.js`;

/** Max time to wait for a single Python execution (after runtime is ready) */
const EXEC_TIMEOUT_MS = 10_000;
/** Max time to wait for Pyodide to initially load */
const INIT_TIMEOUT_MS = 30_000;

/** Files to pre-fetch so the worker loads from cache. Ordered by size descending. */
const PREFETCH_FILES: Array<{ path: string; approxBytes: number }> = [
  { path: 'pyodide.asm.wasm',  approxBytes: 13_000_000 },
  { path: 'python_stdlib.zip', approxBytes:  5_500_000 },
  { path: 'pyodide.asm.js',    approxBytes:  1_200_000 },
];

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
          indexURL: '${PYODIDE_CDN_BASE}/',
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
      const { id, code, stdin, inputBuffer } = e.data;

      // Ping — just confirm the worker is alive
      if (e.data.ping) {
        self.postMessage({ type: 'pong' });
        return;
      }

      // Set up SharedArrayBuffer views for interactive input
      let inputInt32 = null;
      let inputBytes = null;
      if (inputBuffer) {
        inputInt32 = new Int32Array(inputBuffer, 0, 1);
        inputBytes = new Uint8Array(inputBuffer, 4);
      }

      try {
        self.postMessage({ type: 'status', id, message: 'Running code...' });
        const py = await initPyodide();

        // Register JS-side interactive input helper on globalThis so Python can call it
        self.__inputInt32 = inputInt32;
        self.__inputBytes = inputBytes;
        self.__currentId = id;
        self.__outputCapture = null; // will be set after setup

        self.__jsInteractiveInput = function(promptText) {
          // Flush partial output so the UI can display it
          if (self.__outputCapture) {
            try {
              const partialStdout = py.runPython('__stdout_capture.getvalue()');
              self.postMessage({
                type: 'partial_output',
                id: self.__currentId,
                stdout: partialStdout || '',
              });
            } catch(e) { /* ignore */ }
          }
          if (!self.__inputInt32) {
            throw new Error('No input available');
          }
          Atomics.store(self.__inputInt32, 0, 0);
          self.postMessage({
            type: 'input_request',
            id: self.__currentId,
            prompt: promptText || '',
          });
          Atomics.wait(self.__inputInt32, 0, 0);
          const byteLength = Atomics.load(self.__inputInt32, 0);
          if (byteLength === -1) throw new Error('Execution cancelled');
          if (byteLength <= 0) return '';
          const bytes = new Uint8Array(self.__inputBytes.buffer, self.__inputBytes.byteOffset, byteLength);
          return new TextDecoder().decode(bytes);
        };

        // Setup stdout/stderr capture + stdin simulation with interactive fallback
        const setupCode = \`
import sys, io, builtins, js

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
    # No pre-filled stdin left — try interactive input via SharedArrayBuffer
    interactive_fn = js.globalThis.__jsInteractiveInput
    if interactive_fn:
        result = interactive_fn(str(prompt) if prompt else '')
        return str(result)
    raise EOFError('No more input available')

builtins.input = __patched_input
\`;
        py.runPython(setupCode);
        self.__outputCapture = true;

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
          .join('\\n')
          .replace(/\\n{3,}/g, '\\n\\n')
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

const SAB_SIZE = 65_540;

let sharedInputBuffer: SharedArrayBuffer | null = null;

function getSharedBuffer(): SharedArrayBuffer | null {
  if (sharedInputBuffer) return sharedInputBuffer;
  if (typeof SharedArrayBuffer !== 'undefined') {
    try {
      sharedInputBuffer = new SharedArrayBuffer(SAB_SIZE);
      return sharedInputBuffer;
    } catch { return null; }
  }
  return null;
}

function writeInputToBuffer(text: string): void {
  const sab = getSharedBuffer();
  if (!sab) return;
  const int32 = new Int32Array(sab, 0, 1);
  const data = new Uint8Array(sab, 4);
  const encoded = new TextEncoder().encode(text);
  const len = Math.min(encoded.length, data.length);
  data.set(encoded.subarray(0, len));
  Atomics.store(int32, 0, len || 1);
  Atomics.notify(int32, 0);
}

function cancelInputBuffer(): void {
  const sab = getSharedBuffer();
  if (!sab) return;
  const int32 = new Int32Array(sab, 0, 1);
  Atomics.store(int32, 0, -1);
  Atomics.notify(int32, 0);
}

// ---------------------------------------------------------------------------
// Singleton Worker Management
// ---------------------------------------------------------------------------

interface PendingExecution {
  resolve: (result: ExecutionResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  callbacks?: InteractiveCallbacks;
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

  if (msg.type === 'partial_output' && msg.id) {
    const pending = pendingExecutions.get(msg.id);
    if (pending) pending.callbacks?.onPartialOutput?.(msg.stdout || '');
    return;
  }

  if (msg.type === 'input_request' && msg.id) {
    const pending = pendingExecutions.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);

    const handleInput = pending.callbacks?.onInputRequest;
    if (!handleInput) {
      writeInputToBuffer('');
      pending.timer = setTimeout(() => {
        if (!pendingExecutions.has(msg.id)) return;
        pendingExecutions.delete(msg.id);
        pending.resolve({
          language: 'python', version: 'pyodide 0.27.0 (WASM)', provider: 'client',
          run: { stdout: '', stderr: 'Execution timed out.', code: 1, signal: 'SIGTERM', output: '' },
        });
      }, EXEC_TIMEOUT_MS);
      return;
    }

    handleInput(msg.prompt || '').then((text) => {
      writeInputToBuffer(text);
      pending.timer = setTimeout(() => {
        if (!pendingExecutions.has(msg.id)) return;
        pendingExecutions.delete(msg.id);
        pending.resolve({
          language: 'python', version: 'pyodide 0.27.0 (WASM)', provider: 'client',
          run: { stdout: '', stderr: 'Execution timed out.', code: 1, signal: 'SIGTERM', output: '' },
        });
      }, EXEC_TIMEOUT_MS);
    }).catch(() => {
      cancelInputBuffer();
    });
    return;
  }

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

  // Unblock any waiters that are waiting for initialization — without this,
  // they'd hang until their individual 30s timeouts fire even though we already
  // know the worker is dead.
  workerInitError = err.message || 'Worker crashed during initialization';
  workerReady = true;
  const pendingCallbacks = readyCallbacks.splice(0);
  pendingCallbacks.forEach(cb => cb());

  // Destroy the worker so next call recreates it
  singletonWorker = null;
  workerReady = false;
  // NOTE: workerInitError is intentionally kept until getOrCreateWorker() resets
  // it when a fresh worker is created, so callers can inspect it after waitForReady().
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
      reject(new Error('Pyodide failed to initialise within 30s — try again or use cloud execution'));
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
  callbacks?: InteractiveCallbacks,
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

    pendingExecutions.set(execId, { resolve, reject, timer, callbacks });

    // AbortSignal support
    if (signal) {
      signal.addEventListener('abort', () => {
        const pending = pendingExecutions.get(execId);
        if (pending) {
          pendingExecutions.delete(execId);
          clearTimeout(pending.timer);
          cancelInputBuffer();
          pending.reject(new Error('Execution cancelled'));
        }
      }, { once: true });
    }

    const inputBuffer = getSharedBuffer();
    singletonWorker!.postMessage({ id: execId, code, stdin: stdin || '', inputBuffer });
  });
}

// ---------------------------------------------------------------------------
// Preload — kept for compat, but prefer downloadAndWarmPyodide for explicit UX
// ---------------------------------------------------------------------------
export function preloadPyodide(): void {
  getOrCreateWorker();
}

/** Returns true once Pyodide has finished loading in the persistent worker */
export function isPyodideReady(): boolean {
  return workerReady && !workerInitError;
}

// ---------------------------------------------------------------------------
// Explicit warm-up with progress reporting
// ---------------------------------------------------------------------------

export type ProgressCallback = (percent: number, label: string) => void;

/**
 * Pre-fetches the main Pyodide WASM + stdlib files so the browser HTTP cache
 * is populated, then initialises the persistent worker. Calls onProgress with
 * values 0–100 and a human-readable label throughout.
 */
export async function downloadAndWarmPyodide(onProgress: ProgressCallback): Promise<void> {
  const totalApprox = PREFETCH_FILES.reduce((s, f) => s + f.approxBytes, 0);
  let completedBytes = 0;

  onProgress(0, 'Starting download…');

  for (const file of PREFETCH_FILES) {
    const url = `${PYODIDE_CDN_BASE}/${file.path}`;
    let fileLoaded = 0;

    try {
      const resp = await fetch(url, { mode: 'cors' });
      const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
      const fileSize = contentLength > 0 ? contentLength : file.approxBytes;
      const reader = resp.body?.getReader();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileLoaded += value.length;
          const overall = (completedBytes + (fileLoaded / fileSize) * file.approxBytes) / totalApprox;
          onProgress(Math.min(88, Math.round(overall * 90)), 'Downloading Python runtime…');
        }
        reader.releaseLock();
      } else {
        await resp.arrayBuffer();
        fileLoaded = file.approxBytes;
      }
    } catch {
      // Prefetch failed — worker will fetch normally (slower but still works)
      fileLoaded = file.approxBytes;
    }

    completedBytes += file.approxBytes;
    onProgress(Math.min(88, Math.round((completedBytes / totalApprox) * 90)), 'Downloading Python runtime…');
  }

  onProgress(92, 'Initializing Python interpreter…');
  getOrCreateWorker();

  try {
    await waitForReady();
  } catch (err) {
    throw new Error(`Pyodide failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (workerInitError) {
    throw new Error(`Pyodide failed to initialize: ${workerInitError}`);
  }

  onProgress(100, 'Python ready!');
}
