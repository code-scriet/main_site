// ---------------------------------------------------------------------------
// JavaScript Web Worker Sandbox
// ---------------------------------------------------------------------------
// Runs user JS code in a sandboxed Web Worker with 10s hard timeout.
// Captures console.log/warn/error/info calls and sends them back to the host.
// No access to DOM, fetch, localStorage, or any browser APIs.
// ---------------------------------------------------------------------------

// Intercept all console methods to capture output
const _output: string[] = [];
const _errors: string[] = [];

function stringify(...args: unknown[]): string {
  return args
    .map((a) => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a, null, 2);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');
}

console.log = (...args: unknown[]) => {
  _output.push(stringify(...args));
};
console.warn = (...args: unknown[]) => {
  _output.push(`[warn] ${stringify(...args)}`);
};
console.error = (...args: unknown[]) => {
  _errors.push(stringify(...args));
};
console.info = (...args: unknown[]) => {
  _output.push(stringify(...args));
};

// Listen for code to execute
self.onmessage = (e: MessageEvent<{ code: string; stdin?: string }>) => {
  const { code } = e.data;
  _output.length = 0;
  _errors.length = 0;

  try {
    // Use indirect eval to run in global scope of the worker
    const indirectEval = eval;
    indirectEval(code);

    self.postMessage({
      type: 'result',
      stdout: _output.join('\n'),
      stderr: _errors.join('\n'),
      exitCode: _errors.length > 0 ? 1 : 0,
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? `${err.name}: ${err.message}\n${err.stack || ''}`
        : String(err);

    self.postMessage({
      type: 'result',
      stdout: _output.join('\n'),
      stderr: _errors.length > 0 ? _errors.join('\n') + '\n' + errorMsg : errorMsg,
      exitCode: 1,
    });
  }
};
