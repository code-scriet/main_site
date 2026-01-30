/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `announcements` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image_gallery" JSONB,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "links" JSONB,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "short_description" VARCHAR(300),
ADD COLUMN     "slug" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "announcements_slug_key" ON "announcements"("slug");

-- CreateIndex
CREATE INDEX "announcements_featured_idx" ON "announcements"("featured");

-- CreateIndex
CREATE INDEX "announcements_pinned_idx" ON "announcements"("pinned");
