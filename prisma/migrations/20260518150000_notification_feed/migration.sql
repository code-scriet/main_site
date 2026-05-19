-- CreateEnum
CREATE TYPE "NotificationSource" AS ENUM ('ADMIN', 'AUTO_EVENT', 'AUTO_ANNOUNCEMENT', 'AUTO_PROBLEM', 'AUTO_QOTD', 'AUTO_QUIZ', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('ALL', 'USERS', 'NETWORK', 'ALUMNI', 'NETWORK_AND_ALUMNI', 'ADMIN', 'CORE_MEMBER', 'CUSTOM');

-- CreateTable: dashboard-v3 notification feed (one row per broadcast, audience denormalised)
CREATE TABLE "notification_feed" (
    "id" TEXT NOT NULL,
    "source" "NotificationSource" NOT NULL DEFAULT 'ADMIN',
    "audience" "NotificationAudience" NOT NULL DEFAULT 'ALL',
    "audience_roles" JSONB,
    "audience_user_ids" JSONB,
    "category" TEXT NOT NULL DEFAULT 'system',
    "icon" TEXT NOT NULL DEFAULT 'bell',
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "link" VARCHAR(500),
    "ref_entity" TEXT,
    "ref_entity_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "notification_feed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_feed_created_at_idx" ON "notification_feed"("created_at" DESC);
CREATE INDEX "notification_feed_audience_created_at_idx" ON "notification_feed"("audience", "created_at" DESC);
CREATE INDEX "notification_feed_ref_entity_ref_entity_id_idx" ON "notification_feed"("ref_entity", "ref_entity_id");

-- AddForeignKey
ALTER TABLE "notification_feed" ADD CONSTRAINT "notification_feed_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
