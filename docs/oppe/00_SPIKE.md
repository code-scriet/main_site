# 00 — Spike Results

> **Status:** complete · **Date:** 2026-08-29 · **Method:** read-only source tracing + live probes
> against the real upstreams (`wandbox.org/api/compile.json`, `cdn.jsdelivr.net/pyodide`).
>
> This document exists because the first two planning drafts rested on three unverified assumptions,
> two of which turned out to be wrong. Everything downstream (`01_FEASIBILITY`, `02_AUDIT`,
> `03_ARCHITECTURE`) cites this file rather than re-deriving. Raw transcripts are pasted verbatim;
> nothing here is recalled from memory.

---

## Summary

| # | Question | Answer |
|---|---|---|
| F1 | Does browser execution already judge problems? | **No.** No browser judge exists at all |
| F2 | Can the API's Python harness run under Pyodide? | **No.** It starts a thread; Pyodide raises |
| F3 | Does bash support per-test isolation on Wandbox? | **Yes**, all four sub-questions proven |
| F4 | Does the composite-assertion design keep partial credit? | **No** — decompose, which F3 makes cheap |
| F5 | Does an author `check` snippet leak through tracebacks? | **Partially** — frames and messages, not source |
| F6 | Can Pyodide load scikit-learn, and at what cost? | Yes — **~124 MB**. MLP cut from v1 |
| F7 | Blast radius of a test-case contract change | **16 files**, ~12 type-widening only |
| F8 | What does `approach: 'A' \| 'B'` switch? | **Nothing.** Dead parameter; no function-call grading |
| F9 | Where does "judgeable language" truth live? | **Five unsynchronised places**, one with a manual-sync comment |

---

## F1 — There is no browser judge today

"Browser-first practice" was framed as offloading an existing path. It is not; it is a second
implementation of the judge contract.

| Evidence | Finding |
|---|---|
| `grep -n "pyodide\|ExecutionRouter\|runProblemTests"` in [QOTDSolverShell.tsx](../../apps/playground/src/components/problems/QOTDSolverShell.tsx) | **Zero hits** |
| [mainApi.ts:257-259](../../apps/playground/src/lib/mainApi.ts) | `POST /api/problems/:id/run` and `/submit` — the server judge, unconditionally |
| Importers of `pyodideEngine` | `ExecutionRouter`, `PlaygroundContext` (warm-up), `LanguageSidebar` (ready badge) — **free playground only** |

Every judged problem, Python included, is graded server-side. [ExecutionRouter.ts:8-14](../../apps/playground/src/engines/ExecutionRouter.ts)
documents a two-tier model (browser engines / cloud proxy) that the *playground* uses and the
*problem solver* does not touch.

**Consequence:** any browser-first plan carries the full cost of a second grader plus a drift-control
regime, not an incremental change.

---

## F2 — The API's Python harness cannot run under Pyodide

[judgeHarnesses/python.ts:63-73](../../apps/api/src/utils/judgeHarnesses/python.ts) implements the
per-test timeout with threads:

```python
    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(_TIME_LIMIT_MS / 1000.0)
    timed_out = not done[0]
    if timed_out:
        # Best-effort kill — the user thread might still be running but we
        # discard its eventual output and report TIMEOUT regardless.
        try:
            _thread.interrupt_main()
```

Pyodide can import `threading` but raises `RuntimeError` when any thread is started. The harness
therefore fails on its **first test**, not at the edges. An earlier draft filed this under
"manageable divergence" — that was wrong.

**Design implication.** The browser runner must use a Web Worker with `worker.terminate()` as its
timeout. That is strictly better than the server's mechanism: `_thread.interrupt_main()` is
explicitly best-effort and does not reliably stop runaway code, whereas `terminate()` does.
[ExecutionRouter.ts:10](../../apps/playground/src/engines/ExecutionRouter.ts) confirms Pyodide already
runs in a Worker, so the primitive exists; the judge contract on top of it does not.

**First CI divergence test: recursion depth.** WASM stack depth ≠ native CPython stack depth. PDSA is
trees, graphs and divide-and-conquer, so a recursive solution can pass one runtime and raise
`RecursionError` in the other. This lands on a target subject and must be the first equivalence test
written.

---

## F3 — System Commands isolation: all four questions closed

### Probe 1 — tooling and containment primitives

Request: `POST https://wandbox.org/api/compile.json`, `{"compiler":"bash","code": …}`

Response — `status: "0"`, `signal: ""`:

```
--- tooling ---
timeout: YES
stat: YES
setfacl: no
sudo: no
runuser: YES
unshare: YES
whoami: wandbox  uid=999
bash: 5.2.21(1)-release
--- timeout works? ---
timeout rc=124
--- subshell isolation: cd / + exit in user script ---
after subshell rc=3 pwd=/tmp/w/t1
f.txt still here: seed
--- chmod 000 cleanup ---
rm -rf chmod000 dir: OK
--- rm -rf of prior test tree ---
clean between tests: OK
```

| Sub-question | Answer |
|---|---|
| Is GNU `timeout` available? | **Yes** — kills an infinite loop, `rc=124` |
| Does a student `cd /` or `exit` corrupt the run? | **No** — `( … )` subshell preserves `pwd`, propagates `rc=3`, seed file intact |
| Can a `chmod 000` tree be cleaned between tests? | **Yes** — `rm -rf` succeeds (uid 999 owns the files) |
| Is there a cleanup path between tests? | **Yes** — `rm -rf` + `mkdir` per test |

Also available: `unshare`, `runuser` (further isolation if ever needed). No `sudo`.

### Probe 2 — does one runaway test poison the batch?

The decisive question, because all N tests share **one** upstream call. Three tests, the middle one
`while :; do :; done`, each executed as `timeout 2 bash user.sh` in a fresh directory:

```
t1  rc=0    out="hello"
t2  rc=124  out=""
t3  rc=0    out="world"
TOTAL_ELAPSED=2s
```

**Containment holds.** The runaway was killed at its own 2s budget; tests 1 and 3 reported normally;
the batch survived. This is *stronger* containment than the Python harness's threading approach.

### Harness shape this implies

```
per problem:  prelude   (author) — seeds the filesystem tree, permissions, fixtures
per test:     rm -rf <dir> && mkdir && cd <dir>
              <prelude>
              __OUT=$(timeout N bash user.sh 2>&1); __RC=$?
              <check>   (author) — projects assertions to stdout
              emit __JUDGE:<id>:<status>:<runtime>:<base64>
```

### New binding constraint

N tests × per-test timeout must fit **Wandbox's global execution cap**, since the batch is one call.
Measured data point: 3 tests with one 2s runaway completed in 2s wall-clock. The cap itself is
unmeasured — **budget to establish in `01_FEASIBILITY`**, not a blocker.

### Original end-to-end proof (multi-file question)

Prelude seeded `data/students.csv` (5 rows) and `data/README.txt` at `chmod 600`. Submission did
`mkdir`, `awk -F,` filter, pipe to `sort -t, -k2 -nr`, redirect, `chmod 444`, `wc -l`. Response —
`status: "0"`:

```
---stdout:
3
---exit:0
---content:
erin,95
alice,90
carol,88
---perm:444
---readme-perm:600
```

One stdout blob asserting **stdout, exit code, file contents, created-file permissions and preserved
seed permissions** — compared by the *existing* grader at
[codeJudge.ts:411](../../apps/api/src/utils/codeJudge.ts). The `{id, input, expectedOutput}` contract
survives; System Commands does **not** need a polymorphic test model or its own table.

---

## F4 — Partial credit: decompose to one assertion per test case

The F3 end-to-end proof bundles five assertions into one `expectedOutput`. Under exact-match grading
([codeJudge.ts:411](../../apps/api/src/utils/codeJudge.ts)) that scores **zero** for four-of-five
correct — while the real OPPE awards partial marks and
[problemsCore.ts:539-542](../../apps/api/src/utils/problemsCore.ts) distributes weight across hidden
tests by per-test `points`:

```ts
  const weightedCases = [
    ...sampleTests.map((test) => ({ ...test, isHidden: false, weight: sampleWeight })),
    ...hiddenTests.map((test) => ({ ...test, isHidden: true, weight: Math.max(1, Math.round(test.points ?? 1)) })),
  ];
```

**Decision: one assertion per test case.** F3 makes this affordable — isolation is a fresh directory
plus `timeout`, and additional tests cost upstream *wall-clock*, not extra calls. Recorded here as a
deliberate choice so it is not discovered after the question bank exists. The cost lands on the F3
wall-clock budget.

---

## F5 — The `check` traceback leak is narrower than assumed, and the fix is different

Probe against `cpython-3.12.7`, mimicking the harness: exec user source, then exec an author `check`
in the same namespace, with the student having failed to define `f`.

```
=== traceback as student would see it ===
Traceback (most recent call last):
  File "/home/wandbox/prog.py", line 8, in <module>
    exec(CHECK, g)
  File "<string>", line 2, in <module>
NameError: name 'f' is not defined
```

**Source lines do not leak.** `<string>` is not in `linecache`, so Python renders no source text for
the check's frame — the hidden assertion body stays hidden. Compiling with an explicit filename
(`compile(CHECK, "<check>", "exec")`) behaves identically.

**What does leak:**

1. The **harness frame** — `File "/home/wandbox/prog.py", line 8, in <module>` / `exec(CHECK, g)`,
   exposing internal structure.
2. Any **author-written exception message** — e.g. `AssertionError: expected 8, got 5` leaks the
   expected value. Author-controlled, so a discipline-and-lint problem, not a mechanism problem.

**Mitigation** (P7, ships with `check`): scrub frames whose filename is the harness file, and
standardise check-failure messages. Not source redaction, which is unnecessary.

---

## F6 — MLP is out of v1

Measured from the real `pyodide-lock.json` for v0.27.0 (334 packages), then `HEAD` on each wheel:

| Closure | Packages | Download |
|---|---|---|
| numpy | 1 | 11.9 MB |
| + pandas | 5 (`numpy, pandas, python-dateutil, pytz, six`) | 36.2 MB |
| + scikit-learn | 6 (`joblib, numpy, openblas, scikit-learn, scipy, threadpoolctl`) | **99.1 MB** (scipy 45.8, sklearn 22.6) |
| both closures | 10 | 111.0 MB |
| Pyodide runtime | `pyodide.asm.wasm` 9.6 + `asm.js` 1.2 + `python_stdlib.zip` 2.2 | 13.0 MB |

**≈124 MB first load.** Wheels are zip-compressed already, so there is no further transfer win.

Wandbox has **no sklearn**, so there is no server-side path either — MLP could only ever ship
practice-only.

**Verdict: cut from v1.** 124 MB is a bounce, not a cost: a first-time visitor arriving from a
search on Indian mobile data meets a multi-minute progress bar. And a practice-only subject labelled
"no mock exam", inside a product whose premise is mock exams, is a bad shelf item.

**Named alternative for later.** MLP OPPE questions are largely "fit this model with these
hyperparameters, report the accuracy" — that is **numeric-answer grading**, which the existing Quiz
system already supports (`QuizQuestionType.SHORT_ANSWER`) at near-zero cost. Revisit MLP as that
product shape, not as code execution.

---

## F7 — Blast radius of a test-case contract change: 16 files

**API (7 units)**
- [codeJudge.ts](../../apps/api/src/utils/codeJudge.ts) — `TestCase` type (:18), `buildJudgeStdin` (:114-124), grader (:411), harness dispatch (:99-110)
- [problemsCore.ts](../../apps/api/src/utils/problemsCore.ts) — `ProblemTestCase` (:39), `parseTests` (:161), `getProblemTests` (:168-175), `calculateScore` (:528-542), run/submit (:625-649, :691-713, :891-903)
- `judgeHarnesses/` ×4 (`python`, `java`, `javascript`, `cpp`) + a new `bash`
- [routes/problems.ts](../../apps/api/src/routes/problems.ts) — zod `testCaseSchema` (:38-49), array bounds (:66-67)
- [routes/qotd.ts](../../apps/api/src/routes/qotd.ts) — **duplicate** of the same schema (:35-46, :63-64)
- [routes/competition.ts](../../apps/api/src/routes/competition.ts) — DSA hidden-test start gate (:1218, :1234)
- [dailyLimit.ts](../../apps/api/src/utils/dailyLimit.ts) — seeded practice problems (:149-191)

**Web (4):** [api.ts](../../apps/web/src/lib/api.ts) (:115-131) · [CreateProblem.tsx](../../apps/web/src/pages/dashboard/CreateProblem.tsx) (:32-33, :223-239, :510-518) · [AdminProblems.tsx](../../apps/web/src/pages/admin/AdminProblems.tsx) (:162-163) · [BulkImportCard.tsx](../../apps/web/src/components/admin/problems/BulkImportCard.tsx) (:68, :103-141, :228)

**Playground (2):** [mainApi.ts](../../apps/playground/src/lib/mainApi.ts) (:40-41) · [QOTDSolverShell.tsx](../../apps/playground/src/components/problems/QOTDSolverShell.tsx) (:383, :569-571, :747)

**Scripts (1):** [seed-test-qotd.ts](../../scripts/seed-test-qotd.ts) (:25-40, :192-232)

Because `check` is an **optional field inside the existing `Json` column**, ~12 of these are
type-widening only and every existing question keeps working untouched. `Problem.prelude String?` is
the sole new column.

---

## F8 — `approach: 'A' | 'B'` is dead; there is no function-call grading

| Evidence | Finding |
|---|---|
| [codeJudge.ts:100](../../apps/api/src/utils/codeJudge.ts) | `const opts = { userCode, testCases, approach: 'A' as const, timeLimitMs };` — the only call site, hardcoded |
| `grep -n "opts.approach"` across `judgeHarnesses/*.ts` | **Zero hits.** Declared in all four signatures, read by none |
| [python.ts:55](../../apps/api/src/utils/judgeHarnesses/python.ts) | `exec(_USER_SOURCE, {"__name__": "__main__"})` — script semantics, stdin in, stdout out |
| [codeJudge.ts:411](../../apps/api/src/utils/codeJudge.ts) | `passed: normalizeOutput(decoded) === normalizeOutput(testCase.expectedOutput)` |
| [schema.prisma:1283-1305](../../prisma/schema.prisma) | `Problem` has no driver/wrapper/prelude field |

The judge is **stdin/stdout only**. This is a fidelity problem for PDSA and MLP, whose questions are
frequently "define a function that returns…", not "read stdin and print".

**One mechanism fixes both this and bash.** The Python harness already execs user source into a fresh
namespace per test; executing the author's `check` snippet **in that same namespace** puts the
student's `f` in scope, making `assert f(3) == 8` grading a small, local harness change that reuses
the identical field System Commands needs. *Design hypothesis — to be proven in the build spike.*

**Runtime parity (good news).** All three Python paths are CPython 3.12: server pins
`cpython-3.12.7` ([codeJudge.ts:59](../../apps/api/src/utils/codeJudge.ts)), Pyodide 0.27.0 ships
`cp312` wheels, godbolt maps `python312` ([executor.js:118](../../workers/executor.js)). Residual
divergence is WASM-vs-native (F2), not language semantics.

---

## F9 — "Judgeable language" truth is scattered across five places

Adding `BASH` naively repeats a bug the repo already has.

| # | Location | Holds |
|---|---|---|
| 1 | [schema.prisma:1458-1463](../../prisma/schema.prisma) | `ProblemLanguage` enum — `PYTHON \| JAVASCRIPT \| CPP \| JAVA` |
| 2 | [codeJudge.ts:58](../../apps/api/src/utils/codeJudge.ts) | `COMPILERS` (judge) |
| 3 | [execute-server.js:1033](../../apps/playground/execute-server.js) | `COMPILERS` (playground) |
| 4 | [executor.js:116-122](../../workers/executor.js) | `godboltCompiler()` map |
| 5 | [languageConfig.ts](../../apps/playground/src/utils/languageConfig.ts) | UI language list |

[codeJudge.ts:57](../../apps/api/src/utils/codeJudge.ts) carries the comment
`// Keep these synchronized with apps/playground/execute-server.js.` — manual sync as a documented
policy, which is drift by design.

**Existing proof of drift: C.** It is present in the UI list ([languageConfig.ts:96](../../apps/playground/src/utils/languageConfig.ts))
and mapped to godbolt `cg132` in the worker, but **absent from `ProblemLanguage`** — so a C problem
cannot be authored today, despite the execution path existing. The "Programming in C" course is
blocked on a one-line enum that nobody noticed was missing.

The **test-case zod schema** is duplicated the same way, across
[problems.ts:38-49](../../apps/api/src/routes/problems.ts) and
[qotd.ts:35-46](../../apps/api/src/routes/qotd.ts). Adding `check` means editing both.

→ Pre-work **P3** must produce one source of truth for *both* the language table and the test-case
schema before `BASH` or `check` is added.

---

## What this changes

| Earlier assumption | Corrected |
|---|---|
| bash = enum + harness + mapping + config (mechanical) | Contract survives, isolation proven; the real work is a bash harness with dir isolation + P3 consolidation |
| `approach` switches grading modes | Dead parameter; no function-call grading exists at all |
| Browser-first offloads existing execution | No browser judge exists; it is a net-new second grader (~1 week) |
| Python divergence is manageable | Same CPython 3.12, but the harness itself cannot run under Pyodide |
| MLP ships practice-only | MLP cut from v1; revisit as numeric-answer grading |
| Composite assertions are fine | Decompose to one assertion per test case |
| `check` leaks hidden tests | Leaks frames and author messages, not source |

## Open, carried into `01_FEASIBILITY`

1. **The capacity number** — concurrent users before `JUDGE_BUSY` 503s, and the browser-offload figure.
2. **Wandbox global execution cap** — sets the max tests-per-batch budget (F3).
3. **Big Data / MLOps** — recommend in/out with reasoning.

## Reproduction

```bash
# F3 probes  (bash tooling / isolation / runaway containment)
curl -sS -H 'Content-Type: application/json' \
  -d '{"compiler":"bash","code":"command -v timeout && timeout 1 bash -c \"while :; do :; done\"; echo rc=$?"}' \
  https://wandbox.org/api/compile.json

# F5 probe   (traceback leakage)
curl -sS -H 'Content-Type: application/json' \
  -d '{"compiler":"cpython-3.12.7","code":"..."}' https://wandbox.org/api/compile.json

# F6 measurements
curl -sS https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide-lock.json
curl -sSI https://cdn.jsdelivr.net/pyodide/v0.27.0/full/<wheel>   # Content-Length per package
```
