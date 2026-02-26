-- Add rich profile content fields to network_profiles table
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

ALTER TABLE "network_profiles"
  ADD COLUMN IF NOT EXISTS "vision"    TEXT,
  ADD COLUMN IF NOT EXISTS "story"     TEXT,
  ADD COLUMN IF NOT EXISTS "expertise" TEXT;
