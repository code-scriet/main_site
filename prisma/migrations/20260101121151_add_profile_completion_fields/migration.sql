-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "course" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "profile_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "year" TEXT;
