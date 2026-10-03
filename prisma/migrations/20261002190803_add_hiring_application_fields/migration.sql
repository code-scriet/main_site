-- Enhanced hiring application fields — additive only, no backfill, no destructive drift.
--
-- NOTE: the auto-generated version of this migration also emitted DROP INDEX
-- statements for the pg_trgm search indexes and unrelated `settings` column
-- type changes. Those are local dev-DB drift artifacts (see the hand-written
-- 20261002120000_interview_scheduling migration) and would regress Postgres
-- trigram search if applied, so they are deliberately removed here. Only the
-- four optional hiring_applications columns are intended.

-- AlterTable
ALTER TABLE "hiring_applications" ADD COLUMN IF NOT EXISTS "cv_link" TEXT,
ADD COLUMN IF NOT EXISTS "why_join" TEXT,
ADD COLUMN IF NOT EXISTS "team_question_1" TEXT,
ADD COLUMN IF NOT EXISTS "team_question_2" TEXT;
