export function buildHarness(opts: {
  userCode: string;
  testCases: Array<{ id: string; input: string }>;
  approach: 'A' | 'B';
  timeLimitMs: number;
}): string {
  const userSource = JSON.stringify(opts.userCode);
  const timeLimitMs = Math.max(100, Math.floor(opts.timeLimitMs));

  return `const vm = require('vm');
const realFs = require('fs');
const allInput = realFs.readFileSync(0);
const USER_SOURCE = ${userSource};
const TIME_LIMIT_MS = ${timeLimitMs};

let offset = 0;
function readLine() {
  const next = allInput.indexOf(10, offset);
  const end = next === -1 ? allInput.length : next;
  let line = allInput.subarray(offset, end).toString('utf8');
  if (line.endsWith('\\r')) line = line.slice(0, -1);
  offset = next === -1 ? allInput.length : next + 1;
  return line;
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
  const fakeFs = new Proxy(realFs, {
    get(target, prop) {
      if (prop === 'readFileSync') {
        return (path, encoding) => {
          if (path === 0 || path === '/dev/stdin' || path === '0') {
            return encoding ? input : Buffer.from(input, 'utf8');
          }
          return target.readFileSync(path, encoding);
        };
      }
      return target[prop];
    },
  });
  const sandboxProcess = {
    ...process,
    stdin: { isTTY: false },
    stdout: { write: (value) => { output += String(value); return true; } },
    stderr: { write: (value) => { output += String(value); return true; } },
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
    },
    require: (name) => (name === 'fs' ? fakeFs : require(name)),
    Buffer,
    process: sandboxProcess,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    __dirname,
    __filename,
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

try {
  for (const test of readTests()) {
    const result = runOne(test.input);
    const status = result.timedOut ? 'TIMEOUT' : result.error ? 'FAIL' : 'RESULT';
    const body = result.timedOut ? result.output : (result.error || result.output);
    const payload = Buffer.from(body, 'utf8').toString('base64');
    console.log('__JUDGE:' + test.id + ':' + status + ':' + result.runtime + ':' + payload);
  }
} catch (err) {
  const payload = Buffer.from(err && err.stack ? err.stack : String(err), 'utf8').toString('base64');
  console.log('__JUDGE:__harness:FAIL:0:' + payload);
}
`;
}
