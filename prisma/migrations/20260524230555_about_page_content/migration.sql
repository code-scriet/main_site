-- AlterTable: site launch date drives the "months since inception" stat on /about.
ALTER TABLE "settings" ADD COLUMN "site_launch_date" TIMESTAMP(3) NOT NULL DEFAULT '2026-01-01T00:00:00Z';

-- AlterTable: JSON-encoded About-page content (null = use client-side defaults).
-- Shape validated against an explicit Zod schema in apps/api/src/routes/settings.ts on PATCH.
ALTER TABLE "settings" ADD COLUMN "about_page_content" TEXT;
