ALTER TABLE "events"
ADD COLUMN "registration_fields" JSONB;

ALTER TABLE "event_registrations"
ADD COLUMN "custom_field_responses" JSONB;
