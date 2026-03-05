-- AlterTable: Add feature module toggles to settings
ALTER TABLE "settings" ADD COLUMN "playground_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "quiz_enabled" BOOLEAN NOT NULL DEFAULT true;
