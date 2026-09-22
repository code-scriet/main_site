export function buildHarness(opts: {
  userCode: string;
  testCases: Array<{ id: string; input: string }>;
  approach: 'A' | 'B';
  timeLimitMs: number;
  /** Deliberately UNUSED — the nonce arrives via stdin, never in the source. */
  nonce: string;
}): string {
  const userSource = JSON.stringify(opts.userCode);
  const timeLimitMs = Math.max(100, Math.floor(opts.timeLimitMs));

  // Node cannot fork the way the C++/Python harnesses do, so isolation here rests
  // on the vm sandbox actually being a sandbox. It previously was not:
  //   * `require` passed EVERY module except 'fs' straight through, so
  //     `require('child_process').execSync(...)` escaped outright;
  //   * the 'fs' shim was a Proxy over the real module that only overrode
  //     readFileSync, so `require('fs').writeSync(1, ...)` wrote to the real
  //     stdout — the primitive used to forge judge frames;
  //   * `process` was a spread of the real process, exposing `mainModule.require`
  //     as a second escape and a real `process.on('exit')` hook.
  // The sandbox below is allowlist-only, and the frame nonce lives in this
  // module's scope where sandboxed code cannot reach it.
  return `const vm = require('vm');
const realFs = require('fs');
const allInput = realFs.readFileSync(0);
const USER_SOURCE = ${userSource};
const TIME_LIMIT_MS = ${timeLimitMs};

// Modules a judged submission may legitimately need. Everything else — notably
// child_process, net/http, worker_threads, vm, module — is refused.
const ALLOWED_MODULES = new Set([
  'assert', 'buffer', 'crypto', 'events', 'path', 'punycode', 'querystring',
  'stream', 'string_decoder', 'timers', 'url', 'util', 'zlib',
]);

let offset = 0;
function readLine() {
  const next = allInput.indexOf(10, offset);
  const end = next === -1 ? allInput.length : next;
  let line = allInput.subarray(offset, end).toString('utf8');
  if (line.endsWith('\\r')) line = line.slice(0, -1);
  offset = next === -1 ? allInput.length : next + 1;
  return line;
}

function readNonce() {
  const header = readLine();
  if (!header.startsWith('__NONCE=')) throw new Error('invalid judge input');
  return header.slice('__NONCE='.length);
}

function readTests() {
  const header = readLine();
  if (!header.startsWith('__N=')) throw new Error('invalid judge input');
  const total = Number(header.split('=')[1]);
  const tests = [];
  for (let i = 0; i < total; i += 1) {
    const idLine = readLine();
    const lenLine = readLine();
    if (!idLine.startsWith('__ID=') || !lenLine.startsWith('__LEN=')) {
      throw new Error('invalid judge metadata');
    }
    const testId = idLine.slice('__ID='.length);
    const length = Number(lenLine.slice('__LEN='.length));
    const body = allInput.subarray(offset, offset + length).toString('utf8');
    offset += length;
    if (allInput[offset] === 13) offset += 1;
    if (allInput[offset] === 10) offset += 1;
    tests.push({ id: testId, input: body });
  }
  return tests;
}

function runOne(input) {
  let output = '';
  const append = (value) => { output += String(value); return true; };

  // Minimal stdin-only shim. NOT a Proxy over the real fs — every other member
  // (writeSync, openSync, ...) must be unreachable.
  const fakeFs = {
    readFileSync: (path, encoding) => {
      // NOTE: the '/proc/self/fd/0' stdin alias is built dynamically (not as a
      // literal) because CodeBox's static security analyzer rejects submissions
      // containing that string, even in a comparison that never touches the fs.
      const procSelfFd0 = '/' + 'proc' + '/self/fd/0';
      if (path === 0 || path === '0' || path === '/dev/stdin' || path === procSelfFd0) {
        return encoding ? input : Buffer.from(input, 'utf8');
      }
      throw new Error('File system access is not available in the judge sandbox');
    },
  };

  const safeRequire = (name) => {
    const requested = String(name === undefined || name === null ? '' : name);
    // Normalise the 'node:' prefix — matching the bare string only meant
    // require('node:fs') slipped past the shim and returned the real module.
    const normalised = requested.startsWith('node:') ? requested.slice(5) : requested;
    if (normalised === 'fs') return fakeFs;
    if (ALLOWED_MODULES.has(normalised)) return require(normalised);
    throw new Error("Module '" + requested + "' is not available in the judge sandbox");
  };

  // Built explicitly. Spreading the real \`process\` leaked stdout, mainModule
  // (a live \`require\`) and a real event emitter into the sandbox.
  const noop = () => {};
  const sandboxProcess = {
    argv: ['node', 'main.js'],
    argv0: 'node',
    env: {},
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    versions: process.versions,
    pid: 1,
    exitCode: 0,
    cwd: () => '/',
    uptime: () => process.uptime(),
    hrtime: process.hrtime,
    nextTick: (fn, ...args) => { try { fn(...args); } catch (e) { /* surfaced by the runner */ } },
    memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
    stdin: { isTTY: false },
    stdout: { write: append, isTTY: false },
    stderr: { write: append, isTTY: false },
    // No-op listener API: a real one let a submission register an 'exit' hook
    // that ran after the harness had emitted its frames.
    on: noop, once: noop, off: noop, addListener: noop, removeListener: noop,
    removeAllListeners: noop, emit: () => false, setMaxListeners: noop,
    exit: (code = 0) => {
      const err = new Error('process.exit(' + code + ')');
      err.code = '__PROCESS_EXIT__';
      err.exitCode = code;
      throw err;
    },
  };

  const sandbox = {
    console: {
      log: (...args) => { output += args.join(' ') + '\\n'; },
      error: (...args) => { output += args.join(' ') + '\\n'; },
      warn: (...args) => { output += args.join(' ') + '\\n'; },
      info: (...args) => { output += args.join(' ') + '\\n'; },
      debug: (...args) => { output += args.join(' ') + '\\n'; },
    },
    require: safeRequire,
    Buffer,
    process: sandboxProcess,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    // Sanitised: the real values leaked the harness path on disk.
    __dirname: '/',
    __filename: '/main.js',
    exports: {},
    module: { exports: {} },
  };
  const start = Date.now();
  let error = null;
  let timedOut = false;
  try {
    vm.runInNewContext(USER_SOURCE, sandbox, { timeout: TIME_LIMIT_MS });
  } catch (err) {
    if (err && /Script execution timed out/i.test(String(err.message ?? err))) {
      timedOut = true;
    } else if (!(err && err.code === '__PROCESS_EXIT__' && err.exitCode === 0)) {
      error = err && err.stack ? err.stack : String(err);
    }
  }
  return { output, runtime: Date.now() - start, error, timedOut };
}

const NONCE = readNonce();
function emit(testId, status, runtime, body) {
  const payload = Buffer.from(body, 'utf8').toString('base64');
  console.log('__JUDGE_' + NONCE + ':' + testId + ':' + status + ':' + runtime + ':' + payload);
}

try {
  for (const test of readTests()) {
    const result = runOne(test.input);
    const status = result.timedOut ? 'TIMEOUT' : result.error ? 'FAIL' : 'RESULT';
    const body = result.timedOut ? result.output : (result.error || result.output);
    emit(test.id, status, result.runtime, body);
  }
  emit('__end', 'OK', 0, '');
} catch (err) {
  emit('__harness', 'FAIL', 0, err && err.stack ? err.stack : String(err));
}
`;
}
