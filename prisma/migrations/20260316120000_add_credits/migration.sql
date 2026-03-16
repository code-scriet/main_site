-- Create credits table
CREATE TABLE IF NOT EXISTS "credits" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "team_member_id" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "credits_category_order_idx" ON "credits"("category", "order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credits_team_member_id_fkey'
  ) THEN
    ALTER TABLE "credits"
      ADD CONSTRAINT "credits_team_member_id_fkey"
      FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
