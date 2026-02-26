-- Add profile fields to TeamMember
ALTER TABLE "team_members" ADD COLUMN "user_id" TEXT;
ALTER TABLE "team_members" ADD COLUMN "slug" TEXT;
ALTER TABLE "team_members" ADD COLUMN "bio" TEXT;
ALTER TABLE "team_members" ADD COLUMN "vision" TEXT;
ALTER TABLE "team_members" ADD COLUMN "story" TEXT;
ALTER TABLE "team_members" ADD COLUMN "expertise" TEXT;
ALTER TABLE "team_members" ADD COLUMN "achievements" TEXT;
ALTER TABLE "team_members" ADD COLUMN "website" TEXT;

-- Create unique constraint on user_id
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_key" UNIQUE ("user_id");

-- Create unique constraint on slug
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_slug_key" UNIQUE ("slug");

-- Create index on slug
CREATE INDEX "team_members_slug_idx" ON "team_members"("slug");

-- Add foreign key to users table
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
