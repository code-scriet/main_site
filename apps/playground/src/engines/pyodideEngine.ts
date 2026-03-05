// ---------------------------------------------------------------------------
// Python Client-Side Execution Engine — Pyodide WASM
// ---------------------------------------------------------------------------
// Runs Python code entirely in the browser using Pyodide (CPython compiled to
// WebAssembly). The Pyodide runtime is loaded lazily from CDN on first use
// and cached by the browser's HTTP cache for subsequent runs.
//
// stdout/stderr are captured by redirecting sys.stdout and sys.stderr to
// StringIO objects before executing user code then reading them back.
//
// stdin is simulated by pre-loading user-provided input and patching
// the built-in input() function.
// ---------------------------------------------------------------------------

import type { ExecutionResult } from './types';

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js';
const WORKER_TIMEOUT = 10_000; // 10 seconds

// We run Pyodide in a Web Worker so it cannot block the main thread.
// The worker code is constructed as a blob URL.

function buildPyodideWorkerCode(): string {
  return `
    // Pyodide Worker — runs Python in WASM sandbox
    let pyodide = null;

    async function initPyodide() {
      if (pyodide) return pyodide;
      importScripts('${PYODIDE_CDN}');
      pyodide = await loadPyodide({
        stdout: () => {},  // We capture via StringIO, not native stdout
        stderr: () => {},
      });
      return pyodide;
    }

    self.onmessage = async (e) => {
      const { code, stdin } = e.data;
      try {
        self.postMessage({ type: 'status', message: 'Loading Python runtime...' });
        const py = await initPyodide();
        self.postMessage({ type: 'status', message: 'Running code...' });

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
          // Run user code
          py.runPython(code);
        } finally {
          // Always restore stream/input state for next run
          py.runPython('sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__; builtins.input = __original_input');
        }

        // Collect output
        const stdout = py.runPython('__stdout_capture.getvalue()');
        const stderr = py.runPython('__stderr_capture.getvalue()');

        self.postMessage({
          type: 'result',
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: stderr ? 1 : 0,
        });
      } catch (err) {
        // Pyodide wraps Python exceptions ‒ extract the useful part
        let errorMsg = String(err);
        // Try to pull out just the Python traceback
        if (err && err.message) {
          errorMsg = err.message;
        }
        errorMsg = errorMsg
          .replace(/^PythonError:\s*/i, '')
          .replace(/^Error:\s*/i, '')
          .trim();
        self.postMessage({
          type: 'result',
          stdout: '',
          stderr: errorMsg || 'Python execution failed',
          exitCode: 1,
        });
      }
    };
  `;
}

let workerBlobUrl: string | null = null;

function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([buildPyodideWorkerCode()], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

export type StatusCallback = (message: string) => void;

export async function executePython(
  code: string,
  stdin?: string,
  signal?: AbortSignal,
  onStatus?: StatusCallback,
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerBlobUrl());
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        worker.terminate();
      }
    };

    // Hard timeout
    const timer = setTimeout(() => {
      cleanup();
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
    }, WORKER_TIMEOUT);

    // AbortSignal support
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        cleanup();
        reject(new Error('Execution cancelled'));
      });
    }

    worker.onmessage = (e) => {
      const msg = e.data;

      if (msg.type === 'status' && onStatus) {
        onStatus(msg.message);
        return; // Don't resolve yet — still loading/running
      }

      if (msg.type === 'result') {
        clearTimeout(timer);
        cleanup();
        resolve({
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
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      cleanup();
      resolve({
        language: 'python',
        version: 'pyodide 0.27.0 (WASM)',
        provider: 'client',
        run: {
          stdout: '',
          stderr: `Pyodide worker error: ${err.message || 'Unknown error'}`,
          code: 1,
          signal: null,
          output: '',
        },
      });
    };

    worker.postMessage({ code, stdin: stdin || '' });
  });
}

// ---------------------------------------------------------------------------
// Preload Pyodide runtime in background for faster first execution
// ---------------------------------------------------------------------------
let preloadStarted = false;

export function preloadPyodide(): void {
  if (preloadStarted) return;
  preloadStarted = true;

  // Start a worker that will initialize Pyodide, then terminate
  const worker = new Worker(getWorkerBlobUrl());
  
  // Send an empty message to trigger runtime loading
  worker.postMessage({ code: '', stdin: '' });
  
  // Cleanup after 15 seconds max (Pyodide should load in ~3-5s on fast connections)
  setTimeout(() => worker.terminate(), 15_000);
  
  worker.onmessage = () => {
    // Pyodide loaded - terminate immediately to free memory
    worker.terminate();
  };
  
  worker.onerror = () => {
    // Ignore errors during preload
    worker.terminate();
  };
}
