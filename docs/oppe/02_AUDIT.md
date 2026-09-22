# 02 — Capability Audit

> **Status:** complete · **Date:** 2026-08-29 · **Depends on:** [00_SPIKE.md](./00_SPIKE.md), [01_FEASIBILITY.md](./01_FEASIBILITY.md)
>
> Classification: **HAVE** (works today, unmodified) · **PARTIAL** (exists, needs extension) ·
> **MISSING** (does not exist). Every HAVE and PARTIAL carries `file:line`. Written *after* the spike
> so it audits measured behaviour rather than documented intent.

---

## Scoreboard

| # | Capability | Verdict |
|---|---|---|
| 1 | Problem authoring with hidden tests | **HAVE** |
| 2 | Per-test verdicts | **HAVE** |
| 3 | Partial scoring | **HAVE** |
| 4 | Hidden-tests-only weighting | **HAVE** |
| 5 | Judge pipeline + provider fallback | **HAVE** (bash excepted) |
| 6 | Proctoring | **HAVE** |
| 7 | Server-authoritative exam timers | **HAVE** (2 h ceiling) |
| 8 | Submission caps + daily quotas | **HAVE** |
| 9 | Wrong-verdict appeal + rejudge | **HAVE** |
| 10 | Leaderboards | **HAVE** |
| 11 | Admin authoring UI + bulk import | **HAVE** |
| 12 | Exam context separation | **PARTIAL** |
| 13 | Per-subject / per-week organisation | **PARTIAL** |
| 14 | SEO prerender + sitemap | **PARTIAL — actively wrong for IITM** |
| 15 | Auth / session / cross-subdomain | **HAVE**, but domain gating **MISSING** |
| 16 | Function-call grading | **MISSING** |
| 17 | Browser judge | **MISSING** |
| 18 | bash execution (`prelude` / `check`) | **MISSING** |
| 19 | C as a judgeable language | **MISSING** (one enum line) |
| 20 | Reference-solution CI gate | **MISSING** |

---

## HAVE

### 1 · Problem authoring with hidden tests
`Problem` carries `sampleTests` / `hiddenTests` as `Json`
([schema.prisma:1293-1294](../../prisma/schema.prisma)), validated by zod with array bounds
(sample ≤ 20, hidden ≤ 100 — [problems.ts:66-67](../../apps/api/src/routes/problems.ts)) and parsed
tolerantly by `getProblemTests` ([problemsCore.ts:168-175](../../apps/api/src/utils/problemsCore.ts)).
Non-admin authors are forced to `isPublished:false`.

### 2 · Per-test verdicts
`ProblemSubmission.perTestVerdicts` (`Json`), populated per test id from the `__JUDGE:` frames
([codeJudge.ts:400-415](../../apps/api/src/utils/codeJudge.ts)) with `passed`, `actualOutput`
(truncated to 5 KB, [codeJudge.ts:54](../../apps/api/src/utils/codeJudge.ts)), `runtimeMs`, `error`.

### 3 · Partial scoring
`calculateScore` ([problemsCore.ts:528](../../apps/api/src/utils/problemsCore.ts)) returns
`{ score, passedCount, totalCount, perTestVerdicts }`. Exactly what OPPE's partial-marks model needs.

### 4 · Hidden-tests-only weighting
`options.privateOnly` sets `sampleWeight = 0` and distributes weight across hidden tests by per-test
`points` ([problemsCore.ts:538-542](../../apps/api/src/utils/problemsCore.ts)). A real OPPE hides its
tests; this is precisely that mode, already built for CONTEST.

### 5 · Judge pipeline + provider fallback
`problemsCore` → `codeJudge` → `executionRouting` → CF Worker, with per-provider lanes, 45 s
cooldowns and a worker-side fallback chain (see [01_FEASIBILITY](./01_FEASIBILITY.md) A1).
**Exception:** `godboltCompiler()` returns `null` for anything outside cpython/gcc/clang/openjdk
([executor.js:116-123](../../workers/executor.js)), so a future BASH is single-provider.

### 6 · Proctoring — the most complete piece of the stack
Server-enforced lock with a violation budget
(`INSTANT_VIOLATION_BUDGET = 1` — [competition.ts:45](../../apps/api/src/routes/competition.ts)):
`POST /:roundId/proctor/violation` ([:2754](../../apps/api/src/routes/competition.ts)),
`/heartbeat` ([:2833](../../apps/api/src/routes/competition.ts)),
`GET /proctor/me` ([:2851](../../apps/api/src/routes/competition.ts)),
admin `/unlock/:userId` ([:2870](../../apps/api/src/routes/competition.ts)) and
`/lock/:userId` ([:2894](../../apps/api/src/routes/competition.ts)).

Client engine [useProctor.ts](../../apps/playground/src/hooks/useProctor.ts): tab-away via
`visibilitychange`, fullscreen enforcement, clipboard and dev-tools blocking, `beforeunload` guard,
and an iOS carve-out (`fullscreenSupported` — iPhone Safari has no `requestFullscreen`, so a
contestant is never walled behind a button that cannot succeed).

This is genuinely *proctored*-exam-grade and needs no work for OPPE.

### 7 · Server-authoritative exam timers — with a ceiling
In-memory `activeTimers` ([competition.ts:26](../../apps/api/src/routes/competition.ts)),
`scheduleRoundLock` ([:421](../../apps/api/src/routes/competition.ts)),
`autoLockRound` ([:293](../../apps/api/src/routes/competition.ts)),
`computeRemainingSeconds` derived from `startedAt` + `duration`
([:164](../../apps/api/src/routes/competition.ts)), plus boot recovery that re-arms or immediately
locks rounds whose deadline passed during a free-tier sleep.

> ⚠️ **`duration` is bounded 300–7200 s** ([competition.ts:113](../../apps/api/src/routes/competition.ts)).
> 7200 s = exactly 2 h. Real OPPEs are typically ~2 h, so this *just* fits with zero headroom — any
> 3-hour paper needs the bound raised. One-line change; flag it before it surprises someone.

### 8 · Submission caps + daily quotas
`ProblemSubmissionCounter` keyed on `(userId, problemId, contextType, contextKey)` with
`capOverride`; `reserveSubmitCap` ([problemsCore.ts:493](../../apps/api/src/utils/problemsCore.ts))
reserves atomically and rolls back on judge failure. Daily quota via `consumeDailyQuota`
([problemsCore.ts:15](../../apps/api/src/utils/problemsCore.ts)), IST-bucketed, governed by
`Settings.playgroundDailyLimit` (default **100** — [schema.prisma:176](../../prisma/schema.prisma)).

### 9 · Appeal + rejudge
Student appeal `POST /:id/appeal` ([problems.ts:792](../../apps/api/src/routes/problems.ts)) sets
`appealedAt`/`appealNote` + `needsReview`; admin queue
`GET /admin/review-queue` ([problems.ts:840](../../apps/api/src/routes/problems.ts)) ordered by
`appealedAt desc`; rejudge via `enqueueRejudgeJob`
([problems.ts:24](../../apps/api/src/routes/problems.ts)). A `JUDGE_ERROR` is captured rather than
discarded, with cap + quota refunded — so an upstream outage never costs a student an attempt.

### 10 · Leaderboards
Per-problem `GET /:id/leaderboard` ([problems.ts:673](../../apps/api/src/routes/problems.ts),
excludes `PENDING`), QOTD total/weekly/around-me, and contest standings via `buildDsaLeaderboard`.

### 11 · Admin authoring UI + bulk import
[CreateProblem.tsx](../../apps/web/src/pages/dashboard/CreateProblem.tsx) (full form with a test-case
editor and a completeness checklist), [AdminProblems.tsx](../../apps/web/src/pages/admin/AdminProblems.tsx),
and [BulkImportCard.tsx](../../apps/web/src/components/admin/problems/BulkImportCard.tsx) — which
already does CSV/JSON bulk import with a downloadable column template
([:228](../../apps/web/src/components/admin/problems/BulkImportCard.tsx)). **This is the backbone of
the question-bank programme** and it already exists.

---

## PARTIAL

### 12 · Exam context separation
`ProblemContextType = QOTD | CONTEST | PRACTICE`
([schema.prisma:1447-1451](../../prisma/schema.prisma)); submissions and counters are keyed on
`(userId, problemId, contextType, contextKey)`, so contexts are already fully isolated — an OPPE
attempt would not collide with practice on the same problem.

**Gap:** no `OPPE` member. Adding one is additive (Postgres `ADD VALUE`) and inherits isolation,
per-context caps and the `privateOnly` scoring mode for free. **Effort: hours.**

### 13 · Per-subject / per-week organisation
`ProblemSheet` / `ProblemSheetItem` ([schema.prisma:1318-1346](../../prisma/schema.prisma)) give
ordered, publishable, per-user-progress-tracked collections — structurally the right shape for
"Java OPPE1 · Week 3".

**Gap:** `ProblemSheet` has only `slug, title, description, isPublished, createdBy` — **no `course`
or `week` field**. Subject/week could be encoded by slug convention, but nothing can *query* or
*filter* by it, and the OPPE syllabus split (OPPE1 = W2–6, OPPE2 = W2–9 for Java) is exactly a
filterable relationship. Either add fields to `ProblemSheet` or put `course`/`week` on `Problem`.
**Effort: 1–2 days** including UI. Settled in [03_ARCHITECTURE](./03_ARCHITECTURE.md) / `04_SCHEMA`.

### 14 · SEO prerender + sitemap — works, and is actively wrong for this audience
[generate-sitemap.mjs](../../scripts/generate-sitemap.mjs) + [prerender.mjs](../../scripts/prerender.mjs)
produce real crawlable HTML per listing route with JSON-LD and breadcrumbs — a genuinely good pipeline.

**Gap, and it is worse than "single-tenant":** `SITE_URL` is hardcoded to `https://codescriet.dev`
([generate-sitemap.mjs:6](../../scripts/generate-sitemap.mjs)), the route list is a fixed set of club
pages, and [prerender.mjs:594](../../scripts/prerender.mjs) injects a **club-context trailer into every
listing page**:

> *"Every student of CCSU is welcome, and most events are open to outside participants as well.
> Recruitment for the core team happens through a structured Join Us flow…"*

Served to an IITM student searching "Java OPPE practice", that copy is not merely off-brand — it is
misleading about who the site is for. A second domain needs a forked generator, its own route list,
its own trailer, robots.txt and IndexNow key. **Effort: 2–3 days.** (Pre-work **P5**.)

### 15 · Auth — solid, but no domain gating exists
Cross-subdomain session on `.codescriet.dev` ([auth.ts:95](../../apps/api/src/routes/auth.ts)),
Google/GitHub OAuth with single-use exchange codes, `tokenVersion` force-logout, purpose-partitioned
tokens.

**Gap:** grepping `auth.ts` and `passport.ts` for domain restriction returns **only cookie-domain
code** — there is no email-domain allowlist anywhere. IITM gating (e.g. `@ds.study.iitm.ac.in`) does
not exist and must be built if it is wanted. Note this is a **product decision, not just a task**:
gating maximises trust and cohort fit but caps the funnel, and `Settings.registrationOpen` already
provides a blunter lever. **Effort: hours** once decided.

---

## MISSING

| # | Capability | Why it matters | Rough effort |
|---|---|---|---|
| 16 | **Function-call grading** | Judge is stdin/stdout only (F8); PDSA/MLP questions are "implement `f`". Without it, questions don't look like the real exam | **2–3 days** — `check` field + harness change per language + authoring UI |
| 17 | **Browser judge** | No client-side judging exists at all (F1); the API's Python harness can't run under Pyodide (F2). Required for the zero-API public surface | **~1 week** — Pyodide-in-Worker, `terminate()` timeout, judge contract, `__JUDGE:` frame parity |
| 18 | **bash execution** | System Commands is 30 % weightage and the biggest moat. Needs `Problem.prelude`, `ProblemTestCase.check`, a bash harness with per-test dir isolation, and `BASH` in both `COMPILERS` tables | **3–4 days** (mechanism proven in F3) |
| 19 | **C as a judgeable language** | Execution already works (`cg132`); only `ProblemLanguage` lacks `C`, so no C problem can be authored | **1 day** — enum + C harness + 2 `COMPILERS` entries |
| 20 | **Reference-solution CI gate** | The only thing that makes community contribution safe. `referenceSolution`/`referenceLanguage` already exist ([schema.prisma:1295-1296](../../prisma/schema.prisma)); CI already hosts `test:stability` + `audit-gate.mjs` | **2–3 days** |

Plus the pre-work items P1–P7 from the plan, of which **P3 (single source of truth for the language
table + test-case zod schema)** must land *before* 18 and 19, since both otherwise edit five
unsynchronised copies ([00_SPIKE](./00_SPIKE.md) F9).

---

## What the audit changes

1. **The platform is far more OPPE-ready than a greenfield build would suggest.** Eleven of twenty
   capabilities are HAVE, including the two hardest to build well — proctoring and partial scoring
   with hidden-test weighting.
2. **The gaps are concentrated in content shape, not execution.** Function-call grading, `prelude`/
   `check`, and course/week organisation are all about making questions *look like OPPE questions*.
   Execution is largely solved.
3. **Two ceilings are one line each and would surprise someone later:** the 7200 s round duration
   (#7) and the missing `C` enum member (#19).
4. **The SEO pipeline is the sharpest brand conflict**, and it is not abstract — CCSU recruitment
   copy is compiled into every prerendered listing page today.

## Carried forward

| To | Item |
|---|---|
| `03_ARCHITECTURE` | Browser judge (#17); domain-gating decision (#15); SEO fork (#14) |
| `04_SCHEMA_AND_CONTENT` | `OPPE` context (#12); course/week fields (#13); `check`/`prelude` (#16, #18); `C`/`BASH` enum (#19); CI gate (#20); raise `duration` max (#7) |
| `06_RISKS` | Single-provider bash; CCSU-copy brand conflict; 2 h duration ceiling |
