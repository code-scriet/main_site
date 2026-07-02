-- S4/S6 runtime toggles on the Settings singleton (admin UI toggles replacing
-- env-only flags; the env vars remain as emergency force-ON overrides).
-- Additive + idempotent: IF NOT EXISTS makes this safe to re-run and safe on
-- instances where a hotfix added the columns manually. Defaults FALSE ⇒ both
-- features stay off until an admin flips them — zero behavior change on deploy.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "quiz_fold_rank_in_result" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "quiz_snapshot_enabled" BOOLEAN NOT NULL DEFAULT false;
