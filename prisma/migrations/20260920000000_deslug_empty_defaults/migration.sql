-- Deslug empty-string defaults: backfill historical "" slugs with unique
-- id-prefixed values, then drop the column defaults so application code
-- (generateUniqueSlug, with the "untitled" fallback) is the sole source.
-- Idempotent: each UPDATE only touches rows still holding "".
UPDATE "events" SET "slug" = 'event-' || substr("id", 1, 8) WHERE "slug" = '';
UPDATE "announcements" SET "slug" = 'announcement-' || substr("id", 1, 8) WHERE "slug" = '';
UPDATE "achievements" SET "slug" = 'achievement-' || substr("id", 1, 8) WHERE "slug" = '';
ALTER TABLE "events" ALTER COLUMN "slug" DROP DEFAULT;
ALTER TABLE "announcements" ALTER COLUMN "slug" DROP DEFAULT;
ALTER TABLE "achievements" ALTER COLUMN "slug" DROP DEFAULT;

-- Additive FK/lookup indexes matching the @@index entries in schema.prisma.
-- Idempotent (IF NOT EXISTS): safe to re-apply. NOTE to the next dev running
-- `prisma migrate dev`: it diffs schema against migration FILES (not the DB),
-- so it may propose re-creating these six indexes — delete those statements
-- from the generated migration before applying.
CREATE INDEX IF NOT EXISTS "event_teams_leader_id_idx" ON "event_teams"("leader_id");
CREATE INDEX IF NOT EXISTS "event_team_members_user_id_idx" ON "event_team_members"("user_id");
CREATE INDEX IF NOT EXISTS "hiring_applications_user_id_idx" ON "hiring_applications"("user_id");
CREATE INDEX IF NOT EXISTS "problems_created_by_idx" ON "problems"("created_by");
CREATE INDEX IF NOT EXISTS "problem_sheets_created_by_idx" ON "problem_sheets"("created_by");
CREATE INDEX IF NOT EXISTS "competition_round_problems_problem_id_idx" ON "competition_round_problems"("problem_id");
