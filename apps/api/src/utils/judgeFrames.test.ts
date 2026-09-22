import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJudgeStdin,
  frameMarker,
  makeJudgeNonce,
  parseFrames,
  scrubHarnessInternals,
} from './judgeFrames.js';
import { buildHarness as buildPython } from './judgeHarnesses/python.js';
import { buildHarness as buildJavaScript } from './judgeHarnesses/javascript.js';
import { buildHarness as buildJava } from './judgeHarnesses/java.js';
import { buildHarness as buildCpp } from './judgeHarnesses/cpp.js';

const NONCE = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const M = frameMarker(NONCE);
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

// ── nonce ────────────────────────────────────────────────────────────────────
test('makeJudgeNonce returns a long unpredictable hex token', () => {
  const a = makeJudgeNonce();
  const b = makeJudgeNonce();
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.notEqual(a, b);
});

// ── parseFrames ──────────────────────────────────────────────────────────────
test('parseFrames reads frames carrying the run nonce', () => {
  const out = `${M}t1:RESULT:5:${b64('8')}\n${M}t2:RESULT:6:${b64('30')}\n${M}__end:OK:0:`;
  const { frames, tampered, complete } = parseFrames(out, NONCE);
  assert.equal(frames.size, 2);
  assert.equal(tampered, false);
  assert.equal(complete, true);
  assert.equal(Buffer.from(frames.get('t1')!.payload, 'base64').toString(), '8');
  assert.equal(frames.get('t2')!.runtimeMs, 6);
});

test('parseFrames IGNORES frames that do not carry the run nonce (forgery without the token)', () => {
  // Exactly what the old exploit wrote: a bare `__JUDGE:` line.
  const out = `__JUDGE:t1:RESULT:1:${b64('8')}\n${M}t1:RESULT:5:${b64('wrong')}\n${M}__end:OK:0:`;
  const { frames, tampered } = parseFrames(out, NONCE);
  assert.equal(frames.size, 1);
  assert.equal(tampered, false, 'a non-nonce line is not even considered a frame');
  assert.equal(Buffer.from(frames.get('t1')!.payload, 'base64').toString(), 'wrong');
});

test('parseFrames flags a duplicate test id as tampering and keeps the FIRST frame', () => {
  // The genuine frame is always emitted, so a forgery that guessed the nonce
  // still collides with it.
  const out = `${M}t1:RESULT:5:${b64('wrong')}\n${M}t1:RESULT:1:${b64('8')}\n${M}__end:OK:0:`;
  const { frames, tampered } = parseFrames(out, NONCE);
  assert.equal(tampered, true);
  assert.equal(Buffer.from(frames.get('t1')!.payload, 'base64').toString(), 'wrong',
    'first frame wins — a later forged one must never overwrite it');
});

test('parseFrames reports complete=false when the end sentinel is missing', () => {
  const out = `${M}t1:RESULT:5:${b64('8')}`;
  assert.equal(parseFrames(out, NONCE).complete, false);
});

test('parseFrames preserves base64 payloads and skips malformed lines', () => {
  const payload = b64('a:b:c');
  const out = `${M}t1:RESULT:5:${payload}\n${M}broken\nnoise\n${M}__end:OK:0:`;
  const { frames } = parseFrames(out, NONCE);
  assert.equal(frames.size, 1);
  assert.equal(Buffer.from(frames.get('t1')!.payload, 'base64').toString(), 'a:b:c');
});

// ── stdin ────────────────────────────────────────────────────────────────────
test('buildJudgeStdin puts the nonce on the first line, ahead of the test list', () => {
  const stdin = buildJudgeStdin([{ id: 't1', input: 'hi' }], NONCE);
  const lines = stdin.split('\n');
  assert.equal(lines[0], `__NONCE=${NONCE}`);
  assert.equal(lines[1], '__N=1');
});

test('buildJudgeStdin measures __LEN in BYTES, not characters', () => {
  const stdin = buildJudgeStdin([{ id: 't1', input: 'héllo' }], NONCE);
  assert.match(stdin, /__LEN=6\n/);
});

// ── scrubbing (F-5) ──────────────────────────────────────────────────────────
test('scrubHarnessInternals drops harness stack frames but keeps the user’s own', () => {
  const raw = [
    'Traceback (most recent call last):',
    '  File "/home/wandbox/prog.py", line 73, in <module>',
    '    for test_id, body in _read_tests():',
    '  File "<string>", line 2, in <module>',
    'NameError: name \'f\' is not defined',
  ].join('\n');
  const out = scrubHarnessInternals(raw);
  assert.ok(!out.includes('prog.py'), 'harness path removed');
  assert.ok(!out.includes('_read_tests'), 'harness frame body removed');
  assert.ok(out.includes('File "<string>", line 2'), 'user frame kept');
  assert.ok(out.includes('NameError'), 'the actual error is kept');
});

test('scrubHarnessInternals neutralises stray harness references and is empty-safe', () => {
  assert.ok(!scrubHarnessInternals('boom at evalmachine.<anonymous>:3:9').includes('evalmachine'));
  assert.equal(scrubHarnessInternals(''), '');
});

// ── harness builders ─────────────────────────────────────────────────────────
const BUILDERS: Array<[string, (o: any) => string]> = [
  ['python', buildPython],
  ['javascript', buildJavaScript],
  ['java', buildJava],
  ['cpp', buildCpp],
];

for (const [name, build] of BUILDERS) {
  const source = build({
    userCode: name === 'java' ? 'public class Main { public static void main(String[] a) {} }' : '',
    testCases: [{ id: 't1', input: '1' }],
    approach: 'A',
    timeLimitMs: 2000,
    nonce: NONCE,
  });

  test(`${name} harness never embeds the nonce in its generated source`, () => {
    // If the nonce appeared here, a submission could read its own program file
    // and forge perfectly valid frames.
    assert.ok(!source.includes(NONCE), 'nonce must arrive via stdin only');
  });

  test(`${name} harness reads the nonce from stdin and emits an end sentinel`, () => {
    assert.ok(source.includes('__NONCE='), 'reads the nonce header');
    assert.ok(source.includes('__JUDGE_'), 'emits nonce-prefixed frames');
    assert.ok(source.includes('__end'), 'emits the completion sentinel');
  });
}

test('python harness isolates each test in a forked child process', () => {
  const source = buildPython({ userCode: '', testCases: [{ id: 't1', input: '' }], approach: 'A', timeLimitMs: 2000, nonce: NONCE });
  assert.ok(source.includes('os.fork()'), 'fork per test');
  assert.ok(source.includes('os.dup2'), 'child stdout is a pipe, not the real fd 1');
  assert.ok(source.includes('globals()["_NONCE"] = None'), 'child scrubs its inherited nonce');
});

test('javascript harness sandbox is allowlist-only and exposes no writable fs', () => {
  const source = buildJavaScript({ userCode: '', testCases: [{ id: 't1', input: '' }], approach: 'A', timeLimitMs: 2000, nonce: NONCE });
  assert.ok(source.includes('ALLOWED_MODULES'), 'module allowlist present');
  assert.ok(!source.includes("name === 'fs' ? fakeFs : require(name)"), 'no blanket require passthrough');
  assert.ok(source.includes("startsWith('node:')"), 'node: prefix is normalised');
  assert.ok(!source.includes('new Proxy(realFs'), 'fs shim is not a proxy over the real module');
  assert.ok(!source.includes('...process,'), 'process is built explicitly, not spread');
});
