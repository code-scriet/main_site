-- constraints_and_enums (audit A4 enums + A5/A8 uniques + A10 CHECKs)
--
-- HAND-AUTHORED, not Prisma-generated. Prisma's default String→enum migration
-- is DROP COLUMN + ADD COLUMN, which DESTROYS existing data. Every enum
-- conversion below uses a data-preserving `ALTER COLUMN ... TYPE ... USING
-- (col::text::"Enum")` cast instead. The enum members were chosen to match the
-- exact strings already stored, so each cast is a lossless rename.
--
-- ─── PRE-FLIGHT (run on prod BEFORE deploy; every query must return 0 rows) ───
-- Any violating row makes a statement below fail loudly — that is the point.
--
--   -- A5: duplicate (quiz_id, position)
--   SELECT quiz_id, position, COUNT(*) FROM quiz_questions GROUP BY 1,2 HAVING COUNT(*) > 1;
--   -- A8: case-insensitive email collisions
--   SELECT lower(email), COUNT(*) FROM users GROUP BY 1 HAVING COUNT(*) > 1;
--   -- A4: values outside each enum's member set
--   SELECT DISTINCT role           FROM event_team_members;  -- expect LEADER / MEMBER
--   SELECT DISTINCT difficulty     FROM problems;            -- expect EASY / MEDIUM / HARD
--   SELECT DISTINCT difficulty     FROM qotd;                -- expect EASY / MEDIUM / HARD
--   SELECT DISTINCT template       FROM certificates;        -- expect gold / dark / white / emerald
--   SELECT DISTINCT email_template FROM certificates;        -- expect default / faculty_distribution
--   -- A10: rows that would fail the CHECKs
--   SELECT id FROM events         WHERE team_min_size > team_max_size;
--   SELECT id FROM events         WHERE event_days NOT BETWEEN 1 AND 10;
--   SELECT id FROM events         WHERE capacity IS NOT NULL AND capacity < 0;
--   SELECT id FROM quiz_questions WHERE time_limit_seconds NOT BETWEEN 5 AND 120;

-- ─── A4: enum types ──────────────────────────────────────────────────────────
CREATE TYPE "EventTeamMemberRole" AS ENUM ('LEADER', 'MEMBER');
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "CertTemplate" AS ENUM ('gold', 'dark', 'white', 'emerald');
CREATE TYPE "CertEmailTemplate" AS ENUM ('default', 'faculty_distribution');

-- ─── A4: data-preserving conversions ─────────────────────────────────────────
-- Columns with a DEFAULT must drop it before the type change (the old text
-- default can't auto-cast) and re-add the typed default after.

ALTER TABLE "event_team_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "event_team_members"
  ALTER COLUMN "role" TYPE "EventTeamMemberRole" USING ("role"::text::"EventTeamMemberRole");
ALTER TABLE "event_team_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- problems.difficulty + qotd.difficulty are NOT NULL with no default — straight cast.
ALTER TABLE "problems"
  ALTER COLUMN "difficulty" TYPE "Difficulty" USING ("difficulty"::text::"Difficulty");
ALTER TABLE "qotd"
  ALTER COLUMN "difficulty" TYPE "Difficulty" USING ("difficulty"::text::"Difficulty");

ALTER TABLE "certificates" ALTER COLUMN "template" DROP DEFAULT;
ALTER TABLE "certificates"
  ALTER COLUMN "template" TYPE "CertTemplate" USING ("template"::text::"CertTemplate");
ALTER TABLE "certificates" ALTER COLUMN "template" SET DEFAULT 'gold';

ALTER TABLE "certificates" ALTER COLUMN "email_template" DROP DEFAULT;
ALTER TABLE "certificates"
  ALTER COLUMN "email_template" TYPE "CertEmailTemplate" USING ("email_template"::text::"CertEmailTemplate");
ALTER TABLE "certificates" ALTER COLUMN "email_template" SET DEFAULT 'default';

-- (The problems(is_published, difficulty) index depends on difficulty and is
--  rebuilt automatically by the ALTER COLUMN above — no manual recreate.)

-- ─── A5: quiz_questions (quiz_id, position) becomes UNIQUE ────────────────────
-- Small table; a regular index build's brief lock is sub-second at this scale,
-- so we keep the migration transactional/atomically-revertible rather than use
-- CREATE INDEX CONCURRENTLY (which cannot run inside a transaction).
DROP INDEX "idx_quiz_questions_quiz_position";
CREATE UNIQUE INDEX "idx_quiz_questions_quiz_position" ON "quiz_questions" ("quiz_id", "position");

-- ─── A8: case-insensitive email uniqueness (expression index) ────────────────
-- Future-proofing: all write paths already lowercase emails, so this guards a
-- future import/manual insert. NOTE: Prisma cannot represent an expression
-- index in schema.prisma and (as of 5.x) does not introspect one either, so it
-- lives entirely outside Prisma's model — `migrate diff` neither manages nor
-- tries to drop it. Re-verify this holds if Prisma is ever upgraded.
CREATE UNIQUE INDEX "users_email_lower_ux" ON "users" (lower("email"));

-- ─── A10: business-rule CHECK constraints ────────────────────────────────────
ALTER TABLE "events" ADD CONSTRAINT "events_team_size_ck" CHECK ("team_min_size" <= "team_max_size");
ALTER TABLE "events" ADD CONSTRAINT "events_days_ck" CHECK ("event_days" BETWEEN 1 AND 10);
ALTER TABLE "events" ADD CONSTRAINT "events_capacity_ck" CHECK ("capacity" IS NULL OR "capacity" >= 0);
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_q_timelimit_ck" CHECK ("time_limit_seconds" BETWEEN 5 AND 120);
