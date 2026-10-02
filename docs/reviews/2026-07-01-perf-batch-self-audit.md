# Self-audit findings — perf batch S0–S7a (2026-07-01)

> **STATUS: ALL FINDINGS FIXED + RE-VERIFIED** (same session). Plus one CRITICAL bug the
> re-check found that no finder reported: `wsEngine: undefined` (an explicit key) overwrites
> engine.io's `ws` default via Object.assign and would have crashed EVERY socket connection
> in the default (flag-off) configuration — fixed with a conditional spread in both servers
> and proven by a three-way smoke (flag-off PASS / eiows PASS / old shape confirmed broken).
> Final verification: api+web tsc clean, 201/201 stability tests, lint 0 errors,
> quizEmissionPlanner tests extended with the capability-gate case.

Review of the uncommitted working-tree diff (S0 statement_timeout, S1 bcrypt, S2a-d DB wins,
S4 rank-fold, S3 shared-cache helper, S7a eiows). 5 of 8 finder angles completed (3 hit the
session usage limit; their key checks were re-run inline — see "Inline re-checks").

## Confirmed findings (to fix)

1. **[BUG] `passwordSessionInvalidation.test.ts` still imports `bcryptjs`** which was removed
   from package.json — passes locally only because node_modules retains the stale package;
   breaks on fresh install/CI. → switch to `bcrypt`. Also sweep repo for other bcryptjs refs.
2. **[BUG/RACE] `dedupe()` slot-clear races with invalidation** (qotd.ts:157): `.finally(() =>
   slot.p = null)` nulls whatever promise is CURRENTLY in the slot; if invalidation nulls the
   slot mid-flight and a new compute P2 starts, P1 settling wipes P2 → stampede returns. Fix:
   identity-guarded clear + generation counter (also closes the stale-write-back window).
3. **[BUG] total-leaderboard `limit` leaks across concurrent requests**: the deduped compute
   closes over the FIRST requester's `?limit` (1–10); concurrent waiters + the 60s cache get
   that limit's rows (a limit=10 caller can receive 1 row). Pre-existing on cache-hits,
   worsened by dedupe. Fix: compute full top-10 once, slice per request (weekly already does).
4. **[REUSE/ALTITUDE] Two NEW single-flight idioms added in one diff** (stats dashboard pair +
   qotd dedupe/slots), on top of 3 pre-existing copies. Fix: shared
   `utils/singleFlight.ts` (`createTtlSingleFlight`), refactor the two new sites onto it;
   invalidation becomes `board.invalidate()` (no manual slot bookkeeping).
5. **[EFFICIENCY] `rankByUserId` + `answeredUserIds` built on every reveal even when the fold
   flag is OFF (default)** — ~900 wasted allocations per reveal at ceiling on the 400MB box.
   Fix: gate construction behind `foldRank`.
6. **[SAFETY/ALTITUDE] S4 flag is server-global but tolerance lives in the client bundle** —
   flag ON + stale cached SPA bundle = answered players outside top-10 get a frozen rank
   display. Fix: capability handshake — client advertises `foldedRankOk: true` in `join_quiz`;
   server folds ONLY for sockets that advertised it. Old bundles keep getting my_rank_update
   even with the flag on → flag becomes safe to flip regardless of client age.
7. **[CONVENTIONS] CLAUDE.md not updated in the same change** (Living Document Protocol):
   new env vars (PG_STATEMENT_TIMEOUT_MS, QUIZ_FOLD_RANK_IN_RESULT, WS_ENGINE), dep swap
   bcryptjs→bcrypt (+ optional eiows), answer_result payload gained rank/totalPlayers.
   Fix: update Env Vars table, Tech Stack row, Quiz socket-events row + quiz section note
   (records owner approval for S0/S4 per the approved plan).
8. **[SIMPLIFICATION] `setSharedPublicCache`**: hidden `max-age=min(x,30)` clamp undocumented +
   caller-must-remember safety contract. Fix: take `req`, enforce guard #1 in code (authed/
   cookie'd request degrades to `setPublicCache`), document the clamp.
9. **[SIMPLIFICATION] web quizStore: two independent conditional spreads for a pair-emitted
   field** — can half-apply a malformed payload. Fix: single paired guard.
10. **[COMMENT] quizSocket S4 comment claims per-reveal env read enables "restart without
    redeploy" — a module const behaves identically. Fix: hoist + accurate comment.

## Refuted / skipped

- users.ts Promise.all queue-fairness concern → verified a WIN, not a regression (efficiency
  angle cleared it; old version pinned 1 conn for 26×RTT).
- eiows resolver duplication across TS/JS services → matches repo's documented mirror pattern.
- resolvePoolMax vs resolveStatementTimeoutMs parser dedup → over-abstraction, skipped.
- HC#3 (frozen pool) / quiz-freeze objections to S0/S4 → owner-approved in the accepted plan;
  recorded via the CLAUDE.md updates (finding 7).
- Consolidating the 3 PRE-existing single-flight copies (getHomePayload/getPublicStats/
  settingsCache) → outside this diff's scope; noted for a future hygiene PR.

## Inline re-checks (covering the 3 limit-killed angles)

- repo-wide `bcryptjs` grep → only the test import (finding 1).
- `@prisma/adapter-pg` forwards `options` to pg.Pool → verify in node_modules (done inline).
- socket.io `wsEngine: undefined` ≡ omitted → verify engine.io default handling (done inline).
- `planQuestionResults` callers → quizSocket.ts + tests only; options param is optional ⇒ safe.
- setPublicCache on every response path → made uniform by the singleFlight refactor.
