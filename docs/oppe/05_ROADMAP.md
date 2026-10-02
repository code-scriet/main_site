# 05 — Roadmap

> **Status:** complete · **Date:** 2026-08-29 · **Depends on:** [00_SPIKE](./00_SPIKE.md) … [04_SCHEMA_AND_CONTENT](./04_SCHEMA_AND_CONTENT.md)
>
> Sequenced to **retire the demand risk first**. Every stage ships something to users and has
> exit criteria a script can check.

---

## Ordering principle

The traffic thesis is the only untested falsifier left ([00_SPIKE](./00_SPIKE.md) D4). Everything
before it is cheap; everything after it is expensive. So: **probe with what already works, build
infrastructure only after somebody shows up.**

```
R0 pre-work ──► R1 Java probe ──►  ⟨demand? ⟩ ──► R2 gate+bank ──► R3 browser judge
   (3 days)      (days, 0 infra)      │                              ──► R4 apps/oppe
                                      └── nothing ⇒ stop. 1 week spent, not 3 months.
                                                                     ──► R5 System Commands
                                                                     ──► R6 C
```

---

## R0 — Pre-work · ~3 days · ships: nothing (foundations)

| Item | Why now |
|---|---|
| **P1** `buildFilter` on `codescriet-web` in [render.yaml](../../render.yaml) | Today **every** commit redeploys the live club site. Verified: 0 occurrences in that service block |
| **P2** CLAUDE.md drift fix | Omits `judgeHarnesses/` entirely + 6 models/enums. Don't build on a canonical doc that lies |
| **P3** `packages/problem-schema` | **Blocks R5/R6.** Language table lives in 5 unsynchronised places ([00_SPIKE](./00_SPIKE.md) F9); test-case zod duplicated in 2 |
| **A9** `codeExecutionProvider = balanced` | Doubles capacity 160 → 320 users, no deploy ([01_FEASIBILITY](./01_FEASIBILITY.md) A3) |

**Exit criteria**
```bash
awk '/name: codescriet-web/,/name: codescriet-playground-api/' render.yaml | grep -c buildFilter   # ≥ 1
grep -c "judgeHarnesses" CLAUDE.md                                                                  # ≥ 1
test -f packages/problem-schema/package.json                                                        # exists
grep -c "const COMPILERS" apps/api/src/utils/codeJudge.ts apps/playground/execute-server.js         # 0 + 0 (imported)
npm run lint --workspace=apps/api && npm run build --workspace=apps/api                             # green
```

---

## R1 — Java probe on existing rails · days · ships: **a real practice page**

The cheapest possible demand test. Java needs **zero platform work**: enum, harness with
`URLClassLoader` isolation, `java2202` mapping and the dual-provider chain all exist
([01_FEASIBILITY](./01_FEASIBILITY.md) B1). Measured 3.72 s median, 8× ceiling headroom.

**Scope:** 10 Java questions authored through the existing UI; one public listing route; `course`/
`week` migrations (S1–S10) so questions are syllabus-mapped from day one.

**Deliberately NOT in scope:** new services, browser judge, own domain, SEO fork.

**Cost of being wrong:** one week.

**Exit criteria**
```bash
grep -c "OPPE" prisma/schema.prisma                                    # ≥ 1 (ProblemContextType)
grep -c "OppeCourse" prisma/schema.prisma                              # 2  (enum + field)
grep -c "ProblemProvenance" prisma/schema.prisma                       # 2
grep -c "prelude" prisma/schema.prisma                                 # 1
# NOTE: do NOT grep bare "course" — User.course already exists (schema.prisma:33)
ls prisma/migrations | grep -c oppe_                                   # 2  (split — see 04 §1.3)
ls content/questions/java/*.json | wc -l                               # ≥ 10
```
**Ships:** a student can practise 10 syllabus-mapped Java OPPE questions with real judging.

---

## R2 — CI gate + bank to 25 · ~1 week · ships: **a trustworthy bank**

The gate must land **before** any external contributor, not after.

**Scope:** `scripts/verify-questions.mjs` ([04_SCHEMA_AND_CONTENT](./04_SCHEMA_AND_CONTENT.md) §2.5)
wired into [ci.yml](../../.github/workflows/ci.yml); question count to 25; provenance labelling in
the UI.

**Exit criteria**
```bash
test -f scripts/verify-questions.mjs
grep -c "verify-questions" .github/workflows/ci.yml                    # ≥ 1
node scripts/verify-questions.mjs                                      # exit 0
node scripts/verify-questions.mjs --expect-fail-fixture                # exit 1 (gate provably bites)
ls content/questions/**/*.json | wc -l                                 # ≥ 25
```
**Ships:** every published question is proven solvable by its own reference solution.

---

## R3 — Browser judge · ~1 week · ships: **zero-cost practice**

**Scope:** `packages/judge-browser` — Pyodide-in-Worker, `terminate()` timeout, `__JUDGE:` frame
parity, `normalizeOutput` shared from `packages/problem-schema`
([03_ARCHITECTURE](./03_ARCHITECTURE.md) §2). Plus the divergence suite, recursion-depth first.

**Why after R1/R2:** it costs a week and only pays off once there is traffic to offload.

**Exit criteria**
```bash
test -f packages/judge-browser/src/index.ts
grep -c "terminate()" packages/judge-browser/src/*.ts                  # ≥ 1
grep -rc "threading" packages/judge-browser/src/                       # 0  (F2 regression guard)
npm run test:divergence                                                # exit 0
grep -c "recursion" packages/judge-browser/tests/divergence.test.ts    # ≥ 1
```
**Ships:** Python/PDSA practice runs client-side; server judge reserved for scored mocks.

---

## R4 — `apps/oppe` static site · ~1.5 weeks · ships: **the product**

**Scope:** static Vite app on `oppe.codescriet.dev` (existing `.codescriet.dev` cookie works
unchanged), questions baked as JSON (P6), forked SEO pipeline with **no CCSU trailer**,
`packages/code-editor` extraction, CI lint+build steps.

**Exit criteria**
```bash
test -f apps/oppe/package.json
grep -c "apps/oppe" .github/workflows/ci.yml                           # ≥ 2 (lint + build)
awk '/name: codescriet-oppe/,0' render.yaml | grep -c "runtime: static" # 1  (NOT a Node service)
grep -c "CCSU" apps/oppe/dist/index.html                               # 0
ls apps/oppe/dist/questions/*.json | wc -l                             # ≥ 25  (P6: zero-API surface)
grep -c "monaco" apps/web/package.json                                 # 0  (Monaco rule intact)
```
**Ships:** branded, indexable, works with the API asleep.

---

## R5 — System Commands · ~1 week · ships: **the moat**

Mechanism proven ([00_SPIKE](./00_SPIKE.md) F3); **blocked on P3**.

**Scope:** `BASH` enum, bash harness with per-test dir isolation + `timeout`, `Problem.prelude`,
`ProblemTestCase.check`, P7 traceback scrubbing, authoring UI, A4 budget enforcement in the CI gate.

**Exit criteria**
```bash
grep -c "BASH" prisma/schema.prisma                                    # ≥ 1
test -f apps/api/src/utils/judgeHarnesses/bash.ts
grep -c "timeout" apps/api/src/utils/judgeHarnesses/bash.ts            # ≥ 1  (per-test containment)
grep -c "check" apps/api/src/routes/problems.ts                        # ≥ 1  (zod accepts it)
node scripts/verify-questions.mjs --course SYSTEM_COMMANDS             # exit 0, A4 budget enforced
```
**Ships:** the only System Commands practice product that exists.

---

## R6 — C · ~2 days · ships: **Degree-programme coverage**

Execution already works (`cg132`); only the enum is missing.

**Exit criteria**
```bash
grep -cE "^  C$" prisma/schema.prisma                                  # 1  (ProblemLanguage)
test -f apps/api/src/utils/judgeHarnesses/c.ts
node scripts/verify-questions.mjs --course C                           # exit 0
```

---

## Totals

| Stage | Effort | Cumulative | Decision point |
|---|---|---|---|
| R0 | 3 days | 3 d | — |
| R1 | 3 days | ~1.5 wk | **← demand check. Stop here if nothing.** |
| R2 | 1 week | ~2.5 wk | — |
| R3 | 1 week | ~3.5 wk | — |
| R4 | 1.5 weeks | ~5 wk | — |
| R5 | 1 week | ~6 wk | — |
| R6 | 2 days | ~6.5 wk | — |

**Platform ≈ 6.5 weeks. The 40-question bank is the real schedule** and runs in parallel from R1.

## Launch checklist

- [ ] `codeExecutionProvider = balanced` (160 → 320 users)
- [ ] `playgroundDailyLimit` raised from 100 (OPPE-eve practice burns it)
- [ ] `verify-questions.mjs` green on all 40
- [ ] Divergence suite green
- [ ] `apps/oppe` prerender contains **no** CCSU copy
- [ ] Round `duration` ceiling raised above 7200 s if any mock exceeds 2 h
