-- AlterTable
ALTER TABLE "settings" ADD COLUMN "certificates_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "playground_enabled" BOOLEAN NOT NULL DEFAULT true;
