/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `achievements` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "content" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image_gallery" JSONB,
ADD COLUMN     "short_description" VARCHAR(300),
ADD COLUMN     "slug" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "show_tech_blogs" BOOLEAN NOT NULL DEFAULT true;

-- Ensure existing achievements receive unique slugs before adding the unique index
UPDATE "achievements"
SET "slug" = CONCAT('achievement-', "id")
WHERE "slug" = '';

-- CreateIndex
CREATE UNIQUE INDEX "achievements_slug_key" ON "achievements"("slug");

-- CreateIndex
CREATE INDEX "achievements_featured_idx" ON "achievements"("featured");

-- CreateIndex
CREATE INDEX "achievements_slug_idx" ON "achievements"("slug");
