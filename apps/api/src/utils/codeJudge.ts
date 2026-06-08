import { ProblemLanguage, SubmissionVerdict } from '@prisma/client';
import { logger } from './logger.js';
import { buildHarness as buildPythonHarness } from './judgeHarnesses/python.js';
import { buildHarness as buildJavaScriptHarness } from './judgeHarnesses/javascript.js';
import { buildHarness as buildCppHarness } from './judgeHarnesses/cpp.js';
import { buildHarness as buildJavaHarness } from './judgeHarnesses/java.js';

type JudgeMode = 'submit' | 'testrun';

export interface JudgeRequest {
  language: ProblemLanguage;
  userCode: string;
  testCases: Array<{ id: string; input: string; expectedOutput: string }>;
  timeLimitMs: number;
  mode: JudgeMode;
}

export interface JudgeResult {
  verdict: SubmissionVerdict;
  perTestVerdicts: Array<{
    testId: string;
    passed: boolean;
    actualOutput?: string;
    runtimeMs?: number;
    error?: string;
  }>;
  totalRuntimeMs: number;
  compilerOutput?: string;
}

interface CompilerConfig {
  compiler: string;
  options?: string;
  compilerOptionRaw?: string;
}

const EXECUTOR_URL = process.env.EXECUTOR_URL || 'https://codescriet-executor.developer-aary.workers.dev/execute';
const EXECUTOR_ORIGIN_HEADER = process.env.EXECUTOR_ORIGIN_HEADER
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:5002' : 'https://code.codescriet.dev');
const EXECUTION_TIMEOUT_MS = 15_000;
// Compiled languages (Java, C++) need extra headroom for compilation + the
// per-test fork/ClassLoader isolation overhead. Interpreted languages stay
// at the baseline.
const COMPILED_EXECUTION_TIMEOUT_MS = 30_000;
const SUBMIT_CONCURRENCY = 5;
const TESTRUN_CONCURRENCY = 10;
const ACTUAL_OUTPUT_LIMIT = 5 * 1024;
const COMPILER_OUTPUT_LIMIT = 10 * 1024;

// Keep these synchronized with apps/playground/execute-server.js.
const COMPILERS: Record<ProblemLanguage, CompilerConfig> = {
  PYTHON: { compiler: 'cpython-3.12.7' },
  JAVASCRIPT: { compiler: 'nodejs-20.17.0' },
  // -DONLINE_JUDGE matches the de-facto competitive-programming convention
  // (Codeforces, AtCoder, etc). Lets users guard their `freopen("input.txt", …)`
  // template blocks with `#ifndef ONLINE_JUDGE` so they don't trip the judge.
  CPP: { compiler: 'gcc-13.2.0', options: 'warning,c++17', compilerOptionRaw: '-DONLINE_JUDGE' },
  JAVA: { compiler: 'openjdk-jdk-22+36' },
};

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}

const submitSemaphore = new Semaphore(SUBMIT_CONCURRENCY);
const testRunSemaphore = new Semaphore(TESTRUN_CONCURRENCY);

function truncate(value: string | undefined, maxBytes: number): string | undefined {
  if (!value) return undefined;
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return value;
  return buffer.subarray(0, maxBytes).toString('utf8') + '\n[truncated]';
}

function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

function buildHarness(language: ProblemLanguage, userCode: string, testCases: Array<{ id: string; input: string }>, timeLimitMs: number): string {
  const opts = { userCode, testCases, approach: 'A' as const, timeLimitMs };
  switch (language) {
    case 'PYTHON':
      return buildPythonHarness(opts);
    case 'JAVASCRIPT':
      return buildJavaScriptHarness(opts);
    case 'CPP':
      return buildCppHarness(opts);
    case 'JAVA':
      return buildJavaHarness(opts);
    default:
      throw new Error(`Unsupported problem language: ${language}`);
  }
}

function buildJudgeStdin(testCases: Array<{ id: string; input: string }>): string {
  let stdin = `__N=${testCases.length}\n`;
  for (const testCase of testCases) {
    const input = testCase.input ?? '';
    stdin += `__ID=${testCase.id}\n`;
    stdin += `__LEN=${Buffer.byteLength(input, 'utf8')}\n`;
    stdin += input;
    stdin += '\n';
  }
  return stdin;
}

function decodeFramePayload(payload: string): string {
  try {
    return Buffer.from(payload, 'base64').toString('utf8');
  } catch {
    return '[judge output decode failed]';
  }
}

function parseFrames(stdout: string): Map<string, { status: string; runtimeMs: number; payload: string }> {
  const frames = new Map<string, { status: string; runtimeMs: number; payload: string }>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith('__JUDGE:')) continue;
    const parts = line.split(':');
    if (parts.length < 5) continue;
    const [, testId, status, runtimeRaw, ...payloadParts] = parts;
    frames.set(testId, {
      status,
      runtimeMs: Number.parseInt(runtimeRaw, 10) || 0,
      payload: payloadParts.join(':'),
    });
  }
  return frames;
}

function cleanWorkerText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// The compiled-language harnesses wrap the user's code and call its entry point
// (C++ renames `main` → `__user_main`; Java reflectively loads `class Main`).
// When a student submits a function-only / wrongly-named solution, the failure
// surfaces deep in harness internals (`__user_main was not declared`, a
// `ClassNotFoundException`, etc.) — meaningless to them. Translate those known
// signatures into a clear, actionable message; leave genuine user errors as-is.
function humanizeCompilerError(language: ProblemLanguage, raw: string | undefined): string | undefined {
  if (!raw) return raw;
  if (language === 'CPP' && /__user_main\b/.test(raw)) {
    return [
      'Your C++ solution must define an entry point — these problems read input from',
      'standard input and write the answer to standard output (not a bare function):',
      '',
      '    int main() {',
      '        // read input with cin / scanf',
      '        // print your answer with cout / printf',
      '    }',
      '',
      'A function-only solution (e.g. just `string reverseWords(...)` with no main) cannot',
      'run here. Put your logic in main(), or call your function from main().',
    ].join('\n');
  }
  // `__UserMain` is the harness's renamed copy of the student's `class Main`; it
  // only appears in errors when there's no `Main` class or its main() signature is
  // wrong (ClassNotFoundException: __UserMain / NoSuchMethodException: __UserMain.main).
  // Keying on it alone avoids misfiring on a student's own reflection errors.
  if (language === 'JAVA' && /__UserMain\b/.test(raw)) {
    return [
      'Your Java solution must be a `public class Main` with a standard entry point —',
      'these problems read from standard input and write to standard output:',
      '',
      '    public class Main {',
      '        public static void main(String[] args) {',
      '            // read input with Scanner / BufferedReader',
      '            // print your answer with System.out',
      '        }',
      '    }',
      '',
      'Name the class exactly `Main`. A function-only solution cannot run here.',
    ].join('\n');
  }
  return raw;
}

export async function runJudge(req: JudgeRequest): Promise<JudgeResult> {
  const release = await (req.mode === 'submit' ? submitSemaphore : testRunSemaphore).acquire();
  const totalStartedAt = Date.now();

  try {
    const compiler = COMPILERS[req.language];
    const wrappedCode = buildHarness(
      req.language,
      req.userCode,
      req.testCases.map(({ id, input }) => ({ id, input })),
      req.timeLimitMs,
    );
    const stdin = buildJudgeStdin(req.testCases.map(({ id, input }) => ({ id, input })));
    const controller = new AbortController();
    const isCompiled = req.language === 'CPP' || req.language === 'JAVA';
    const ceiling = isCompiled ? COMPILED_EXECUTION_TIMEOUT_MS : EXECUTION_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), Math.max(ceiling, req.timeLimitMs + 5_000));

    let workerResult: Record<string, unknown>;
    try {
      const response = await fetch(EXECUTOR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: EXECUTOR_ORIGIN_HEADER,
        },
        body: JSON.stringify({
          compiler: compiler.compiler,
          code: wrappedCode,
          stdin,
          options: compiler.options || '',
          ...(compiler.compilerOptionRaw ? { 'compiler-option-raw': compiler.compilerOptionRaw } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn('Judge worker returned non-OK response', { status: response.status });
        return {
          verdict: 'JUDGE_ERROR',
          perTestVerdicts: [],
          totalRuntimeMs: Date.now() - totalStartedAt,
          compilerOutput: truncate(await response.text(), COMPILER_OUTPUT_LIMIT),
        };
      }

      workerResult = await response.json() as Record<string, unknown>;
    } catch (error) {
      logger.error('Judge worker request failed', { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          verdict: 'TIME_LIMIT_EXCEEDED',
          perTestVerdicts: [],
          totalRuntimeMs: Date.now() - totalStartedAt,
          compilerOutput: 'Execution timed out',
        };
      }
      return {
        verdict: 'JUDGE_ERROR',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: truncate(error instanceof Error ? error.message : String(error), COMPILER_OUTPUT_LIMIT),
      };
    } finally {
      clearTimeout(timeout);
    }

    if (workerResult.error) {
      return {
        verdict: 'JUDGE_ERROR',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: truncate(String(workerResult.error), COMPILER_OUTPUT_LIMIT),
      };
    }

    const stdout = cleanWorkerText(workerResult.program_output);
    const stderr = cleanWorkerText(workerResult.program_error);
    const compilerError = cleanWorkerText(workerResult.compiler_error);
    const compilerOutput = cleanWorkerText(workerResult.compiler_output);
    const status = Number.parseInt(String(workerResult.status ?? '0'), 10) || 0;
    const signal = cleanWorkerText(workerResult.signal);
    const combinedCompilerOutput = truncate([compilerOutput, compilerError, stderr].filter(Boolean).join('\n'), COMPILER_OUTPUT_LIMIT);

    if (compilerError && !stdout.includes('__JUDGE:')) {
      return {
        verdict: 'COMPILATION_ERROR',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: humanizeCompilerError(req.language, combinedCompilerOutput),
      };
    }

    // Wandbox kills the program with a signal when it exceeds its own ceiling.
    // That's the only reliable global-TLE indicator here. The per-test limit
    // (`req.timeLimitMs`) is enforced inside each harness on a per-test basis,
    // and we frame TIMEOUT per-test below.
    if (signal) {
      return {
        verdict: 'TIME_LIMIT_EXCEEDED',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: combinedCompilerOutput,
      };
    }

    const frames = parseFrames(stdout);
    if (frames.size === 0) {
      return {
        verdict: status !== 0 ? 'RUNTIME_ERROR' : 'JUDGE_ERROR',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: humanizeCompilerError(req.language, truncate([combinedCompilerOutput, stdout].filter(Boolean).join('\n'), COMPILER_OUTPUT_LIMIT)),
      };
    }

    let anyTimeout = false;
    const perTestVerdicts = req.testCases.map((testCase) => {
      const frame = frames.get(testCase.id);
      if (!frame) {
        return {
          testId: testCase.id,
          passed: false,
          error: 'No judge output for this test',
        };
      }

      const decoded = decodeFramePayload(frame.payload);
      if (frame.status === 'TIMEOUT') {
        anyTimeout = true;
        return {
          testId: testCase.id,
          passed: false,
          runtimeMs: frame.runtimeMs,
          error: `Time limit exceeded (>${req.timeLimitMs}ms)`,
        };
      }
      if (frame.status === 'FAIL') {
        return {
          testId: testCase.id,
          passed: false,
          actualOutput: truncate(decoded, ACTUAL_OUTPUT_LIMIT),
          runtimeMs: frame.runtimeMs,
          error: truncate(decoded, ACTUAL_OUTPUT_LIMIT),
        };
      }

      return {
        testId: testCase.id,
        passed: normalizeOutput(decoded) === normalizeOutput(testCase.expectedOutput),
        actualOutput: truncate(decoded, ACTUAL_OUTPUT_LIMIT),
        runtimeMs: frame.runtimeMs,
      };
    });

    const verdict = perTestVerdicts.every((test) => test.passed)
      ? 'ACCEPTED'
      : anyTimeout && perTestVerdicts.every((test) => test.passed || test.error?.startsWith('Time limit exceeded'))
        ? 'TIME_LIMIT_EXCEEDED'
        : perTestVerdicts.some((test) => test.error)
          ? 'RUNTIME_ERROR'
          : 'WRONG_ANSWER';

    return {
      verdict,
      perTestVerdicts,
      totalRuntimeMs: Date.now() - totalStartedAt,
      compilerOutput: combinedCompilerOutput,
    };
  } finally {
    release();
  }
}
