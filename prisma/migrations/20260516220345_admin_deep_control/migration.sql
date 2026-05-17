-- CreateEnum
CREATE TYPE "UserBlockFeature" AS ENUM ('EVENT', 'PLAYGROUND', 'QOTD', 'QUIZ', 'NETWORK');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "current_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" TEXT,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "last_login_ip" TEXT,
ADD COLUMN     "longest_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "longest_streak_at" TIMESTAMP(3),
ADD COLUMN     "password_reset_expires_at" TIMESTAMP(3),
ADD COLUMN     "password_reset_token" TEXT,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "email_password_reset_body" TEXT,
ADD COLUMN     "email_password_reset_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "feature" "UserBlockFeature" NOT NULL,
    "blocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_by" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_password_reset_token_key" ON "users"("password_reset_token");

-- CreateIndex
CREATE INDEX "users_last_login_at_desc_idx" ON "users"("last_login_at" DESC);

-- CreateIndex
CREATE INDEX "users_is_deleted_role_idx" ON "users"("is_deleted", "role");

-- CreateIndex
CREATE INDEX "user_blocks_user_id_idx" ON "user_blocks"("user_id");

-- CreateIndex
CREATE INDEX "user_blocks_feature_expires_at_idx" ON "user_blocks"("feature", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_user_id_feature_key" ON "user_blocks"("user_id", "feature");

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
