-- Run `npm run db:audit:competition-autosaves` before applying this migration in production.
-- Cleanup rules are intentionally conservative:
-- 1. Delete auto-saves only when the owning user no longer exists.
-- 2. Preserve auto-saves for live users by nulling stale team references.

DELETE FROM "competition_auto_saves" cas
WHERE NOT EXISTS (
  SELECT 1
  FROM "users" u
  WHERE u."id" = cas."user_id"
);

UPDATE "competition_auto_saves" cas
SET "team_id" = NULL
WHERE cas."team_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "event_teams" et
    WHERE et."id" = cas."team_id"
  );

ALTER TABLE "competition_auto_saves"
ADD CONSTRAINT "competition_auto_saves_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "event_teams"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "competition_auto_saves"
ADD CONSTRAINT "competition_auto_saves_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
