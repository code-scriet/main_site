-- Add APPRECIATION to CertType (additive, idempotent).
-- Certificates of Appreciation join the existing
-- PARTICIPATION/COMPLETION/WINNER/SPEAKER types; no data changes.
ALTER TYPE "CertType" ADD VALUE IF NOT EXISTS 'APPRECIATION';
