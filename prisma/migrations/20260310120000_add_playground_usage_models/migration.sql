-- Unify playground usage/reset tables under Prisma-managed migrations.
CREATE TABLE IF NOT EXISTS "playground_daily_usage" (
  "user_id" TEXT NOT NULL,
  "usage_date" DATE NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playground_daily_usage_pkey" PRIMARY KEY ("user_id", "usage_date")
);

CREATE INDEX IF NOT EXISTS "pdu_usage_date_idx" ON "playground_daily_usage"("usage_date");

CREATE TABLE IF NOT EXISTS "playground_limit_resets" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reset_by" TEXT NOT NULL,
  "reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "playground_limit_resets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "plr_user_id_idx" ON "playground_limit_resets"("user_id");

CREATE INDEX IF NOT EXISTS "snippets_user_id_updated_at_idx" ON "snippets"("user_id", "updated_at");
