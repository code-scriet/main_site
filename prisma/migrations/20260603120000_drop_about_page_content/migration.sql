-- Drop the unused about_page_content column. The original 20260524230555 migration
-- added it for a planned admin-editable About page, but the page is file-managed
-- (apps/web/src/lib/aboutContent.ts) and the column was never read.
-- IF EXISTS makes this safe whether or not 20260524230555 has been deployed yet.
ALTER TABLE "settings" DROP COLUMN IF EXISTS "about_page_content";
