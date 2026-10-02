-- ─── S2d: covering partial index for the QOTD leaderboard aggregates ─────────
-- The /api/qotd/leaderboard/{total,around-me} handlers scan EVERY
-- problem_submissions row with context_type='QOTD', join qotd on context_key,
-- GROUP BY user_id, and read score/submitted_at/verdict. Today a 60s in-process
-- cache hides that cost; this index keeps the underlying cache-MISS aggregate an
-- index-only scan of the QOTD partition as submission volume grows (break-even
-- pain ~50-100K cumulative QOTD rows).
--
-- Partial WHERE context_type='QOTD' keeps CONTEST/PRACTICE inserts OUT of the
-- index (no write amplification on the hot practice/contest path). INCLUDE makes
-- the aggregate heap-free. NON-concurrent on purpose: `prisma migrate deploy`
-- wraps each migration in a transaction and CREATE INDEX CONCURRENTLY cannot run
-- inside one; the problem_submissions row count is small enough at club scale
-- that the brief build lock is sub-second. IF NOT EXISTS ⇒ idempotent/re-runnable.
--
-- PRISMA-INVISIBLE (mirrors users_email_lower_ux in 20260613120000): a partial +
-- covering (INCLUDE) index is not representable in schema.prisma. It lives
-- outside Prisma's model. Re-verify on any Prisma upgrade that `migrate dev`
-- does NOT generate a DROP for it (if it ever does, keep it here and exclude it
-- from the schema, same as the email index).
--
-- Rollback: DROP INDEX IF EXISTS "problem_submissions_qotd_agg_ix";
-- Gate before trusting it in prod: run EXPLAIN ANALYZE on the /leaderboard/total
-- query before & after on a production-like dataset and confirm the planner uses
-- it. It is additive and safe regardless (worst case: an unused index with minor
-- write cost on QOTD submits only).
CREATE INDEX IF NOT EXISTS "problem_submissions_qotd_agg_ix"
  ON "problem_submissions" ("context_key", "user_id")
  INCLUDE ("score", "submitted_at", "verdict")
  WHERE "context_type" = 'QOTD';
