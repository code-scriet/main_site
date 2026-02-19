-- Compatibility migration for environments that predate the Network feature.
-- Safe to run multiple times.
-- Also backfills indexes from 20260220003000 in case that migration is resolved as applied.

-- 1) Ensure Role enum supports NETWORK.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'NETWORK';

-- 2) Ensure network enums exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NetworkConnectionType') THEN
    CREATE TYPE "NetworkConnectionType" AS ENUM (
      'GUEST_SPEAKER',
      'GMEET_SESSION',
      'EVENT_JUDGE',
      'MENTOR',
      'INDUSTRY_PARTNER',
      'ALUMNI',
      'OTHER'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NetworkStatus') THEN
    CREATE TYPE "NetworkStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
  END IF;
END $$;

-- 3) Ensure network_profiles table exists.
CREATE TABLE IF NOT EXISTS "network_profiles" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "slug" TEXT,
  "full_name" TEXT NOT NULL,
  "designation" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "bio" TEXT,
  "profile_photo" TEXT,
  "phone" TEXT,
  "linkedin_username" TEXT,
  "twitter_username" TEXT,
  "github_username" TEXT,
  "personal_website" TEXT,
  "connection_type" "NetworkConnectionType" NOT NULL,
  "connection_note" TEXT,
  "connected_since" INTEGER,
  "passout_year" INTEGER,
  "degree" TEXT,
  "branch" TEXT,
  "roll_number" TEXT,
  "achievements" TEXT,
  "current_location" TEXT,
  "admin_notes" TEXT,
  "events" JSONB DEFAULT '[]'::jsonb,
  "is_featured" BOOLEAN NOT NULL DEFAULT false,
  "status" "NetworkStatus" NOT NULL DEFAULT 'PENDING',
  "verified_at" TIMESTAMP(3),
  "verified_by" TEXT,
  "rejection_reason" TEXT,
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "network_profiles_pkey" PRIMARY KEY ("id")
);

-- 4) Ensure auth/hiring lower(email) indexes.
CREATE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users"(LOWER("email"));
CREATE INDEX IF NOT EXISTS "hiring_applications_email_lower_idx" ON "hiring_applications"(LOWER("email"));

-- 5) Ensure unique constraints/indexes.
CREATE UNIQUE INDEX IF NOT EXISTS "network_profiles_user_id_key" ON "network_profiles"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "network_profiles_slug_key" ON "network_profiles"("slug");
CREATE INDEX IF NOT EXISTS "network_profiles_status_created_at_idx" ON "network_profiles"("status", "created_at");
CREATE INDEX IF NOT EXISTS "network_profiles_connection_type_idx" ON "network_profiles"("connection_type");
CREATE INDEX IF NOT EXISTS "network_profiles_industry_idx" ON "network_profiles"("industry");
CREATE INDEX IF NOT EXISTS "network_profiles_display_order_idx" ON "network_profiles"("display_order");
CREATE INDEX IF NOT EXISTS "network_profiles_is_featured_idx" ON "network_profiles"("is_featured");
CREATE INDEX IF NOT EXISTS "network_profiles_passout_year_idx" ON "network_profiles"("passout_year");
CREATE INDEX IF NOT EXISTS "network_profiles_public_listing_idx"
  ON "network_profiles"("status", "is_public", "is_featured", "display_order", "created_at");
CREATE INDEX IF NOT EXISTS "network_profiles_admin_listing_idx"
  ON "network_profiles"("status", "connection_type", "created_at");

-- 6) Ensure FK to users exists.
DO $$
BEGIN
  IF to_regclass('public.network_profiles') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'network_profiles_user_id_fkey'
     ) THEN
    ALTER TABLE "network_profiles"
      ADD CONSTRAINT "network_profiles_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 7) Ensure Settings has Network-related toggles/templates.
ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "show_network" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "email_network_verified_body" TEXT,
  ADD COLUMN IF NOT EXISTS "email_network_rejected_body" TEXT;
