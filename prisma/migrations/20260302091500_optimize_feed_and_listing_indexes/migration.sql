-- Optimize common listing/feed query patterns across public and admin pages.

-- Users admin listing: WHERE role != ... ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS "users_role_created_at_desc_idx"
  ON "users" ("role", "created_at" DESC);

-- Event registrations listing per event ordered by newest first
CREATE INDEX IF NOT EXISTS "event_registrations_event_id_timestamp_desc_idx"
  ON "event_registrations" ("event_id", "timestamp" DESC);

-- Announcements homepage/list ordering with expiry filtering
CREATE INDEX IF NOT EXISTS "announcements_pinned_created_at_desc_idx"
  ON "announcements" ("pinned" DESC, "created_at" DESC);

CREATE INDEX IF NOT EXISTS "announcements_expires_pinned_created_idx"
  ON "announcements" ("expires_at", "pinned" DESC, "created_at" DESC);

-- Team listings sorted by team/order/created_at and global order views
CREATE INDEX IF NOT EXISTS "team_members_team_order_created_at_idx"
  ON "team_members" ("team", "order", "created_at");

CREATE INDEX IF NOT EXISTS "team_members_order_created_at_idx"
  ON "team_members" ("order", "created_at");

-- Team member slug already has a unique index via `@unique`; drop redundant plain index if present
DROP INDEX IF EXISTS "team_members_slug_idx";

-- Achievement featured feed ordering
CREATE INDEX IF NOT EXISTS "achievements_featured_date_desc_idx"
  ON "achievements" ("featured", "date" DESC);

-- Network public feed filters and sorting
CREATE INDEX IF NOT EXISTS "network_profiles_public_feed_idx"
  ON "network_profiles" ("status", "is_public", "is_featured" DESC, "display_order", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "network_profiles_status_public_industry_idx"
  ON "network_profiles" ("status", "is_public", "industry");
