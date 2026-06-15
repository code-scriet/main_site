# Performance Improvement Plan — codescriet platform (complete audit)

> Audit date: 2026-06-11. **Full line-by-line coverage**: `prisma/schema.prisma`, all 29 API routers, every util, middleware, quiz workspace, both socket layers, email/PDF/signature pipelines, passport config, `apps/playground/execute-server.js` (all 1509 lines), `workers/executor.js`, web infrastructure (API client + modules, contexts, hooks, stores, App shell, vite config, index.html, index.css), heavy-page query/polling sweep, scripts/, seed, playground web app.
>
> **Owner decision 2026-06-11: nothing is frozen.** Items formerly gated behind Hard Constraint #6 (quiz optimization freeze) and the pool freeze are owner-approved and scheduled below (PR-4/PR-5).
>
> Verdict up front: the codebase has already absorbed several serious optimization passes — bounded queries everywhere, atomic check-free updates, serializable-txn retries with jitter, in-process caches with in-flight dedup, event-driven schedulers, cursor-batched bulk mail, write-behind playground sessions, split React contexts, all-lazy routes. What follows is the **complete residue** after touching every file. Codes: **[PERF★]** prioritized win · [PERF] real but smaller · [MEM] free-tier memory · [BUG] correctness-adjacent · [HYG] hygiene · [OK] audited, nothing to do.

---

## 0. Ground rules that still hold

- `/ping` keep-warm endpoint stays untouched (UptimeRobot).
- Playground token-in-URL auth handoff is intentional (cross-subdomain SSO) — not "fixed".
- HC #7/#9/#11 semantics (top-10 broadcast, unicast rank, participant-only capacity) are *behavior*, not perf freezes — all changes below preserve them bit-for-bit.
- `prisma migrate dev --create-only` for every migration; review SQL before `db:migrate:deploy`.

---

## 1. Tier 1 — Backend query & runtime wins

### 1.1 [PERF★] `GET /api/qotd/stats/leaderboard` — replace 100k-row JS aggregation with SQL
`apps/api/src/routes/qotd.ts:353-417`. Two `findMany` calls pull up to **50k `QOTDSubmission` + 50k accepted `ProblemSubmission` rows** into Node and build `Map<userId, Set<istDateKey>>`. ≈20–30 MB transient spike per cold compute under the 400 MB heap cap, growing forever. One raw query replaces it (keep the 60s cache + user hydration exactly as-is):

```sql
SELECT user_id, COUNT(DISTINCT solve_day)::int AS days FROM (
  SELECT qs.user_id, DATE(q.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') AS solve_day
  FROM qotd_submissions qs JOIN qotd q ON q.id = qs.qotd_id
  UNION ALL
  SELECT ps.user_id, DATE(q.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
  FROM problem_submissions ps JOIN qotd q ON q.id = ps.context_key
  WHERE ps.context_type = 'QOTD' AND ps.verdict = 'ACCEPTED'
) u GROUP BY user_id ORDER BY days DESC LIMIT 100;
```
Parity: the JS path also keys on `q.date` (not submitted_at) and filters ACCEPTED — output is identical; diff old-vs-new JSON before merge.

### 1.2 [PERF★] `utils/init.ts` instantiates a second `PrismaClient`
`init.ts` top: `const prisma = new PrismaClient()` instead of importing the shared client → **two connection pools** against the Neon pooler for the process lifetime. One-line import swap. Also: `populateProfileSlugs` full-scans teamMembers + networkProfiles every boot (skip the scan when the before-count probes return 0 missing), and the one-off `_prisma_migrations` DELETE workaround in `initializeDatabase` runs every boot (removable). Boot chain in `index.ts:593-608` is fully serial — slug backfills can run post-listen, cutting deploy unavailability ~1–3s.

### 1.3 [PERF★] Two 3-round-trip counter patterns on every code execution / problem submit
- `utils/dailyLimit.ts` `consumeDailyQuota()` — upsert + guarded `updateMany` + `findUnique` re-read.
- `utils/problemsCore.ts` `reserveSubmitCap()` — same shape.

Each collapses to one `INSERT … ON CONFLICT (…) DO UPDATE SET count = t.count + 1 WHERE t.count < $cap RETURNING count` (cap = `COALESCE(cap_override, $defaultCap)` for the submit-cap variant; no row returned ⇒ over cap ⇒ one fallback read). A submit today costs ~10–14 round-trips before the judge runs; this removes ~4. Existing cap/quota tests must pass byte-identically.

### 1.4 [PERF★] The notification bell is the steadiest DB load on the API
1. `routes/notifications.ts` GET costs **8 DB queries** per call (`me` + `myNetwork` awaited sequentially, then a 6-way `Promise.all`).
2. `components/dashboard/DashboardLayout.tsx:363` polls that full aggregate **every 60s in every signed-in tab** just for `unreadCount` — while `useNotificationsSocket()` four lines later already invalidates the same queries on server push.
3. `NotifMenu.tsx` adds a 90s poll while open; `AdminPendingRequestsCardV2` two more at 60s; `DashboardOverview` polls `getAdminDashboardStats` (≈25 queries) at 60s.

One idle signed-in tab ≈ **480+ DB queries/hour**; an idle admin overview tab ≈ 2,000+/hour. Fixes: (a) bell preview interval 60s → 5 min (socket push covers freshness); (b) parallelize `me`+`myNetwork` in the endpoint; (c) adminStats 60s → 120s (judgment call, comment says deliberate); (d) optional slim `GET /api/notifications/unread-count` if a fast poll must return.

### 1.5 [PERF] QOTD publish/hold triggers a serial ~5-queries-per-submitter streak recompute
`utils/qotdStreak.ts` `recomputeStreaksForQOTDSafe()` loops submitters serially; each `recomputeUserStreak()` refetches that user's entire history (2 unbounded findMany + IN-lookup + read + conditional write). N submitters ⇒ ~5N queries at the publish moment. Batch: 2 grouped `findMany({ userId: { in } })` + shared published-day set + per-user compute in JS + write only changed rows.

### 1.6 [PERF] Socket handshakes and feature-block checks bypass the 30s auth LRU
`utils/socketAuth.ts` does a fresh `user.findUnique` per handshake on all 4 namespaces — a 900-player quiz join burst = 900 point reads. Reuse `userAuthCache` (get/set) with identical revocation semantics to HTTP. Same for `middleware/blocks.ts` `isUserBlocked()` (1 read per gated request and per `/quiz` handshake): a 30s bounded LRU invalidated in the two block-mutation handlers in `users.ts`.

### 1.7 [PERF] Sequential id/slug fallback chains → single `findFirst` with OR
`events.ts:326-342` (2 sequential lookups), `team.ts:278-356` (up to 3, duplicated across two endpoints), `announcements.ts /:id`, `achievements.ts /:idOrSlug` (2 each). 1–2 extra Neon round-trips per public detail-page view. In-repo precedent: `problems.ts resolveProblem()` and `polls.ts findPollByIdOrSlug()` already do the OR form. Also fold: `qotd.ts /history` calls `addSubmissionStatus` per row (1 point read × up to 100 rows) → batch with one `findMany({ contextKey: { in } })`.

### 1.8 [PERF-mini] Misc query collapses (all verified safe)
- `competition.ts GET /:roundId` ≈6 sequential round-trips on a page the solve UI polls → `Promise.all` the independents.
- `competition.ts raise-cap` event-wide = users×problems upserts in one txn (e.g. 200×4 = 800 statements) → one `INSERT … SELECT … ON CONFLICT DO UPDATE`.
- `attendance.ts /event/:eventId/summary` issues one `dayAttendance.count` per day (≤10) → the `groupBy` already used in `/live/:eventId`.
- `stats.ts sendPublicStats` (6 queries, anonymous, hit by /about) → copy the in-file `homeCache` pattern (60s + in-flight dedup).
- `stats.ts /me` fetches the user's entire QOTD history to recompute a streak that's materialized on `User.currentStreak`. Switch to the materialized value (semantics note: legacy = consecutive calendar days; materialized = consecutive published-QOTD days — the canonical definition used everywhere else). Fallback: bound the fetch to 400 days.
- `events.ts /:id/registrations/export` fetches ALL registrations unbounded (the list endpoint caps at 5,000; export doesn't) and applies year/branch/course filters in JS → add the same cap + push filters into the WHERE.
- `quizRouter.ts GET /:quizId` double-fetches questions for FINISHED/creator; `/history/me` ≡ `/my-history` copy-paste [HYG].
- `rejudgeJobs.ts` hydrates up to 10k full submissions (~20 MB) up front → page in 200s inside the existing serial loop.

---

## 2. Tier 2 — Owner-approved engine work (formerly frozen, now scheduled as PR-5)

### 2.1 [APPROVED ★] Throttle `poll_results_update`
`quiz/quizSocket.ts:589-594`: every POLL/RATING answer broadcasts the full distribution to the whole room — **O(n²) messages per poll question** (n submits × n recipients). At the 900-player ceiling ≈ 810k socket emits in one question window, on the same box that throttles `answer_count_update` to 1000ms (HC #8) precisely to prevent this class. This is the single most plausible OOM/CPU incident in the system. Fix: a `schedulePollResultsBroadcast` clone of the existing `scheduleAnswerCountBroadcast` (1 batched emit/sec). Break-even: fine ≤ ~100 players, dangerous at 900.

### 2.2 [APPROVED] Set-based end-of-quiz persistence
`quiz/quizStore.ts:650` `persistResultsAndCleanup`: per-participant `updateMany` loop inside one `$transaction` — at 900 players, ~900 sequential statements holding one pooled Neon connection (est. 30–90s). Replace with one raw `UPDATE quiz_participants AS p SET final_score=v.score, … FROM (VALUES …) AS v(user_id, score, …) WHERE p.quiz_id=$1 AND p.user_id=v.user_id` (~3 statements total incl. answers `createMany` + per-question analytics).

### 2.3 [APPROVED] O(1) all-answered check in `submitAnswer`
`quizStore.ts:491`: `Array.from(room.players.values()).filter(connected).every(answered)` materializes the player array per submit ⇒ O(n²) per question. Maintain `answeredConnectedCount` / `connectedCount` counters updated on answer/connect/disconnect/kick/advance; the check becomes one integer compare. (Also removes the same scans in `scheduleAnswerCountBroadcast`, `markPlayerDisconnected`, `getConnectedPlayerCount`.)

### 2.4 Regression gate for PR-5
A load script driving ≥100 simulated socket players through an MCQ + a POLL question, asserting: identical `question_results`/`answer_result`/`my_rank_update` payloads, poll distribution converges to the same final state, persisted rows byte-identical, and peak RSS/event-loop-lag improved or equal. HC #7 (top-10 slice) and #9 (unicast rank) assertions stay in `quizEmissionPlanner.test.ts`.

---

## 3. Tier 3 — Playground execute-server (fully read, 2 real findings)

### 3.1 [BUG/PERF★] Transactions issued on the pool, not a client
`apps/playground/execute-server.js` `flushUserSession()` (~L370-415): `pool.query('BEGIN')` … `pool.query(<writes>)` … `pool.query('COMMIT')`. With `pg`, each `pool.query()` may check out a **different** connection — BEGIN can land on connection A, the writes on B (running outside any transaction), COMMIT on C, and connection A is left **idle-in-transaction** (holds locks + Neon compute). Mostly-accidentally-correct under zero concurrency; not under load (the 60s periodic flush + limit-reached flushes + shutdown flush can overlap). Fix:
```js
const client = await pool.connect();
try { await client.query('BEGIN'); …writes via client.query…; await client.query('COMMIT'); }
catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
finally { client.release(); }
```
While there: the history flush is DELETE + up to 15 single INSERTs → one multi-VALUES INSERT [PERF-mini].

### 3.2 [MEM] Slow-leak in-memory maps
`userExecCounts`, `ipExecCounts`, `userPrefsMemory` keep one entry per unique user/IP ever seen and are never swept (entries are only overwritten on that same key's next access). Bytes per entry, but the process is kept warm 24/7 by UptimeRobot → unbounded slow growth. Add a day-rollover sweep (the `userSessions` map already has an idle-TTL sweep to copy from).

[OK] everything else in the file: write-behind session design, exec result cache (bounded 500 + TTL sweep), per-user/IP limits, fail-closed block gate with 42P01 escape, graceful flush on SIGTERM, CF worker (origin allowlist + constant-time secret + sanitized upstream errors).

---

## 4. Tier 4 — Schema: drop provably-redundant indexes

Every secondary index costs one B-tree write per INSERT/UPDATE. These are **leftmost-prefix-covered** by another index/unique on the same table — dropping them cannot regress any read:

| Drop | Covered by | Hot write path |
|---|---|---|
| `EventRegistration @@index([eventId])` | `[eventId, attended]` (+2 more eventId-first) | registration spikes |
| `QuizAnswer @@index([quizId])` | `[quizId, userId]` | end-of-quiz bulk persist |
| `QuizParticipant @@index([quizId])` | `@@unique([quizId, userId])` | end-of-quiz persist |
| `Quiz @@index([pin])` | `pin @unique` | — |
| `DayAttendance @@index([registrationId])` | `@@unique([registrationId, dayNumber])` | scan bursts |
| `EventTeam @@index([inviteCode])` / `[eventId]` | `inviteCode @unique` / `@@unique([eventId, teamName])` | team create txn |
| `CompetitionSubmission @@index([roundId])` | `@@unique([roundId, userId])` | submit burst |
| `CompetitionAutoSave @@index([roundId])` | `@@unique([roundId, userId])` | autosave every few sec |
| `PollVote @@index([pollId])` / `PollOption @@index([pollId])` | uniques `[pollId, userId]` / `[pollId, sortOrder]` | vote bursts |
| `UserBlock @@index([userId])` | `@@unique([userId, feature])` | — |
| `Certificate @@index([certId])` / `[eventId]` | `certId @unique` / `[eventId, issuedAt]` | bulk issuance |
| `Announcement @@index([pinned])` / `[expiresAt]` | the two composite desc indexes | — |
| `Achievement @@index([featured])` | `[featured, date desc]` | — |
| `Snippet @@index([shareToken])` | `shareToken @unique` | — |

**Keep** (look redundant but aren't): `QOTDSubmission [qotdId]`, `Event [startDate]`, `Announcement [createdAt]`, `EventRegistration [timestamp]` + `[reminderSentAt]`, `Execution [executedAt]`. **Verify via `pg_stat_user_indexes.idx_scan` before touching** (not prefix-provable): `NetworkProfile [displayOrder]/[isFeatured]/[connectionType]/[industry]/[passoutYear]`, `Event [featured]`.

Process: `npx prisma migrate dev --create-only --name drop_redundant_indexes`, snapshot `pg_stat_user_indexes` first, deploy, re-check 48h. Fully revertible.

---

## 5. Tier 5 — Frontend

1. **Bell + polling cadence** → §1.4 (the biggest frontend-driven server win).
2. **EventDetailPage** (`pages/EventDetailPage.tsx:466`) polls `/api/competition/event/:id` every 30s for every visitor, ungated → poll only while rounds exist/are ACTIVE; fetch once otherwise. (The 1s countdown ticker below is already correctly gated.)
3. **Fonts** (`apps/web/index.html`): `Fira Code` has **0 references** in the codebase — remove from the Google Fonts URL. `font-extrabold` (800) used 2× vs `font-black` (900) 32× — migrate the 2 and drop the 800 weights from Outfit + Sora. Audit Newsreader's 6 weight/italic combos against actual usage. ≈60–120 KB less first-paint font transfer.
4. **Dead Monaco chain in apps/web**: `components/problems/ProblemSolverShell.tsx` is imported by nothing; it's the sole importer of `lib/monacoEditor.ts` and the only reason `monaco-editor`, `@monaco-editor/react`, `emmet-monaco-es` are in `apps/web/package.json`. Delete all five + the `vendor-monaco` manualChunk (solve flow lives in the playground app, where Monaco is correctly chunked).
5. **Public GET Cache-Control**: `/api/stats/home` already sends `public, max-age=60, stale-while-revalidate=120`. Extend to anonymous-only responses (`/api/team?compact`, `/api/achievements`, `/api/announcements*`, `/api/credits`, `/api/qotd/leaderboard/total`, `/api/stats/public`, `/api/events*` strictly when `!getAuthUser(req)` — auth responses carry `isRegistered`). With Cloudflare in front, repeat anonymous hits shed before Render.
6. **Events list payload**: `GET /api/events` ships full `description` + `registrationFields` per row → opt-in `?view=card` trimmed select; default unchanged.
7. [OK] verified: App.tsx (all-lazy, MotionConfig reducedMotion, focus-refetch off), split Auth/Settings contexts with throttled focus refetch, `_internal.ts` single 401-retry, useQuizTimer (rAF), useNotificationsSocket (debounced invalidation), attendanceQueue (bounded localStorage + 5 sync triggers), html2canvas dynamic-imported, vite manual chunks, index.css (backdrop-blur surfaces have a reduced-motion disable path; optional `prefers-reduced-transparency` knob someday), scripts/seed/prerender (build-time only), playground web app (Monaco correctly isolated).

---

## 6. PR sequencing

| PR | Contents |
|---|---|
| **PR-1 `perf/api-queries`** | §1.1, §1.3, §1.4(b), §1.5, §1.7, §1.8 (all pure code, individually revertible commits) |
| **PR-2 `perf/drop-redundant-indexes`** | §4 only — one `--create-only` migration |
| **PR-3 `perf/web`** | §5.1–5.6 (bell cadence, competition-poll gate, fonts, dead Monaco, cache headers, view=card) |
| **PR-4 `perf/runtime-singletons`** | §1.2 (shared PrismaClient, boot-time trims), §1.6 (socketAuth + blocks LRU), §3 (playground pool-txn fix + map sweeps) |
| **PR-5 `perf/quiz-engine`** | §2 (owner-approved) with the §2.4 load-script gate |

Rejected/deferred (unchanged): no Redis/queues/new infra; no cursor rework of already-bounded admin lists; no index.css split; no service worker; `@db.Uuid` migration stays its own project.

---

## 7. No-regression verification protocol

1. `npm run lint --workspace=apps/{api,web}`, `npm run test:e2e`, `npm run test:stability` per PR.
2. §1.1 leaderboard parity: old-vs-new JSON diff on prod data — byte-identical.
3. §1.3 cap/quota: existing unit tests + a concurrent-submit script (two parallel submits at cap-1 → exactly one accepted).
4. New SQL: `EXPLAIN (ANALYZE, BUFFERS)` attached to PRs; index scans only.
5. §4: `pg_stat_user_indexes` snapshot before; Neon slow-query log clean 48h after.
6. §2: load script per §2.4; `quizEmissionPlanner.test.ts` untouched and green.
7. §3.1: concurrent-flush test (two sessions flushing simultaneously) asserting no idle-in-transaction connections (`pg_stat_activity`).
8. Fonts/visual: screenshot the 2 `font-extrabold` call sites + one Newsreader page.
9. Free-tier ledger: every change is memory-neutral or negative; nothing added grows with user/player count.

---

## Appendix A — file-by-file ledger (everything touched, including [OK]s)

**API infra:** index.ts [§1.2 note, else OK] · lib/prisma.ts [OK] · middleware/auth [OK] /role [OK] /blocks [§1.6] · utils: response, logger, idParams, pagination, slug, registrationFilters, registrationStatus, transactionRetry, dateStreak, publicUrl, superAdmin, invitationStatus, generateCertId, profileSync, oauthEmail, indexnow, registrationIntake, uploadCertificate, notifications, videoEmbed, eventRegistrationFields, attendanceToken, attendanceDomain [all OK — attendanceDomain's create-race settle protocol is exemplary] · audit [HYG: `void` the await where ordering isn't semantic; hard-delete keeps audit-first] · settingsCache, userAuthCache, emailPolicy, emailTransport [OK, model cache layers] · socket [OK] · socketAuth [§1.6] · dailyLimit [§1.3] · problemsCore [§1.3; context gates all indexed point reads] · codeJudge [OK: semaphores 5/10, truncation, humanized errors] · scheduler [OK — best file in the repo] · qotdStreak [§1.5] · init [§1.2] · rejudgeJobs [§1.8] · email.ts incl. send/sendBulk bodies [OK: toggles → testing-mode → normalized recipients → 1000/batch messageVersions + 100ms spacing] · emailTemplates [OK, string building] · generateCertificatePDF [OK: once-guarded font init, local font files] · processSignatureImage [OK: host allowlist, 10s fetch timeout, sharp timeout, graceful fallback chain] · config/passport [OK: H1 verified-email, R1 pre-hijack password clear] · attendance/attendanceSocket [OK].

**Quiz workspace:** quizStore [§2.2, §2.3; bounded rate-limit map w/ sweep] · quizEmissionPlanner [OK, HC #7/#9 in pure functions] · quizSocket [§2.1; single-query room hydration OK] · quizRouter [§1.8 minis; everything bounded].

**Routers (all 29, fully read):** stats [§1.8] · notifications [§1.4] · qotd [§1.1, §1.7-history] · team [§1.7] · events [§1.7, §1.8-export, view=card §5.6; eventDays day-row reconciliation batched correctly] · competition [§1.8 ×2; auto-lock txn + boot recovery OK] · certificates [OK throughout: shared issuance orchestrator, batched dedup, deliberately-serial PDFs, schema-drift fallbacks] · attendance [OK; §1.8 summary-groupBy] · users [OK: cursor pagination, capped advanced search, "not N+1" annotations accurate, soft-delete txn correct] · network [OK: composite-index feed, bounded admin lists, full export admin-rare] · invitations [OK: prefetched user maps, derived EXPIRED, txn-safe revoke] · teams [OK: batched invite-code candidates in serializable txn] · polls [OK] · settings [OK: /public from cache, writers invalidate all three caches] · auth [OK: timing-equalized misses, atomic reset claim, sliding-session cap] · problems incl. all endpoints [OK: cached gate, bounded lists, in-memory cap-request throttle w/ prune] · registrations, hiring, playground, announcements, achievements, mail (cursor-batched bulk), sitemap (1h CDN header), upload (magic bytes), signatories, credits, audit, search [all OK].

**Playground service + worker:** execute-server.js fully read [§3.1 ★, §3.2; else OK] · workers/executor.js fully read [OK].

**Web:** lib/api/_internal + 7 domain modules [OK: typed fetch wrappers, no logic] · AuthContext/SettingsContext/SocketContext/ThemeContext [OK — split-context pattern, throttled refetch] · hooks (quizSocket, quizTimer rAF, notificationsSocket debounced, homePageData, aboutPageData, eventForm, userDetail, adminPermissions, motionConfig, offlineScanner) [OK] · lib (quizStore, attendanceQueue, dateUtils, authToken, error, utils, imageUtils Cloudinary presets, videoEmbed, etc.) [OK] · App.tsx [OK] · index.html [§5.3 fonts] · index.css [OK; note §5.7] · vite.config [OK; §5.4 vendor-monaco removal] · pages/components polling sweep [§1.4, §5.2; QRTicket 15s tick, AdminScanner live poll, AdminProblems conditional refetch — all correctly scoped] · dead `ProblemSolverShell.tsx` + `lib/monacoEditor.ts` [§5.4].

**Other:** scripts/ (prerender, sitemap, indexnow-key, backfills, prune) [OK — build-time/admin-manual] · prisma/seed.ts [OK] · playground web app (9.3k lines; Monaco chunked; QOTDSolverShell lives here correctly) [OK].
