// ---------------------------------------------------------------------------
// JavaScript Client-Side Execution Engine
// ---------------------------------------------------------------------------
// Runs JS code in a Web Worker sandbox with a 10s hard timeout.
// Zero server/API calls. Worker is persistent and reused across executions;
// only terminated on timeout/abort (infinite loops) and lazily recreated.
//
// Interactive input: provides `input(prompt?)`, `prompt()`, and `readline()`
// globals. Uses SharedArrayBuffer + Atomics for synchronous blocking when
// the program calls input(). Falls back to pre-filled stdin lines when SAB
// is unavailable or when stdin was pre-provided.
// ---------------------------------------------------------------------------

import type { ExecutionResult } from './types';

const WORKER_TIMEOUT = 10_000; // 10 seconds
const SAB_SIZE = 65_540; // 4 bytes control int32 + 65536 bytes data

// ---------------------------------------------------------------------------
// Interactive Input Callbacks
// ---------------------------------------------------------------------------

export interface InteractiveCallbacks {
  /** Called when the worker flushes partial output (e.g. before blocking for input) */
  onPartialOutput?: (stdout: string) => void;
  /** Called when the program calls input(). Must resolve with the user's typed input. */
  onInputRequest?: (prompt: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// SharedArrayBuffer for interactive input
// ---------------------------------------------------------------------------
// Layout:
//   Bytes 0-3  : Int32 control word
//                0  = worker is waiting for input
//                >0 = input ready, value = byte length of UTF-8 data
//                -1 = cancelled / aborted
//   Bytes 4+   : UTF-8 encoded input data (up to 65536 bytes)
// ---------------------------------------------------------------------------

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
  Atomics.store(int32, 0, len || 1); // min 1 so worker wakes (0 = still waiting)
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
// Persistent Worker Management
// ---------------------------------------------------------------------------

interface PendingExec {
  resolve: (result: ExecutionResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  callbacks?: InteractiveCallbacks;
}

let singletonWorker: Worker | null = null;
let workerBlobUrl: string | null = null;
let execIdCounter = 0;
const pendingExecs = new Map<string, PendingExec>();

function buildWorkerCode(): string {
  return `
      const _output = [];
      const _errors = [];
      let _currentId = null;
      let _inputInt32 = null;
      let _inputBytes = null;
      let _stdinLines = [];
      let _stdinIndex = 0;

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

      function input(promptText) {
        if (promptText !== undefined && promptText !== '') {
          _output.push(String(promptText));
        }
        if (_stdinIndex < _stdinLines.length) {
          return _stdinLines[_stdinIndex++];
        }
        if (!_inputInt32) {
          throw new Error('No input available. Provide input in the stdin section or use a browser that supports interactive input.');
        }
        self.postMessage({
          type: 'partial_output',
          id: _currentId,
          stdout: _output.join('\\n'),
        });
        Atomics.store(_inputInt32, 0, 0);
        self.postMessage({
          type: 'input_request',
          id: _currentId,
          prompt: promptText !== undefined ? String(promptText) : '',
        });
        Atomics.wait(_inputInt32, 0, 0);
        const byteLength = Atomics.load(_inputInt32, 0);
        if (byteLength === -1) throw new Error('Execution cancelled');
        if (byteLength <= 0) return '';
        const bytes = new Uint8Array(_inputBytes.buffer, _inputBytes.byteOffset, byteLength);
        return new TextDecoder().decode(bytes);
      }
      const prompt = input;
      const readline = () => input('');

      self.onmessage = (e) => {
        const { id, code, inputBuffer, stdin } = e.data;
        _currentId = id;
        _output.length = 0;
        _errors.length = 0;
        _stdinLines = stdin ? stdin.split('\\n') : [];
        _stdinIndex = 0;

        if (inputBuffer) {
          _inputInt32 = new Int32Array(inputBuffer, 0, 1);
          _inputBytes = new Uint8Array(inputBuffer, 4);
        } else {
          _inputInt32 = null;
          _inputBytes = null;
        }

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

          const stackMatch = rawStack.match(/playground-user-code\\.js:(\\d+):(\\d+)/);
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

function makeTimeoutHandler(id: string, pending: PendingExec): () => void {
  return () => {
    if (!pendingExecs.has(id)) return;
    pendingExecs.delete(id);
    destroyWorker();
    pending.resolve({
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
  };
}

function handleWorkerMessage(e: MessageEvent): void {
  const msg = e.data;
  if (!msg || !msg.id) return;

  const pending = pendingExecs.get(msg.id);
  if (!pending) return;

  if (msg.type === 'partial_output') {
    pending.callbacks?.onPartialOutput?.(msg.stdout || '');
    return;
  }

  if (msg.type === 'input_request') {
    // Pause the execution timeout while waiting for user input
    clearTimeout(pending.timer);

    const handleInput = pending.callbacks?.onInputRequest;
    if (!handleInput) {
      // No input handler — write empty string to unblock worker
      writeInputToBuffer('');
      pending.timer = setTimeout(makeTimeoutHandler(msg.id, pending), WORKER_TIMEOUT);
      return;
    }

    handleInput(msg.prompt || '').then((text) => {
      writeInputToBuffer(text);
      // Restart the execution timeout
      pending.timer = setTimeout(makeTimeoutHandler(msg.id, pending), WORKER_TIMEOUT);
    }).catch(() => {
      cancelInputBuffer();
    });
    return;
  }

  if (msg.type === 'result') {
    pendingExecs.delete(msg.id);
    clearTimeout(pending.timer);
    pending.resolve({
      language: 'javascript',
      version: 'browser',
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
  stdin?: string,
  signal?: AbortSignal,
  callbacks?: InteractiveCallbacks,
): Promise<ExecutionResult> {
  const worker = getOrCreateWorker();
  const id = String(++execIdCounter);
  const inputBuffer = getSharedBuffer();

  return new Promise<ExecutionResult>((resolve, reject) => {
    const pending: PendingExec = {
      resolve,
      reject,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
      callbacks,
    };
    pending.timer = setTimeout(makeTimeoutHandler(id, pending), WORKER_TIMEOUT);

    pendingExecs.set(id, pending);

    if (signal) {
      signal.addEventListener('abort', () => {
        if (!pendingExecs.has(id)) return;
        pendingExecs.delete(id);
        clearTimeout(pending.timer);
        cancelInputBuffer();
        destroyWorker();
        reject(new Error('Execution cancelled'));
      }, { once: true });
    }

    worker.postMessage({ id, code, inputBuffer, stdin: stdin || '' });
  });
}

/** Warm up the JS worker so the first execution is instant */
export function preloadJavaScript(): void {
  getOrCreateWorker();
}
