-- Speed up case-insensitive email lookups used by auth/hiring flows.
CREATE INDEX IF NOT EXISTS "users_email_lower_idx"
  ON "users"(LOWER("email"));

CREATE INDEX IF NOT EXISTS "hiring_applications_email_lower_idx"
  ON "hiring_applications"(LOWER("email"));

-- Note: network_profiles indexes are created in 20260220013000_add_network_schema_compat
-- which also creates the network_profiles table itself.
