-- Speed up case-insensitive email lookups used by auth/hiring flows.
CREATE INDEX IF NOT EXISTS "users_email_lower_idx"
  ON "users"(LOWER("email"));

CREATE INDEX IF NOT EXISTS "hiring_applications_email_lower_idx"
  ON "hiring_applications"(LOWER("email"));

-- Speed up public and admin network listing filters/sorting.
CREATE INDEX IF NOT EXISTS "network_profiles_public_listing_idx"
  ON "network_profiles"("status", "is_public", "is_featured", "display_order", "created_at");

CREATE INDEX IF NOT EXISTS "network_profiles_admin_listing_idx"
  ON "network_profiles"("status", "connection_type", "created_at");
