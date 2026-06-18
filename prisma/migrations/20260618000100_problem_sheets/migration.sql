-- S-09: curated problem sheets ("topic ladders").
--
-- Two small additive tables. Per-member progress is computed live from
-- problem_submissions (no per-user rows stored), so this is free-tier safe.
-- Written idempotently so it is safe to (re)apply even if prod has drifted.

CREATE TABLE IF NOT EXISTS "problem_sheets" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_sheets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "problem_sheets_slug_key" ON "problem_sheets"("slug");
CREATE INDEX IF NOT EXISTS "problem_sheets_is_published_created_at_idx" ON "problem_sheets"("is_published", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "problem_sheet_items" (
    "id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "problem_sheet_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "problem_sheet_items_sheet_id_problem_id_key" ON "problem_sheet_items"("sheet_id", "problem_id");
CREATE INDEX IF NOT EXISTS "problem_sheet_items_sheet_id_order_idx" ON "problem_sheet_items"("sheet_id", "order");

DO $$ BEGIN
  ALTER TABLE "problem_sheets"
    ADD CONSTRAINT "problem_sheets_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "problem_sheet_items"
    ADD CONSTRAINT "problem_sheet_items_sheet_id_fkey"
    FOREIGN KEY ("sheet_id") REFERENCES "problem_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "problem_sheet_items"
    ADD CONSTRAINT "problem_sheet_items_problem_id_fkey"
    FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
