-- ─── Trigram (pg_trgm) indexes for the Cmd+K global search ──────────────────
-- The global search (routes/search.ts) filters every table with
-- `contains … mode:'insensitive'` → `col ILIKE '%q%'`. A leading-wildcard ILIKE
-- can't use a btree index, so each keystroke seq-scanned the table (fine while
-- tables are tiny, but `users` grows). A GIN index with the `gin_trgm_ops`
-- operator class makes ILIKE '%q%' index-backed for query fragments ≥3 chars.
--
-- pg_trgm is a standard contrib extension (available on Neon). These indexes use
-- the `gin_trgm_ops` operator class, which Prisma 5.x does not introspect — so,
-- like `users_email_lower_ux` and `problem_submissions_qotd_agg_ix`, they live
-- OUTSIDE schema.prisma's model (no drift, no managed drop). Re-verify on a
-- Prisma upgrade. `IF NOT EXISTS` ⇒ idempotent/re-runnable. Non-CONCURRENT on
-- purpose (migrate deploy wraps each migration in a txn); the searched tables are
-- small at club scale, so the brief build lock is acceptable.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users (the fastest-growing searched table — highest-value target)
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx"  ON "users"  USING gin ("name"  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users"  USING gin ("email" gin_trgm_ops);

-- Events
CREATE INDEX IF NOT EXISTS "events_title_trgm_idx" ON "events" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "events_slug_trgm_idx"  ON "events" USING gin ("slug"  gin_trgm_ops);

-- Problems
CREATE INDEX IF NOT EXISTS "problems_title_trgm_idx" ON "problems" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "problems_slug_trgm_idx"  ON "problems" USING gin ("slug"  gin_trgm_ops);

-- Polls
CREATE INDEX IF NOT EXISTS "polls_question_trgm_idx" ON "polls" USING gin ("question" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "polls_slug_trgm_idx"     ON "polls" USING gin ("slug"     gin_trgm_ops);

-- Announcements
CREATE INDEX IF NOT EXISTS "announcements_title_trgm_idx" ON "announcements" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "announcements_slug_trgm_idx"  ON "announcements" USING gin ("slug"  gin_trgm_ops);
