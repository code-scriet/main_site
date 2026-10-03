-- Hiring communication: out-of-band messages sent by the hiring team to applicants.
-- Additive only; safe to (re)apply. One row per recipient per message.

-- CreateTable
CREATE TABLE IF NOT EXISTS "hiring_messages" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "bell_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hiring_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hiring_messages_application_id_created_at_idx" ON "hiring_messages"("application_id", "created_at" DESC);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "hiring_messages" ADD CONSTRAINT "hiring_messages_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "hiring_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "hiring_messages" ADD CONSTRAINT "hiring_messages_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
