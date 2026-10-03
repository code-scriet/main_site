-- Deleting a user should purge their hiring application (and everything hanging
-- off it) on a HARD delete. Flip the FK from ON DELETE SET NULL to CASCADE.
-- Soft delete never removes the row, so this does not affect restore.

ALTER TABLE "hiring_applications" DROP CONSTRAINT IF EXISTS "hiring_applications_user_id_fkey";

ALTER TABLE "hiring_applications"
  ADD CONSTRAINT "hiring_applications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
