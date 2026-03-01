-- Add legacy slug storage for backward-compatible Team and Network profile URLs.
ALTER TABLE "team_members"
  ADD COLUMN IF NOT EXISTS "legacy_slugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "network_profiles"
  ADD COLUMN IF NOT EXISTS "legacy_slugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "team_members_legacy_slugs_gin_idx"
  ON "team_members" USING GIN ("legacy_slugs");

CREATE INDEX IF NOT EXISTS "network_profiles_legacy_slugs_gin_idx"
  ON "network_profiles" USING GIN ("legacy_slugs");
