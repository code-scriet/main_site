/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `events` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "slug" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");
