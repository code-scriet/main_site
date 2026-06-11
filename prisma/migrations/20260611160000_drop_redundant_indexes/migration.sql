-- Drop 18 provably-redundant secondary indexes (perf plan §1.2,
-- docs/performance-improvement-plan.md). Every index below is
-- leftmost-prefix-covered by another index or unique constraint on the same
-- table, so no read path can regress; each one cost an extra B-tree write per
-- INSERT/UPDATE on tables that take their writes in bursts (end-of-quiz
-- persist, competition autosaves, attendance scan-ins, registration spikes).
--
-- Coverage proof (dropped -> covering index/constraint):
--   event_registrations_event_id_idx      -> event_registrations(event_id, attended) +2 more event_id-first
--   day_attendances_registration_id_idx   -> UNIQUE(registration_id, day_number)
--   event_teams_invite_code_idx           -> UNIQUE(invite_code)
--   event_teams_event_id_idx              -> UNIQUE(event_id, team_name)
--   competition_submissions_round_id_idx  -> UNIQUE(round_id, team_id) / UNIQUE(round_id, user_id)
--   competition_auto_saves_round_id_idx   -> UNIQUE(round_id, user_id)
--   announcements_pinned_idx              -> announcements(pinned DESC, created_at DESC)
--   announcements_expires_at_idx          -> announcements(expires_at, pinned DESC, created_at DESC)
--   poll_options_poll_id_idx              -> UNIQUE(poll_id, sort_order)
--   poll_votes_poll_id_idx                -> UNIQUE(poll_id, user_id)
--   achievements_featured_idx             -> achievements(featured, date DESC)
--   user_blocks_user_id_idx               -> UNIQUE(user_id, feature)
--   idx_quizzes_pin                       -> UNIQUE(pin)
--   idx_quiz_participants_quiz_id         -> UNIQUE(quiz_id, user_id)
--   idx_quiz_answers_quiz_id              -> idx_quiz_answers_quiz_user(quiz_id, user_id)
--   snippets_share_token_idx              -> UNIQUE(share_token)
--   certificates_event_id_idx             -> certificates(event_id, issued_at)
--   certificates_cert_id_idx              -> UNIQUE(cert_id)
--
-- (B-tree sort direction does not affect prefix coverage; Postgres scans both ways.)
--
-- Fully revertible — to restore, run:
--   CREATE INDEX "event_registrations_event_id_idx" ON "event_registrations"("event_id");
--   CREATE INDEX "day_attendances_registration_id_idx" ON "day_attendances"("registration_id");
--   CREATE INDEX "event_teams_invite_code_idx" ON "event_teams"("invite_code");
--   CREATE INDEX "event_teams_event_id_idx" ON "event_teams"("event_id");
--   CREATE INDEX "competition_submissions_round_id_idx" ON "competition_submissions"("round_id");
--   CREATE INDEX "competition_auto_saves_round_id_idx" ON "competition_auto_saves"("round_id");
--   CREATE INDEX "announcements_pinned_idx" ON "announcements"("pinned");
--   CREATE INDEX "announcements_expires_at_idx" ON "announcements"("expires_at");
--   CREATE INDEX "poll_options_poll_id_idx" ON "poll_options"("poll_id");
--   CREATE INDEX "poll_votes_poll_id_idx" ON "poll_votes"("poll_id");
--   CREATE INDEX "achievements_featured_idx" ON "achievements"("featured");
--   CREATE INDEX "user_blocks_user_id_idx" ON "user_blocks"("user_id");
--   CREATE INDEX "idx_quizzes_pin" ON "quizzes"("pin");
--   CREATE INDEX "idx_quiz_participants_quiz_id" ON "quiz_participants"("quiz_id");
--   CREATE INDEX "idx_quiz_answers_quiz_id" ON "quiz_answers"("quiz_id");
--   CREATE INDEX "snippets_share_token_idx" ON "snippets"("share_token");
--   CREATE INDEX "certificates_event_id_idx" ON "certificates"("event_id");
--   CREATE INDEX "certificates_cert_id_idx" ON "certificates"("cert_id");

-- DropIndex
DROP INDEX IF EXISTS "event_registrations_event_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "day_attendances_registration_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "event_teams_invite_code_idx";

-- DropIndex
DROP INDEX IF EXISTS "event_teams_event_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "competition_submissions_round_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "competition_auto_saves_round_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "announcements_pinned_idx";

-- DropIndex
DROP INDEX IF EXISTS "announcements_expires_at_idx";

-- DropIndex
DROP INDEX IF EXISTS "poll_options_poll_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "poll_votes_poll_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "achievements_featured_idx";

-- DropIndex
DROP INDEX IF EXISTS "user_blocks_user_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "idx_quizzes_pin";

-- DropIndex
DROP INDEX IF EXISTS "idx_quiz_participants_quiz_id";

-- DropIndex
DROP INDEX IF EXISTS "idx_quiz_answers_quiz_id";

-- DropIndex
DROP INDEX IF EXISTS "snippets_share_token_idx";

-- DropIndex
DROP INDEX IF EXISTS "certificates_event_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "certificates_cert_id_idx";
