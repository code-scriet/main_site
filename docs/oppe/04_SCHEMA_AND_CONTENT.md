# 04 — Data Model & the Question-Bank Programme

> **Status:** complete · **Date:** 2026-08-29 · **Depends on:** [00_SPIKE](./00_SPIKE.md) … [03_ARCHITECTURE](./03_ARCHITECTURE.md)
>
> **No migration files are written in this pass.** This document specifies them.

---

# Part 1 — Schema

## 1.1 Deltas

| # | Change | Kind | Migration? | Prisma-representable |
|---|---|---|---|---|
| S1 | `ProblemContextType += OPPE` | enum `ADD VALUE` | yes | ✅ |
| S2 | `ProblemLanguage += BASH` | enum `ADD VALUE` | yes | ✅ |
| S3 | `ProblemLanguage += C` | enum `ADD VALUE` | yes | ✅ (closes the C gap, F9) |
| S4 | `enum OppeCourse` (new) | `CREATE TYPE` | yes | ✅ |
| S5 | `enum ProblemProvenance` (new) | `CREATE TYPE` | yes | ✅ |
| S6 | `Problem.prelude String?` | additive column | yes | ✅ |
| S7 | `Problem.course OppeCourse?` | additive column | yes | ✅ |
| S8 | `Problem.week Int?` | additive column | yes | ✅ |
| S9 | `Problem.provenance ProblemProvenance?` | additive column | yes | ✅ |
| S10 | `@@index([isPublished, course, week])` on `Problem` | index | yes | ✅ |
| S11 | **`ProblemTestCase.check?: string`** | **JSON field** | **NO — zero migration** | n/a (inside `Json`) |
| S12 | Round `duration` max 7200 → 14400 | **zod only** ([competition.ts:113](../../apps/api/src/routes/competition.ts)) | **NO** | n/a |

**Every change is additive and nullable.** No existing row is rewritten, no column is dropped, no
type is narrowed. An unapplied migration degrades gracefully: OPPE features 404/500, everything else
is untouched — the same posture as `20260807120000_backdated_records`.

## 1.2 The two decisions inside this

### `check` lives in the `Json` column — not a new table

`sampleTests` / `hiddenTests` are already `Json` ([schema.prisma:1293-1294](../../prisma/schema.prisma)),
and `ProblemTestCase` already carries an optional `points` used by the weighting path
([problemsCore.ts:539-542](../../apps/api/src/utils/problemsCore.ts)). Adding an optional `check`
string is therefore **a type widening with no DDL at all** — the single highest-leverage property of
this whole design ([00_SPIKE](./00_SPIKE.md) F7: ~12 of 16 touched files are type-only).

### `course`/`week` go on `Problem`, not on `ProblemSheet`

[02_AUDIT](./02_AUDIT.md) #13 found `ProblemSheet` structurally right but lacking syllabus fields.
Putting them on **`Problem`** instead is better because course and week are **intrinsic to the
question**, not to one curation of it. Then:

- "Java OPPE1" = `course=JAVA AND week BETWEEN 2 AND 6` — a **query**, not stored data
- "Java OPPE2" = `week BETWEEN 2 AND 9` — the same problems, no duplication
- `ProblemSheet` stays exactly as it is, for curated ladders

Storing the OPPE1/OPPE2 split as sheet rows would duplicate the syllabus into content and guarantee
drift when it changes.

```prisma
enum OppeCourse { PYTHON  PDSA  JAVA  SYSTEM_COMMANDS  C }
enum ProblemProvenance { ORIGINAL  COMMUNITY_RECALLED  OFFICIAL_RELEASED }
```

`OppeCourse` is an **enum, not a free string** — deliberately unlike `Credit.category`, which stays a
string because admins invent categories at will ([CLAUDE.md DB Schema](../../CLAUDE.md)). The course
list is fixed, externally defined by IITM, and directly drives filtering; a typo'd string would
silently empty a listing page. `MLP`/`BIG_DATA`/`MLOPS` are **deliberately absent** — they are out of
v1 ([01_FEASIBILITY](./01_FEASIBILITY.md) B6), and adding a member later is a one-line additive
migration.

## 1.3 ⚠️ The enum-in-transaction trap — why this is two migrations

`prisma migrate deploy` **wraps each migration in a transaction** (stated in this repo's own
[20260701120000](../../prisma/migrations/20260701120000_qotd_leaderboard_agg_index/migration.sql)
header, explaining why `CREATE INDEX CONCURRENTLY` is avoided).

PostgreSQL permits `ALTER TYPE … ADD VALUE` inside a transaction, but **the new value cannot be
used until that transaction commits** (`unsafe use of new value … of enum type`). So a single
migration that adds `OPPE` *and* references it — in a backfill, a `DEFAULT`, or a partial index
`WHERE context_type='OPPE'` — **fails at deploy time**.

**Therefore: split.** Migration 1 does enum work only. Migration 2 adds columns and indexes.

Precedent for the statement style — [20260702093000_certtype_appreciation](../../prisma/migrations/20260702093000_certtype_appreciation/migration.sql):

```sql
ALTER TYPE "CertType" ADD VALUE IF NOT EXISTS 'APPRECIATION';
```

## 1.4 Exact `--create-only` sequence

Hard Constraint #5: `--create-only` is mandatory; review the SQL, then `db:migrate:deploy`. Never
bare `prisma migrate dev` on a shared database.

```bash
# ── Migration 1 — enums only. Nothing may USE these values in this migration. ──
npx prisma migrate dev --create-only --name oppe_enums
# review prisma/migrations/<ts>_oppe_enums/migration.sql, then hand-edit to:
#   ALTER TYPE "ProblemContextType" ADD VALUE IF NOT EXISTS 'OPPE';
#   ALTER TYPE "ProblemLanguage"    ADD VALUE IF NOT EXISTS 'BASH';
#   ALTER TYPE "ProblemLanguage"    ADD VALUE IF NOT EXISTS 'C';
#   CREATE TYPE "OppeCourse" AS ENUM ('PYTHON','PDSA','JAVA','SYSTEM_COMMANDS','C');
#   CREATE TYPE "ProblemProvenance" AS ENUM ('ORIGINAL','COMMUNITY_RECALLED','OFFICIAL_RELEASED');
npm run db:migrate:deploy

# ── Migration 2 — columns + index. Safe now: migration 1 has committed. ──
npx prisma migrate dev --create-only --name oppe_problem_fields
# review, then ensure every statement is IF NOT EXISTS (drifted-DB safe):
#   ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "prelude"    TEXT;
#   ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "course"     "OppeCourse";
#   ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "week"       INTEGER;
#   ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "provenance" "ProblemProvenance";
#   CREATE INDEX IF NOT EXISTS "problems_published_course_week_idx"
#     ON "problems" ("is_published", "course", "week");
npm run db:migrate:deploy
```

⚠️ Prisma's default enum handling is `DROP` + `ADD COLUMN` (data-destroying). This repo's
`20260613120000_constraints_and_enums` used data-preserving `USING` casts for exactly that reason.
**Read the generated SQL before deploying** — that is what `--create-only` is for.

## 1.5 Index rationale

`problems_published_course_week_idx` on `(is_published, course, week)` serves the primary listing
query (published problems for a course, week-filtered) with the selective boolean first. It is fully
representable as a Prisma `@@index`, so unlike `users_email_lower_ux` or
`problem_submissions_qotd_agg_ix` it does **not** need to live outside the schema.

**Not proposed yet:** an OPPE analogue of the QOTD partial covering index. Break-even for that one
was ~50–100 K rows; an OPPE leaderboard should reuse the existing pattern only once volume justifies
it. Premature here.

---

# Part 2 — The question-bank programme

The judge is a weekend. **Forty validated Java questions is the actual project.** This part is scope,
not a footnote.

## 2.1 Launch target

**40 Java questions**, mapped to the syllabus split: OPPE1 = weeks 2–6, OPPE2 = weeks 2–9. The
incumbent has 25 Python and 4 DBMS; 40 syllabus-mapped Java beats everything on the market.

| Milestone | Count | Meaning |
|---|---|---|
| Probe | **10** | Enough for a landing page and a real practice session |
| Beta | **25** | Matches the incumbent's largest subject |
| **Launch** | **40** | Covers both OPPE splits with redundancy |

## 2.2 Authoring workflow — reuse, don't build

[02_AUDIT](./02_AUDIT.md) #11 found the backbone already exists:

| Need | Existing tool |
|---|---|
| Single-question authoring | [CreateProblem.tsx](../../apps/web/src/pages/dashboard/CreateProblem.tsx) — form, test-case editor, completeness checklist |
| Bulk import | [BulkImportCard.tsx](../../apps/web/src/components/admin/problems/BulkImportCard.tsx) — CSV/JSON + downloadable column template |
| Draft gating | Non-admin authors forced `isPublished:false`; admin publishes from the Proposals tab |
| Review queue | `GET /admin/review-queue` ([problems.ts:840](../../apps/api/src/routes/problems.ts)) |

**Additions needed:** `course` / `week` / `provenance` selectors, a `prelude` editor (System Commands),
and a per-test `check` field — all extensions of existing forms, plus the matching columns in the bulk
template.

## 2.3 Provenance — enforce the honour-code boundary in the schema

IITM's grading policy treats sharing live assignment material as plagiarism, and **past OPPE papers
are not officially released**. `Problem.provenance` makes the bank's status explicit rather than
implicit:

| Value | Meaning | Expected share |
|---|---|---|
| `ORIGINAL` | Written to the published week-level syllabus | **Overwhelming majority** |
| `COMMUNITY_RECALLED` | Student-recalled from a past term; unofficial | Small, **labelled in the UI** |
| `OFFICIAL_RELEASED` | Officially published by IITM | Rare/none |

**Rules:** no ingestion of live-term material, ever. `COMMUNITY_RECALLED` renders a visible
"community-recalled, unofficial" badge. A takedown request is satisfiable with one query, because
provenance is a column rather than tribal knowledge.

## 2.4 Contributor pipeline

```
contributor writes question (form or bulk CSV)
        │  non-admin ⇒ isPublished:false, always
        ▼
   CI GATE (§2.5) ── reference solution must pass its own hidden tests ── ✗ blocks
        ▼
   admin review: syllabus fit · provenance · difficulty · check-message hygiene (P7)
        ▼
   publish → course/week filterable → static JSON rebuild (P6)
```

## 2.5 The CI reference-solution gate — the anchor deliverable

**Every question's `referenceSolution` is executed against its own `hiddenTests`. A failing reference
blocks the PR.** Without this, community contribution is unsafe: a broken hidden test is invisible
until a student loses marks to it.

Everything needed already exists:

| Piece | Status |
|---|---|
| `Problem.referenceSolution` + `referenceLanguage` | ✅ [schema.prisma:1295-1296](../../prisma/schema.prisma) |
| A judge that takes code + tests and returns per-test verdicts | ✅ `runJudge` in [codeJudge.ts](../../apps/api/src/utils/codeJudge.ts) |
| A CI job to hang it on | ✅ [ci.yml](../../.github/workflows/ci.yml) — `test:stability`, [audit-gate.mjs](../../scripts/audit-gate.mjs) |
| A precedent for a blocking, exception-listed gate | ✅ `audit-gate.mjs` with `REVIEWED_EXCEPTIONS` |

**Design.** Questions live in-repo as JSON (which P6 requires anyway for the static build), so the
gate runs on the files, not the database:

```
scripts/verify-questions.mjs
  for each question JSON:
    assert referenceSolution && referenceLanguage present
    assert language ∈ packages/problem-schema table          ← catches the C/BASH drift class
    assert hiddenTests.length ≥ 1 and within the A4 budget   ← 01_FEASIBILITY A4
    run referenceSolution against hiddenTests via the real judge
    assert verdict === ACCEPTED and passedCount === totalCount
  exit 1 on any failure
```

**Two guards this inherits for free.** It fails **closed** on a broken run (the `audit-gate.mjs`
lesson: assert the result *shape* before scanning, or an unreachable upstream prints PASS). And it
enforces the [01_FEASIBILITY](./01_FEASIBILITY.md) **A4 wall-clock budget** — `per-test timeout ×
test count` under ~12 s — so a question that would issue false TLEs is rejected at authoring time
rather than discovered by a student.

**Same harness, second job: the browser/server divergence suite**
([03_ARCHITECTURE](./03_ARCHITECTURE.md) §2). Each Python reference solution runs through *both*
graders; verdicts must match. First case is recursion depth.

⚠️ This job makes network calls to Wandbox, so it must be **non-blocking on upstream failure** —
distinguish "reference is wrong" (block) from "upstream is down" (warn), or an outage stops all
merges. Same fail-closed-vs-fail-open discipline the audit gate already documents.

## 2.6 Effort

| Item | Effort |
|---|---|
| Schema migrations (S1–S10) | 0.5 day |
| P3 consolidation (`packages/problem-schema`) — **prerequisite** | 2 days |
| `check` mechanism + harness changes + P7 scrubbing | 2–3 days |
| bash harness + `prelude` | 3–4 days |
| C harness + enum | 1 day |
| Authoring UI extensions | 2 days |
| CI reference gate + divergence suite | 2–3 days |
| **Platform total** | **~2.5 weeks** |
| **40 Java questions** | **the actual schedule** |

---

## Carried to `05_ROADMAP` / `06_RISKS`

Migration split is a **hard ordering constraint** (1.3) · P3 must precede `BASH`/`C` · the CI gate
must precede any external contribution · provenance labelling is a **risk control**, not a nice-to-have.
