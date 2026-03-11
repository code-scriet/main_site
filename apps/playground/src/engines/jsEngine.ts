// ---------------------------------------------------------------------------
// JavaScript Client-Side Execution Engine
// ---------------------------------------------------------------------------
// Runs JS code in a Web Worker sandbox with a 10s hard timeout.
// Zero server/API calls. Worker is terminated after timeout.
// ---------------------------------------------------------------------------

import type { ExecutionResult } from './types';

const WORKER_TIMEOUT = 10_000; // 10 seconds

export async function executeJavaScript(
  code: string,
  _stdin?: string,
  signal?: AbortSignal,
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    // Create worker from the jsWorker module via blob URL
    const workerCode = `
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
        const { code } = e.data;
        _output.length = 0;
        _errors.length = 0;
        try {
          const indirectEval = eval;
          const executable = code + '\\n//# sourceURL=playground-user-code.js';
          indirectEval(executable);
          self.postMessage({
            type: 'result',
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
            stdout: _output.join('\\n'),
            stderr: _errors.length > 0 ? _errors.join('\\n') + '\\n' + errorMsg : errorMsg,
            exitCode: 1,
          });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      }
    };

    // Hard timeout — terminate worker after 10s
    const timer = setTimeout(() => {
      cleanup();
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

    // AbortSignal support
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        cleanup();
        reject(new Error('Execution cancelled'));
      });
    }

    worker.onmessage = (e) => {
      clearTimeout(timer);
      cleanup();
      const { stdout, stderr, exitCode } = e.data;
      resolve({
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
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      cleanup();

      const line = Number.isFinite(err.lineno) && err.lineno > 0 ? err.lineno : null;
      const column = Number.isFinite(err.colno) && err.colno > 0 ? err.colno : null;
      const file = err.filename || 'worker';
      const location = line
        ? `${file}:${line}${column ? `:${column}` : ''}`
        : file;
      const runtimeError = (err as ErrorEvent).error as Error | undefined;
      const stack = runtimeError?.stack ? `\n${runtimeError.stack}` : '';
      const details = `Worker runtime error at ${location}: ${err.message || 'Unknown error'}${stack}`;

      resolve({
        language: 'javascript',
        version: 'browser',
        provider: 'client',
        run: {
          stdout: '',
          stderr: details,
          code: 1,
          signal: null,
          output: '',
        },
      });
    };

    // Send code to the worker
    worker.postMessage({ code });
  });
}
