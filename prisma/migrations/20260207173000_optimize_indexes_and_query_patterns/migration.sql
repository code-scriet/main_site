-- Database optimization migration:
-- 1) Remove redundant indexes that duplicate unique constraints.
-- 2) Add composite/time-based indexes for common query patterns.

-- Redundant indexes (unique constraints already provide indexes)
DROP INDEX IF EXISTS "users_email_idx";
DROP INDEX IF EXISTS "achievements_slug_idx";

-- Replace single-column hiring filters with filter+sort composite indexes
DROP INDEX IF EXISTS "hiring_applications_status_idx";
DROP INDEX IF EXISTS "hiring_applications_applying_role_idx";

-- Event listing/sorting
CREATE INDEX IF NOT EXISTS "events_start_date_idx" ON "events"("start_date");

-- Registration-heavy reads (user dashboard + stats windows)
CREATE INDEX IF NOT EXISTS "event_registrations_user_id_timestamp_idx"
  ON "event_registrations"("user_id", "timestamp");
CREATE INDEX IF NOT EXISTS "event_registrations_timestamp_idx"
  ON "event_registrations"("timestamp");

-- Expiry filtering for announcements
CREATE INDEX IF NOT EXISTS "announcements_expires_at_idx"
  ON "announcements"("expires_at");

-- QOTD submission history/trends
CREATE INDEX IF NOT EXISTS "qotd_submissions_user_id_timestamp_idx"
  ON "qotd_submissions"("user_id", "timestamp");
CREATE INDEX IF NOT EXISTS "qotd_submissions_timestamp_idx"
  ON "qotd_submissions"("timestamp");

-- Hiring admin list filters with createdAt sorting
CREATE INDEX IF NOT EXISTS "hiring_applications_status_created_at_idx"
  ON "hiring_applications"("status", "created_at");
CREATE INDEX IF NOT EXISTS "hiring_applications_applying_role_created_at_idx"
  ON "hiring_applications"("applying_role", "created_at");
