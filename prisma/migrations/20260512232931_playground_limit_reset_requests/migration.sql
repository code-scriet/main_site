-- CreateEnum
CREATE TYPE "PlaygroundResetRequestStatus" AS ENUM ('PENDING', 'GRANTED', 'DENIED');

-- CreateTable
CREATE TABLE "playground_limit_reset_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "note" TEXT,
    "status" "PlaygroundResetRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playground_limit_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playground_limit_reset_requests_status_created_at_idx" ON "playground_limit_reset_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "playground_limit_reset_requests_user_id_status_idx" ON "playground_limit_reset_requests"("user_id", "status");

-- AddForeignKey
ALTER TABLE "playground_limit_reset_requests" ADD CONSTRAINT "playground_limit_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
