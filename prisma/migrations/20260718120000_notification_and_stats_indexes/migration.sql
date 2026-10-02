-- ─── Notification-bell + admin-stats read indexes (additive, idempotent) ─────
-- 1) audit_logs(entity, entity_id, timestamp): serves the notification bell's
--    per-user system-events query (routes/notifications.ts filters audit_logs by
--    entity + entity_id and orders by timestamp) — the existing composite
--    indexes lead with other columns and can't satisfy it.
-- 2) problem_submissions(submitted_at): serves the admin dashboard's
--    AC-rate · 7d groupBy (routes/stats.ts) — a bare submitted_at range scan.
--
-- Index names match Prisma's default naming so schema.prisma and the DB agree
-- with no drift. NON-concurrent on purpose: `prisma migrate deploy` wraps each
-- migration in a transaction and CREATE INDEX CONCURRENTLY cannot run inside
-- one; both tables are small at club scale, so the brief build lock is fine.
-- IF NOT EXISTS ⇒ idempotent/re-runnable.

CREATE INDEX IF NOT EXISTS "audit_logs_entity_entity_id_timestamp_idx"
  ON "audit_logs"("entity", "entity_id", "timestamp");

CREATE INDEX IF NOT EXISTS "problem_submissions_submitted_at_idx"
  ON "problem_submissions"("submitted_at");
