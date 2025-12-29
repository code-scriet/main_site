-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password" TEXT,
ALTER COLUMN "oauth_provider" DROP NOT NULL,
ALTER COLUMN "oauth_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "club_name" TEXT NOT NULL DEFAULT 'code.scriet',
    "club_email" TEXT NOT NULL DEFAULT 'contact@codescriet.com',
    "club_description" TEXT NOT NULL DEFAULT 'Building tomorrow''s problem solvers through collaborative learning and hands-on coding experiences.',
    "registration_open" BOOLEAN NOT NULL DEFAULT true,
    "max_events_per_user" INTEGER NOT NULL DEFAULT 5,
    "announcements_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);
