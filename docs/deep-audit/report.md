# Deep Audit — code.scriet Platform (June 2026)

> Scope: everything the June-2026 performance audit did **not** cover — architecture, schema, API design, security, logic bugs, UI/UX, dependencies, ops. Performance findings already scheduled in PRs #46–#50 are referenced, not re-discovered.
> Branch audited: `perf/quiz-engine` (PR-5 content present; PR-1..4 content **not** yet merged here).
> Verification constraint: the local dev DB is essentially empty (11 users, planner stats unset), so `EXPLAIN ANALYZE` against it is not representative of prod — DB-shape claims below rest on complexity arguments and are labelled accordingly.

---

## Executive summary — the 10 findings that matter most

| # | Finding | Impact in one line |
|---|---|---|
| 1 | **[S7] Security headers are not live in prod** (CSP/HSTS/X-Frame-Options absent; render.yaml's own comment verifies it) | One 10-minute dashboard/Cloudflare config closes the platform's largest unshipped security control — clickjacking + script-injection blast-radius. |
| 2 | **[W3] Public site is frozen mid-design-migration** — `[data-public]` cream/ink/Newsreader shell wraps every public page but only Achievements was migrated; both font stacks load | Finishing (or excising) it makes every public page coherent again and cuts ~100–150 KB of font transfer per first visit. |
| 3 | **[W1] `vendor-qr` chunk (482 KB / 152 KB gz) bundles QR *rendering* with two *scanner* libraries** — every quiz player and every event-ticket viewer downloads both scanners to display one QR | Splitting the chunk cuts ~150 KB gz from the quiz-join path; at a 300-player event-hall join burst that is ~45 MB less Wi-Fi transfer and visibly faster joins. |
| 4 | **[B4] `GET /api/quiz/:quizId` returns all question texts mid-quiz to any participant** | Closes a live-quiz cheating vector (read upcoming questions, google answers) with a 5-line gate. |
| 5 | **[S1] JWT `purpose` check is a blocklist, not an allowlist** — `oauth_exchange` codes work as 30 s bearer tokens; exchange codes are replayable within their TTL | One conditional turns five token types signed by one secret into a properly partitioned scheme. |
| 6 | **[L2] `registrationOpen=false` and `maxEventsPerUser` are not enforced server-side** | Two admin toggles that look like controls but are cosmetic — direct `POST /api/auth/register` ignores both. |
| 7 | **[G1] No `unhandledRejection`/`uncaughtException` handlers on a 24/7 process** | One missed `.catch` during a 900-player quiz kills every live game with no log of why; 15 lines buy crash forensics + graceful drain. |
| 8 | **[B1] `start_quiz` has no status guard** — a double-emit on an active room silently skips question 1 | Host double-click = corrupted quiz; 2-line fix. |
| 9 | **[S6] Password change doesn't invalidate existing sessions** (`tokenVersion` not bumped, unlike the reset flow) | A user who changes a compromised password today does *not* evict the attacker for up to 7 days. |
| 10 | **[A7] Four tables grow forever with no retention story** (QuizAnswer, NotificationFeed, CompetitionAutoSave, AuditLog-by-policy) | Extending the existing pruner keeps the free-tier Neon DB inside its storage budget at 3-year scale. |

The codebase is in genuinely good shape — strict TS everywhere, 8 `as any` total, serializable-txn discipline, atomic check-free updates, an exemplary scheduler, defense-in-depth sanitization (server `sanitize-html` + client DOMPurify), and a quiz engine that has now absorbed three optimization passes. The findings below are the residue, not the rule.

---

## A. Database schema (full mandate) — summary

Full target schema + ordered migration path in [schema-redesign.md](schema-redesign.md). Highlights:

### [A1] [medium] [FREE] Settings is a 60+-column god-table
- **Where:** `prisma/schema.prisma:117-196`
- **Now:** one singleton row mixes branding, 14 feature flags, 8 email-category toggles, 6 email template bodies, contact channels, and two secrets.
- **Why it's a problem:** every new email category or flag is a migration + schema churn (the migration history shows exactly this: 9 of 76 migrations only add Settings columns). The 5-min settings cache invalidates the *whole* object for any change.
- **Proposal:** keep the singleton for branding/flags (it works), but extract `EmailTemplate(key, subject, body, updatedAt)` as a table — new categories become rows, not migrations — and move the two secrets (below) out.
- **Practical benefit:** new email category ships with zero migrations; template editing stops invalidating the feature-flag cache.
- **Alternatives:** full key-value settings table (rejected — loses type safety for the 40 flags that work fine as columns).

### [A2] [medium] [FREE] Three overlapping person models
- **Where:** `User` (bio + 4 social URLs), `TeamMember` (bio/vision/story/expertise/achievements + 4 socials), `NetworkProfile` (same five rich fields + socials).
- **Why:** profile edits drift across surfaces; `profileSync.ts` exists *because* of this duplication. A rename of "expertise" semantics must be made three times.
- **Proposal:** a `ProfileContent` satellite (1:1 polymorphic by `ownerType/ownerId`, or two FKs) holding the five rich-markdown fields; TeamMember/NetworkProfile keep role-specific columns.
- **Practical benefit:** removes `profileSync.ts` (122 LOC) and the class of "edited my team bio, network bio stale" tickets. **Effort M; do only when the next profile feature lands** — it's drift-prone, not broken.

### [A3] [low] [FREE] Actor columns are inconsistently typed
- **Where:** `DayAttendance.scannedBy`, `UserBlock.blockedBy`, `Certificate.issuedBy/revokedBy`, `QOTD.heldBy`, `User.deletedBy` — bare strings; `Event.createdBy`, `Announcement.createdBy` — real FKs.
- **Proposal:** document the rule (snapshot-on-purpose vs relation) in CLAUDE.md; where these are user-ids in practice, add FK `onDelete: SetNull` in the uuid-migration pass (A9) so hard-deletes can't leave dangling ids.

### [A4] [low] [FREE] Enum candidates left as strings
`EventTeamMember.role` ("LEADER"/"MEMBER", varchar(10)), `Problem.difficulty` + `QOTD.difficulty` (frontend locks EASY/MEDIUM/HARD), `Certificate.template` (gold|dark|white|emerald), `Certificate.emailTemplate`, `Credit.category`. Each is one `--create-only` migration; Postgres then rejects the typo'd writes JS currently must police. Batch them into one migration with the A5/A10 constraints.

### [A5] [medium] [FREE] `quiz_questions` has no uniqueness on `(quizId, position)`
- **Where:** `schema.prisma:903` — plain index, not unique. `PATCH /api/quiz/:quizId` delete-and-recreates questions, so a concurrent double-PATCH can persist duplicate positions; the quiz UI orders by position and would show a duplicated/skipped question.
- **Proposal:** `@@unique([quizId, position])`. Verification: `npx prisma migrate dev --create-only`, confirm `CREATE UNIQUE INDEX`; existing data check first: `SELECT quiz_id, position, COUNT(*) FROM quiz_questions GROUP BY 1,2 HAVING COUNT(*)>1;`

### [A6] [low] [FREE] `CompetitionRound.allowedTeamIds String[]`
No FK integrity — dissolving a team leaves a dangling id silently shrinking the allowed set. Fine at club scale; convert to a `CompetitionRoundTeam` join table only if SELECTED_TEAMS rounds become common. **Considered and deferred with reason.**

### [A7] [medium] [FREE] Unbounded-growth tables without a pruning story
- **Where:** `utils/scheduler.ts:482` prunes only `Execution` (90 d) + `PlaygroundDailyUsage` (60 d).
- **Unpruned:** `QuizAnswer` (≈ players × questions per quiz — a weekly 200-player/20-q quiz ≈ 200 k rows/yr), `NotificationFeed` (has `expiresAt` but nothing deletes expired rows), `CompetitionAutoSave` (one TEXT code blob per participant per round, superseded the moment the round locks), `AuditLog` (manual `DELETE /api/audit-logs/retention` exists — the *policy decision* from the June audit is still open, the mechanism is not missing).
- **Proposal:** extend `pruneOldRecords()`: NotificationFeed `expiresAt < now OR createdAt < now-90d`; CompetitionAutoSave where round is FINISHED > 30 d; QuizAnswer optionally `> 365 d` (keep QuizParticipant aggregates forever — they're the leaderboard history).
- **Practical benefit:** keeps Neon free-tier storage flat; the bell-feed CUSTOM query (`take: 50` over all CUSTOM rows) stays fast forever.
- **Break-even:** matters from ~the second year of weekly quizzes.

### [A8] [polish] [FREE] No DB-level case-insensitive email uniqueness
All write paths lowercase emails (verified: register, login, OAuth, dev-login), so this is future-proofing only: `CREATE UNIQUE INDEX users_email_lower_ux ON users (lower(email));` protects against a future import script or manual insert.

### [A9] — `@db.Uuid` migration: now scoped
See [schema-redesign.md §3](schema-redesign.md) for the full expand-migrate-contract plan (5 steps, each `--create-only`, near-zero downtime). Honest assessment: **benefit is modest** (16 bytes vs ~36 per id ≈ 25–40 % smaller indexes, faster joins) and the blast radius is every FK + the Prisma client. Recommended *only* bundled with the next big schema change, not as its own project.

### [A10] [polish] [FREE] Missing CHECK constraints
`team_min_size <= team_max_size`, `event_days BETWEEN 1 AND 10`, `capacity IS NULL OR capacity >= 0`, `quiz_questions.time_limit_seconds BETWEEN 5 AND 120`. All currently JS-only rules; one migration makes them DB-enforced.

### [A11] [low] [FREE] `HiringApplication.email @unique` = one application per person, ever
- **Why it's a problem:** next hiring season, every previous applicant gets "email already exists." There is no season/cycle concept.
- **Proposal:** add `cycle String` (e.g. "2026-autumn", default from Settings) and change unique to `[email, cycle]`. One migration + a default; admin UI gets a cycle filter.
- **Break-even:** the first re-opened hiring round.

---

## B. SQL & query layer

- **No `$queryRawUnsafe`/`$executeRawUnsafe` anywhere** (grep-verified); the 6 raw-SQL files all use tagged templates. The new quiz-persist VALUES-join SQL (`quizStore.ts:683-724`) parameterizes per-cell — correct.
- **withRetry / serializable-retry idempotency:** verified for registration (`createEventRegistrationInTx` inside the txn, P2002 → 409), team create/join (invite-code candidates re-checked inside txn), invitation accept. Reminder sends use reservation-then-rollback with exact-timestamp matching (`scheduler.ts:24-47`) — the strongest dedup pattern in the repo.
- **Connection budget [UNVERIFIED for prod]:** main API = 1 PrismaClient pool (default `num_cpus*2+1`; on Render free ≈ 5) — **plus a second pool from `utils/init.ts` until PR-4 merges** — plus playground `pg.Pool` (default 10, worth pinning `max: 4` explicitly in `execute-server.js`). Worst case ≈ 5+5+10 = 20 against Neon free-tier pooler (default limit comfortably above this). Action: after PR-4, set playground `max` explicitly; verify with `SELECT count(*) FROM pg_stat_activity` during a quiz.
- Remaining hot-path query items are PR-1/PR-4 territory (bell aggregate, counter round-trips, socket-auth LRU) — already planned, not re-litigated.

## C. Backend architecture

### [C1] [medium] [FREE] `GET /api/users/export` silently exports only 100 users
- **Where:** [users.ts:358](../../apps/api/src/routes/users.ts) — `take: 100`, newest-first, while the UI labels it "Export all users".
- **Why:** an admin pulling the member list for an event gets the 100 newest accounts and no warning — silent data loss in the artifact admins trust most.
- **Proposal:** cursor-batch the read (the in-file mail.ts pattern) into the worksheet, or at minimum raise to the list cap (2000) and add a "truncated" banner row.
- **Verification:** seed 150 users locally, export, count rows.

### [G1] [medium] [FREE] No process-level crash handlers
- **Where:** [index.ts](../../apps/api/src/index.ts) — `SIGTERM/SIGINT` handled; `unhandledRejection`/`uncaughtException` not.
- **Why:** Node 20 default kills the process on unhandled rejection. The codebase `void`s many promises (audit writes, socket sweeps, email sends) — all individually `.catch`ed today, but one future miss inside a socket handler takes down every live quiz with no diagnostic.
- **Proposal:** `process.on('unhandledRejection', log)` + `process.on('uncaughtException', err => { log; shutdown(); })` reusing the existing graceful `shutdown()` (which already persists active quizzes as ABANDONED — that's the payoff: a crash becomes a *clean* quiz persist instead of data loss).
- **Verification:** dev-only route throwing in a `setTimeout`; confirm log + graceful drain.

### [D1] [polish] Doc/convention drift
- `settings.ts:305` uses literal `requireRole('PRESIDENT')` — CLAUDE.md forbids it; functionally it admits ADMIN (both level 4), and the real gate is the inline check. Rename for honesty.
- CLAUDE.md route map is missing `/admin/notifications`; the public site's design-system description ("Outfit/Sora + amber") no longer matches code (see W3).
- `apps/api/src/scripts/{create_test_*,update_outreach_dsa}.ts` are dev scripts living inside `src/` — they compile into `dist/` on every deploy. Move to `/scripts`.

### [D2] [medium] [FREE] Response-shape split, quantified
14 routers still use raw `res.json()` exclusively (network 17 sites, settings 16, team 11, playground 11, auth 9, events 8 …); `users.ts` is mixed (61 ApiResponse + 13 raw). Frontend `api.ts` papers over it, which is why a future API consumer (mobile app, scripts) would curse it. **Proposal:** mechanical sweep per router (no behavior change), one router per PR, frontend untouched since shapes converge to what `api.ts` already expects. Don't do it as one mega-PR.

### Architecture verdicts (engaged, not overturned)
- **WebSocket-only realtime, in-memory rooms, server-authoritative phases, no Redis/queues:** all stand. With UptimeRobot keep-warm + boot recovery (`recoverActiveRounds`, quiz DB-rehydrate on join) the single-process model's failure modes are mitigated; Redis would add cost and an extra failure domain for zero present need.
- **Express layering:** routes-as-modules with utils/ domain helpers is fine at this size. The real structural debt is the **four 2,000+-line routers** (competition, certificates, attendance, quizRouter). Don't reorganize the world; when next touching one, split it file-per-concern (e.g. `certificates/{issue,verify,email,admin}.ts` behind one router). Effort S each, payoff = reviewable diffs.
- **utils/ grab-bag:** 40+ files but each single-purpose with tests on the risky ones. Leave it.

## Security findings (cross-cutting)

### [S7] [HIGH] [CONFIG] Production is serving without CSP/HSTS/X-Frame-Options
- **Where:** [render.yaml](../../render.yaml) `headers:` block — the in-file comment documents that the dashboard config overrides the blueprint and that a 2026-06-07 `curl -I` showed only `x-content-type-options` reaching clients.
- **Why:** the carefully-hardened CSP (no `script-src *`, no `unsafe-eval`) is written, reviewed… and not shipped. Without X-Frame-Options/frame-ancestors the site is clickjackable; without CSP, any future XSS has unlimited script-src.
- **Proposal:** paste the block into Render dashboard headers **or** (better, survives Render config drift) a Cloudflare Transform Rule, with CSP first deployed as `Content-Security-Policy-Report-Only` for a week.
- **Practical benefit:** the single highest security-control-per-minute action available; also closes the open June-audit "Cloudflare proxy-hop" item's sibling.
- **Verification:** `curl -sI https://codescriet.dev | grep -iE 'content-security|strict-transport|frame'` on a cache MISS.

### [S1] [high] [FREE] Token-type confusion: blocklist → allowlist
- **Where:** [auth.ts middleware:83](../../apps/api/src/middleware/auth.ts), [jwt.ts:148-152](../../apps/api/src/utils/jwt.ts) — one HS256 secret signs access tokens, `oauth_exchange` (30 s), `invitation_claim` (30 d), attendance QR (90 d), quiz access (20 m). Auth middleware rejects only `purpose === 'attendance'`.
- **What slips through:** an `oauth_exchange` code carries `userId` and no rejected purpose → it authenticates as a full session for its 30 s life, *and* `POST /api/auth/exchange-code` does not single-use it (replayable within TTL). The code travels in a URL (`/auth/callback?code=…`) — exactly the channel (history, referrer) the exchange-code design exists to protect.
- **Proposal:** (1) in both auth middlewares and `socketAuth`, reject any token where `typeof decoded.purpose === 'string'` (access tokens never carry one); (2) single-use the exchange code via an in-memory `Set<jti>` with 60 s TTL (add `jti: randomUUID()` to the sign).
- **Free-tier impact:** ≤ a few KB.
- **Verification:** unit test — sign an `oauth_exchange` token, assert 401 from `/api/users/me`; exchange the same code twice, assert second 400.
- **Break-even:** matters the day an exchange URL leaks via referrer/history — low probability, near-zero fix cost.

### [S6] [medium] [FREE] Password change keeps old sessions alive
- **Where:** [users.ts:240-278](../../apps/api/src/routes/users.ts) (`/me/change-password`, `/me/add-password`) — no `tokenVersion` bump, no cache invalidation; the reset flow (auth.ts:788-807) does both.
- **Why:** the #1 reason users change passwords is suspicion of compromise; today the attacker's JWT keeps working up to 7 days.
- **Proposal:** bump `tokenVersion` + `invalidateCachedAuthUser` in change-password, then issue a fresh token in the response so the *current* session survives (mirror `generateToken` from auth.ts).
- **Verification:** change password in tab A, assert tab B's next request 401s.

### [S2] [medium] [FREE] Socket rate-limit keys on client-spoofable IP
- **Where:** [socket.ts:14-21](../../apps/api/src/utils/socket.ts) — takes the **first** entry of raw `X-Forwarded-For`; HTTP rate limiting (express-rate-limit + `trust proxy 1`) takes the right-most-untrusted. A direct-to-origin client defeats the 30-conn/min cap by rotating XFF; behind Cloudflare the two layers disagree about what "the client IP" is.
- **Proposal:** one shared `getClientIp()` that prefers `CF-Connecting-IP` when the peer is a CF range, else Express's resolution; use it in both layers and login telemetry.
- **Joint verification (closes the open June item [S8/G2]):** temporary prod log line printing `req.ip`, `cf-connecting-ip`, and `x-forwarded-for` for 24 h — this single experiment settles the trust-proxy hop count, the rate-limit bucket question, and the socket IP question at once. **[UNVERIFIED until run].**

### [S9] [low] [FREE] `POST /api/settings/reset` silently wipes the attendance JWT secret + IndexNow key
Deleting + recreating the Settings row drops `attendanceJwtSecret` — every issued QR keeps verifying only because the runtime cache still holds the old secret *until restart*, after which all 90-day attendance QR codes go invalid with no warning. Preserve the two columns across reset, or make reset refuse when they're set.

### [S10] [low] [FREE] Per-route rate-limit gaps
Public `POST /api/hiring/apply` and `POST /api/polls/:id/vote`/`feedback` ride only the general 500/15 min limiter. Add the same `rateLimit` pattern used by teams-join (15/15 min). `mail.ts` `emails[]` should get `.max(500)`.

### Confirmed-intentional (documented so nobody "fixes" them)
- Quiz PIN broadcast to all signed-in users via bell + `quiz:starting` socket — club-wide-join design.
- Playground token-in-URL handoff — owner decision, untouched.
- `requireNotBlocked` fail-open on DB blip — deliberate availability choice.

## Quiz-engine logic findings

### [B1] [medium] [FREE] `start_quiz` lacks a status guard
- **Where:** [quizSocket.ts:433-522](../../apps/api/src/quiz/quizSocket.ts) — no `room.status === 'waiting'` check before setting active + `advanceQuestion()`.
- **Why:** a host double-click / client retry emits `start_quiz` twice → second call advances from Q0 to Q1 before anyone answers; the quiz silently loses its first question. Same handler also re-runs the DB `UPDATE`.
- **Proposal:** `if (room.status !== 'waiting') return emitBlockedControlAction('ALREADY_STARTED', …)`.
- **Verification:** add a double-emit case to `quizSocket.test.ts` asserting `currentQuestionIndex === 0` after the second emit.

### [B4] [medium] [FREE] Participants can read upcoming questions mid-quiz
- **Where:** [quizRouter.ts:1145-1205](../../apps/api/src/quiz/quizRouter.ts) — `GET /api/quiz/:quizId` returns *all* question texts + options (sans correctAnswer) to any authed user while the quiz is WAITING/ACTIVE.
- **Why:** a player who fetches the endpoint after joining sees every future question — enough to search answers during the countdowns. Game integrity, not data security.
- **Proposal:** when status is WAITING/ACTIVE and caller ≠ creator/admin, return quiz metadata with `questions: []`.
- **Verification:** as participant, fetch during ACTIVE → expect empty questions; as creator → full list.

### [B5] [low→grows] [FREE] PIN generation collides with retired PINs
- **Where:** [quizRouter.ts:2025-2033] checks `{ pin, pinActive: true }` but the column is globally `@unique`; finished quizzes keep their pins forever (persist only flips `pinActive`).
- **Why:** with N retired quizzes, each open has ≈ N/900 000 chance per attempt of a P2002 → 500. Slow fuse, confusing failure.
- **Proposal:** null out `pin`/`joinCode` in `persistResultsAndCleanup` (they're meaningless post-quiz), or drop `pinActive` from the existence check.

### [B3] [low] Kicked players can rejoin instantly — their 20-min quiz access token stays valid and there is no kick list. If kick is meant to be final, hold a per-room `kickedUserIds: Set` checked in `join_quiz`. (8 bytes × kicks; free.)
### [B2] [low] `start_quiz`'s restart-hydration path calls `initQuiz` without `joinCode`/`pin`, so the host panel shows no PIN after a server restart mid-lobby. Pass them through like the `join_quiz` hydration does.
### [B6] [medium MEM] [FREE] Quiz Excel export is the real OOM candidate
- **Where:** [quizRouter.ts:1488-1902] — 5 in-memory worksheets; the "Detailed Answers" sheet alone is participants × questions × 4 cells, "All Responses" is one row per answer × 16 columns.
- **Math:** 900 players × 50 q ≈ 180 k + 720 k cells; ExcelJS in-memory commonly needs ~0.5–1 KB/cell ⇒ several hundred MB against a 400 MB heap. Today's ~100-player quizzes are safe; the ceiling quiz is not.
- **Proposal:** switch to ExcelJS `stream.xlsx.WorkbookWriter` writing directly to `res` (API is near-identical), or gate the two detail sheets behind `?full=1` with a participant-count cap.
- **Break-even:** ~400 players × 30 questions.

## D. Frontend performance (measured)

Build: 238 JS assets, 4.8 MB total. Key chunks (gzip): `vendor-qr` **152.5 KB**, `vendor-charts` 116 KB, `index` 95.4 KB, markdown 63.7 + 47.7 KB (two chunks), `vendor-ui` 52.7 KB, html2canvas 47.3 KB (dynamic), `vendor-react` 17.5 KB.

### [W1] [high] [FREE] Split QR rendering from QR scanning
- **Where:** [vite.config.ts](../../apps/web/vite.config.ts) `manualChunks['vendor-qr'] = ['html5-qrcode', 'jsqr', 'qrcode.react']`; importers of *render-only* `qrcode.react`: `QRTicket` (every attendee's ticket), `QuizLobby`/`QuizHostView` (every quiz), `Step4Success`.
- **Why:** rendering one QR costs the full 152 KB gz chunk containing two complete barcode-*decoding* engines used only by AdminScanner and VerifyCertificatePage.
- **Proposal:** `'vendor-qr-render': ['qrcode.react']` (~4 KB gz) and `'vendor-qr-scan': ['html5-qrcode', 'jsqr']`.
- **Practical benefit:** ~148 KB gz removed from the quiz-join and ticket paths. On event-day hall Wi-Fi with 300 players joining inside a minute, that's ≈ 45 MB less concurrent transfer and a join screen that paints seconds earlier on 4G; QR tickets at the door load faster exactly when the queue is longest.
- **Verification:** rebuild; confirm `QuizLobby` route no longer pulls the scan chunk (network tab), sizes in build output.

### [W3] [high] [FREE] Resolve the half-migrated public design system
- **Where:** [Layout.tsx](../../apps/web/src/components/layout/Layout.tsx) applies `[data-public]` + `--pub-canvas/ink` to **every** public page; [index.css:1027+] defines the full cream/ink/ember + Newsreader/Inter Tight/JetBrains system; **only `AchievementsPage` uses `--pub-*` tokens** — ~20 public pages still amber/Outfit. [index.html] loads both font stacks (6 Newsreader variants + Inter Tight + JetBrains Mono *and* Outfit ×6 + Sora ×5). *(Stale as committed: this line originally also flagged a zero-reference Fira Code load — removed by PR #47, which merged before these docs landed.)*
- **Why:** users see two different brands navigating Home → Achievements; every first visit pays ~100–150 KB of fonts for whichever system the page doesn't use. This is the residue of reverted PR #42.
- **Proposal (calibrated to the owner's taste — warm, confident, people-first):** the cream + ink + ember + Newsreader direction *is* the more distinctive system; finish the migration page-by-page (Home → Events → Team first, the high-traffic three) and then delete the amber tokens + Outfit/Sora from index.html. If instead the revert was the decision, delete the `[data-public]` block + second font stylesheet — a one-day excision.
- **Practical benefit:** visual coherence across the public site + ~40–60 % less font transfer on first paint (font CSS+woff2 measured at ~190 KB total today, [UNVERIFIED split per family]); Lighthouse FCP on / should improve measurably.
- **Verification:** before/after Lighthouse runs on `/`, `/events`, `/achievements` (not run in this audit — no prod-like instance; flag **[UNVERIFIED]** for exact deltas).

### [W2] [medium] [FREE] Markdown costs two chunks (~111 KB gz combined)
Two emitted `markdown-*.js` files (157 + 202 KB raw). `rehype-highlight` is in package.json + the manualChunk list but imported **nowhere** — remove both. Then run `rollup-plugin-visualizer` (the config already documents how) to attribute the remaining split; likely one chunk is react-markdown+remark-gfm+rehype-raw, the other dompurify+component code that could merge. **[UNVERIFIED attribution — visualizer run is the recipe].**

### [W4] [low] [FREE] Single-use dependencies
- `jsqr` → one usage (VerifyCertificatePage image decode); `html5-qrcode.scanFile()` does the same job → drop jsqr (−90 KB raw from the scan chunk).
- `react-hook-form` + `@hookform/resolvers` + web `zod` → exactly one page (NetworkOnboarding, its 118 KB chunk). Either adopt RHF as the form standard (there are 10+ hand-rolled forms that would benefit) or rewrite this one form and drop three deps. Recommendation: **adopt** — the hand-rolled forms are where the UX walkthrough found validation gaps.

### [OK]s with fresh eyes
Route-level code-splitting is genuinely good (worst route chunk 34 KB gz). recharts is correctly confined to quiz-results pages. html2canvas is dynamic-imported. `vendor-monaco` emits nothing (dead chain confirmed; deletion is PR-3). The 95 KB gz shared `index` chunk is the one remaining unknown — visualizer recipe above.

## E. UI/UX
Full per-route table + top-10 ranked fixes in [uiux-walkthrough.md](uiux-walkthrough.md).

## F. Dependencies & toolchain

| Item | Evidence | Action |
|---|---|---|
| Root `@fontsource/cinzel` + `@fontsource/playfair-display` | zero imports across all workspaces (cert fonts are local TTFs in `apps/api/public/logos/`) | delete [FREE] |
| `rehype-highlight` (web) | zero imports | delete + remove from manualChunks [FREE] |
| Two API sanitizers: `sanitize-html` (mail) + `isomorphic-dompurify` (sanitize.ts) | both used | standardize on sanitize-html (already powers the richer policy) when next touching sanitize.ts [low] |
| `jsqr` | 1 usage, replaceable by html5-qrcode | replace + delete [FREE] |
| zod v3 (api) vs v4 (web+playground) | version split; api upgrade is mechanical but touches every schema | do as its own PR with test pass [M] |
| Prisma 5.8 → 6.x, Express 4 → 5, Tailwind 3 → 4, helmet 7 → 8 | all majors behind | **don't batch**. Prisma 6 first (perf + maintained), Express 5 only with the e2e gate below, Tailwind 4 only with/after the W3 design resolution |
| `react`/`react-dom` in API deps | required by `@react-pdf/renderer` | keep, add comment |
| TS strictness | `strict` everywhere, `noUnusedLocals` on web, **8** `as any` repo-wide | exemplary — say so |
| **[F4] e2e coverage** | `e2e/` = 36 lines (2 smoke specs); stability tests cover quiz engine/attendance domain/auth tokens well | the riskiest *flows* have zero e2e: registration (serializable race), team join, quiz lifecycle, attendance scan, password reset. Add 5 Playwright specs (~1 day) — they gate the Express-5 and zod-4 upgrades you'll eventually want |

## G. Reliability & ops

- **[G1] crash handlers** — see C.
- **[G2] [CONFIG]** `codescriet-api` has no `buildFilter` → web-only commits trigger API deploys (and the API restart persists quizzes as ABANDONED if one is live!). Add `buildFilter: paths: [apps/api/**, prisma/**, package.json]`. **Practical benefit:** deploying a typo fix to the homepage can no longer kill a live quiz.
- **[G3] [FREE/CONFIG] Observability for $0:** (1) UptimeRobot keyword monitor on `/health/db` (alerts on `"database":"down"` — today only `/ping` liveness is watched, so a DB outage is invisible until users report); (2) Render log-based alert on `"Failed to persist quiz"` and `"persistence retry limit reached"` — the two messages that mean real data loss; (3) Sentry free tier on the web app (5 k events/mo) — currently a prod ErrorBoundary render is observable by no one.
- **[G4]** render.yaml migrate-resolve workaround expires 2026-08-01 — calendar it.
- **Graceful shutdown** verified end-to-end: schedulers → io.close → quiz persist (retry ladder w/ unref'd timers) → http close → prisma disconnect → 28 s hard timeout. The only gap: persistence retries are killed by process exit — acceptable given the 3 sync attempts happen first.
- **512 MB behavior:** with `--max-old-space-size=400`, OOM = V8 abort → Render restart → boot recovery re-arms competition timers + quiz rooms rehydrate on join, participants' scores up to the last persist are lost (in-memory). The B6 export fix removes the most plausible trigger.

---

## Rejected / explicitly not proposed
- Redis/queues/workers/SSE — re-examined, still wrong for this footprint (cost + ops + no present bottleneck).
- Replacing Express with Fastify/Hono — churn ≫ benefit at 42 k LOC with this much hand-tuned middleware.
- Splitting the monorepo or extracting a shared types package — nice-to-have; the `search.ts` route-manifest duplication is the only real pain and a 100-line shared file solves it when it next bites.
- Client-clock quiz phases, removing rank unicast, HTTP polling — remain rejected per CLAUDE.md.
- Full Settings → key-value store — rejected (type safety of 40 boolean columns is worth more than schema elegance).
