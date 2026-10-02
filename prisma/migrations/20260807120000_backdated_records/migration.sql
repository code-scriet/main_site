-- Backdated records — retroactive certificates, registrations, attendance and guests.
--
-- PRESIDENT / super-admin can now issue a certificate (or reconstruct a registration,
-- a guest invitation, or an attendance mark) for an event that already happened, and
-- have it carry that event's date rather than today's. Each table below already owns
-- the "effective" date column that gets backdated:
--
--   certificates.issued_at          → the date the recipient / verify page / email show
--   event_registrations.timestamp   → when the person is recorded as having registered
--   day_attendances.scanned_at      → when the person is recorded as having checked in
--   event_invitations.invited_at    → when the guest is recorded as having been invited
--     (+ responded_at for the matching accept)
--
-- These columns record WHO backdated the row, so a retroactive record is never
-- mistaken for an organic one. They are deliberately plain-string actor snapshots,
-- not FKs (audit A3): they must survive the acting admin's deletion.
--
-- The real row-write time is never overwritten — certificates, day_attendances and
-- event_invitations already carry created_at, and every backdate also writes an
-- AuditLog row stamped with true wall-clock time.
--
-- All columns are nullable and additive; every statement is IF NOT EXISTS, so this is
-- safe to (re)apply on a drifted database. Code degrades gracefully when unapplied:
-- certificate writes go through the existing schema-fallback (which omits these
-- columns), and the backdate endpoints simply 500 until the migration lands.

ALTER TABLE "certificates"        ADD COLUMN IF NOT EXISTS "backdated_by"    TEXT;
ALTER TABLE "certificates"        ADD COLUMN IF NOT EXISTS "backdate_reason" TEXT;
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "backdated_by"    TEXT;
ALTER TABLE "day_attendances"     ADD COLUMN IF NOT EXISTS "backdated_by"    TEXT;
ALTER TABLE "event_invitations"   ADD COLUMN IF NOT EXISTS "backdated_by"    TEXT;
