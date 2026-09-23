-- Show-execution-source display flag for run-output badges.
-- Boolean add is instant and non-blocking; default true preserves current UX.
ALTER TABLE "settings" ADD COLUMN "show_execution_source" BOOLEAN NOT NULL DEFAULT true;
