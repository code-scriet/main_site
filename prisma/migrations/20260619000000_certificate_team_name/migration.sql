-- Certificate team name persistence.
--
-- WINNER team certificates render a team name into the PDF at first issuance, but
-- it was never stored — so a regenerated cert (admin edit, or cloud-asset recovery)
-- silently dropped the team name. This column persists it so regeneration can
-- restore it.
--
-- Nullable, additive, idempotent — safe to (re)apply on a drifted DB. The code path
-- does NOT require this column: certificate writes use a schema-fallback that omits
-- team_name when absent, and reads tolerate P2022, so an un-migrated instance keeps
-- working (just without team-name restoration on regeneration).

ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "team_name" TEXT;
