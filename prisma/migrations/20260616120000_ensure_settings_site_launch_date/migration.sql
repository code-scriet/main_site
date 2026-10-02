-- Resilience migration: ensure `settings.site_launch_date` exists.
--
-- The original 20260524230555_about_page_content migration added this column,
-- but production drifted (the column is absent there) while the migration is
-- recorded as applied, so `prisma migrate deploy` won't re-add it. Every
-- full-row Settings read (getCachedSettings -> /api/settings, /api/settings/public)
-- then fails with "column settings.site_launch_date does not exist" -> 500.
--
-- IF NOT EXISTS makes this safe everywhere: it adds the column on the drifted
-- production DB and is a no-op where 20260524230555 applied cleanly.
ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "site_launch_date" TIMESTAMP(3) NOT NULL DEFAULT '2026-01-01T00:00:00Z';
