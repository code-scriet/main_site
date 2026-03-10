-- DropIndex
DROP INDEX IF EXISTS "network_profiles_admin_listing_idx";

-- DropIndex
DROP INDEX IF EXISTS "network_profiles_public_listing_idx";

-- AlterTable
ALTER TABLE "network_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;
