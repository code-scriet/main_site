# Schema Redesign — target sketch + ordered migration path

> Companion to [report.md §A](report.md). Philosophy: the schema is fundamentally sound — 30 models, sensible uniques, deliberate denormalized snapshots (Certificate signatory copies, EventInvitation invitee snapshots are **justified**: historical documents must not mutate when the source row changes). This is a *correction pass*, not a rewrite. Every step is its own `--create-only` migration, reviewable and individually revertible.

## 1. What stays exactly as-is (evaluated, kept, with reasons)

| Table / pattern | Verdict |
|---|---|
| Certificate signatory/invitee **snapshots** | Keep — point-in-time documents; FK + snapshot pair is correct |
| `User.currentStreak/longestStreak` materialization | Keep — recompute paths audited (publish/hold/submit all call `recomputeUserStreakSafe`); backfill script exists |
| `EventRegistration.attended` legacy sync alongside `DayAttendance` | Keep — every write path syncs both (attendanceDomain tests cover it); removing it breaks old exports for zero gain |
| `PollVoteSelection` composite PK, `PlaygroundDailyUsage` composite PK | Keep — textbook |
| JSON columns `Event.{faqs,speakers,resources,imageGallery,registrationFields}`, `Settings.contactEmails`, `NotificationFeed.audience*` | Keep as JSON — admin-authored display blobs with no relational queries against them; Zod-validated at the boundary. Promoting them to tables adds joins for nothing. (`NetworkProfile.events` likewise.) |
| `InvitationStatus.EXPIRED` derived at read | Keep — storing it would need a sweep job |
| Quiz `joinCode` + `pin` dual codes | Keep (different join UX paths) but null both on quiz end (fixes B5) |

## 2. Target deltas (one consolidated "constraints + enums" migration, then satellites)

### Migration M1 — `tighten_constraints` [FREE, low risk]
```sql
-- uniqueness the app already assumes (B/A5)
CREATE UNIQUE INDEX CONCURRENTLY quiz_questions_quiz_position_ux ON quiz_questions (quiz_id, position);
CREATE UNIQUE INDEX CONCURRENTLY users_email_lower_ux ON users (lower(email));  -- A8

-- business rules Postgres can hold (A10)
ALTER TABLE events ADD CONSTRAINT events_team_size_ck CHECK (team_min_size <= team_max_size);
ALTER TABLE events ADD CONSTRAINT events_days_ck CHECK (event_days BETWEEN 1 AND 10);
ALTER TABLE events ADD CONSTRAINT events_capacity_ck CHECK (capacity IS NULL OR capacity >= 0);
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_q_timelimit_ck CHECK (time_limit_seconds BETWEEN 5 AND 120);
```
*Pre-flight:* duplicate-position and duplicate-lower-email SELECTs (in report A5/A8). *Risk:* fails loudly at migrate time if bad data exists — that's the point. *Downtime:* none (CONCURRENTLY for the two indexes; CHECKs validate fast at current scale).

### Migration M2 — `enums_for_string_columns` (A4) [FREE, low risk]
`EventTeamMemberRole {LEADER, MEMBER}`, `Difficulty {EASY, MEDIUM, HARD}` (problems + qotd), `CertTemplate {gold, dark, white, emerald}`, `CertEmailTemplate {default, faculty_distribution}`. Pattern per column: create enum type → `ALTER … TYPE … USING (col::text::enum)`. `Credit.category` stays a string (admin invents categories at will — enum would fight the feature).
*Risk:* any stored value outside the set fails the cast — pre-flight `SELECT DISTINCT` each column.

### Migration M3 — `hiring_cycles` (A11) [FREE]
```sql
ALTER TABLE hiring_applications ADD COLUMN cycle TEXT NOT NULL DEFAULT '2026';
ALTER TABLE hiring_applications DROP CONSTRAINT hiring_applications_email_key;
CREATE UNIQUE INDEX hiring_email_cycle_ux ON hiring_applications (email, cycle);
```
Plus: `Settings.hiringCycle` column (or reuse an existing text field) the apply endpoint stamps. *Code change:* hiring.ts create + admin list filter.

### Migration M4 — `email_templates_table` (A1, expand-migrate-contract)
1. **Expand:** `CREATE TABLE email_templates (key TEXT PRIMARY KEY, subject TEXT, body TEXT, updated_at TIMESTAMP)`; backfill from the 6 Settings columns.
2. **Migrate:** `utils/email.ts` template cache reads the table (same 5-min TTL); settings PATCH writes both for one release.
3. **Contract:** drop the 6 `email_*_body` Settings columns once the dashboard editor points at the new endpoint.
*Benefit:* new email categories = INSERT, not migration. *Risk:* low — cache layer isolates readers.

### Migration M5 — retention additions (A7) [FREE, code-only + optional index]
Extend `pruneOldRecords()` (no schema change needed; `notification_feed.created_at` and `competition_auto_saves.saved_at` already indexed adequately for the delete predicates at club scale). AuditLog: **decision still owner's** — mechanism exists (`DELETE /api/audit-logs/retention`); recommendation: 365-day automatic with the manual endpoint for earlier purges.

### Deferred with reasons
- **ProfileContent extraction (A2):** do alongside the next profile-page feature; pure-refactor migrations of live content tables aren't worth standalone risk.
- **`CompetitionRoundTeam` join table (A6):** only if SELECTED_TEAMS usage grows.
- **Actor-column FKs (A3):** bundle into M6 below (they become uuid columns there anyway).

## 3. The `@db.Uuid` project (A9) — scoped honestly

**What it buys:** ids shrink 36→16 bytes; every PK/FK index ~40 % smaller; joins and `IN` lists faster; native `gen_random_uuid()` defaults. On this DB (tens of MB) the absolute win is small — **bundle it with the next heavy schema work, don't run it alone.**

**Why it's safe to do incrementally:** all ids are app-generated v4 uuid strings already (verified: `@default(uuid())` everywhere except 3 cuid models, which stay TEXT).

**Plan (expand-migrate-contract per table-cluster, leaf→root):**
1. **Audit pass:** `SELECT … WHERE id !~ '^[0-9a-f]{8}-…$'` per table to find any non-uuid strays (slug-backfilled rows etc.). Fix strays first.
2. **Cluster order:** leaf tables first (QuizAnswer, PollVoteSelection, DayAttendance…), then mid (registrations, submissions), then root (users, events) — each cluster one migration: `ALTER TABLE t ALTER COLUMN id TYPE uuid USING id::uuid;` + same for every FK column referencing it **in the same transaction** (FKs must change together with their target).
3. **Prisma:** add `@db.Uuid` to the cluster's fields in the same commit; regenerate client. Type stays `string` in TS — **zero application-code changes**.
4. **Index rebuild** is implicit in the type change (table rewrite); run per-cluster during low-traffic windows; largest table today rewrites in seconds, but at 3-year scale budget minutes for quiz_answers — still fine inside a deploy window because the API tolerates short DB stalls via `withRetry`.
5. **Skip:** NetworkProfile/Signatory/Certificate (cuid PKs) — leave TEXT; document.
*Risk per step:* the USING cast fails loudly on stray data (step 1 prevents); FK pairs changed together prevents constraint mismatch. *Rollback:* reverse cast `uuid::text` is lossless.

## 4. Index strategy from first principles (post-PR-#48 baseline)

PR #48's leftmost-prefix-covered drops are correct and assumed merged. Beyond it, derived from the read paths actually in code:

| Add / change | Serves | Note |
|---|---|---|
| *(nothing new required)* | — | After #48, every hot query path I traced (events feed `[status,startDate]`, registrations `[eventId,…]` family, bell-feed `[audience,createdAt]`, audit browse `[timestamp desc]`, problem-submission unique-key lookups) has a matching index. The schema is, if anything, **over-indexed**, not under. |
| Partial-index candidates **only if** prod `pg_stat_user_indexes` shows the full ones cold | e.g. `event_invitations (invitee_user_id) WHERE status='PENDING'`; `notification_feed (created_at) WHERE audience='CUSTOM'` | [UNVERIFIED — needs prod `idx_scan` counts; dev DB is empty] |
| Expression index `users (lower(email))` | login/lookups use `mode: insensitive` (ILIKE) — today seq-scans users | doubles as the A8 uniqueness; users table is small so this is correctness-first, perf-second |

**Verification recipe for any index decision:** snapshot `SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan` on prod, re-check after 7 days — same protocol PR #48 documents.
