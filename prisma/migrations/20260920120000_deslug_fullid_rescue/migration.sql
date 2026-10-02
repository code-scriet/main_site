-- Rescue backfill for any "" slugs left behind if the prefix backfill in
-- 20260920000000_deslug_empty_defaults could not complete (e.g. an id-prefix
-- collision aborted that migration). The full row id is unique per table, so
-- these values cannot collide. Pure no-op on databases where the prefix
-- backfill already succeeded (no "" rows remain) and on fresh databases.
UPDATE "events" SET "slug" = 'event-' || "id" WHERE "slug" = '';
UPDATE "announcements" SET "slug" = 'announcement-' || "id" WHERE "slug" = '';
UPDATE "achievements" SET "slug" = 'achievement-' || "id" WHERE "slug" = '';
