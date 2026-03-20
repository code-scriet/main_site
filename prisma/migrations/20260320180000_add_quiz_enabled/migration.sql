-- AlterTable
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "quiz_enabled" BOOLEAN NOT NULL DEFAULT true;
