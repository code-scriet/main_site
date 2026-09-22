# 06 — Risk Register

> **Status:** complete · **Date:** 2026-08-29
>
> Scored **likelihood × impact**. Risks marked ⚑ were **discovered by measurement** during the spike
> rather than anticipated. Ordered by severity.

| # | Risk | L | I | Score |
|---|---|---|---|---|
| 1 | Demand never materialises | Med | **Critical** | 🔴 |
| 2 | ⚑ Wandbox outage during peak OPPE week | **High** | **Critical** | 🔴 |
| 3 | Single-maintainer bus factor | **High** | High | 🔴 |
| 4 | Question bank never reaches 40 | Med | High | 🟠 |
| 5 | ⚑ False TLEs from batch wall-clock | **High** | Med | 🟠 |
| 6 | Honour-code / provenance exposure | Low | **Critical** | 🟠 |
| 7 | ⚑ Brand & SEO conflict (CCSU copy) | **High** | Med | 🟠 |
| 8 | ⚑ Browser/server grader divergence | Med | Med | 🟡 |
| 9 | Neon connection-pool pressure | Low | High | 🟡 |
| 10 | ⚑ Enum-in-transaction deploy failure | Med | Med | 🟡 |
| 11 | Free-tier memory exhaustion | Low | High | 🟡 |
| 12 | ⚑ 2-hour round duration ceiling | Low | Med | 🟢 |
| 13 | IITM changes the syllabus | Med | Low | 🟢 |

---

## 🔴 1 · Demand never materialises

**The one risk the whole plan is arranged around.** ~47,300 students and no incumbent could mean an
untapped market — or that students practise on LeetCode and course material and don't want this.

**Mitigation.** [05_ROADMAP](./05_ROADMAP.md) R1 tests it in **days**, on existing rails, with zero new
infra. The stop-loss is explicit: *if the probe draws nothing, stop — one week spent, not three
months.* Do **not** build R3/R4 before this reads positive.

## 🔴 2 · ⚑ Wandbox outage during peak OPPE week

Wandbox is a single-host free service with no SLA that periodically fails host-side for *every*
language ([CLAUDE.md Execution Resilience](../../CLAUDE.md)). Peak demand is by definition
OPPE-eve — precisely when an outage is most visible.

**Measured exposure.** godbolt covers Python/C/C++/Java. It does **not** cover bash:
`godboltCompiler()` returns `null` outside cpython/gcc/clang/openjdk
([executor.js:116-123](../../workers/executor.js)). **System Commands — 30 % weightage, our biggest
moat — is single-provider with no fallback.**

**Mitigations.** (a) `codeExecutionProvider = balanced` before launch. (b) Browser judge (R3) makes
Python practice outage-immune. (c) For bash, no second provider exists today: honest options are a
status banner, queueing, or accepting downtime — **decide before R5 ships**, don't discover it live.
(d) The 503 `JUDGE_BUSY` path already refunds cap and quota
([problemsCore.ts:584](../../apps/api/src/utils/problemsCore.ts)), so an outage costs attempts, not
progress.

**Residual: HIGH.** This is the single biggest technical risk and it is largely outside our control.

## 🔴 3 · Single-maintainer bus factor

One person holds the judge, the harnesses, the content and the ops knowledge. A 152 KB CLAUDE.md is
the mitigation, and it **already drifted** — omitting `judgeHarnesses/` entirely plus six
models/enums ([00_SPIKE](./00_SPIKE.md), P2).

**Mitigations.** P2 fixes the drift. P3 removes the five-copy language table that only its author can
safely edit. The CI reference gate (R2) encodes correctness in a script rather than in a head. The
Living Document Protocol must actually be followed for OPPE sections.

## 🟠 4 · Question bank never reaches 40

The judge is a weekend; 40 validated questions is the project. Classic failure: platform ships,
content doesn't, product is an empty shell.

**Mitigations.** Explicit milestones (10 → 25 → 40). Bulk import already exists. The CI gate makes
outside contribution safe, which is the only way this scales past one author.

## 🟠 5 · ⚑ False TLEs from batch wall-clock

A batch that is merely slow in aggregate aborts at 15 s (interpreted) / 30 s (compiled) and returns
**`TIME_LIMIT_EXCEEDED` against correct student code**
([codeJudge.ts:241,279-284](../../apps/api/src/utils/codeJudge.ts)). This is a **latent bug in the
existing platform**, not an OPPE-only concern.

Worst case is System Commands: `timeout N` runs serially, so 20 tests × 2 s = 40 s ≫ 15 s ⇒ *every*
student sees a false TLE.

**Mitigations.** Enforce the A4 budget (`per-test timeout × test count` ≤ ~12 s) **in the CI gate**,
so a bad question is rejected at authoring time. Consider raising `EXECUTION_TIMEOUT_MS` for BASH —
deliberately, with the 60 s gateway ceiling in mind
([01_FEASIBILITY](./01_FEASIBILITY.md) A5). Nothing here is unfixable, but silence is expensive:
students blame their code.

## 🟠 6 · Honour-code / provenance exposure

Using LLMs on an OPPE is plagiarism per IITM policy, and past papers are not officially released. A
bank perceived as leaked exam material is an existential reputational risk — worse for an IITM
student contributor than for us.

**Mitigations.** `Problem.provenance` makes status a queryable column
([04_SCHEMA_AND_CONTENT](./04_SCHEMA_AND_CONTENT.md) §2.3). Bank is overwhelmingly `ORIGINAL`,
written to the *published* week-level syllabus. `COMMUNITY_RECALLED` is visibly labelled. **No
ingestion of live-term material, ever.** A takedown is satisfiable with one query.

**Low likelihood, critical impact — the mitigation is cheap, so do it from day one.**

## 🟠 7 · ⚑ Brand & SEO conflict

Not abstract: [prerender.mjs:594](../../scripts/prerender.mjs) compiles CCSU recruitment copy into
**every** prerendered listing page — *"Every student of CCSU is welcome… Recruitment for the core
team happens through a structured Join Us flow."* Served to an IITM student searching "Java OPPE
practice", that is misleading about who the site is for. `SITE_URL` is likewise hardcoded
([generate-sitemap.mjs:6](../../scripts/generate-sitemap.mjs)).

**Mitigations.** R1 accepts the mismatch knowingly for a days-long probe. R4 forks the pipeline
entirely; exit criterion `grep -c "CCSU" apps/oppe/dist/index.html` **must be 0**. Domain moves to
its own only once demand is proven ([03_ARCHITECTURE](./03_ARCHITECTURE.md) §6).

## 🟡 8 · ⚑ Browser/server grader divergence

Two independent judges ([00_SPIKE](./00_SPIKE.md) F1/F2) mean a submission can pass one and fail the
other, with no debugging story. Mitigated by both being CPython 3.12 (F8), but **recursion depth
differs** (WASM vs native) and PDSA is recursion-heavy.

**Mitigations.** Divergence suite in CI, recursion first (R3). Practice/scored split is explicit in
the UI. `packages/problem-schema` shares `normalizeOutput` so grading semantics cannot drift silently.

## 🟡 9 · Neon connection-pool pressure

25 of ~64 pooler connections allocated (API 20 + playground 5, HC #3).

**Mitigation — largely designed out.** `apps/oppe` is **static**: zero DB connections
([03_ARCHITECTURE](./03_ARCHITECTURE.md) §4). This risk exists only if Alt A (a 5th Node service) is
ever revisited. Raising the pool past 20 requires owner approval.

## 🟡 10 · ⚑ Enum-in-transaction deploy failure

`prisma migrate deploy` wraps each migration in a transaction; a new enum value **cannot be used in
the transaction that added it**. A single combined migration fails at deploy — on production.

**Mitigation.** Split into two migrations, documented with the exact sequence
([04_SCHEMA_AND_CONTENT](./04_SCHEMA_AND_CONTENT.md) §1.3-1.4). Also: Prisma's default enum handling
is `DROP`+`ADD COLUMN` (data-destroying) — `--create-only` is mandatory (HC #5) and the generated SQL
must be read, as `20260613120000_constraints_and_enums` did with `USING` casts.

## 🟡 11 · Free-tier memory exhaustion

512 MB with `--max-old-space-size=400` (HC #1, #4).

**Mitigation — designed out.** Alt C adds **zero** server RAM: no new process, no new sockets, no new
in-memory structures. The dominant new cost is the *student's* browser (~13 MB Pyodide, cached) —
which is exactly why MLP's 99 MB sklearn closure was cut ([00_SPIKE](./00_SPIKE.md) F6).

## 🟢 12 · ⚑ 2-hour round duration ceiling

`duration` is bounded 300–7200 s ([competition.ts:113](../../apps/api/src/routes/competition.ts)).
7200 s = exactly 2 h, so real OPPE mocks fit with **zero headroom**; a 3-hour paper fails validation.

**Mitigation.** One-line zod change (S12). On the launch checklist so it is not discovered by an admin
mid-configuration.

## 🟢 13 · IITM changes the syllabus

Week ranges shift between terms.

**Mitigation.** `course`/`week` are columns on `Problem`, so an OPPE split is a **query**, not stored
data ([04_SCHEMA_AND_CONTENT](./04_SCHEMA_AND_CONTENT.md) §1.2) — a syllabus change is a filter
change, not a content migration.

---

## Risks explicitly accepted

| Accepted | Why |
|---|---|
| **MLP shipped as nothing in v1** | 124 MB browser cost, no server path. Better absent than a bad shelf item ([00_SPIKE](./00_SPIKE.md) F6) |
| **Big Data / MLOps out entirely** | Require student GCP + billing; no gradable artefact ([01_FEASIBILITY](./01_FEASIBILITY.md) B6) |
| **DBMS not designed for** | Needs stateful PostgreSQL execution — a separate problem. Nothing here forecloses it |
| **CCSU brand during R1** | Days-long probe; forked at R4 |
| **A third frontend to maintain** | Bounded by `packages/` extraction; the alternative violates the Monaco rule |

## Watch list — no action yet

Wandbox's ~60 s gateway timeout returning a **non-JSON** body (handled as `JUDGE_ERROR`, but triggers
a 45 s provider cooldown that degrades the platform to single-provider) · `playgroundDailyLimit`
default 100 being consumed by OPPE-eve practice · CF Worker deployed **manually** and absent from CI.
