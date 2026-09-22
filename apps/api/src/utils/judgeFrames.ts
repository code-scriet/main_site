import { randomBytes } from 'node:crypto';

/**
 * The judge's frame protocol, kept free of Prisma/network imports so it can be
 * unit-tested directly.
 *
 * Every harness reports each test as one line:
 *
 *   __JUDGE_<nonce>:<testId>:<status>:<runtimeMs>:<base64 payload>
 *
 * and one final `__end` sentinel proving it ran to completion.
 *
 * Two properties make the stream trustworthy, and BOTH are load-bearing:
 *
 *  1. **The nonce is unguessable and out of band.** It is generated per run and
 *     delivered as the first line of the judge stdin — never embedded in the
 *     generated source, so a submission cannot recover it by reading its own
 *     program file.
 *  2. **First frame wins, and a duplicate is treated as tampering.** The harness
 *     always emits the genuine frame, so any forged one necessarily collides.
 *     This holds even if the nonce were somehow leaked.
 *
 * Both exist because the original protocol had neither: frames were matched on a
 * bare `__JUDGE:` prefix and stored last-wins, so a submission could print its
 * own frames to fd 1 from a deferred hook (atexit / JVM shutdown hook /
 * setTimeout) after the harness had emitted the real ones, and be marked
 * ACCEPTED without solving anything.
 */

export const END_SENTINEL_ID = '__end';

export function makeJudgeNonce(): string {
  return randomBytes(12).toString('hex');
}

export function frameMarker(nonce: string): string {
  return `__JUDGE_${nonce}:`;
}

/** Judge stdin: nonce line, then the test list. */
export function buildJudgeStdin(testCases: Array<{ id: string; input: string }>, nonce: string): string {
  let stdin = `__NONCE=${nonce}\n`;
  stdin += `__N=${testCases.length}\n`;
  for (const testCase of testCases) {
    const input = testCase.input ?? '';
    stdin += `__ID=${testCase.id}\n`;
    stdin += `__LEN=${Buffer.byteLength(input, 'utf8')}\n`;
    stdin += input;
    stdin += '\n';
  }
  return stdin;
}

export interface ParsedFrames {
  frames: Map<string, { status: string; runtimeMs: number; payload: string }>;
  /** A duplicate frame for one test id — the signature of a forgery attempt. */
  tampered: boolean;
  /** The harness emitted its end sentinel, i.e. it ran every test to completion. */
  complete: boolean;
}

export function parseFrames(stdout: string, nonce: string): ParsedFrames {
  const marker = frameMarker(nonce);
  const frames = new Map<string, { status: string; runtimeMs: number; payload: string }>();
  let tampered = false;
  let complete = false;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(marker)) continue;
    const parts = line.slice(marker.length).split(':');
    if (parts.length < 4) continue;
    const [testId, status, runtimeRaw, ...payloadParts] = parts;
    if (testId === END_SENTINEL_ID) {
      complete = true;
      continue;
    }
    if (frames.has(testId)) {
      tampered = true;
      continue;
    }
    frames.set(testId, {
      status,
      runtimeMs: Number.parseInt(runtimeRaw, 10) || 0,
      payload: payloadParts.join(':'),
    });
  }
  return { frames, tampered, complete };
}

/**
 * Remove judge-harness internals from student-facing text.
 *
 * A failing submission's traceback carried harness frames — `/home/wandbox/prog.py`,
 * `at runOne (/home/wandbox/prog.js:88:8)` — which leak the wrapper's structure and
 * advertise the frame protocol. The user's OWN frames (`File "<string>", line N`)
 * are kept: they are the only actionable part of a stack trace.
 */
export function scrubHarnessInternals(text: string): string {
  if (!text) return text;
  const HARNESS_FILE = /(?:\/home\/wandbox\/)?prog\.(?:py|js|java|cpp|c)\b/;
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!HARNESS_FILE.test(lines[i])) {
      kept.push(lines[i]);
      continue;
    }
    // A Python/Java stack frame spans TWO lines — the `File "..."` line and the
    // echoed source line under it. Dropping only the first left the harness's
    // own source visible, so consume the indented continuation lines that belong
    // to this frame as well.
    while (
      i + 1 < lines.length
      && /^\s+/.test(lines[i + 1])
      && !/^\s*(?:File |at )/.test(lines[i + 1])
    ) {
      i += 1;
    }
  }
  return kept
    .join('\n')
    .replace(/(?:\/home\/wandbox\/)?prog\.(?:py|js|java|cpp|c)\b/g, '<judge>')
    .replace(/\bevalmachine\.<anonymous>/g, 'main')
    .replace(/\b__(?:UserMain|user_main|judge_[A-Za-z_]+|JudgeTest|TestOutcome)\b/g, 'main')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
