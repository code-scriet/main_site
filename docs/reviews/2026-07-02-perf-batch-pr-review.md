# PR Review — perf/robustness batch (S0–S7a) · 2026-07-02

> **Reviewed as an external, third-person panel** (three independent reviewers: correctness,
> security/ops, architecture; the correctness reviewer's session was cut short and its
> dimension was re-covered manually — its assigned checks and outcomes are listed below).
> Scope: the full uncommitted working-tree diff (~30 files) plus the new migration.
>
> **Final verdict: APPROVE-WITH-COMMENTS** — after the two blocking findings were fixed in
> the same session (both fixes verified). Initial panel verdicts were request-changes ×2.

## What this PR does

The author lands eight independently-flagged performance/robustness tracks on a free-tier
(512 MB × 2 boxes, frozen 5-connection Neon pool) platform: an env-gated pg
`statement_timeout` valve (S0); a bcryptjs→native-bcrypt swap (S1); DB quick wins —
`$transaction([])`→`Promise.all`, a shared TTL+single-flight primitive for the admin
dashboard and the three QOTD leaderboards, and a Prisma-invisible partial covering index
(S2a–d); enforced shared-edge cache headers on 13 provably-anonymous GET sites (S3); a
flagged fold of quiz rank into `answer_result` with a per-socket capability handshake (S4);
flag-gated crash-durable quiz snapshots restoring as *paused* rooms (S6); and an opt-in C++
WebSocket engine (eiows) on both socket servers (S7a). CLAUDE.md is updated throughout per
the repo's Living Document Protocol, and the author committed their own prior self-audit
(docs/reviews/2026-07-01) — an unusually honest artifact that this panel repeatedly used as
a cross-reference.

## Blocking findings (both FIXED in-session)

1. **S0 shipped default-ON against an unverified pooler behavior** (`lib/prisma.ts`).
   Neon's pooled endpoint is PgBouncer, which only accepts startup `options` parameters it
   tracks; `statement_timeout` may be honored, silently stripped (no-op valve), or
   **rejected — refusing every pooled connection, a total API outage on first deploy**.
   *Fix applied:* default flipped to **OFF** (opt-in via `PG_STATEMENT_TIMEOUT_MS`), the
   code comment no longer asserts pooler support as fact, a NaN-typo env value now warns
   instead of silently disabling, and CLAUDE.md documents the exact verification command
   required before enabling.
2. **`createTtlSingleFlight` — canonical shared infrastructure with zero tests**
   (`utils/singleFlight.ts`). Its two non-obvious guarantees (identity-guarded clear,
   generation fencing) exist precisely because the author's self-audit caught races in the
   hand-rolled predecessors; neither was verified. *Fix applied:* 4 unit tests covering
   single-flight dedup + TTL, error non-caching, invalidate-during-inflight fencing, and
   the old-compute-cannot-evict-newer-slot identity guard. All pass.

## Non-blocking findings (addressed in-session)

- **settingsCache stale-write-back** — the panel correctly rejected the author's "deferred
  hygiene" framing for this one copy: an in-flight read racing `invalidateSettingsCache()`
  could mask an admin settings PUT (including `emailTestingMode`) for a full 5-minute TTL.
  *Fixed:* generation fence + identity-guarded clear added, mirroring the primitive.
- **`GET /stats/home` inconsistency** — listed in `setSharedPublicCache`'s own doc but not
  migrated, and hand-rolling a Vary-less header. *Fixed:* migrated to the enforced helper.
- **`setSharedPublicCache` guard untested** despite its security claim. *Fixed:* 4 unit
  tests (bare request → s-maxage; Authorization/`scriet_session` → safe degrade; unrelated
  cookies don't block sharing).
- **Snapshot tick event-loop cost at ceiling** (multi-MB `allAnswers` stringify). *Fixed:*
  2 MB per-room size guard — an oversized room is skipped with a once-per-quiz warning
  (crash durability is best-effort; live-quiz liveness is not negotiable).
- **Hygiene:** `.gitignore` gains `.data/` + WAL sidecars (the snapshot DB contains quiz
  answer keys); `QuizRoom` gains a drift-pointer comment to `quizSnapshot.ts` (the
  hand-maintained field copy is the module's one fragile seam); the vestigial
  `scheduleEmptyRoomCleanup(_io)` parameter is documented; the inaccurate S2b comment
  (claimed to share getHomePayload's implementation and TTL — it shares neither) was
  corrected; CLAUDE.md gains the missing Tech Stack row for the two optional native deps
  and the corrected S0 row.

## Deferred (follow-ups, deliberately not in this diff)

- **Batch the audit-log retention DELETE** (`routes/audit.ts`) via the existing
  `deleteInBatches` before enabling S0 below 8s — a months-of-rows manual DELETE is the
  statement most likely to hit the valve, and 57014 rolls it back atomically so retries
  never shrink the working set. Same check for a 900-player `quizAnswer.createMany`.
- **S6 recovery integration test** (temp-file sqlite + mocked `prisma.quiz.findMany`) for
  the freshness/DB-status/existing-room guards; conversions are unit-tested, orchestration
  is not.
- **Migrating the two remaining benign cache copies** (getHomePayload, getPublicStats) onto
  the primitive — genuinely safe to defer (no `invalidate()`, so neither race can occur).
- **Cloudflare guards #2/#3** (path-allowlist Cache Rule + bypass-on-cookie) are ops
  config; the panel noted this repo's precedent for dashboard-managed config drifting
  (Render rewrites incident) and recommends recording the exact CF config in the ops
  checklist before any Cache Rule is enabled. The code is safe without them (bodies are
  anonymous-identical; the enforced guard degrades credentialed requests).

## What the panel explicitly praised

- **`setSharedPublicCache` survives adversarial reading** — all 13 switched sites verified
  anonymous-identical by reading each handler; the two danger routes (mixed-audience
  `GET /events`, per-user around-me) correctly untouched; header-case and cookie-substring
  false-positives can only degrade in the safe direction.
- **The optional-native-dep story** — eiows and better-sqlite3 both behind try/require with
  logged fallbacks and `optionalDependencies`, and the `wsEngine: undefined` /
  Object.assign trap (a would-be total-socket-outage the author's own audit caught) is both
  fixed and documented at the site, byte-equivalently in both services.
- **S4's capability handshake is the right altitude** — payload versioning would not solve
  the real failure mode (server suppressing `my_rank_update` for an incapable client);
  every gap in the flag×capability matrix fails safe toward "duplicate message, never
  missing rank", and the `canFold` injection seam keeps the planner pure and testable.
- **S6's paused-restore design** — verifiably simpler than boot-time timer re-arm (the
  resume path already re-derives the clock anchor), keeps the frozen engine untouched, and
  documents its sharp edges honestly (deploys not covered; unclaimed recoveries
  self-ABANDON; scheduler-after-recovery ordering).
- **The S2d migration comment block** — called "exemplary… the template for future raw-SQL
  migrations" (exact queries served, break-even scale, deliberate non-CONCURRENTLY,
  rollback statement, EXPLAIN gate, Prisma-invisibility warning wired to precedent).
- **The S2c full-dataset-compute + per-request-slice refactor** — fixes a pre-existing
  cross-caller `?limit=` cache-poisoning bug while landing the optimization.

## Correctness dimension (re-covered manually after the reviewer was cut short)

Verified: singleFlight semantics (now also test-enforced); around-me's per-user slice stays
outside the shared compute; the total board's top-10 slice preserves ranks (rank is stamped
at build); snapshot guards (finished/isPersisting/pendingFinalStatus) and counter math;
scheduler-after-recovery ordering and the shutdown window (a final tick cannot resurrect a
cleanly-persisted quiz — the DB-status guard rejects FINISHED/ABANDONED rows); restore has
no P2002 risk (no DB writes; the quiz row still owns its pin/joinCode); `initQuiz`'s
MAX_ACTIVE_ROOMS throw is caught per-room in recovery; reconnects re-advertise
`foldedRankOk` on the fresh socket and `canFold`'s live-namespace lookup fails safe for
dead sockets; no `bcryptjs` residue outside `.claude/worktrees`.

## Landing guidance

The repo squash-merges; landing all eight tracks as one commit is bisect-opaque. The panel
recommends splitting into four commits/PRs: **(1)** S1 bcrypt (auth-critical, mechanically
verifiable), **(2)** S0 + S2a–d + singleFlight + migration (DB batch), **(3)** S3 header
sweep, **(4)** S4 + S6 + S7a (quiz/socket batch, all default-off). Every risky behavior is
env-flagged with default = pre-PR behavior, so runtime risk is low regardless; the split is
for revertability.

## Verification record (post-fixes)

api + web `tsc` clean · **211/211** stability tests (8 added by this review) · lint 0
errors · eiows smoke: flag-off PASS / flag-on PASS / old broken shape confirmed broken ·
S6 round-trip + guards unit-tested · singleFlight + shared-cache guard unit-tested.
