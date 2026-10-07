-- Per-team vs per-member collection of special registration fields.
-- Additive only; safe to (re)apply. Default false = fields collected once per
-- team by the leader at team creation; true = every member fills them at join.

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "collect_fields_per_member" BOOLEAN NOT NULL DEFAULT false;
