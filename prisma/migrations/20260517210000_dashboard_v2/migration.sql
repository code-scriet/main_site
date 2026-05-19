-- AlterTable: add notification read cutoff for the bell menu (single timestamp avoids unbounded per-notification rows on free tier)
ALTER TABLE "users" ADD COLUMN "notifications_read_at" TIMESTAMP(3);

-- AlterTable: admin-controlled accent token applied to <html data-accent="…">. Allowed: rust|teal|indigo|violet|mint|mono.
ALTER TABLE "settings" ADD COLUMN "accent_color" TEXT NOT NULL DEFAULT 'rust';

-- CreateTable: image library record written on every /api/upload/image POST
CREATE TABLE "uploaded_images" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "filename" TEXT,
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_images_public_id_key" ON "uploaded_images"("public_id");

-- CreateIndex
CREATE INDEX "uploaded_images_user_id_created_at_idx" ON "uploaded_images"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "uploaded_images" ADD CONSTRAINT "uploaded_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
