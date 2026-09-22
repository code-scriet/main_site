import { ProblemLanguage, SubmissionVerdict } from '@prisma/client';
import {
  buildJudgeStdin,
  frameMarker,
  makeJudgeNonce,
  parseFrames,
  scrubHarnessInternals,
} from './judgeFrames.js';
import { logger } from './logger.js';
import {
  executionRouter,
  getConfiguredProviderSetting,
  type ExecutionProvider,
} from './executionRouting.js';
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
  /**
   * Set when the harness output could not be trusted — duplicate frames for one
   * test id, or frames for a test that was never sent. Callers MUST NOT refund
   * the submit cap / daily quota for a tampered run (unlike a genuine
   * JUDGE_ERROR, this is not the platform's fault).
   */
  tampered?: boolean;
}

interface CompilerConfig {
  compiler: string;
  options?: string;
  compilerOptionRaw?: string;
}

const EXECUTOR_URL = process.env.EXECUTOR_URL || 'https://codescriet-executor.developer-aary.workers.dev/execute';
const EXECUTOR_ORIGIN_HEADER = process.env.EXECUTOR_ORIGIN_HEADER
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:5002' : 'https://code.codescriet.dev');
// Shared secret for the CF Worker (M1). Optional — the worker only enforces it
// once EXECUTOR_SECRET is set in ITS environment; sending it unconditionally
// when configured here makes the judge ready for that flip.
const EXECUTOR_SECRET = process.env.EXECUTOR_SECRET || '';
// Local Judge0 engine (CodeBox, loopback). Same box, no external dependency;
// the CF Worker chain below stays as the backstop when CodeBox is unhealthy.
const CODEBOX_URL = process.env.CODEBOX_URL || 'http://127.0.0.1:3000';
const CODEBOX_TOKEN = process.env.CODEBOX_TOKEN || '';
const CODEBOX_LANG_IDS: Record<ProblemLanguage, number> = {
  PYTHON: 71,
  JAVASCRIPT: 63,
  CPP: 54,
  JAVA: 62,
};
const EXECUTION_TIMEOUT_MS = 15_000;
// Compiled languages (Java, C++) need extra headroom for compilation + the
// per-test fork/ClassLoader isolation overhead. Interpreted languages stay
// at the baseline.
const COMPILED_EXECUTION_TIMEOUT_MS = 30_000;
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

// Wandbox runs every execution in a throwaway container. When its host is out of
// capacity the upstream returns messages like
//   "Error: OCI runtime error: crun: clone: Resource temporarily unavailable"
// (a clone()/fork() EAGAIN) inside compiler_error / stderr, with no program
// output. That is an infrastructure outage — NOT the student's code. It must
// surface as JUDGE_ERROR (retryable, rolls back the submit cap, never persists a
// verdict), never as COMPILATION_ERROR, which would both mislead the user and
// clobber a prior ACCEPTED verdict on resubmit.
const INFRA_FAILURE_RE = /OCI runtime|\bcrun\b|\brunc\b|Resource temporarily unavailable|Cannot allocate memory|cannot fork|pthread_create|No space left on device|\bEAGAIN\b/i;

function isInfraFailure(text: string | undefined): boolean {
  return !!text && INFRA_FAILURE_RE.test(text);
}

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

function buildHarness(language: ProblemLanguage, userCode: string, testCases: Array<{ id: string; input: string }>, timeLimitMs: number, nonce: string): string {
  const opts = { userCode, testCases, approach: 'A' as const, timeLimitMs, nonce };
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

function decodeFramePayload(payload: string): string {
  try {
    return Buffer.from(payload, 'base64').toString('utf8');
  } catch {
    return '[judge output decode failed]';
  }
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
  raw = scrubHarnessInternals(raw);

  let hint = '';
  if (language === 'CPP' && /__user_main\b/.test(raw)) {
    hint = [
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
  } else if (language === 'JAVA' && /__UserMain\b/.test(raw)) {
    // `__UserMain` is the harness's renamed copy of the student's `class Main`; it
    // only appears in errors when there's no `Main` class or its main() signature is
    // wrong (ClassNotFoundException: __UserMain / NoSuchMethodException: __UserMain.main).
    // Keying on it alone avoids misfiring on a student's own reflection errors.
    hint = [
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

  if (!hint) return raw;

  // Keep the student's REAL compiler errors below the hint — a typo'd `int main`
  // (e.g. `i main()` / `whil`) produces genuine errors they need to see, which the
  // hint must not hide. Drop only the harness-internal frames that reference our
  // wrapper symbols (pure noise to them). If nothing but harness noise remains
  // (a true no-entry-point submission), show just the hint.
  const HARNESS_SYMBOLS = /\b(?:__user_main|__UserMain|__invoke_user_main|__run_one_test|__JudgeTest)\b/;
  const realErrors = raw
    .split('\n')
    .filter((line) => !HARNESS_SYMBOLS.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return realErrors
    ? `${hint}\n\n──────────────────────────\nCompiler output:\n${realErrors}`
    : hint;
}

export async function runJudge(req: JudgeRequest): Promise<JudgeResult> {
  // Admin-selected execution provider setting (wandbox | godbolt | balanced),
  // read from the 5-min settings cache so this stays a no-op DB-wise on the hot
  // judge path. The router resolves it to ONE concrete provider per request
  // (balanced = least-loaded split, JS pinned to Wandbox, unhealthy providers
  // deprioritized); the CF Worker still falls back to the other host on an
  // infra failure as the last-resort net.
  const setting = await getConfiguredProviderSetting();
  const provider = executionRouter.chooseProvider(setting, req.language, req.mode);
  const release = await executionRouter.acquire(provider, req.mode);
  const totalStartedAt = Date.now();

  try {
    const compiler = COMPILERS[req.language];
    const nonce = makeJudgeNonce();
    const marker = frameMarker(nonce);
    const wrappedCode = buildHarness(
      req.language,
      req.userCode,
      req.testCases.map(({ id, input }) => ({ id, input })),
      req.timeLimitMs,
      nonce,
    );
    const stdin = buildJudgeStdin(req.testCases.map(({ id, input }) => ({ id, input })), nonce);
    const controller = new AbortController();
    const isCompiled = req.language === 'CPP' || req.language === 'JAVA';
    const ceiling = isCompiled ? COMPILED_EXECUTION_TIMEOUT_MS : EXECUTION_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), Math.max(ceiling, req.timeLimitMs + 5_000));

    let workerResult: Record<string, unknown>;
    try {
      if (provider === 'codebox') {
        workerResult = await runJudgeViaCodeBox(req.language, wrappedCode, stdin, controller.signal);
      } else {
        const response = await fetch(EXECUTOR_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: EXECUTOR_ORIGIN_HEADER,
            ...(EXECUTOR_SECRET ? { 'X-Executor-Secret': EXECUTOR_SECRET } : {}),
          },
          body: JSON.stringify({
            compiler: compiler.compiler,
            code: wrappedCode,
            stdin,
            options: compiler.options || '',
            provider,
            ...(compiler.compilerOptionRaw ? { 'compiler-option-raw': compiler.compilerOptionRaw } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          logger.warn('Judge worker returned non-OK response', { status: response.status });
          // 5xx from the worker = every reachable upstream failed for this request.
          if (response.status >= 500) executionRouter.reportInfraFailure(provider);
          return {
            verdict: 'JUDGE_ERROR',
            perTestVerdicts: [],
            totalRuntimeMs: Date.now() - totalStartedAt,
            compilerOutput: truncate(await response.text(), COMPILER_OUTPUT_LIMIT),
          };
        }

        workerResult = await response.json() as Record<string, unknown>;
      }
    } catch (error) {
      logger.error('Judge worker request failed', { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        // F-4: this is OUR client-side ceiling on the whole batch, not the
        // student's per-test limit (each harness enforces that itself and frames
        // TIMEOUT per test). Reporting TIME_LIMIT_EXCEEDED blamed correct code
        // for a batch that was merely slow in aggregate. JUDGE_ERROR is the
        // honest classification: it refunds the cap + daily quota and files the
        // submission for review.
        logger.warn('Judge upstream call aborted at the client ceiling', {
          language: req.language,
          tests: req.testCases.length,
        });
        return {
          verdict: 'JUDGE_ERROR',
          perTestVerdicts: [],
          totalRuntimeMs: Date.now() - totalStartedAt,
          compilerOutput: 'The judge took too long to respond and the attempt was not counted. Please try again.',
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

    // Health accounting for the router. A redeployed worker reports which
    // provider actually served (`judge_provider`) and whether the requested one
    // infra-failed en route (`judge_fallback`); with an older deployed worker
    // those fields are absent and accounting degrades to requested-provider-only.
    const servedProvider: ExecutionProvider | null =
      workerResult.judge_provider === 'wandbox' || workerResult.judge_provider === 'godbolt'
        ? workerResult.judge_provider
        : null;
    if (workerResult.judge_fallback === true) {
      executionRouter.reportInfraFailure(provider);
    }

    const stdout = cleanWorkerText(workerResult.program_output);
    const stderr = cleanWorkerText(workerResult.program_error);
    const compilerError = cleanWorkerText(workerResult.compiler_error);
    const compilerOutput = cleanWorkerText(workerResult.compiler_output);
    const status = Number.parseInt(String(workerResult.status ?? '0'), 10) || 0;
    const signal = cleanWorkerText(workerResult.signal);
    const combinedCompilerOutput = truncate([compilerOutput, compilerError, stderr].filter(Boolean).join('\n'), COMPILER_OUTPUT_LIMIT);

    // Upstream container/host capacity failure (no program ran) — classify as a
    // retryable judge outage, not a code-compilation failure.
    if (!stdout.includes(marker) && (isInfraFailure(compilerError) || isInfraFailure(stderr))) {
      logger.warn('Judge upstream resource failure', { snippet: (compilerError || stderr).slice(0, 200) });
      // An infra result surviving the worker's chain means every provider that
      // could run this language failed — cool down both we know about.
      executionRouter.reportInfraFailure(provider);
      if (servedProvider && servedProvider !== provider) executionRouter.reportInfraFailure(servedProvider);
      return {
        verdict: 'JUDGE_ERROR',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: 'Execution service is temporarily unavailable. Please try again in a moment.',
      };
    }

    // Any non-infra result (accepted / wrong answer / compile error / TLE) came
    // from a healthy host.
    executionRouter.reportSuccess(servedProvider ?? provider);

    if (compilerError && !stdout.includes(marker)) {
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

    const { frames, tampered, complete } = parseFrames(stdout, nonce);

    // Forgery attempt: a duplicate frame for one test id. The genuine frame is
    // always emitted by the harness, so a submission that writes its own frames
    // necessarily collides. Never trust this run, and never refund it.
    if (tampered) {
      logger.error('Judge output tampering detected', {
        language: req.language,
        tests: req.testCases.length,
      });
      return {
        verdict: 'JUDGE_ERROR',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: 'The judge could not verify this run. Your submission has been flagged for manual review.',
        tampered: true,
      };
    }

    // Frames for tests we never sent — only a forger produces these.
    const requestedIds = new Set(req.testCases.map((test) => test.id));
    for (const id of frames.keys()) {
      if (!requestedIds.has(id)) {
        logger.error('Judge frame for an unknown test id', { language: req.language, id });
        return {
          verdict: 'JUDGE_ERROR',
          perTestVerdicts: [],
          totalRuntimeMs: Date.now() - totalStartedAt,
          compilerOutput: 'The judge could not verify this run. Your submission has been flagged for manual review.',
          tampered: true,
        };
      }
    }

    // The harness did not reach its end sentinel — it was killed mid-run (e.g. a
    // submission calling System.exit / os._exit). Frames collected so far may be
    // a partial view, so don't score it.
    if (frames.size > 0 && !complete) {
      return {
        verdict: 'JUDGE_ERROR',
        perTestVerdicts: [],
        totalRuntimeMs: Date.now() - totalStartedAt,
        compilerOutput: 'The program exited before the judge finished running every test. Avoid terminating the process (e.g. System.exit / sys.exit / os._exit) in your solution.',
      };
    }

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
        const scrubbed = scrubHarnessInternals(decoded);
        return {
          testId: testCase.id,
          passed: false,
          actualOutput: truncate(scrubbed, ACTUAL_OUTPUT_LIMIT),
          runtimeMs: frame.runtimeMs,
          error: truncate(scrubbed, ACTUAL_OUTPUT_LIMIT),
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
