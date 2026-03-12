// ---------------------------------------------------------------------------
// JavaScript Client-Side Execution Engine
// ---------------------------------------------------------------------------
// Runs JS code in a Web Worker sandbox with a 10s hard timeout.
// Zero server/API calls. Worker is persistent and reused across executions;
// only terminated on timeout/abort (infinite loops) and lazily recreated.
// ---------------------------------------------------------------------------

import type { ExecutionResult } from './types';

const WORKER_TIMEOUT = 10_000; // 10 seconds

// ---------------------------------------------------------------------------
// Persistent Worker Management
// ---------------------------------------------------------------------------

interface PendingExec {
  resolve: (result: ExecutionResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let singletonWorker: Worker | null = null;
let workerBlobUrl: string | null = null;
let execIdCounter = 0;
const pendingExecs = new Map<string, PendingExec>();

function buildWorkerCode(): string {
  return `
      const _output = [];
      const _errors = [];

      function stringify(...args) {
        return args.map(a => {
          if (a === null) return 'null';
          if (a === undefined) return 'undefined';
          if (typeof a === 'object') {
            try { return JSON.stringify(a, null, 2); } catch { return String(a); }
          }
          return String(a);
        }).join(' ');
      }

      console.log = (...args) => { _output.push(stringify(...args)); };
      console.warn = (...args) => { _output.push('[warn] ' + stringify(...args)); };
      console.error = (...args) => { _errors.push(stringify(...args)); };
      console.info = (...args) => { _output.push(stringify(...args)); };
      console.dir = (...args) => { _output.push(stringify(...args)); };
      console.table = (...args) => { _output.push(stringify(...args)); };
      console.clear = () => { _output.length = 0; _errors.length = 0; };
      console.assert = (cond, ...args) => { if (!cond) _errors.push('Assertion failed: ' + stringify(...args)); };
      console.time = () => {};
      console.timeEnd = () => {};
      console.timeLog = () => {};
      console.group = () => {};
      console.groupEnd = () => {};

      self.onmessage = (e) => {
        const { id, code } = e.data;
        _output.length = 0;
        _errors.length = 0;
        try {
          const indirectEval = eval;
          const executable = code + '\\n//# sourceURL=playground-user-code.js';
          indirectEval(executable);
          self.postMessage({
            type: 'result',
            id,
            stdout: _output.join('\\n'),
            stderr: _errors.join('\\n'),
            exitCode: _errors.length > 0 ? 1 : 0,
          });
        } catch (err) {
          const rawStack = err instanceof Error ? (err.stack || '') : '';
          const name = err instanceof Error ? (err.name || 'Error') : 'Error';
          const message = err instanceof Error ? (err.message || String(err)) : String(err);

          let line = Number.isFinite(err?.lineNumber) ? err.lineNumber : null;
          let column = Number.isFinite(err?.columnNumber) ? err.columnNumber : null;

          // Stack examples we may see:
          //   at eval (playground-user-code.js:3:11)
          //   at playground-user-code.js:3:11
          const stackMatch = rawStack.match(/playground-user-code\.js:(\d+):(\d+)/);
          if ((!line || !column) && stackMatch) {
            line = Number(stackMatch[1]);
            column = Number(stackMatch[2]);
          }

          const location = line
            ? ('Line ' + line + (column ? (', Column ' + column) : ''))
            : '';

          const headline = location
            ? (name + ': ' + message + ' (' + location + ')')
            : (name + ': ' + message);

          // Avoid duplicating the headline if stack already starts with it
          const cleanedStack = rawStack && !rawStack.startsWith(headline)
            ? rawStack
            : '';

          const errorMsg = cleanedStack ? (headline + '\\n' + cleanedStack) : headline;

          self.postMessage({
            type: 'result',
            id,
            stdout: _output.join('\\n'),
            stderr: _errors.length > 0 ? _errors.join('\\n') + '\\n' + errorMsg : errorMsg,
            exitCode: 1,
          });
        }
      };
    `;
}

function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([buildWorkerCode()], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

function destroyWorker(): void {
  if (singletonWorker) {
    singletonWorker.onmessage = null;
    singletonWorker.onerror = null;
    singletonWorker.terminate();
    singletonWorker = null;
  }
  for (const [, pending] of pendingExecs) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Worker terminated'));
  }
  pendingExecs.clear();
}

function handleWorkerMessage(e: MessageEvent): void {
  const { type, id, stdout, stderr, exitCode } = e.data;
  if (type !== 'result' || !id) return;

  const pending = pendingExecs.get(id);
  if (!pending) return;
  pendingExecs.delete(id);
  clearTimeout(pending.timer);

  pending.resolve({
    language: 'javascript',
    version: 'browser',
    provider: 'client',
    run: {
      stdout: stdout || '',
      stderr: stderr || '',
      code: exitCode ?? 0,
      signal: null,
      output: stdout || '',
    },
  });
}

function handleWorkerError(err: ErrorEvent): void {
  const line = Number.isFinite(err.lineno) && err.lineno > 0 ? err.lineno : null;
  const column = Number.isFinite(err.colno) && err.colno > 0 ? err.colno : null;
  const file = err.filename || 'worker';
  const location = line ? `${file}:${line}${column ? `:${column}` : ''}` : file;
  const runtimeError = (err as ErrorEvent).error as Error | undefined;
  const stack = runtimeError?.stack ? `\n${runtimeError.stack}` : '';
  const details = `Worker runtime error at ${location}: ${err.message || 'Unknown error'}${stack}`;

  for (const [, pending] of pendingExecs) {
    clearTimeout(pending.timer);
    pending.resolve({
      language: 'javascript',
      version: 'browser',
      provider: 'client',
      run: { stdout: '', stderr: details, code: 1, signal: null, output: '' },
    });
  }
  pendingExecs.clear();

  if (singletonWorker) {
    singletonWorker.onmessage = null;
    singletonWorker.onerror = null;
    singletonWorker.terminate();
    singletonWorker = null;
  }
}

function getOrCreateWorker(): Worker {
  if (singletonWorker) return singletonWorker;
  const worker = new Worker(getWorkerBlobUrl());
  worker.onmessage = handleWorkerMessage;
  worker.onerror = handleWorkerError;
  singletonWorker = worker;
  return worker;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function executeJavaScript(
  code: string,
  _stdin?: string,
  signal?: AbortSignal,
): Promise<ExecutionResult> {
  const worker = getOrCreateWorker();
  const id = String(++execIdCounter);

  return new Promise<ExecutionResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pendingExecs.has(id)) return;
      pendingExecs.delete(id);
      destroyWorker();
      resolve({
        language: 'javascript',
        version: 'browser',
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

    pendingExecs.set(id, { resolve, reject, timer });

    if (signal) {
      signal.addEventListener('abort', () => {
        if (!pendingExecs.has(id)) return;
        pendingExecs.delete(id);
        clearTimeout(timer);
        destroyWorker();
        reject(new Error('Execution cancelled'));
      }, { once: true });
    }

    worker.postMessage({ id, code });
  });
}

/** Warm up the JS worker so the first execution is instant */
export function preloadJavaScript(): void {
  getOrCreateWorker();
}
