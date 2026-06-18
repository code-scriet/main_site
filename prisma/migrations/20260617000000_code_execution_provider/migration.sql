-- Admin-selectable code-execution provider for the judge + playground.
--
-- Adds `settings.code_execution_provider` (default 'wandbox'). The CF Worker
-- (workers/executor.js) tries this provider first and falls back to the other
-- (wandbox <-> godbolt) on an upstream infra failure. Read cached on both the
-- API (getCachedSettings, 5-min) and the playground execute-server (60s) and
-- passed to the worker in the request body.
--
-- IF NOT EXISTS keeps it safe on any drift: it adds the column where missing and
-- is a no-op where it already exists.
ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "code_execution_provider" TEXT NOT NULL DEFAULT 'wandbox';
