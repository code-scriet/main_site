-- AlterTable
ALTER TABLE "events" ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "faqs" JSONB,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "highlights" TEXT,
ADD COLUMN     "image_gallery" JSONB,
ADD COLUMN     "learning_outcomes" TEXT,
ADD COLUMN     "resources" JSONB,
ADD COLUMN     "short_description" VARCHAR(300),
ADD COLUMN     "speakers" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "target_audience" TEXT,
ADD COLUMN     "video_url" TEXT;

-- CreateIndex
CREATE INDEX "events_featured_idx" ON "events"("featured");
