# 01 — Per-Subject Feasibility & Capacity

> **Status:** complete · **Date:** 2026-08-29 · **Depends on:** [00_SPIKE.md](./00_SPIKE.md)
>
> Capacity figures are derived from **measured** round-trip latency against the real upstream, not
> estimated. Every code parameter is cited.

---

## Part A — Capacity

### A1. The parameters (read from source)

| Parameter | Value | Source |
|---|---|---|
| Submit concurrency | **5 per provider** | [executionRouting.ts:91](../../apps/api/src/utils/executionRouting.ts), env `JUDGE_SUBMIT_CONCURRENCY` |
| Testrun concurrency | **10 per provider** | [executionRouting.ts:92](../../apps/api/src/utils/executionRouting.ts), env `JUDGE_TESTRUN_CONCURRENCY` |
| Submit queue cap | **80 total waiters** | [executionRouting.ts:84](../../apps/api/src/utils/executionRouting.ts) |
| Testrun queue cap | **120 total waiters** | [executionRouting.ts:85](../../apps/api/src/utils/executionRouting.ts) |
| Infra-failure cooldown | **45 s** | [executionRouting.ts:83](../../apps/api/src/utils/executionRouting.ts) |
| Balanced mode | capacity **adds**, not shares | [executionRouting.ts:13](../../apps/api/src/utils/executionRouting.ts) |
| Over-cap behaviour | 503 `JUDGE_BUSY` **before** quota/cap consumed | [problemsCore.ts:584-592](../../apps/api/src/utils/problemsCore.ts) |
| Default provider | **`wandbox`** (single) | [schema.prisma:211](../../prisma/schema.prisma) |

### A2. Measured round-trip latency

One upstream call per submit (F-batching, [00_SPIKE](./00_SPIKE.md) F8). Realistic **10-test batch**,
measured wall-clock end-to-end against `wandbox.org/api/compile.json`:

| Language | Samples (s) | Median | Notes |
|---|---|---|---|
| Python (`cpython-3.12.7`) | 2.36 · 2.81 · 4.17 | **2.81** | interpreted |
| Java (`openjdk-jdk-21+35`) | 3.19 · 3.59 · 3.86 · 4.28 | **3.72** | includes `javac` |
| bash | 1.98 · 2.00 · 2.33 | **2.00** | 10 × `timeout 2` sub-runs |

All returned `status: "0"` with 10 `__JUDGE:` frames. godbolt latency **not measured** — figures below
use Wandbox latency for both lanes, which is conservative (prior evidence suggests godbolt is faster).

### A3. Throughput and the 503 threshold

Service rate `μ = concurrency ÷ latency`:

| Configuration | Submit μ | Testrun μ |
|---|---|---|
| **`wandbox` (the default)** — Python | 5 ÷ 2.81 = **1.78/s** (107/min) | 10 ÷ 2.81 = **3.56/s** |
| **`balanced`** — Python | 10 ÷ 2.81 = **3.56/s** (214/min) | 20 ÷ 2.81 = **7.12/s** |
| **`balanced`** — Java | 10 ÷ 3.72 = **2.69/s** (161/min) | 20 ÷ 3.72 = **5.38/s** |

**Sustained concurrent users.** Modelling an active practising student at 1 submit / 90 s and
1 test-run / 45 s (write → test → fix → submit):

| Configuration | Submit-limited | Testrun-limited | **Ceiling** |
|---|---|---|---|
| `wandbox`, Python | 1.78 × 90 = 160 | 3.56 × 45 = 160 | **~160 users** |
| `balanced`, Python | 3.56 × 90 = 320 | 7.12 × 45 = 320 | **~320 users** |
| `balanced`, Java | 2.69 × 90 = 242 | 5.38 × 45 = 242 | **~242 users** |

> **The answer: ~160 concurrent active users on today's default settings; ~320 with
> `codeExecutionProvider=balanced`.** Both lanes saturate at the same user count, which is a
> coincidence of the 2:1 concurrency ratio matching the 2:1 action ratio.

**Burst behaviour.** The 80-waiter submit queue absorbs a burst of 80 on top of 10 in flight; at
3.56/s that drains in ~22 s. The 91st simultaneous submitter gets 503 `JUDGE_BUSY` — but *before*
their attempt or daily quota is consumed ([problemsCore.ts:584](../../apps/api/src/utils/problemsCore.ts)),
so a busy judge is a retry, not a lost attempt. This is the single best-engineered part of the
existing pipeline for our purposes.

**Browser offload.** Practice run client-side removes the test-run lane entirely. Submits alone then
bind: `balanced` Python → 3.56/s × 90 s ≈ **320 users**, and the testrun lane's 120-waiter queue stops
competing for the same upstream. Because both lanes currently saturate together, **offloading
test-runs roughly doubles effective headroom** (the submit lane no longer shares upstream capacity
with 2× as many test-runs).

### A4. ⚠️ Hazard found: batch wall-clock causes **false TLEs**

The judge aborts its own upstream call at a fixed ceiling
([codeJudge.ts:241](../../apps/api/src/utils/codeJudge.ts)):

```ts
const ceiling = isCompiled ? COMPILED_EXECUTION_TIMEOUT_MS : EXECUTION_TIMEOUT_MS;
const timeout = setTimeout(() => controller.abort(), Math.max(ceiling, req.timeLimitMs + 5_000));
```

`EXECUTION_TIMEOUT_MS = 15_000`, `COMPILED_EXECUTION_TIMEOUT_MS = 30_000`
([codeJudge.ts:49,53](../../apps/api/src/utils/codeJudge.ts)). On abort the verdict is
**`TIME_LIMIT_EXCEEDED`** ([codeJudge.ts:279-284](../../apps/api/src/utils/codeJudge.ts)) — attributed
to the student, not to the platform.

So a batch that is merely *slow in aggregate* returns a false TLE against correct code. Budget:

| Language | Wall ceiling | Measured 10-test cost | Headroom |
|---|---|---|---|
| Python / bash | **15 s** | 2.0–2.8 s | ~5× |
| Java / C++ | **30 s** | 3.7 s | ~8× |

**This binds the F4 "one assertion per test case" decision.** System Commands runs `timeout N` per
test *serially* inside one call, so worst case ≈ N × testcount. With `N=2 s`, **20 tests = 40 s > the
15 s ceiling ⇒ every student gets a false TLE.** Concretely:

> **System Commands budget: `per-test timeout × hidden-test count` must stay under ~12 s**
> (15 s ceiling minus network). At `timeout 2` that is **≤ 6 tests**; at `timeout 1`, ≤ 12.
> Raising `EXECUTION_TIMEOUT_MS` for BASH is the alternative and must be a deliberate change.

Note the zod caps permit far more than the budget allows: `hiddenTests` max **100**, `sampleTests`
max **20** ([problems.ts:66-67](../../apps/api/src/routes/problems.ts)).

### A5. The upstream gateway cap (measured)

| Probe | Result |
|---|---|
| `sleep` 20 s | `status:"0"`, `DONE` reached, 22.77 s wall |
| `sleep` 40 s | `status:"0"`, `DONE` reached, 42.31 s wall |
| `sleep` 200 s | **`error code: 504`** — non-JSON body, ~60 s wall |

Wandbox itself happily ran 40 s; the binding limit is a **~60 s HTTP gateway timeout** returning a
**non-JSON body**. Our judge handles this correctly — `!response.ok` with `status >= 500` →
`JUDGE_ERROR` + `reportInfraFailure(provider)`
([codeJudge.ts:264-272](../../apps/api/src/utils/codeJudge.ts)), which refunds cap and quota. But it
also puts that provider on a **45 s cooldown**, so one over-long batch degrades the whole platform to
single-provider for 45 s. In practice A4's 15/30 s abort fires first, so this is a second-line
concern.

---

## Part B — Per-subject feasibility

| Subject | Target | Verdict | Gap |
|---|---|---|---|
| **Java** | Wandbox ⇄ godbolt (`java2202`) | ✅ **Ready today** | None. Content only |
| **Python** | Server now; browser later | ✅ Ready (server) | Browser judge for practice (F1/F2) |
| **PDSA** | Server now; browser later | ⚠️ **Fidelity gap** | Needs `check` function-call grading (F8) |
| **System Commands** | Wandbox **only** | ⚠️ Feasible, constrained | `prelude` + `check` + bash harness; **no fallback provider**; A4 budget |
| **C** | Wandbox ⇄ godbolt (`cg132`) | ⚠️ Blocked on one line | `ProblemLanguage` lacks `C` (F9); needs a C harness |
| **MLP** | — | ❌ **Out of v1** | 124 MB browser cost, no server path (F6) |
| **Big Data** | — | ❌ **Out** | See B6 |
| **MLOps** | — | ❌ **Out** | See B6 |

### B1. Java — ship this first

Everything exists: `JAVA` in `ProblemLanguage` ([schema.prisma:1458-1463](../../prisma/schema.prisma)),
[java.ts](../../apps/api/src/utils/judgeHarnesses/java.ts) with `URLClassLoader` static-state isolation
and `public class Main` → `class __UserMain` rewriting, `openjdk` → `java2202` godbolt mapping
([executor.js:121](../../workers/executor.js)), and the full dual-provider fallback chain.

Measured 3.72 s median for a 10-test batch; 30 s abort ceiling gives ~8× headroom. **Zero platform
work.** Question shape: stdin/stdout, which suits Java OPPE's typical "read input, print output" form
better than PDSA's.

*Gotcha for authors:* Wandbox compiles to `prog.java`, so a bare `public class Main` fails with
`class Main is public, should be declared in a file named Main.java` — I hit this while measuring.
The harness's `rewriteMainClass` already handles it; a raw reference solution pasted into an authoring
form will not.

### B2. Python — ready server-side

`cpython-3.12.7` ([codeJudge.ts:59](../../apps/api/src/utils/codeJudge.ts)), full fallback chain,
2.81 s median. Browser practice needs the new judge (F1) with Worker-`terminate()` timeouts (F2).

### B3. PDSA — the fidelity gap, not a platform gap

Runs on the same Python path, so execution is solved. The problem is **question shape**: PDSA is
"implement this class/function", and the judge is stdin/stdout only (F8). Without `check`,
PDSA questions must be rewritten as stdin/stdout wrappers — which students will recognise as unlike
the real exam.

**Recursion depth is the first CI divergence test** (F2): PDSA is trees, graphs and divide-and-conquer,
and WASM stack depth ≠ native. A browser-passing solution can `RecursionError` server-side.

### B4. System Commands — feasible, with two named constraints

Mechanism proven end-to-end (F3): prelude seeds the tree, `timeout N bash user.sh` per test in a fresh
directory, `check` projects stdout/exit-code/file-contents/permissions into stdout, existing
exact-match grader compares. Runaway containment verified.

Two constraints:
1. **No fallback provider.** `godboltCompiler()` returns `null` for anything that isn't
   cpython/gcc/clang/openjdk ([executor.js:116-123](../../workers/executor.js)), so bash is
   **Wandbox-only** — same single-point-of-failure JS has today. During a Wandbox outage, System
   Commands is fully down. For a 30 %-weightage subject in OPPE week, that is the headline risk.
2. **A4 budget:** ≤ ~6 hidden tests at `timeout 2`, or raise `EXECUTION_TIMEOUT_MS` for BASH.

Also needs `BASH` added to **both** `COMPILERS` tables ([codeJudge.ts:58](../../apps/api/src/utils/codeJudge.ts),
[execute-server.js:1033](../../apps/playground/execute-server.js)) — see F9/P3.

### B5. C — blocked on a one-line enum

Execution works: worker maps `*-c` → godbolt `cg132` ([executor.js:120](../../workers/executor.js)) and
the UI offers C ([languageConfig.ts:96](../../apps/playground/src/utils/languageConfig.ts)). But
`ProblemLanguage` has no `C` member, so **no C problem can be authored**. Needs the enum member, a C
harness (the C++ `fork()`-per-test harness is close but `#include <bits/stdc++.h>` is C++-only), and
both `COMPILERS` entries. Low effort, gated on P3.

### B6. Big Data and MLOps — recommend OUT, and not marginally

Both require the student's **own GCP account with billing enabled**, and are assessed on work inside
that account (Spark clusters, Dataproc, deployment pipelines). There is no artefact our judge can
grade: no stdin/stdout contract, no deterministic output, no bounded runtime. Nothing in the
architecture — browser, Wandbox, godbolt — executes them, and no plausible extension does.

They are also the weakest product fit: Degree-level, far smaller cohort than Foundation, and the
practice need is "how do I configure this", which is documentation, not a judge.

**Out. Not deferred — out**, and nothing in the schema plan forecloses adding a non-executed
question type later if that ever becomes interesting.

---

## Part C — What this means

1. **The traffic thesis survives, conditionally.** ~160 concurrent users on today's defaults is
   comfortably above any realistic early-stage load, and the single highest-leverage ops change —
   flipping `codeExecutionProvider` to `balanced` — **doubles it with no deploy**.
2. **The default is the wrong setting.** `wandbox` is the schema default
   ([schema.prisma:211](../../prisma/schema.prisma)); `balanced` should be set before any launch.
3. **A4 is a latent bug in the existing platform**, not just an OPPE concern. Any problem whose batch
   exceeds 15 s already returns a false TLE today. Worth fixing regardless.
4. **System Commands' real risk is availability, not mechanism.** The mechanism is proven; the
   single-provider exposure is the thing to design around.
5. **Java-first is confirmed by measurement**, not just by inventory: 3.72 s median, 8× ceiling
   headroom, zero platform work.

## Carried forward

| To | Item |
|---|---|
| `03_ARCHITECTURE` | Browser-judge design; whether to raise `EXECUTION_TIMEOUT_MS` for BASH; single-provider mitigation for bash |
| `04_SCHEMA_AND_CONTENT` | `ProblemLanguage += BASH, C`; `Problem.prelude`; `ProblemTestCase.check`; P3 consolidation |
| `05_ROADMAP` | Set `codeExecutionProvider=balanced` as a launch checklist item |
| `06_RISKS` | Wandbox single-provider exposure for bash; A4 false-TLE; 45 s cooldown amplification |
