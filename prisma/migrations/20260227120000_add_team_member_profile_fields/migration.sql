-- Add profile fields to TeamMember
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "vision" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "story" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "expertise" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "achievements" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "website" TEXT;

-- Create unique constraint on user_id
DO $$
BEGIN
	ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_key" UNIQUE ("user_id");
EXCEPTION
	WHEN duplicate_object THEN NULL;
	WHEN duplicate_table THEN NULL;
END $$;

-- Create unique constraint on slug
DO $$
BEGIN
	ALTER TABLE "team_members" ADD CONSTRAINT "team_members_slug_key" UNIQUE ("slug");
EXCEPTION
	WHEN duplicate_object THEN NULL;
	WHEN duplicate_table THEN NULL;
END $$;

-- Create index on slug
CREATE INDEX IF NOT EXISTS "team_members_slug_idx" ON "team_members"("slug");

-- Add foreign key to users table
DO $$
BEGIN
	ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
