# 07 — Bugs Found by Testing

> **Status:** complete · **Date:** 2026-08-30 · **Method:** exploits built against the **real**
> harness code (`buildHarness` imported directly) and executed on the real upstream.
>
> ✅ **ALL FIVE FIXED AND VERIFIED (2026-08-31).** See [§ Fixes applied](#fixes-applied) at the end.
> Every exploit below was re-run against the patched harnesses on the real upstream: **13/13 checks
> pass**, and the stability suite went 351 → 371 (20 new regression tests), 0 fail.

**Baseline:** `npm run test:stability` → **351 pass, 0 fail**. Nothing below is a regression; all of
it is pre-existing.

| # | Finding | Severity | Affects |
|---|---|---|---|
| **F-1** | **Judge frame forgery → arbitrary ACCEPTED verdict** | 🔴 **Critical** | Python, Java, JavaScript |
| **F-2** | JS harness `require` passthrough → sandbox escape | 🟠 High | JavaScript |
| **F-3** | `fakeFs` shim bypassed by `node:` prefix | 🟠 High | JavaScript |
| **F-4** | False `TIME_LIMIT_EXCEEDED` on slow batches | 🟠 High | All |
| **F-5** | Harness internals leak in error output | 🟡 Low | All |

---

## F-1 · Grade forgery — 🔴 Critical

A student can obtain **ACCEPTED on any problem without solving it**.

### Cause: two independent weaknesses that compose

**(a) Frames are unauthenticated.** `parseFrames` trusts any stdout line beginning with `__JUDGE:`
([codeJudge.ts:135-148](../../apps/api/src/utils/codeJudge.ts)).

**(b) Last frame wins.** `frames.set(testId, …)` overwrites silently, so a frame emitted *after* the
genuine one replaces it.

Combined: emit forged frames **after** the harness has printed its real ones — from a deferred hook
that runs at interpreter/JVM shutdown, after the synchronous test loop.

### Why three of four languages fall

The difference is **process isolation**, not language:

| Harness | User code runs | Real fd 1 reachable? | Result |
|---|---|---|---|
| Python | in-process, `sys.stdout = io.StringIO()` ([python.ts:48,55](../../apps/api/src/utils/judgeHarnesses/python.ts)) | **yes** — `os.write(1, …)` bypasses a language-level swap | ✗ **forged** |
| Java | in-process, `System.setOut(fakeOut)` ([java.ts:116](../../apps/api/src/utils/judgeHarnesses/java.ts)) | **yes** — `new FileOutputStream(FileDescriptor.out)` | ✗ **forged** |
| JavaScript | `vm` sandbox, `console` captured | **yes** — `require('node:fs').writeSync(1, …)` | ✗ **forged** |
| **C++** | **`fork()` + `dup2` on fd 0/1/2** ([cpp.ts:126,136-138](../../apps/api/src/utils/judgeHarnesses/cpp.ts)) | **no** — the child's fd 1 *is* the pipe | ✅ **resisted** |

**C++ is safe because it forks.** The other three swap stdout at the language level, which any direct
file-descriptor write goes under.

### Proof — Java (the R1 launch subject)

Submission defines no solution and prints `"deliberately wrong"`, but registers a shutdown hook
writing forged frames to `FileDescriptor.out`. Actual upstream output:

```
__JUDGE:t1:RESULT:70:ZGVsaWJlcmF0ZWx5IHdyb25nCg==   ← genuine ("deliberately wrong")
__JUDGE:t2:RESULT:1:ZGVsaWJlcmF0ZWx5IHdyb25nCg==    ← genuine
__JUDGE:t1:RESULT:1:OA==                            ← forged ("8")
__JUDGE:t2:RESULT:1:MzA=                            ← forged ("30")

t1: "8" vs "8"   => PASS
t2: "30" vs "30" => PASS
JAVA VERDICT: *** ACCEPTED — FORGED ***
```

Python reproduces identically via `atexit` + `os.write(1, …)`; JavaScript via
`setTimeout(…)` + `require('node:fs')`.

### Impact

Applies to **every** context — QOTD streaks and leaderboards, Practice, and **graded CONTEST rounds
that issue certificates**. The `__JUDGE:` protocol is visible in student-facing error output (F-5)
and the repository is Apache-2.0 licensed, so the format is discoverable rather than secret.

### Recommended fix — layered

1. **Reject duplicate `testId` frames** *(cheapest, and it alone defeats all three exploits)*. The
   genuine frame is always emitted too, so any forgery produces **two** frames for one id. Treat a
   duplicate as tampering → `JUDGE_ERROR` + `needsReview`, never a pass. ~10 lines in `parseFrames`.
2. **Nonce the marker.** Pass a per-run random token through the existing stdin protocol; emit
   `__JUDGE_<nonce>:` and accept only that prefix. Note the nonce is *not* a complete defence on its
   own — in-process user code can read the harness source (`/home/wandbox/prog.py`) — which is
   exactly why (1) matters.
3. **Adopt the C++ model where practical.** `os.fork()` per test in Python mirrors the design that
   already resists this. The correct long-term fix; larger change.
4. **Strip `__JUDGE` from captured payloads** before emitting, as defence in depth.

Fix (1) + (2) is small and closes the hole; (3) is the durable answer.

---

## F-2 · JS sandbox escape — 🟠 High

[javascript.ts:81](../../apps/api/src/utils/judgeHarnesses/javascript.ts):

```js
require: (name) => (name === 'fs' ? fakeFs : require(name)),
```

**Every module except `fs` is passed through to the real `require`** — deny-nothing. Verified live:

```
ESCAPE_PROBE=uid=999(wandbox) gid=999(wandbox) groups=999(wandbox)
```

…from `require('child_process').execSync('id')` inside a submission. `net`, `http`, `os` are equally
reachable.

**Mitigating context:** this escapes *our* `vm` sandbox, not Wandbox's container — the upstream
sandbox (uid 999, ephemeral) is what actually contains it, and that protection applies to all
submitted code anyway. So the practical impact is grade forgery (F-1) plus outbound network from a
throwaway container, not compromise of our infrastructure.

**Fix:** allowlist by default — resolve a small set (`fs`→shim, `util`, `assert`) and throw on
everything else.

## F-3 · `fakeFs` bypassed by the `node:` prefix — 🟠 High

The shim matches the exact string `'fs'`, so `require('node:fs')` returns the **real** module. Verified
— it is the write primitive in the JS forgery.

**Fix:** normalise the specifier (strip a leading `node:`) before the allowlist check. One line, and it
should land with F-2.

## F-4 · False `TIME_LIMIT_EXCEEDED` — 🟠 High

Already documented in [01_FEASIBILITY](./01_FEASIBILITY.md) §A4; repeated here because it is a
**pre-existing bug**, not an OPPE concern. The judge aborts its own upstream call at
`EXECUTION_TIMEOUT_MS = 15_000` / `COMPILED_EXECUTION_TIMEOUT_MS = 30_000`
([codeJudge.ts:49,53,241](../../apps/api/src/utils/codeJudge.ts)) and returns
**`TIME_LIMIT_EXCEEDED`** ([codeJudge.ts:279-284](../../apps/api/src/utils/codeJudge.ts)) — blaming
the student for a batch that was merely slow in aggregate.

Measured headroom is comfortable today (Python 2.81 s / Java 3.72 s per 10-test batch), so this bites
only large or slow batches — and would bite System Commands hard, where `timeout N` runs serially.

**Fix:** distinguish "upstream aborted" from "student code timed out" — the former is `JUDGE_ERROR`
(refunds cap + quota, flags `needsReview`), which the platform already handles well.

## F-5 · Harness internals leak — 🟡 Low

Student-visible errors expose harness paths and line numbers: `/home/wandbox/prog.js:88`,
`/home/wandbox/prog.py`, `at runOne (…)`. Consistent with [00_SPIKE](./00_SPIKE.md) F5 (source lines
do **not** leak; frames and messages do). Harmless alone, but it is how a student discovers the
`__JUDGE:` protocol that F-1 abuses.

**Fix:** scrub frames whose filename is the harness file before returning `compilerOutput` — the same
change already planned as **P7**.

---

## Suggested order

| Priority | Action | Effort |
|---|---|---|
| 1 | F-1 fix (1) duplicate-`testId` rejection | ~1 hour |
| 2 | F-1 fix (2) nonced marker | ~2 hours |
| 3 | F-2 + F-3 require allowlist with `node:` normalisation | ~1 hour |
| 4 | F-4 abort → `JUDGE_ERROR` | ~1 hour |
| 5 | F-5 / P7 frame scrubbing | ~2 hours |
| 6 | F-1 fix (3) fork-per-test for Python | ~1 day |

**Regression tests to add** (the suite has no judge-tampering coverage today): a forged-frame fixture
per language asserting the verdict is *not* ACCEPTED, and a `require('node:fs')` /
`require('child_process')` fixture asserting rejection. These belong in `test:stability`, which
already runs DB-free.


---

## Fixes applied

All five findings are fixed, with the exploits re-run against the patched code on the real upstream.

### The shared root cause

Frames were matched on a bare `__JUDGE:` prefix and stored **last-wins**, and three of four harnesses
redirected stdout at the *language* level, which a direct file-descriptor write walks straight past.

### What changed

| Fix | Where |
|---|---|
| **Per-run nonce, delivered out of band.** Frames are `__JUDGE_<nonce>:…`; the nonce is the first stdin line (`__NONCE=`) and is **never embedded in the generated source**, so a submission cannot read it out of its own program file | new [judgeFrames.ts](../../apps/api/src/utils/judgeFrames.ts) + all 4 harnesses |
| **First frame wins; a duplicate test id ⇒ `tampered`.** The genuine frame is always emitted, so any forgery collides — this holds even if a nonce leaked | [judgeFrames.ts](../../apps/api/src/utils/judgeFrames.ts) `parseFrames` |
| **`__end` sentinel.** A run that killed the process early (`System.exit`) to suppress genuine frames has no sentinel ⇒ `JUDGE_ERROR`, never scored | all 4 harnesses + [codeJudge.ts](../../apps/api/src/utils/codeJudge.ts) |
| **Frames for unrequested test ids ⇒ `tampered`** | [codeJudge.ts](../../apps/api/src/utils/codeJudge.ts) |
| **Tampered runs are NOT refunded** — unlike a genuine outage, they consume the attempt and daily unit, so forging cannot buy unlimited probes | [problemsCore.ts](../../apps/api/src/utils/problemsCore.ts) |
| **Python now forks per test** (`fork` + `dup2`, mirroring C++), and the child scrubs its inherited nonce. User code no longer holds the real stdout at all | [python.ts](../../apps/api/src/utils/judgeHarnesses/python.ts) |
| **Java keeps the nonce in a `main()` local** — not a static field, so reflection cannot reach it | [java.ts](../../apps/api/src/utils/judgeHarnesses/java.ts) |
| **JS sandbox is allowlist-only:** `require` refuses everything outside a safe set, `node:` prefixes are normalised, the `fs` shim is a minimal stdin-only object (no longer a Proxy over the real module), and `process` is built explicitly instead of spread — closing `mainModule.require` and real `process.on` hooks | [javascript.ts](../../apps/api/src/utils/judgeHarnesses/javascript.ts) |
| **F-4:** batch-ceiling abort now returns `JUDGE_ERROR` (refund + review) instead of blaming the student with `TIME_LIMIT_EXCEEDED` | [codeJudge.ts](../../apps/api/src/utils/codeJudge.ts) |
| **F-5:** `scrubHarnessInternals()` removes harness paths and their *multi-line* stack frames, keeping the user's own frames | [judgeFrames.ts](../../apps/api/src/utils/judgeFrames.ts) |

### Verification

Re-run live against `wandbox.org` — **13/13**:

```
PASS  PYTHON/JAVASCRIPT/JAVA/CPP legit solution accepted     (all 4, complete=true)
PASS  PYTHON     frame forgery rejected
PASS  JAVASCRIPT frame forgery rejected
PASS  JAVA       frame forgery rejected
PASS  JS child_process / node:fs write / net / process.on  — all BLOCKED
PASS  JAVA System.exit suppression rejected                  (complete=false)
PASS  PYTHON error output free of harness internals
```

Python is the strongest result: the forged writes now land in the child's pipe and surface as the
*payload* (`"deliberately wrong"`), so forgery is **structurally impossible** rather than merely
detected.

Regression coverage: **20 new tests** in
[judgeFrames.test.ts](../../apps/api/src/utils/judgeFrames.test.ts) — nonce handling, non-nonce frames
ignored, duplicate ⇒ tampered with first-wins, sentinel completeness, byte-accurate `__LEN`, scrubbing
(including the multi-line-frame case that my first scrubber got wrong), plus per-harness assertions
that the nonce is never embedded, Python forks, and the JS sandbox stays allowlist-only.
Suite: **351 → 371, 0 fail.** Lint and typecheck clean.

### Deliberately not done

**Per-test JVM subprocess for Java.** Java cannot `fork`, so its isolation rests on the nonce being
unreachable (a `main()` local) plus duplicate detection and the sentinel — which defeats every vector
tested. A per-test subprocess would make Java structurally safe like Python and C++, at roughly
+100–200 ms per test. Worth doing if Java becomes the launch subject; not worth the regression risk
in a security patch.
