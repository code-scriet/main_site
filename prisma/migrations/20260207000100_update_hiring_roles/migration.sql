-- Rebuild enum to support both rename (VIDEO_EDITING -> SOCIAL_MEDIA)
-- and new value (DSA_CHAMPS) in a transaction-safe way.
CREATE TYPE "ApplyingRole_new" AS ENUM (
  'TECHNICAL',
  'DSA_CHAMPS',
  'DESIGNING',
  'SOCIAL_MEDIA',
  'MANAGEMENT'
);

ALTER TABLE "hiring_applications"
ALTER COLUMN "applying_role"
TYPE "ApplyingRole_new"
USING (
  CASE
    WHEN "applying_role"::text = 'VIDEO_EDITING' THEN 'SOCIAL_MEDIA'
    ELSE "applying_role"::text
  END
)::"ApplyingRole_new";

ALTER TYPE "ApplyingRole" RENAME TO "ApplyingRole_old";
ALTER TYPE "ApplyingRole_new" RENAME TO "ApplyingRole";
DROP TYPE "ApplyingRole_old";
