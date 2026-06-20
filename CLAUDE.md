# CLAUDE.md — code.scriet Club Platform

> **AI agents:** Single source of truth. Read fully before any change. No speculative exploration — everything you need is here. For exhaustive prose / historical context, see [docs/detailed_claude.md](docs/detailed_claude.md) **only when needed**.

---

## Project

Full-stack monorepo for CCSU's coding club. Events (solo + team + guest invites), announcements, polls, achievements, hiring, alumni network, live quizzes, timed coding rounds, judged problems (QOTD + practice + DSA contest), playground, certificates, QR attendance, credits.

**Prod:** web=`codescriet.dev` · api=`api.codescriet.dev` · playground=`code.codescriet.dev` · CF Worker (Wandbox proxy).

---

## Hard Constraints (non-negotiable)

1. **Free-tier (512 MB RAM)** on Render `codescriet-api`/`codescriet-playground-api`. No data structures that grow with user/player count. Safe ceiling ~900 concurrent quiz players.
2. **WebSocket-only** for real-time (Socket.io). No HTTP long-polling/SSE.
3. **Prisma pool is frozen.** Don't touch `datasource` block, add pool middleware, or change connection limits without approval.
4. **`--max-old-space-size=400`** must stay in prod start script.
5. **`prisma migrate dev --create-only` is mandatory.** Review SQL, then `db:migrate:deploy`. Never bare `prisma migrate dev` on shared/prod.
6. **Optimization code frozen during UI work.** Don't touch quiz scoring, leaderboard calc, or socket throttles when doing UI (`apps/api/src/quiz/quizSocket.ts`).
7. **Leaderboard broadcasts top 10 only.**
8. **`answer_count_update` throttle fixed at 1000 ms.**
9. **`my_rank_update` is unicast** — never broadcast.
10. **Phase transitions are server-authoritative.** No client-clock/schedule-based transitions — breaks pause/resume + extend-time.
11. **Capacity counts filter `registrationType = PARTICIPANT`.** `GUEST` invitations never consume participant seats.

---

## Response Standards

- **Stack-specific.** Cite exact file paths, Prisma model names, existing utilities. "Add a bounded Map in `quizStore.ts`" not "use a cache."
- **Flag O(n²) immediately.** Nested iteration over players × questions (or any unbounded × unbounded) → state complexity class + break-even n before anything else.
- **Socket event docs:** `event_name` → direction → payload TS interface → trigger → unicast/broadcast.
- **Prisma N+1:** Annotate `// N+1: consider batching` with justification, or batch via `findMany({ where: { id: { in: ids } } })`.
- **Free-tier impact:** For non-trivial features, estimate peak memory delta (bytes × concurrent users) and confirm fit under 512 MB.
- **No new infra.** No Redis, queues, separate workers, paid services.
- **Architecture proposals** must include: explicit tradeoffs, capacity math, ≥2 alternatives compared, O(n²) flag if applicable, free-tier impact check.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Express + TS (ESM, Node 20) |
| Frontend | React 19 + Vite + TS + Tailwind + shadcn/ui + Zustand (quiz UI only) + Recharts + Sonner + React Query (staleTime 5m, gcTime 30m) + React Router v7 + Monaco + cmdk + react-markdown |
| DB | PostgreSQL (Neon serverless) via Prisma. `DATABASE_URL`=pooler, `DIRECT_URL`=non-pooler (for migrations) |
| Auth | Passport (Google + GitHub OAuth) + JWT (7-day) + bcryptjs |
| Real-time | Socket.io: `/quiz`, `/attendance`, `/notifications` namespaces |
| Email | Brevo REST API (`BREVO_API_KEY`) |
| Storage | Cloudinary (images + cert PDFs) |
| PDF | `@react-pdf/renderer` server-side (this is why `react`/`react-dom` are `apps/api` deps — keep them) |
| Img processing | `sharp` (signature cleanup) |
| Export | ExcelJS |
| QR | `qrcode.react` (render) + `html5-qrcode` (scan) |
| Animation | Framer Motion |
| Deploy | Render free tier + Cloudflare Workers |
| Package mgr | npm workspaces |

---

## Layout

```
apps/
  api/                Express backend (TS, ESM) — entry src/index.ts
    src/
      config/passport.ts            Google + GitHub OAuth
      middleware/{auth,role,blocks}.ts
      routes/<resource>.ts          All resource routers (see route table below)
      attendance/attendanceSocket.ts
      quiz/{quizRouter,quizSocket,quizStore}.ts
      lib/prisma.ts                 client + withRetry()
      utils/                        attendanceToken, audit, email, eventStatus,
                                    generateCertificatePDF, processSignatureImage,
                                    init, jwt, logger, codeJudge, problemsCore,
                                    rejudgeJobs, dailyLimit, response, sanitize,
                                    scheduler, socket, superAdmin, qotdStreak
    public/logos/                   Cert fonts (GreatVibes/Cinzel/Cormorant/Playfair)
  web/                React frontend (Vite)
    src/
      App.tsx                       Router, lazy routes, QueryClient
      context/{Auth,Settings,Theme}Context.tsx
      lib/{api.ts,error.ts,utils.ts}
      components/{auth,dashboard,attendance,events,home,media,polls,teams,theme,layout,ui,dash}/
      pages/                        Public + dashboard/* + admin/* + quiz/*
  playground/         execute-server.js (plain JS) + Vite app
prisma/               schema.prisma + migrations + seed.ts
workers/executor.js   CF Worker → Wandbox
scripts/              migrate/sitemap(.mjs)/prerender(.mjs)/streak-backfill + dev seed scripts (create_test_*, update_outreach_dsa — moved out of apps/api/src so they no longer compile into dist). Build scripts use explicit .mjs (ESM) / .cjs (CommonJS) extensions to avoid Node's module-type warning.
render.yaml           4 services
```

---

## Commands

```bash
npm run dev                                  # API + Web + Playground
npm run {api,web,playground}                 # individual
npm run build / build:web:seo                # web + sitemap + prerender
npm run db:migrate:deploy                    # prod migrations
npm run db:migrate:day-attendance
npm run db:audit:competition-autosaves
npm run db:prune                             # manual retention pruning (-- --dry-run to preview)
npm run db:seed / db:studio / db:reset
npx prisma migrate dev --create-only --name <name>   # ALWAYS use --create-only
npm run test:e2e / test:stability
npm run lint --workspace=apps/{api,web}
```

---

## Runtime Lifecycle (API)

Startup in `apps/api/src/index.ts`:
1. Load env **first** via `import './config/loadEnv.js'` as index.ts's first import (`../../.env` then local), fail-fast on insecure/missing JWT secret. **Must precede every other import** — Prisma 7's pg adapter captures `DATABASE_URL` at construction (module-import) time, so loading env later (in the body) leaves the client with an undefined connection string → node-postgres defaults the DB to the OS user (local `P1003 database "<user>" does not exist`). Real env vars (Render) always win; this only bites `.env`-file setups.
2. HTTP + Socket.io (`/quiz` + `/attendance` + `/notifications`).
3. Middleware: helmet → compression → CORS allow-list → JSON → CSRF (cookie-auth writes) → optional req logger → rate limits.
4. Mount routers + health/SEO.
5. `initializeDatabase()` → hydrate security env → slug backfills.
6. Background schedulers (event status + reminders + QOTD auto-publish + registration-open): **ON by default in production**, off in development. `ENABLE_BACKGROUND_SCHEDULERS=true/false` forces it either way (`NODE_ENV` is normalized so anything ≠ `development` ⇒ production). Event-status + QOTD + **registration-open (S-01)** use event-driven in-memory timers (no polling); reminders poll every 6h. **S-01:** the registration-open scheduler arms a precise timer at each event's `registrationStartDate` and, on fire, sends the (previously unused) "Now Open" email + an `AUTO_EVENT` bell — deduped by the bell `NotificationFeed` row itself (`refEntity:'event-registration-open'`), only ever arming *future* moments so old events are never blasted. On boot a bounded **catch-up sweep** (12h window) fires for opens missed during downtime (free-tier spin-down); the persistent bell-row dedup keeps it at-most-once. **S-10:** the 6h reminder tick also runs `sendEventFeedbackRequests()` — for events that ended 2h–96h ago with a published linked feedback `Poll`, it reserves `Event.feedbackSentAt` then bells+emails attendees once (self-disables if the columns aren't migrated). The reminder tick also runs retention pruning at most once per 24h (`pruneOldRecords()` in `utils/scheduler.ts`: Execution > 90d, PlaygroundDailyUsage > 60d, NotificationFeed expired-or-> 90d, CompetitionAutoSave on FINISHED rounds > 30d, QuizAnswer > 365d **only when `PRUNE_QUIZ_ANSWERS=true`** (default off; QuizParticipant leaderboard aggregates never pruned); AuditLog deliberately untouched — compliance trail, manual `DELETE /api/audit-logs/retention` only — manual run: `npm run db:prune [-- --dry-run]`).
7. HTTP listen with port-retry on `EADDRINUSE`.
8. `recoverActiveRounds()` re-arms competition timers.

Shutdown (SIGTERM/SIGINT): stop schedulers → close Socket.io → persist active quizzes as `ABANDONED` → close HTTP → disconnect Prisma → hard-timeout 28s (beats Render's 30s SIGKILL).

Crash handlers (G1): `unhandledRejection` is logged with stack, process keeps running; `uncaughtException` logs then drains through the same `shutdown()` path (live quizzes persist as `ABANDONED`) and exits 1 (`Drained after crash`).

---

## Auth Flow

- **Email/password:** JWT in response + `scriet_session` cookie.
- **OAuth:** redirect → Passport (state-cookie CSRF check) → `/auth/callback?code=<30s exchange JWT>` → frontend `POST /api/auth/exchange-code` → real token to `localStorage`. No long-lived JWT ever appears in a URL. Exchange codes carry a `jti` and are **single-use**: `consumeOAuthExchangeJti()` (in-memory 60s used-jti map in `utils/jwt.ts`) rejects replays with 400. Cross-subdomain cookie on `.codescriet.dev` for playground.
- **Return path (`?next=`, UX#2):** SignInPage reads `?next=`, validates via `getSafeNextUrl` (`apps/web/src/lib/safeNext.ts` — origin-allowlist open-redirect guard, unit-tested) and redirects there on email/password login; for OAuth it stashes the validated value in `sessionStorage.post_login_next`, which `AuthCallbackPage` consumes after the code exchange (same-origin only) before its `/dashboard` fallback. EventDetailPage's "Sign in to register/accept" CTAs pass `?next=/events/:slug[?register=1]`.
- **registrationOpen (L1):** when `Settings.registrationOpen === false`, `POST /auth/register` 403s and routine OAuth first sign-ins are refused (no implicit account creation in passport.ts); existing accounts keep signing in. **Network-intent OAuth signups are exempt** (`shouldBlockImplicitOAuthSignup` returns false when the `oauth_intent=network` cookie is set) so invited guests/speakers/alumni can still create the account their invitation needs — `registrationOpen` governs member signups, `showNetwork` governs the network funnel. 5-min cached settings read, fail-open on read error.
- **JWT:** 7-day expiry, `{ userId, email, name, role, tokenVersion }`. Force logout = increment DB `tokenVersion`; middleware rejects when DB > claim. `GET /auth/me` echoes the presented token while it is in the front half of its life and only mints a replacement in the back half (caps sliding-session renewal).
- **Middleware:** `authMiddleware` reads `Authorization: Bearer` or `scriet_session` cookie; user row served from a 30s bounded LRU (`utils/userAuthCache.ts`, 500 entries). Every user-row mutation that affects auth (role/tokenVersion/isDeleted) MUST call `invalidateCachedAuthUser(userId)`.
- **Purpose allowlist (token partitioning):** access tokens never carry a `purpose` claim; special-purpose tokens do (`oauth_exchange`, `invitation_claim`, `quiz_access`, `qotd_reopen` share the main secret; `attendance` uses its own runtime secret, so its purpose rejection is defense-in-depth). Both auth middlewares, `verifyToken` (which also covers socket auth), and the playground's `optionalAuth` reject any purpose-carrying JWT for session auth. New special-purpose tokens MUST set a `purpose` claim.
- **Password reset:** self-service `POST /api/auth/request-password-reset` (neutral response, 5/15min/IP + 3/15min/email) and admin-initiated `POST /api/users/:id/password-reset` both store a sha-256-hashed 30-min token; consumed by `POST /api/auth/reset-password` (atomic claim, bumps tokenVersion). Frontend: `/forgot-password` + `/reset-password` (one lazy page, two modes).
- **Password change/add (`/api/users/me/{change,add}-password`):** rotates the session — bumps `tokenVersion` + `invalidateCachedAuthUser()` (kills every other live session immediately), then returns a fresh token + `scriet_session` cookie signed with the new watermark. Frontend adopts it via `adoptToken` (AuthContext) so the current tab survives.
- **Dev:** `POST /api/auth/dev-login` only when `ENABLE_DEV_AUTH=true`. Returns 404 when disabled.
- **CSRF guard:** Cookie-authed mutating `/api/*` writes must come from `Origin/Referer` in `isAllowedBrowserOrigin()` allow-list. Bearer bypasses.
- **CORS:** Explicit allowlist `ALLOWED_CODESCRIET_ORIGINS` (no subdomain wildcard). Dev: localhost/127.0.0.1/LAN IPs.
- **Rate limits:** General 500/15min/IP, Auth 50/15min, password reset 20/15min, hiring apply 15/15min/IP, polls vote/feedback 60/15min/IP (deliberately above the teams-join 15 — a hall voting behind one campus NAT must survive), teams join 15/15min, mail `emails[]` capped at 500/request.
- **Client IP (S2):** every IP-keyed limiter + login telemetry resolves via [apps/api/src/utils/clientIp.ts](apps/api/src/utils/clientIp.ts) — `CF-Connecting-IP` honored **only when the peer is inside Cloudflare's published ranges**, else Express `trust proxy` resolution; the Socket.io connection limiter uses `getSocketClientIp` (right-most XFF = the hop the platform proxy saw — never the client-controlled first entry). `LOG_IP_DIAGNOSTICS=true` logs `req.ip` vs `cf-connecting-ip` vs XFF per request for the 24h prod readback (ops-checklist).

---

## Role Hierarchy

```
PUBLIC=0 · USER=1 · NETWORK=1 · MEMBER=2 · CORE_MEMBER=3 · ADMIN=4 · PRESIDENT=4
```

- Super admin = `SUPER_ADMIN_EMAIL`. Settings writable by superAdmin + PRESIDENT only.
- `requireRole('ADMIN')` admits PRESIDENT. No literal `requireRole('PRESIDENT')` — use `requireRole('ADMIN')` + inline `isSuperAdmin(u) || u.role === 'PRESIDENT'`. Helpers in [apps/api/src/utils/superAdmin.ts](apps/api/src/utils/superAdmin.ts): `isSuperAdmin`, `isPresident`, `isPresidentOrSuperAdmin`. Known exception: `settings.ts` `PUT /api/settings` uses literal `requireRole('PRESIDENT')` (functionally identical to `'ADMIN'` — both level 4; the real gate is the inline `enforceSuperAdminOrPresident`); rename scheduled in the hygiene PR (audit D1).
- **Admin-deep-control:** Only superAdmin acts on PRESIDENT. PRESIDENT acts on ADMIN-and-below but cannot promote to ADMIN/PRESIDENT, cannot edit existing ADMIN/PRESIDENT. No actor edits self via `/api/users/*` (use `/dashboard/profile`). `PUT /api/users/:id/role` floor = PRESIDENT/superAdmin only.

---

## API Routes (mounted in `apps/api/src/index.ts`)

| Path | Auth | Notes |
|---|---|---|
| `/api/auth/*` | No (50/15min) | Includes `/dev-login` (gated), `/reset-password` (20/15min), `/request-password-reset` (5/15min/IP + 3/15min/email, neutral response) |
| `/api/events/*` | Mixed | |
| `/api/registrations/*` | User | |
| `/api/announcements/*` | Mixed | |
| `/api/polls/*` | GET=optional, vote/feedback=User, admin=Admin | |
| `/api/team/*` | Mixed | Team member directory |
| `/api/teams/*` | User (create/join), Admin (mgmt) | Event teams |
| `/api/invitations/*` | Mixed | |
| `/api/achievements/*` | Mixed | |
| `/api/qotd/*` | Mixed | |
| `/api/users/*` | Yes | Admin-deep-control endpoints below |
| `/api/stats/*` | No | Public + admin `/dashboard` with 12-tile insights. `/onboarding` (User, S-06 first-week checklist booleans), `/digest?month=YYYY-MM` (Admin, S-08 monthly recap markdown — draft only, never sends) |
| `/api/settings/*` | Some (superAdmin/PRESIDENT for `/settings`, `/settings/email-templates`, `/settings/security-env`) | Admin manual triggers: `POST /event-status/sync-now`, `POST /reminders/trigger` (runs one reminder pass; respects global toggle + per-event opt-out + dedup). `POST /reset` preserves `attendanceJwtSecret` + `indexNowKey` (S9 — wiping them would invalidate every issued 90d attendance QR after the next restart) |
| `/api/hiring/*` | Mixed | `/apply` stamps `Settings.hiringCycle`, dupes blocked per-cycle; `/applications?cycle=` admin filter; `/cycles` (Admin) distinct-cycles + current |
| `/api/certificates/*` | Mixed | |
| `/api/signatories/*` | Admin | |
| `/api/upload/*` | Yes | `+/history`; `+/streak-card` (S-03 — any authed user, dedicated `streak-cards/` folder, **no** UploadedImage gallery row) |
| `/api/network/*` | Mixed | |
| `/api/audit-logs/*` | Admin (PRESIDENT/superAdmin gate on the audit log page) | `DELETE /retention?days=N` (N min 30, default 90) deletes AuditLog rows older than N days — PRES/superAdmin only (403 inside the ADMIN gate). Retention *policy* decision still open (June 2026 audit); mechanism exists, nothing automatic. |
| `/api/mail/*` | Admin | |
| `/api/quiz/*` | Mixed | `POST /import` (CSV/XLSX), `POST /:quizId/open` (DRAFT→WAITING) |
| `/api/playground/*` | Mixed | `/snippets|stats|history`=User; `/request-reset|my-reset-request`=User; `/admin/*`=Admin |
| `/api/problems/*` | Mixed | List=public (if `problemsEnabled`); run/submit/request-cap=User; create=CORE_MEMBER+ (non-admin forced `isPublished:false`); update/delete/rejudge/override/cap-admin=Admin |
| `/api/problems/sheets/*` | Mixed (gated by `problemsEnabled`) | S-09 topic ladders. Mounted **before** `/api/problems` so "sheets" dodges the `/:idOrSlug` catch-all. `GET /` + `GET /:slug` (live per-user progress = ACCEPTED in **any** context, so a problem solved as a QOTD also ticks on a sheet); `POST` create=CORE_MEMBER+ (non-admins forced unpublished → admin **Sheets** tab publishes); `PUT` (incl. publish toggle + edit items) / `DELETE`=Admin |
| `/api/credits/*` | GET=public, write=Admin | |
| `/api/attendance/*` | Mixed | QR + history=User; admin endpoints=Admin; `/summary`=CORE_MEMBER+ |
| `/api/competition/*` | Mixed (gated by `competitionEnabled`) | Results GET=public; save/submit/my-submission=User; create/start/lock/judging/finish/score/edit/delete/publish-practice/raise-cap=Admin |
| `/api/notifications` GET + `/mark-read` | User | Dashboard v2 |
| `/api/search/global` | User | Dashboard v2, role-aware, 5/category |
| `/api/indexnow` | Admin | |
| `/sitemap.xml`, `/robots.txt` | Public | |
| `/health`, `/health/db`, `/ping` | Public | `/ping`=plain "pong" (UptimeRobot keep-warm; do NOT remove) |
| `/share/streak/:userId` | Public (root, own 120/5min limiter) | S-03 — server-rendered OG-image page (LinkedIn crawler reads `og:image`); humans 302 → dashboard. og:image is ONLY the user's stored `streakCardUrl` (never request input), all interpolations `escapeHtml`'d, `noindex`, soft-deleted users redirected — not an open og:image redirector |
| `/api/test-email` | Admin | |

**Admin-deep-control endpoints (`/api/users`):** `:id/full`, `:id/activity`, `:id/audit`, `:id/streak/{reset-current,restore-longest}` (PRES/SA), `:id/blocks` (GET=Admin, POST=PRES/SA), `:id/blocks/:feature` DELETE (PRES/SA), `:id/force-logout` (PRES/SA), `:id/password-reset` (PRES/SA), `:id/restore` (SA only), `:id` DELETE `?hard=true` (soft=PRES, hard=SA).

**Frontend route map:** see `apps/web/src/App.tsx`. All pages lazy-loaded with `React.lazy()` + `<Suspense>`. Notable: `/admin/users` + `/admin/users/:id`, `/admin/{team,achievements,problems,credits,event-registrations,hiring,network,certificates,competition,public-view,audit-log,mail,notifications,settings}` (**`/admin/problems` is the consolidated coding hub** — `AdminProblemsHub`, tabs via `?tab=catalog|qotd|review|proposals|sheets`: Catalog=`AdminProblems`, QOTD=`CreateQOTD` embedded, Review=`AdminSubmissionReview` embedded + filters, Proposals=core draft QOTDs + unpublished problems, **Sheets=`AdminSheets`** (manage every topic-ladder sheet incl. member-proposed drafts — publish/unpublish/edit/delete via the now-wired `updateProblemSheet`; draft-count badge); **`/admin/submission-review` now redirects to `?tab=review`**; `/dashboard/qotd` is the limited **Propose QOTD** form for non-admins and redirects admins into the hub), `/admin/competition/:roundId/judge`, `/admin/events/:eventId/attendance`, `/dashboard/{events,announcements,leaderboard,coding,invitations,certificates,profile,attendance,quiz,upload,problems/new}`, `/dashboard/events/:eventId/attendance` (CORE_MEMBER+), `/qotd/{today,:date}`, `/competition/:roundId/solve/:problemId`, `/competition/:roundId/results`, `/polls/:slug`, `/verify/:certId`, `/forgot-password` + `/reset-password` (one `ResetPasswordPage`, mode from URL token).

---

## DB Schema (Prisma)

**Actor-column rule (audit A3):** `DayAttendance.scannedBy`, `UserBlock.blockedBy`, `Certificate.issuedBy/revokedBy`, `QOTD.heldBy`, `User.deletedBy` are **deliberate plain-string snapshots, not FKs** — they record who acted at that moment and must survive actor deletion. `Event.createdBy` / `Announcement.createdBy` are real FKs. Don't "fix" the snapshot columns into relations ad hoc; they become uuid + `onDelete: SetNull` FKs only as part of the scheduled uuid-migration pass (audit A9).

### User
`id, name, email(unique), password?, oauthProvider/Id, role(Role), avatar, bio, github/linkedin/twitter/websiteUrl, branch/course/phone/year, profileCompleted, lastLoginAt/Ip, tokenVersion(default 0), currentStreak/longestStreak/longestStreakAt, streakCardUrl?(S-03 — Cloudinary URL of the user's latest streak-share card, served as og:image of `GET /share/streak/:id`), isDeleted/deletedAt/deletedBy, passwordResetToken(unique)/ExpiresAt, notificationsReadAt?, createdAt/updatedAt`

Relations: announcements, registrations, hiringApplications, qotdSubmissions, networkProfile, teamMember, invitationsReceived/Sent, createdQuizzes, quizParticipants/Answers, certificates, ledTeams, teamMemberships, competitionSubmissions/AutoSaves, createdPolls, pollVotes/Feedback, eventsCreated, qotdsCreated, auditLogs, executions, snippets, playgroundPrefs, playgroundDailyUsage, playgroundLimitResets, blocks (UserBlock[]).

### UserBlock (admin-deep-control)
`id, userId, feature(UserBlockFeature), blockedAt, blockedBy, reason?, expiresAt?` · unique `[userId,feature]` · index `[feature,expiresAt]`. Lazy expiry via `requireNotBlocked(feature)`.

### Settings (singleton id='default')
clubName/Email/Description · registrationOpen · maxEventsPerUser · announcementsEnabled · showAchievements/Leaderboard/QOTD · social URLs · contactPhone? · contactEmails(JSON `{label,email}[]`, admin-managed, shown on public `/contact`) · hiringEnabled + 5 categories · hiringCycle (current season label, default "2026"; A11) · email* template bodies · show_tech_blogs · showNetwork · mailingEnabled · certificatesEnabled · playgroundEnabled · playgroundDailyLimit · competitionEnabled · problemsEnabled · email\*Enabled (welcome/eventCreation/registration/announcement/certificate/reminder/invitation/passwordReset) · emailTestingMode/TestRecipients · attendanceJwtSecret? · indexNowKey? · **accentColor** (default `"rust"`) · **codeExecutionProvider** (`wandbox`|`godbolt`, default `"wandbox"` — primary code-execution upstream for judge + playground).

### Event
`id, title, slug(unique), description, status(EventStatus), startDate, endDate?, registrationStartDate?, registrationEndDate?, location?, venue?, capacity?, imageUrl, createdBy, eventDays(default 1), dayLabels(JSON String[])?, eventType?, prerequisites?, registrationFields(JSON)?, agenda?, faqs(JSON)?, featured, highlights?, imageGallery(JSON)?, learningOutcomes?, resources(JSON)?, shortDescription?, speakers(JSON)?, tags(String[]), targetAudience?, videoUrl?, allowLateRegistration, remindersEnabled(default true), feedbackSentAt?(S-10 reservation marker — post-event feedback sent once), teamRegistration(default false), teamMinSize(1), teamMaxSize(4)` · relations: registrations, invitations, certificates, teams, competitionRounds, feedbackPolls(Poll[]). `remindersEnabled=false` makes the reminder scheduler skip this event's registrations (per-event admin opt-out, set in the event editor's Registration timeline card).

### EventRegistration
`id, userId, eventId, timestamp, customFieldResponses(JSON)?, reminderSentAt?, attendanceToken?(unique), attended(default false), scannedAt?, manualOverride(default false), registrationType(RegistrationType, default PARTICIPANT), invitation?` · unique `[userId,eventId]` · index `[eventId,attended]`, `[eventId,registrationType,attended]`.

### EventInvitation
`id, eventId, inviteeUserId?, inviteeEmail?, inviteeNameSnapshot?/Designation?/Company?, role(default "Guest"), customMessage?, status(InvitationStatus), certificateEnabled(default true), certificateType(default SPEAKER), invitedById, invitedAt, respondedAt?, revokedAt?, emailSent, emailSentAt?, lastEmailResentAt?, registrationId?(unique), createdAt/updatedAt` · unique `[eventId,inviteeUserId]` · `EXPIRED` derived at read time.

### DayAttendance
`id, registrationId, dayNumber, attended(default false), scannedAt?, scannedBy?, manualOverride(default false), createdAt/updatedAt` · unique `[registrationId,dayNumber]`.

### EventTeam / EventTeamMember
`EventTeam: id, eventId, teamName, inviteCode(unique, 8-char hex), leaderId, isLocked, createdAt` · unique `[eventId,teamName]`. `EventTeamMember: id, teamId, userId, registrationId(unique), role(EventTeamMemberRole LEADER|MEMBER), joinedAt` · unique `[teamId,userId]`. Leader has `onDelete: Restrict`. Serializable txn + 3 retries.

### CompetitionRound / CompetitionRoundProblem / CompetitionSubmission / CompetitionAutoSave
Round: `id, eventId, title, description?, duration(sec), status(CompetitionStatus), roundType(IMAGE_TARGET|DSA), participantScope(ALL|SELECTED_TEAMS), leadersOnly, allowedTeamIds(String[]), targetImageUrl?, finalWeight(Float, default 1 — raw weight in the event-final aggregation, normalized at compute), proctored(default false), penaltyModel(CompetitionPenaltyModel, default BEST_SCORE), leaderboardFreezeMinutes?, difficultyWeights(JSON? — optional EASY/MED/HARD presets seeding the admin weight UI; raw per-problem weight still on RoundProblem.points), startedAt?, lockedAt?` (contest-redesign fields additive — migration `20260621000000_contest_redesign_phase_a`). RoundProblem: `id, roundId, problemId, displayOrder, points` (`points` = the **raw within-round problem weight**) unique `[roundId,problemId]`, `[roundId,displayOrder]`. Submission: `id, roundId, teamId?, userId, code, isAutoSubmit, score?, rank?, adminNotes?` unique `[roundId,teamId]`, `[roundId,userId]`. AutoSave: `id, roundId, teamId?, userId, code, savedAt` unique `[roundId,userId]`.

### CompetitionParticipantState / CompetitionViolation / CompetitionClarification (contest redesign)
ParticipantState (one per `[roundId,userId]`): `locked, lockReason?, lockedAt?, unlockedBy?/At?, violationCount, lastViolationAt?, lastSeenAt?` — proctor lock (server-enforced) + live-monitor heartbeat. Violation (append log): `roundId, userId, kind(CompetitionViolationKind), detail?, at`. Clarification: `roundId, message, createdBy, createdAt` — admin broadcast, contestants poll. All cascade with the round; DB-backed + prunable. **Tables land in Phase A; the proctor/monitor/clarification endpoints + UI ship in Phases C/E.**

**Contest scoring (CONTEST-only, [apps/api/src/utils/contestScoring.ts](apps/api/src/utils/contestScoring.ts), unit-tested):** 3-level normalized hierarchy, each capped 0–100. **Problem** = private-test pass % — `calculateScore(..., {privateOnly:true})` weights sample/public tests **0** (contestant self-test only) and distributes weight across hidden tests by their `points`; stored at submit on `ProblemSubmission.score` (QOTD/Practice keep sample weight 1, unchanged). **Round** = Σ(problem% × normalized RoundProblem.points) via `aggregateWeighted`. **Event-final** = Σ(round% × normalized Round.finalWeight) — read-time, so admin weight retunes need no rejudge. **Ranking** (`rankEntries`, 1224): `BEST_SCORE` = score desc + earliest completion; `ICPC` = score desc + penalty asc (penalty = wrong attempts × 20min + minutes-to-AC; tracked on `ProblemSubmission.contestWrongAttempts`/`contestSolvedAt`, CONTEST-only). The DSA `GET /:roundId/results` consumes this; event-final publish is Phase F.

### Announcement
`id, title, body, slug(unique), priority, createdBy, featured, pinned, shortDescription?, imageUrl?, imageGallery?, attachments?, links?, tags(String[]), expiresAt?, createdAt/updatedAt`.

### Poll / PollOption / PollVote / PollVoteSelection / PollFeedback
Poll: `id, question, description?, slug(unique), allowMultipleChoices, allowVoteChange, isAnonymous, deadline?, isPublished, createdBy, eventId?(FK Event, SetNull — S-10: links a poll as an event's post-event feedback poll, index [eventId])`. Option: `id, pollId, text, sortOrder` unique `[pollId,sortOrder]`. Vote: unique `[pollId,userId]`. Selection: composite PK `(voteId,optionId)`. Feedback: unique `[pollId,userId]`.

### TeamMember
`id, name, role, team, imageUrl, github?/linkedin?/twitter?/instagram?, order, userId?(unique FK), slug?(unique), legacySlugs(String[]), bio?, vision?, story?, expertise?, achievements?, website?, createdAt` · relations: user, credits.

### Achievement
`id, title, slug(unique), description, content?, shortDescription?, eventName?, achievedBy, imageUrl?, imageGallery(JSON)?, date, tags(String[]), featured, createdAt/updatedAt`.

### QOTD + QOTDSubmission
QOTD: `id, date(unique), question, problemLink, difficulty, problemId?, createdById?, isPublished, publishAt?, publishedAt?, heldBy?, holdReason?, reopenedAt?/reopenedBy?(admin "reopen a past QOTD"; reopenedBy is a plain-string actor snapshot), createdAt`. Submission: unique `[userId,qotdId]`.

**QOTD reopen (PRES/SA):** `POST /api/qotd/:id/reopen` re-stamps `reopenedAt` (idempotent) and returns a signed `qotd_reopen` token; the admin shares the private link `code.codescriet.dev/?qotd=<date>&reopen=<token>` (built with `getPlaygroundPublicUrl`, **no** auth-handoff). `POST /:id/close-reopen` nulls `reopenedAt` (revokes every outstanding link). A holder submits a PAST QOTD: the playground forces scored-QOTD context (not practice) and sends `reopenToken` on run/submit; [problemsCore.ts](apps/api/src/utils/problemsCore.ts) `validateProblemContext` bypasses the active-day gate only when the token verifies for that QOTD **and** `reopenedAt` is set (it returns `{ viaReopen }`). The gate `isQotdReopenAllowed` matches the token nonce by **millisecond instant** of `reopenedAt` (resilient to serialization precision) — unit-tested in [qotdReopen.test.ts](apps/api/src/utils/qotdReopen.test.ts). Token purpose `qotd_reopen` is in the partitioning allowlist (`jwt.ts`). **Admin acceptance — reopened solves are NOT auto-counted:** a reopen-link solve that judges ACCEPTED is **held**, persisted with `verdict=PENDING` + `reopenPending=true` + `needsReview=true` (no streak recompute; PENDING never counts on any ACCEPTED-filtered streak/leaderboard), and surfaced in the admin review queue. The submit returns `pendingAcceptance:true` (solver toast: "sent for admin acceptance"). **Acceptance is PRES/SA-only** (it grants credit for a past day — same authority that can reopen): **Accept** (`POST /api/problems/admin/reopen/:submissionId/accept`, PRES/SA) → `verdict→ACCEPTED`, clears flags, `recomputeUserStreakSafe` + `invalidateQotdLeaderboardCaches`, bells the solver — or **Reject** (`POST .../reject`, PRES/SA) → clears flags, verdict stays PENDING. The generic `PATCH override/:submissionId` recomputes the QOTD streak on verdict change and clears `reopenPending`, but **403s for a non-PRES/SA actor on a `reopenPending` row** (closes the bypass; plain ADMINs still grade every other queue row). The review-queue UI hides the Accept/Reject + grade controls for non-PRES/SA on held rows. The S-07 solution reveal stays shut for a held solve (verdict isn't ACCEPTED yet). Migration `20260618000300_qotd_reopen_pending` (additive, idempotent).

### Problem / ProblemSubmission / ProblemSubmissionCounter
Problem: `id, slug(unique), title, body, difficulty, tags(String[]), allowedLanguages(ProblemLanguage[]), timeLimitMs, defaultSubmitCap, sampleTests/hiddenTests(JSON), referenceSolution?, referenceLanguage?, isPublished, createdBy, testCasesUpdatedAt`. Submission: unique `[userId,problemId,contextType,contextKey]`, fields `language, code, verdict, score, passedCount, totalCount, perTestVerdicts(JSON), runtimeMs?, compilerOutput?, manualOverride, overrideNotes?, needsReview(default false), reopenPending(default false — held reopened-QOTD solve: verdict stays PENDING until an admin accepts), appealedAt?, appealNote?` · index `[needsReview,updatedAt]` (manual-review queue). Counter: unique on same key + `count, capOverride?, lastResetAt?, pendingRequest, requestedAt?, requestNote?, lastGrantedBy?, lastGrantedAt?`.

### ProblemSheet / ProblemSheetItem (S-09 — topic ladders)
Sheet: `id, slug(unique), title, description?, isPublished(default false), createdBy(FK User Restrict), createdAt/updatedAt` · index `[isPublished,createdAt desc]`. Item: `id, sheetId(FK Cascade), problemId(FK Cascade), order(default 0)` · unique `[sheetId,problemId]` · index `[sheetId,order]`. Per-member progress computed live from `ProblemSubmission` (**ACCEPTED in any context** — practice, QOTD, or contest) — no per-user state stored. Admins manage sheets (incl. publishing member-proposed drafts) from the coding hub's **Sheets** tab (`AdminSheets`).

### NetworkProfile (1:1 with User)
`id, userId(unique), slug?(unique), legacySlugs(String[]), fullName, designation, company, industry, bio?, profilePhoto?, phone?, linkedinUsername?/twitter?/github?/personalWebsite?, connectionType(NetworkConnectionType), connectionNote?, connectedSince?, passoutYear?, degree?, branch?, rollNumber?, achievements?, currentLocation?, vision?, story?, expertise?, adminNotes?, events(JSON array), isFeatured, status(NetworkStatus), verifiedAt?/By?, rejectionReason?, isPublic, displayOrder`.

### Certificate
`id, certId(unique, "ABCD-EFGH-IJKL"), recipientId?(FK), recipientName/Email, eventId?(FK), eventName, type(CertType), position?, domain?, description?, teamName?(WINNER team certs — persisted so regeneration restores it; migration `20260619000000_certificate_team_name`, additive/idempotent, code degrades gracefully if unmigrated), template(CertTemplate, default gold), emailTemplate(CertEmailTemplate, default default), pdfUrl?, signatoryId?(FK Signatory), signatoryName/Title/ImageUrl, facultySignatoryId?(FK), facultyName/Title/ImageUrl, issuedBy/At, emailSent/At?, lastEmailResentAt?, isRevoked, revokedAt?/By?/Reason?, viewCount` · unique `[recipientEmail,eventId,type]`.

### Signatory
`id, name, title(default "Club President"), signatureUrl?, isActive`.

### HiringApplication
`id, name, email, phone?, department, year, skills?, applyingRole(ApplyingRole), status(ApplicationStatus), cycle(default "2026"), userId?` · unique `[email, cycle]` (A11 — one application per email **per hiring season**, was global). `cycle` stamped from `Settings.hiringCycle` at apply time.

### AuditLog
`id, userId, action, entity, entityId?, metadata(JSON)?, timestamp`.

### Credit
`id, title, description?, category, teamMemberId?(FK SetNull), order, createdAt/updatedAt` · index `[category,order]`. `category` stays a **plain string** (admins invent categories at will — an enum would fight the feature; deliberately not converted in the A4 enum pass).

### Quiz models
Quiz, QuizQuestion, QuizParticipant, QuizAnswer (persisted post-quiz). `QuizQuestion` has **`@@unique([quizId, position])`** (A5) — the delete-and-recreate PATCH can't persist duplicate positions.

### DB-enforced constraints (migration `20260613120000_constraints_and_enums`)
CHECKs Postgres now holds (formerly JS-only): `events_team_size_ck` (team_min ≤ team_max), `events_days_ck` (event_days 1–10), `events_capacity_ck` (capacity NULL or ≥ 0), `quiz_q_timelimit_ck` (time_limit_seconds 5–120). Plus `users_email_lower_ux` unique expression index on `lower(email)` (A8) — **not representable in schema.prisma; Prisma 5.x doesn't introspect expression indexes, so it lives outside Prisma's model (no drift, no managed drop). Re-verify on any Prisma upgrade.** Enum conversions used data-preserving `USING` casts (never Prisma's default DROP+ADD COLUMN).

### Playground models
Execution (`userId, language, code?, outputText?, executedAt, durationMs?, status`); UserPlaygroundPrefs PK `userId` (`theme, fontSize, keybinding, lastLanguage`); Snippet (`userId, title, language, code, isPublic, shareToken?(unique)`); PlaygroundDailyUsage composite PK `[userId,usageDate]` (`count`); PlaygroundLimitReset (`userId, resetBy, resetAt, note?`); PlaygroundLimitResetRequest (`userId, note?, status, decidedBy?/At?`).

### UploadedImage (Dashboard v2)
`id, userId, url, publicId(unique), filename, bytes, width, height, format, createdAt` · cascade with User.

### Enums
```
Role: PUBLIC|USER|CORE_MEMBER|ADMIN|PRESIDENT|MEMBER|NETWORK
EventStatus: UPCOMING|ONGOING|PAST
AnnouncementPriority: LOW|MEDIUM|HIGH|URGENT
ApplyingRole: TECHNICAL|DSA_CHAMPS|DESIGNING|SOCIAL_MEDIA|MANAGEMENT
ApplicationStatus: PENDING|INTERVIEW_SCHEDULED|SELECTED|REJECTED
CertType: PARTICIPATION|COMPLETION|WINNER|SPEAKER
CertTemplate: gold|dark|white|emerald   (lowercase members — match stored strings)
CertEmailTemplate: default|faculty_distribution
EventTeamMemberRole: LEADER|MEMBER
Difficulty: EASY|MEDIUM|HARD   (Problem.difficulty + QOTD.difficulty)
RegistrationType: PARTICIPANT|GUEST
InvitationStatus: PENDING|ACCEPTED|DECLINED|REVOKED   (EXPIRED derived, not stored)
QuizStatus: DRAFT|WAITING|ACTIVE|FINISHED|ABANDONED
QuizQuestionType: MCQ|TRUE_FALSE|SHORT_ANSWER|POLL|RATING|MULTI_SELECT|OPEN_ENDED
NetworkConnectionType: GUEST_SPEAKER|GMEET_SESSION|EVENT_JUDGE|MENTOR|INDUSTRY_PARTNER|ALUMNI|OTHER
NetworkStatus: PENDING|VERIFIED|REJECTED
ExecutionStatus: SUCCESS|ERROR|TIMEOUT
CompetitionStatus: DRAFT|ACTIVE|LOCKED|JUDGING|FINISHED
CompetitionPenaltyModel: BEST_SCORE|ICPC
CompetitionViolationKind: BLUR|HIDDEN|CLICK_OUT|FULLSCREEN_EXIT|COPY_PASTE|OTHER
CompetitionRoundType: IMAGE_TARGET|DSA
CompetitionParticipantScope: ALL|SELECTED_TEAMS
ProblemContextType: QOTD|CONTEST|PRACTICE
ProblemLanguage: PYTHON|JAVASCRIPT|CPP|JAVA
PlaygroundResetRequestStatus: PENDING|GRANTED|DENIED
SubmissionVerdict: PENDING|ACCEPTED|WRONG_ANSWER|TIME_LIMIT_EXCEEDED|RUNTIME_ERROR|COMPILATION_ERROR|JUDGE_ERROR
UserBlockFeature: EVENT|PLAYGROUND|QOTD|QUIZ|NETWORK
```

---

## Quiz System

Mature + optimized. **Don't propose perf refactors** unless a regression is named.

- **In-memory during active quiz** — `quizStore.ts` uses `Map<string, QuizRoom>`. No DB writes until quiz ends.
- **Draft-first persistence** — quizzes saved as `DRAFT`; `POST /api/quiz/:quizId/open` → `WAITING`. CSV/XLSX import via `POST /api/quiz/import`.
- **Question privacy (B4):** `GET /api/quiz/:quizId` returns `questions: []` to non-hosts while the quiz is DRAFT/WAITING/ACTIVE — players receive questions only via the socket `show_question` event. Creator/admin always sees the full list; FINISHED reveals answers to everyone (review mode); ABANDONED shows questions with answers redacted.
- **Server-authoritative timers.** Pause clears timers; resume re-arms.
- **start_quiz guards:** only a `waiting` room starts (double-emit → `control_action_blocked ALREADY_STARTED`, index stays 0); the no-room DB-hydration path refuses non-WAITING/ACTIVE quizzes (`QUIZ_NOT_OPEN` — ACTIVE allowed for crash recovery) and passes `joinCode`/`pin` into `initQuiz` so the host panel keeps its PIN after a restart.
- **Kick is final:** per-room `kickedUserIds: Set` (bytes per kick, freed with the room); `join_quiz` rejects listed users with `quiz_error KICKED` even though their 20-min access token is still valid.
- **Scoring:** base 1000 + time bonus (faster=more) + streak bonus. Logic in `quizSocket.ts`.
- **Rate limit:** 500ms per user per `submit_answer`.
- **Persistence on end** → `QuizParticipant` + `QuizAnswer`. Set-based: participant scores/ranks + per-question analytics each persist via one `UPDATE … FROM (VALUES …)` (no per-row statement loops). Shutdown persists active as `ABANDONED`. Persist also nulls `pin`/`joinCode` (both globally `@unique` — retired codes returned to the pool, no P2002 collisions with history) alongside `pinActive: false`.
- **O(1) room counters** — `QuizRoom.connectedCount/answeredCount/answeredConnectedCount` maintained on every join/answer/disconnect/kick/advance transition; all-answered and answer-count checks never scan the players map. Gate: `quizEngineLoad.test.ts` (150-player churn + throttle parity).
- **Capacity ceiling ~900 concurrent.**

### Socket Events (`/quiz` namespace, JWT auth)
| Event | Dir | Audience | Notes |
|---|---|---|---|
| `join`, `start`, `next_question`, `submit_answer`, `end`, `pause`, `resume`, `extend_time`, `skip`, `kick` | c→s | — | submit_answer rate-limited 500ms |
| `question_start` | s→c | broadcast | |
| `answer_result` | s→c | unicast | per-player correct/points/streak |
| `leaderboard_update` | s→c | broadcast | **Top 10 only** (HC #7) |
| `answer_count_update` | s→c | broadcast | **Throttled 1000ms** (HC #8) |
| `my_rank_update` | s→c | **unicast** | per-socket (HC #9) |
| `player_status_update` | s→c | **unicast to host** | 7 emit sites |
| `poll_results_update` | s→c | broadcast | **Throttled 1000ms** (batched like `answer_count_update`; reveal cancels pending tick) |
| `quiz_end` | s→c | broadcast | triggers 2s finale splash |
| `podium` | s→c | broadcast | final top-3 data |

### Frontend (apps/web/src/pages/quiz/)
- `QuizPage.tsx` — state machine `idle|joining|lobby|question|revealing|paused|finished`; 2s finale splash via `finaleShown` flag.
- `QuizHostView.tsx` — host dashboard, sorted player list, live count, kick/skip.
- `QuizAdminPanel.tsx` — pause/resume/extend/end overlay.
- `QuizLeaderboard.tsx` — mid: compact top-5; final: 3-tier podium (rank 3@500ms, 2@800ms, 1@1100ms) with CSS confetti.
- `QuizFinaleIntro.tsx` — 2s splash on `quiz_end`.
- `QuizResultsPage.tsx` — analytics (creator/admin), HeatmapGrid + difficulty curve + drop-off + perf scatter (Recharts).
- `AdminQuizCreator.tsx` — wizard: manual + CSV/XLSX, `Save Draft` vs `Save & Open Now`.
- `QuizQuestion / QuizResultReveal / QuizAnswerDistribution / PollResultsView / QuizLobby`.

### Frontend store ([apps/web/src/lib/quizStore.ts](apps/web/src/lib/quizStore.ts))
`QuizPlayer { userId, displayName, answered?, connected? }`. Per-player session stats (`myScore/myStreak/myRank/leaderboard/answeredCount/players`) on QuizState, not QuizPlayer.

### Rejected proposals
- Client-clock phase transitions (breaks pause/resume + extend).
- Removing `my_rank_update` unicast (UX regression).
- HTTP polling fallback (free-tier incompatible).

---

## Attendance System

- **QR payload:** long-lived JWT (default `90d`, override via `ATTENDANCE_TOKEN_EXPIRES_IN`), `{userId, eventId, registrationId, purpose:'attendance'}`. Generated on registration inside the serializable txn. Util: [apps/api/src/utils/attendanceToken.ts](apps/api/src/utils/attendanceToken.ts).
- **Multi-day truth:** `DayAttendance` rows per `dayNumber` (1..10). Legacy `EventRegistration.attended/scannedAt/manualOverride` stays synced.
- **Scanning:** CORE_MEMBER+ scans via `POST /api/attendance/scan` (verifies JWT, marks for `dayNumber`). Offline batch via `/scan-batch`.
- **Offline scanner:** `useOfflineScanner` stores in `localStorage`. 5 sync triggers: immediate, 3s interval, mount sync, visibilitychange, `sendBeacon` on unload.
- **QR scanner lib:** `html5-qrcode` `{fps:10, qrbox:280}`, rear camera.
- **QR display:** visible from 30 min before start to endDate (or startDate+4h fallback).
- **Atomic mark:** `updateMany({ where: { id, attended: false } })`. `count === 0` = duplicate. Never check-then-update.

### Endpoints (`/api/attendance/*`)
`/my-qr/:eventId` GET (User) · `/scan` POST (CORE+, supports `bypassWindow`) · `/scan-batch` POST (CORE+) · `/scan-beacon` POST (token-in-body CORE+) · `/manual-checkin` POST (CORE+, +`dayNumber`) · `/unmark` PATCH (CORE+, +`dayNumber`) · `/bulk-update` PATCH (CORE+, +`dayNumber`) · `/edit/:registrationId` PATCH (CORE+, +`dayNumber`) · `/regenerate-token/:registrationId` POST (Admin) · `/search` GET (CORE+) · `/live/:eventId` GET (CORE+) · `/event/:eventId/full` GET (CORE+) · `/event/:eventId/export` GET (CORE+, +`dayNumber`) · `/email-absentees/:eventId` POST (Admin, +`dayNumber`) · `/event/:eventId/certificate-recipients` GET (Admin, +`minDays`) · `/my-history` GET (User) · `/event/:eventId/summary` GET (CORE+) · `/backfill-tokens` POST (Admin). PAST events block scanning.

### Socket (`/attendance` namespace)
`join:event`/`leave:event` c→s · `attendance:marked`/`unmarked`/`bulk` s→c (broadcast to `event:${eventId}`).

### Components (apps/web/src/components/attendance/)
`QRTicket` (countdown→QR→attended badge + day breakdown) · `AdminScanner` (offline-first, day selector, audio, manual checkin) · `AttendanceManager` (CRUD table, day selector, bulk, export, absentees email) · `EventCertificateWizard` (attendance/competition wizard with optional `minDays` filter + per-batch event-name override) · `EventAdminHub` (tabs: Details/Scanner/Manage + Certificates for Admin; routes `/admin/events/:eventId/attendance` or `/dashboard/events/:eventId/attendance`) · `AttendanceHistory`.

---

## Problems + QOTD Coding System

Single canonical `Problem` reused across 3 contexts: `PRACTICE`, `QOTD`, `CONTEST`. Each submission keyed by `(userId, problemId, contextType, contextKey)`.

- **Per-context cap** via `ProblemSubmissionCounter` (cap override + pending request).
- **Judge pipeline:** `problemsCore.ts` → `codeJudge.ts` → CF Worker (`workers/executor.js`) → admin-selected provider (`Settings.codeExecutionProvider`: Wandbox or godbolt), **with the other provider as automatic fallback inside the worker** (see Execution Resilience below).
- **Upstream-infra errors ≠ code errors:** when Wandbox is out of container capacity it returns `OCI runtime error: crun: clone: Resource temporarily unavailable` (clone/fork `EAGAIN`) in `compiler_error`/stderr with no `__JUDGE:` frame. `codeJudge.ts` (`isInfraFailure()` / `INFRA_FAILURE_RE`) classifies these as `JUDGE_ERROR` (retryable, rolls back the submit cap, never persists), **never `COMPILATION_ERROR`** — a false compile error would also clobber a prior ACCEPTED verdict on resubmit.
- **Monotonic solved status:** `submitProblemForUser()` never lets a non-ACCEPTED resubmit overwrite an existing ACCEPTED `ProblemSubmission` row (single row per `[userId,problemId,contextType,contextKey]` drives `totalSolved`/leaderboard). The user still sees their real latest result in the response; the canonical row stays ACCEPTED. Admin `rejudgeSubmission()` is exempt (intentional re-eval).
- **Capture-on-judge-failure + manual review (appeal):** a `JUDGE_ERROR` submit is NOT discarded — it's persisted with `needsReview=true` (verdict `JUDGE_ERROR`) so the code is captured, and the attempt + daily quota are **refunded** (`releaseSubmitCap` + `refundDailyQuota`) since the failure isn't the user's fault. The submit returns `needsReview:true` (frontends show "judging unavailable — saved for review", not a code error). Students can also `POST /api/problems/:id/appeal` (any non-ACCEPTED submission → sets `appealedAt`/`appealNote`, `needsReview=true`). Admins work the queue via `GET /api/problems/admin/review-queue` and grade with the existing `PATCH override/:submissionId` (which sets `needsReview=false`). Frontend: admin `/admin/submission-review` page; appeal button lives in the playground `QOTDSolverShell` (covers QOTD + contest DSA + practice). Migration `20260616130000_submission_review_appeal` (additive, idempotent).
- **Daily quota** (`dailyLimit.ts`) IST-based, shared with playground. A `JUDGE_ERROR` on **both** submit and Test Run (`runProblemTests`) refunds the consumed quota unit — an upstream outage never burns a student's allowance.
- **Feature gate:** non-admins get 404 when `Settings.problemsEnabled !== true`.
- **Feature blocks on run/submit:** QOTD context → `QOTD` block, PRACTICE context → `PLAYGROUND` block (practice executes user code, so a PLAYGROUND-blocked user can't run/submit it); applied on both run and submit.
- **Context validation:** `validateProblemContext()` checks event registration, team scope, leader-only, QOTD-date. **PRACTICE `contextKey` is server-stamped** to the server's IST today in `submitProblemForUser`/`runProblemTests`/`my-submission` (the client-sent date is ignored) — race-free across the IST-midnight boundary.
- **Practice solution reveal (S-07):** for PRACTICE the engagement gate matches an ACCEPTED submission in **any** practice day (not just today's `contextKey`), so a returning solver doesn't see the solution re-lock the next day. QOTD/CONTEST stay keyed to the exact context.
- **Cap reservation:** submit flow reserves cap first, rolls back on judge/system failure.
- **Rejudge queue:** `rejudgeJobs.ts` bounded in-memory, serial execution via promise chain.
- **Materialized QOTD streaks:** `User.currentStreak/longestStreak` count consecutive *published-and-not-held* QOTD days the user submitted. Updated transactionally via `recomputeUserStreakSafe()` ([apps/api/src/utils/qotdStreak.ts](apps/api/src/utils/qotdStreak.ts)) from `POST /api/qotd/:id/submit` and `submitProblemForUser()` (contextType=QOTD, verdict=ACCEPTED). 60s in-process cache of published-date set; invalidated on publish/hold. **Single streak definition everywhere:** `computeQOTDStats` (powers `GET /users/me/qotd-stats` → dashboard streak widget + Coding QOTD tab) reads the SAME publish-aware walk (`computePublishAwareStreaks`) as the materialized columns — no separate calendar-day algorithm. The walk has a **today-grace** (an unsolved *today* doesn't break the streak until the day ends); grace never fires at materialize time (the user has just solved), so materialized values are unchanged.
- **QOTD scheduling + publish notification:** On create, `publishAt` = chosen IST wall-clock time (`publishTime` HH:mm, default 00:00 IST) on the QOTD's IST date; if that instant is already past it publishes immediately, else stays scheduled. **Every** go-live path — create-and-publish-now, manual `POST /:id/publish`, and the auto-publish scheduler — fires the `broadcastQotdLive()` bell notification (`utils/notifications.ts`, source `AUTO_QOTD`, audience ALL). Auto-publish also recomputes submitter streaks + invalidates the published-day cache per flipped row.
- **QOTD scheduler (event-driven, no polling):** `startQotdAutoPublishScheduler()` arms a precise in-memory `setTimeout` per scheduled QOTD instead of polling. Timers are armed at create time (`armQotdPublishTimer` from `POST /api/qotd`), re-hydrated once on boot from the DB, and cancelled on hold/publish/delete (`cancelQotdPublishTimer`). When a timer fires it flips that one row + sends the bell. Net DB contact: one hydration query on boot + one targeted write per publish — between publishes the DB sleeps. Bounded (only pending scheduled QOTDs). Far-future schedules chain past Node's ~24.8-day `setTimeout` ceiling. Active only when `ENABLE_BACKGROUND_SCHEDULERS` is on.

### Problems endpoints
List/admin-all/admin-reset-cap/admin-pending-cap-requests · create/update/delete/publish · run/submit/my-submission/leaderboard/all-submissions · override/:submissionId · rejudge + rejudge-status/:jobId · request-cap · `:id/appeal` (User — flag a non-accepted submission for review) · `admin/review-queue` (Admin — `needsReview` submissions for manual grading) · `admin/reopen/:submissionId/{accept,reject}` (PRES/SA — accept/reject a held reopened-QOTD solve; accept flips PENDING→ACCEPTED + recomputes streak/leaderboard. `override/:submissionId` also 403s for non-PRES/SA on a `reopenPending` row). Per-problem `/:id/leaderboard` excludes `verdict=PENDING` (held reopen solves never rank).

### QOTD endpoints
`/today` · `/history` (supports `?date=YYYY-MM-DD` single-day lookup, `?from=YYYY-MM-DD&to=YYYY-MM-DD` inclusive range — powers the admin QOTD calendar's per-month fetch so far-back months aren't blank — + `?includeUnpublished` for staff). Serialized rows carry both `hasSubmitted` (any attempt) and `hasSolved` (verdict ACCEPTED; legacy self-report counts) so the UI shows truthful Solved/Attempted/Missed. · `/history/summary` (optional auth → `{totalPublished, solved, left}`; `solved` = ACCEPTED only; via `getQotdSolveStatus`) · `/leaderboard/total` (lifetime points) · `/leaderboard/weekly` (public, 60s cache — one grouped query summing each user's best per-day score over the last 7 published-and-not-held days, `daysSolved` + `dayCount`; **replaced the old client-side 7×top-10 rollup AND the now-removed unused `/stats/leaderboard`**) · `/:qotdId/leaderboard` (daily, score-ranked incl. partials, excludes PENDING) · `/:id` GET/PUT/DELETE · POST create (CORE+) · PUT edit (CORE+ owner-or-Admin; **only an UNPUBLISHED proposal/scheduled QOTD** — published/held → 400; re-derives legacy fields on problemId change, re-arms the publish timer on date/time change; surfaced via the Edit pencil in CreateQOTD's history list + `EditQOTDDialog`) · `/publish`, `/hold`, `/publish-practice`, `/unpublish-practice` (Admin) · `/reopen`, `/close-reopen` (PRES/SA — reopen a past QOTD via private signed link) · `/submit` (legacy text) · `/leaderboard/around-me` (User, Dashboard v2; `RANK() OVER ()` CTE → `{slice, myRank, totalRanked, nextUpDelta, nextUp}`).

**QOTD authoring gate:** `POST /api/qotd` is `CORE_MEMBER+`, but **non-admin authors can only PROPOSE** — `resolveQotdPublishState` ([utils/qotdAuthoring.ts](apps/api/src/utils/qotdAuthoring.ts), unit-tested) forces `isPublished:false` + `publishAt:null` (a draft the auto-publish scheduler never arms), audit action `QOTD_PROPOSED`. Admins keep full publish/schedule control. Mirrors the problems non-admin-draft pattern; fails closed. Admins review proposals in the **Problems hub → Proposals tab** and publish/reject them there.

---

## Competition Rounds System

Two types: `IMAGE_TARGET` (code buffer + autosave) and `DSA` (problem-linked).

- **In-memory timer:** `activeTimers Map<roundId, NodeJS.Timeout>` auto-locks at `duration` elapsed past `startedAt`. Armed on `start`, cleared on `lock`/`finish`/`delete`.
- **Boot recovery:** `recoverActiveRounds()` re-arms ACTIVE timers; immediately locks rounds whose deadline already passed during downtime → free-tier sleeps are safe.
- **Participant scope:** `ALL` accepts every registered team/user; `SELECTED_TEAMS` restricts to `allowedTeamIds`. `leadersOnly=true` further restricts submissions to team leader.
- **Feature gate:** non-admins 404 when `Settings.competitionEnabled !== true`.
- **Rate limits:** save 12/min, submit 5/min, user-keyed.
- **DSA submissions** go to `ProblemSubmission` (contextType=`CONTEST`, contextKey=round.id). Judged by judge. **Contestant entry (Phase D arena):** `CompetitionSolvePage`/AdminCompetition/Coding-hub link to `/competition/:roundId/solve/:problemId`, which redirects to the playground **Contest Arena** at `/contest/:roundId` (optional `?problem=` preselect) — [apps/playground/src/pages/ContestArenaPage.tsx](apps/playground/src/pages/ContestArenaPage.tsx). The arena lists all round problems (difficulty, weight share %, best score, verdict), hosts `QOTDSolverShell` for the selected problem in a **CONTEST** `QOTDSolverContext` (`contextKey=roundId`, submit gated on round `ACTIVE` + proctor lock), shows a server-authoritative timer + live round score, and runs the proctor engine (**lock-only for DSA** — a draft is preserved locally, so it locks rather than force-submitting broken code; IMAGE_TARGET still auto-submits-then-locks). Run/submit go through `/api/problems/:id/{run,submit}` in the contest context. (The legacy single-problem `?contest=<roundId>&problem=<id>` handler on `PlaygroundPage` still works as a fallback.) `POST /api/competition/:roundId/save` and `/submit` **reject DSA rounds (400)** — those endpoints + `CompetitionSubmission`/`CompetitionAutoSave` serve IMAGE_TARGET only; DSA submits exclusively through the Problems judge.
- **IMAGE_TARGET autosave** writes `CompetitionAutoSave`; final submissions in `CompetitionSubmission` (solved in the playground build editor at `/competition/:roundId`). Auto-lock can convert latest autosaves to `isAutoSubmit=true` submissions.
- **Finish + ranks:** IMAGE_TARGET requires scored submissions in judging; DSA can finish directly from LOCKED/JUDGING. Ranks are auto-computed from scores (standard 1224) by `recomputeRoundRanks()` — invoked on finish **and** when `PATCH /score/:submissionId` corrects a score on an already-FINISHED round (so stored `rank` never drifts out of sync with `score`). An explicit `rank` in the score payload is honored and skips the recompute (manual-override escape hatch). The pure 1224 ranking lives in [utils/competitionRanks.ts](apps/api/src/utils/competitionRanks.ts) (`computeRanksFromScores`, unit-tested in [competitionRanks.test.ts](apps/api/src/utils/competitionRanks.test.ts)); `recomputeRoundRanks` owns the query ordering + the set-based `unnest` write.

### Endpoints (`/api/competition/*`)
POST (Admin create) · GET `/event/:eventId` (optional auth — admin sees all, public sees metadata) · GET `/event/:eventId/results-summary` (Admin, cert flow) · GET `/:roundId` (User) · PATCH `/start|lock|judging|finish` (Admin) · POST `/save` (User, rate-limited) · POST `/submit` (User, rate-limited; idempotent per `[roundId,userId]`) · GET `/my-submission` (User) · GET `/submissions` (Admin) · PATCH `/score/:submissionId` (Admin) · GET `/results/export` (Admin, ExcelJS) · GET `/results` (public when FINISHED) · POST `/publish-as-practice` · POST `/raise-cap` · PUT/DELETE round (Admin, cascades). **Proctoring (Phase C):** `POST /:roundId/proctor/violation` (User — records a `CompetitionViolation` + locks the participant on a proctored live round; the client force-submits its draft first), `POST /:roundId/proctor/heartbeat` (User — `lastSeenAt` + returns lock state; the arena's lock poll), `GET /:roundId/proctor/me` (User — self lock state), `POST /:roundId/proctor/unlock/:userId` (Admin — release the lock, audited). **Lock enforcement:** IMAGE_TARGET `/save`+`/submit` and the DSA run/submit path (`validateProblemContext` CONTEST branch, gated on `requireActiveContest` so the read-only problem view isn't blocked) reject a locked participant with 403. Client engine: `useProctor` ([apps/playground/src/hooks/useProctor.ts](apps/playground/src/hooks/useProctor.ts)) — visibilitychange + window-blur (ignores focus into our preview iframe) → 10s away → auto-submit then violation → locked overlay; heartbeat re-arms on admin unlock. **Live monitor / leaderboard / clarifications (Phase E, polling — no socket):** `GET /:roundId/leaderboard` (User registered — live DSA board via shared `buildDsaLeaderboard`; non-admins get a full freeze `{frozen:true}` in the final `leaderboardFreezeMinutes`; admins always live), `GET /:roundId/clarifications` (User), `POST /:roundId/clarifications` (Admin broadcast), `GET /:roundId/monitor` (Admin — participants merged from `CompetitionParticipantState` (online via `lastSeenAt`, lock, violations) + DSA score, plus a recent-submission feed). Admin UI: `CompetitionMonitor` ([apps/web/src/pages/admin/CompetitionMonitor.tsx](apps/web/src/pages/admin/CompetitionMonitor.tsx), route `/admin/competition/:roundId/monitor`, "Monitor" button on ACTIVE rounds) — participant table with unlock, clarification broadcaster, submission feed (polls 8s active). Arena adds Leaderboard + Clarifications tabs (poll while ACTIVE).

### Frontend
`AdminCompetition` (`/admin/competition`) — round editor also configures the redesign settings: ranking model (BEST_SCORE/ICPC), event-final weight, leaderboard freeze minutes, proctored toggle, and **difficulty-seeded per-problem weights** (Easy 100 · Medium 200 · Hard 300, editable, with a live normalized-share % preview). `POST`/`PUT /competition` accept these (`finalWeight`, `proctored`, `penaltyModel`, `leaderboardFreezeMinutes`, `difficultyWeights`, per-problem `points`). · `CompetitionJudge` (`/admin/competition/:roundId/judge`) · `CompetitionSolvePage` (`/competition/:roundId/solve/:problemId`, DSA) · `CompetitionResults` (`/competition/:roundId/results`) · `EventCertificateWizard` consumes `getCompetitionResultsSummary()` to bulk-issue WINNER certs via `competitionCertificateUtils.ts`.

---

## Polls System

Single/multi-select polls with deadlines, anonymous voting, per-user feedback.

- Anonymous polls strip identifiers from public payloads; admin exports still resolve identities.
- `allowVoteChange=true` → vote handler deletes prior `PollVoteSelection` rows in same txn as new selection writes.
- `PollFeedback` unique `[pollId,userId]` — resubmit overwrites.

Endpoints: `GET /api/polls` (optional auth) · `GET /:idOrSlug` · `POST /:idOrSlug/vote` · `POST /:idOrSlug/feedback` · `GET /admin/public-view` · `GET /admin/public-view/:id` · POST/PUT/DELETE (Admin) · `GET /:id/admin/export.xlsx`.

Frontend: `PollDetailPage` (`/polls/:slug`) · `AdminPublicView` (`/admin/public-view`).

---

## Team Registration System

Event-level toggle (`teamRegistration` + `teamMinSize/teamMaxSize` 1-10). Leader creates → auto-registered → gets 8-char hex invite code. Members join via code → auto-registered. Solo registration blocked for team events.

- **Serializable txn + 3 retries** with jittered exponential backoff (50ms × 2^attempt + jitter) for P2034.
- **Atomic capacity check** inside txn (filters `registrationType=PARTICIPANT`).
- **maxEventsPerUser (L2):** every PARTICIPANT intake (solo register, team create, team join) calls `assertWithinActiveEventLimitInTx` ([apps/api/src/utils/registrationIntake.ts](apps/api/src/utils/registrationIntake.ts)) inside its serializable txn — counts the caller's PARTICIPANT registrations on UPCOMING/ONGOING events (guests exempt, PAST events free their slots; limit <1 disables the check). Guest-invitation accept deliberately exempt.
- **Leader deletion guard:** `onDelete: Restrict` on `EventTeam.leaderId`.
- **Cannot change `teamRegistration` mode** once event has registrations.
- **Dissolve** cascades: deletes members + their registrations in one txn.

Endpoints (`/api/teams/*`): `/create` POST (User) · `/join` POST (User, 15/15min) · `/my-team/:eventId` GET · `/:teamId/lock` PATCH (leader) · `/:teamId/members/:userId` DELETE (leader) · `/:teamId/leave` POST · `/:teamId/transfer-leadership` POST · `/:teamId/dissolve` DELETE · `/event/:eventId` GET (Admin) · `/:teamId/admin-lock` PATCH (Admin) · `/:teamId/admin-dissolve` DELETE (Admin) · `/my-all` GET (Dashboard v2).

Components: `TeamCreateModal`, `TeamJoinModal`, `TeamDashboard` (`apps/web/src/components/teams/`).

---

## Invitation System

Guests/speakers/judges/alumni invited via verified NetworkProfile users or raw email → accept creates `EventRegistration` with `registrationType=GUEST` → existing attendance/QR/quiz/cert pipelines take over.

- **Capacity-safe:** participant counts filter `PARTICIPANT`; guests never consume seats.
- **Expiry derived at read time:** `status==PENDING && event.endDate<now` → `EXPIRED`. Not persisted.
- **Email-only claim flow:** raw-email invitees get signed JWT → `/join-our-network?invitation=<token>`. After signup, claim attaches invitation to user.
- **Revoke transactional:** revoking ACCEPTED deletes linked guest registration in same txn.
- **Accept:** serializable txn, 3 retries (same backoff as registration).
- **Email guard:** `Settings.emailInvitationEnabled` via `EmailService.send()` category guard.

Endpoints (`/api/invitations/*`): `/search-invitees` GET (Admin) · POST (Admin bulk) · `/event/:eventId` GET (Admin) · `/my` GET (User, derived EXPIRED) · `/claim` POST (User) · PATCH (Admin edit) · DELETE (Admin revoke) · `/:id/resend` POST (Admin) · `/:id/accept` POST (User, serializable) · `/:id/decline` POST (User).

Components: `DashboardInvitations` (`/dashboard/invitations` + `/:invitationId` deep-link) · `AdminEventInvitations` (events admin) · `ChiefGuestsStrip` (public event page) · `EventDetailPage` shows accepted guest QR ticket + dashboard CTA for pending · `EventCertificateWizard` Guests tab.

---

## Credits System

Categories: Founding, Platform, Design, Events, Content, Infrastructure, Special Thanks (+ custom).

Endpoints: `GET /api/credits` (public, `?teamMemberId=`) · `GET /:id` · POST/PUT/DELETE (Admin) · `PATCH /reorder` (Admin, bulk). Response `{ success, data }`.

Frontend: `CreditsPage` (`/credits`) · `AdminCredits` (`/admin/credits`).

---

## Email Notification Control System

All guards inside `EmailService.send()`/`sendBulk()`. Order: settings (5-min cache, stale fallback, default all-enabled) → category toggle → testing mode → Brevo send.

| Category | Setting | Methods | Callers |
|---|---|---|---|
| `welcome` | `emailWelcomeEnabled` | `sendWelcome` | auth.ts, passport.ts |
| `event_creation` | `emailEventCreationEnabled` | `sendNewEventToAll`, `sendRegistrationOpens` (S-01), `sendEventUpdate` (S-11 change/cancel), `sendEventFeedback` (S-10) | events.ts, scheduler.ts |
| `registration` | `emailRegistrationEnabled` | `sendEventRegistration` | registrations.ts |
| `announcement` | `emailAnnouncementEnabled` | `sendAnnouncementToAll` | announcements.ts |
| `certificate` | `emailCertificateEnabled` | `sendCertificateIssued` | certificates.ts |
| `reminder` | `emailReminderEnabled` | `sendEventReminder` | scheduler.ts |
| `invitation` | `emailInvitationEnabled` | `sendEventInvitation`, `sendEventInvitationWithdrawn` | invitations.ts |
| `password_reset` | `emailPasswordResetEnabled` | `sendPasswordReset` | users.ts |
| `admin_mail` | `mailingEnabled` | `sendBulk` | mail.ts |
| `other` | none (always on) | raw `send()` | attendance/hiring/network |

**Testing mode:** when on, redirects to `emailTestRecipients` (comma-list) with `[TEST]` subject prefix + yellow debug banner. No recipients → all suppressed + logged. Cache: `getNotificationSettings()` keeps **no TTL'd cache of its own** — it `projectNotificationSettings()`s the email-shaped view off the single in-process `getCachedSettings()` (5-min TTL, `utils/settingsCache.ts`), so `invalidateSettingsCache()` (called on every settings PUT/PATCH) is the one invalidation. `invalidateNotificationSettingsCache()` is a back-compat alias that delegates to it. **Degraded-read fallback:** `getCachedSettings()` returns `null` on a transient DB error **and** in a schema-drift window (it SELECTs the whole Settings row, so a not-yet-migrated column fails the read). Mapping that `null` straight to defaults would re-open admin-disabled categories + flip `emailTestingMode` off mid-outage (real mail escaping the test redirect), so `getNotificationSettings` holds a **sticky last-known-good** projection and serves it when the read fails (`resolveNotificationSettings`, pure + unit-tested). **Cold-start-in-drift corner:** the sticky cache needs one good read to seed it, so a first read landing inside a drift window has nothing sticky and would concede to defaults — before doing so, `readNotificationColumns()` does a **narrow SELECT over only the email columns** (can't trip a drift on an unrelated column, the way the pre-cache code never selected them) and seeds the sticky cache from it; only a real DB outage (the narrow read also throws) falls through to the all-enabled defaults.

---

## Certificate System

PDF via `@react-pdf/renderer` in [apps/api/src/utils/generateCertificatePDF.ts](apps/api/src/utils/generateCertificatePDF.ts). A4 Landscape (841.89×595.28 pt), maroon/gold.

**Fonts** (`apps/api/public/logos/`): `GreatVibes.ttf` (cursive fallback) · `Cinzel` 400+700 (headings) · `CormorantGaramond` regular+italic (body) · `PlayfairDisplay-Bold` (recipient name). `initFonts()` runs automatically.

**`CertData`:** `recipientName, eventName, type, position?, domain?, description?, certId, issuedAt, signatoryName, signatoryTitle?, signatoryImageUrl?, facultyName?, facultyTitle?, facultySignatoryImageUrl?, codescrietLogoUrl?, ccsuLogoUrl?`. `formatPosition()` "1"/"1st" → "First Place". QR links `FRONTEND_URL/verify/:certId`. Uploaded to Cloudinary → `Certificate.pdfUrl`. Public verify: `GET /api/certificates/verify/:code` (increments `viewCount`, **does not expose `pdfUrl`**).

### Dual signature (per slot: primary + faculty)
1. **Signature image (preferred):** `processSignatureImage()` ([apps/api/src/utils/processSignatureImage.ts](apps/api/src/utils/processSignatureImage.ts)) — fetch (URL or data URI) → EXIF rotate → grayscale + normalise → median filter 3px → sharpen σ=1.2 → dark-bg detection (auto-invert) → adaptive threshold (`mean*0.65` clamped [100,200]) → per-pixel alpha (ink opaque, bg transparent) → trim + resize ≤200×70px → base64 PNG. 3MB base64 size limit. Failure → undefined → text fallback.
2. **Typed name fallback:** GreatVibes 28pt.

`resolveSignatory()` (in [apps/api/src/utils/certificateIssuance.ts](apps/api/src/utils/certificateIssuance.ts)) fetches Signatory by ID, processes once per generate/bulk request (not per recipient). Custom signatories use `signatoryCustomImageUrl`/`facultyCustomImageUrl`.

### Issuance module ([utils/certificateIssuance.ts](apps/api/src/utils/certificateIssuance.ts))
Issuance is a module, not route-inlined — `routes/certificates.ts` is the HTTP adapter. `renderAndUploadCertificatePdf(source, opts)` is the **single render+upload seam**: it owns `buildCertData` (the one place a `CertData` payload is assembled + sanitized + logo-stamped) → `generateCertificatePDF` → `uploadCertificate`. The three flows that produce a PDF — `issueOneCertificate` (new issuance, certId-collision retry), `recoverMissingCertificateCloudAsset` (regen for a missing cloud asset), and the edit-regenerate endpoint — all go through it, so the mapping can't drift. `buildCertData` is unit-tested ([certificateIssuance.test.ts](apps/api/src/utils/certificateIssuance.test.ts)). **Schema-fallback writers + collision/drift predicates + the tolerant `readCertificateTeamName` reader live in [utils/certificatePersistence.ts](apps/api/src/utils/certificatePersistence.ts)** (shared by issuance *and* the edit/revoke/delete endpoints — not issuance-only). **`teamName` persistence (resolved):** `Certificate.teamName` (`team_name`, migration `20260619000000`) stores a WINNER team cert's team name so regeneration restores it. Non-mandatory by design — issuance writes it via the schema-fallback's *full* payload only (legacy fallback omits it), and recover/edit-regenerate read it via `readCertificateTeamName` which returns `null` on P2022, so an un-migrated instance keeps working (just without team-name restoration).

**Layout:** signature 190pt wide, 58pt from bottom; image 150×50pt centered; text GreatVibes 28pt centered; below: HR + name in Cinzel 11pt caps + title in CormorantGaramond 12pt italic. Primary left (78pt from left), faculty right (78pt from right).

---

## Dashboard v2 (May 2026)

Spec: `tmp/design_bundle/code-scriet-innerdashboard/`. Scoped to `[data-dashboard]` — public site unaffected.

- **Tokens:** rust-accent CSS vars (`--bg-canvas/sunken/raised`, `--ds-text-1/2/3`, `--accent`, semantic + role pills, shadows, motion) in `apps/web/src/index.css` under `[data-dashboard]`. Public site keeps `--background/--foreground`. Shadcn HSL bridge (`--primary`, `--ring`, …) overridden in scope.
- **Fonts:** Geist + Geist Mono in `apps/web/index.html`, applied inside `[data-dashboard]` only. Public pages still *render* on Outfit/Sora, but `index.html` currently loads **both** public stacks (Outfit/Sora *and* Newsreader/Inter Tight/JetBrains Mono) — see the W3 note in Hard rules below.
- **Accent picker:** `Settings.accentColor` (default `rust`, values `rust|teal|indigo|violet|mint|mono`). Admin picks in `BrandAccentCard` → `PATCH /api/settings/accentColor` → sets `data-accent` on every `[data-dashboard]`.
- **Density/motion:** `data-density="compact"` and `data-motion="reduced"` attrs supported, currently `regular`/`normal`.
- **Solve flow is playground-only.** Never add Monaco to the main web app. `QOTDSolvePage`/`CompetitionSolvePage` redirect to playground with `?qotd=<date>` or the Contest Arena `/contest/:roundId` (DSA) / `/competition/:roundId` build editor (IMAGE_TARGET) + one-time auth handoff in URL hash.

### New DB
`User.notificationsReadAt` (single read cutoff for bell — items older than cutoff are 'read', avoids per-notification join) · `User.streakCardUrl` (S-03 streak-share — Cloudinary URL of the latest generated card, served as og:image of `/share/streak/:id`; migration `20260618000400_user_streak_card`, additive/idempotent) · `Settings.accentColor` · `UploadedImage` (written best-effort fire-and-forget by `POST /api/upload/image`, cascade with User).

Migration: `prisma/migrations/20260517210000_dashboard_v2/migration.sql` (additive).

### New endpoints
`apps/api/src/routes/notifications.ts` → `GET /api/notifications` (aggregates invitations + certs + quiz + audit, grouped) + `POST /mark-read` (updates `User.notificationsReadAt`). `apps/api/src/routes/search.ts` → `GET /api/search/global?q=...` (5 hits each across pages/events/problems/polls/people/announcements; role-aware; capped; expired announcements excluded). `/api/problems/me/recent` · `/api/problems/admin/cap-requests/:counterId/{grant,deny}`. `/api/qotd/leaderboard/around-me` (rank ± window via `RANK() OVER ()` CTE). `/api/teams/my-all`. `/api/upload/history?limit=24`. `/api/stats/dashboard` (admin) → 12-tile `insights`: total users + Δ, active/upcoming events, pending invitations, certs this month, live scans · 1h, quiz sessions · 7d, registration funnel, avg + max streak, AC rate · 7d, top contributor, network-pending, playground daily-quota pressure. **S-03 streak share:** `POST /api/upload/streak-card` (any authed user — uploads the card to the dedicated `streak-cards/` Cloudinary folder, **no** UploadedImage gallery row) · `POST /api/users/me/streak-card` (User — persist the user's own card URL; validated to an https Cloudinary host to stop og:image injection; also destroys the previous card asset + any legacy gallery row so storage stays ~1/user) · `GET /api/qotd/history/summary` (optional auth → `{totalPublished, solved, left}` for the "Full history" header) · root `GET /share/streak/:userId` (public OG-image page, see API Routes table). `GET /api/users/:id/full` (admin) now also returns `coding {totalSubmissions, accepted, acRate, qotdSolved}` + `contentCreated {events, announcements, quizzes, qotds, problems, problemSheets, polls}` + extra `counts` (invitationsReceived/Sent, uploadedImages) for the richer admin user-detail panel.

### New socket namespace
`/notifications`, auth required. Clients join `user:<id>` on connect.
| Event | Audience | Emit site |
|---|---|---|
| `invitation:received` | room (recipient) | invitations.ts send flow |
| `certificate:issued` | room (recipient) | certificates.ts generate + bulk |
| `quiz:starting` | broadcast | quizRouter.ts `POST /:quizId/open` |

### Frontend shell
- [DashboardLayout.tsx](apps/web/src/components/dashboard/DashboardLayout.tsx) — sidebar 244px exp / 60px collapsed (localStorage), brand dot, search shortcut, role-aware sections, "Coding" with sub-items (Practice/QOTD/Competitions/Leaderboard/Playground), user card + sign-out. Topbar 56px frosted: breadcrumb + Cmd+K + theme + bell + avatar. Mobile drawer + bottom-tab. Desktop collapse toggle next to breadcrumb.
- [CommandPalette.tsx](apps/web/src/components/dashboard/CommandPalette.tsx) — Cmd/Ctrl+K, debounced `/api/search/global`. Sections: Pages/Events/Problems/Polls/Announcements/People/Actions.
- [NotifMenu.tsx](apps/web/src/components/dashboard/NotifMenu.tsx) — bell popover, All/Unread tabs, refetch every 30s when open, "Mark all as read".

### Design primitives (apps/web/src/components/dash/)
`Pill` (tones neutral/accent/success/warning/danger/info + 6 role tones; `roleTone()` helper) · `KBD` · `MonoChip` · `Difficulty` (EASY/MEDIUM/HARD locked colors) · `CountdownPill` (`.live-dot` pulse) · `StatTile` (label+value+delta+sparkline slot) · `Banner` · `EmptyState` · `ProgressBar` · `SegmentedTabs` (pill) · `UnderlineTabs` · `Avatar` (deterministic-hue initials + status dot) · `Field` · `IconButton` (ghost/soft/border) · `DSCard` (padded/hover, polymorphic `as`) · `Section`/`SectionHead`/`Divider`. Shadcn primitives re-skinned via HSL bridge.

### Pages rewritten
`DashboardOverview` — flat typography-led, dynamic IST greeting, USER/NETWORK/ADMIN variants (admin prepends `AdminStatStrip` + `AdminPendingRequestsCard`). Sections: QOTDHero (streak ring), StatsRow, MyEvents, ReadUp, Standing (rank±2), MyCode, Earned, HiringStatus. `DashboardCoding` — 5 tabs: Practice/QOTD/Competitions/Leaderboard/Playground (every Solve opens playground in new tab). `AdminSettings` adds `BrandAccentCard`.

### Hard rules (Dashboard v2)
- Layout wraps in `<div data-dashboard data-accent={settings.accentColor || 'rust'} data-density data-motion>`. Anything needing new tokens MUST render inside this scope.
- Public pages render on Outfit/Sora + amber, **but the public site is frozen mid-design-migration (audit W3):** `Layout.tsx` wraps every public page in `[data-public]`, `index.css` carries a full parallel cream/ink/ember + Newsreader token system (`--pub-*`), and only `AchievementsPage` consumes it. Finishing or excising that migration is **owner-deferred** — do not extend either public system to more pages, delete the `[data-public]` block, or change the font loads without an explicit owner decision. **Don't move styles across scopes either direction.**
- Solve flow is playground-only — never add Monaco to the main web app.

---

## Playground Architecture

- Frontend: React app at `code.codescriet.dev` (separate Vite).
- Execute server: `apps/playground/execute-server.js` (plain JS, port 5002). Proxies CF Worker → admin-selected provider (`Settings.codeExecutionProvider`, 60s cache, forwarded as `body.provider`). Python: Pyodide (browser, no server call). Daily limits via `Settings.playgroundDailyLimit` (default 100/day). Tables: `PlaygroundDailyUsage`, `PlaygroundLimitReset`, `PlaygroundLimitResetRequest`.
- **Upstream-capacity retry:** Wandbox host-capacity failures (`isInfraFailure()` / `OCI runtime`/`crun`/`Resource temporarily unavailable`) are detected in `executeCode()` and thrown as a tagged `EXEC_INFRA_UNAVAILABLE`; `executeWithRetry()` retries up to 3× with backoff (transient → almost always succeeds), and a persistent failure returns a friendly **503** "service briefly at capacity, try again" instead of a bogus compile error. Infra failures are never cached.

### Execution Resilience (admin-selectable provider + worker fallback chain)
- **Why:** Wandbox is a single-host free service with no SLA; it periodically fails host-side for **every language** with `OCI runtime error: crun: clone: Resource temporarily unavailable` (clone/fork `EAGAIN`, status 126) even on trivial programs — verified by direct `curl` to `wandbox.org`, i.e. nothing on our side can fix it.
- **Admin-selectable primary:** `Settings.codeExecutionProvider` (`wandbox` | `godbolt`, default `wandbox`). The admin picks it in Admin → Settings (`CodeExecutionCard` → `PATCH /api/settings/codeExecutionProvider`). Both server callers forward it to the worker as `body.provider`: the API judge reads it from `getCachedSettings()` (5-min, instant on invalidation) in [codeJudge.ts](apps/api/src/utils/codeJudge.ts); the playground reads it from a 60s `providerCache` (own query, decoupled from the daily-limit read) in [execute-server.js](apps/playground/execute-server.js). Default `wandbox` keeps old callers working pre-rollout.
- **Worker chain (`workers/executor.js`):** `runWithChain(body)` tries `body.provider` first, then the other provider, **only falling through on an infra failure** (`isInfraFailure(result, provider)` — the status-126 rule is Wandbox-only; both use `INFRA_FAILURE_RE`). A legit compile/runtime error from the chosen provider is returned as-is (never retried on the other host). Each provider's response is mapped **onto Wandbox field names** (`program_output`/`compiler_error`/`status`…) so neither `codeJudge.ts` nor `execute-server.js` changes its parsing. godbolt (Compiler Explorer, `godbolt.org/api/compiler/<id>/compile`, `executorRequest:true`) maps `cpython→python312`, `gcc-*-c→cg132` (C, checked before C++), `gcc-*/clang/++→g132` (`-std=c++17 -DONLINE_JUDGE`), `openjdk/java→java2202`; its ANSI diagnostics are stripped; `signal` stays `''` for a clean run (`codeJudge.ts` treats any non-empty signal as a global TLE) and becomes `SIGKILL` only on godbolt's `timedOut` (its 20s exec cap = global TLE).
- **⚠️ JS/Node has no fallback:** godbolt **cannot execute** JavaScript/Node or TypeScript (it's a compiler tool, no JS runtime), so `godboltCompiler()` returns `null` for them and the chain skips godbolt. JS therefore runs on **Wandbox only** — during a Wandbox outage JS execution fails with the graceful "temporarily unavailable" message. Python / C / C++ / Java get the full Wandbox↔godbolt chain. (The previous JS-capable third-party fallback was removed entirely; godbolt is the only fallback now.)
- **Deploy:** the worker is NOT in CI — it's pasted/`wrangler deploy`d to Cloudflare manually. The godbolt support + provider handling are inert until that manual deploy. Flipping the *setting* afterward needs no redeploy (the worker reads `body.provider` per request).
- Users request same-day reset → admin grant/deny in dashboard `AdminPendingRequestsCard` → grant calls `resetDailyQuotaAndPracticeCounters()`.
- Pre-flight `isUserBlocked(userId, 'QUIZ')` (and feature-equivalent) in `POST /api/execute`, fail-opens on pre-migration `42P01`.
- Shares JWT secret with main API, reads `scriet_session` cookie.

---

## Critical Patterns (always relevant)

- **ESM imports:** All API TS files use `.js` extension on relative imports.
- **Auth in routes:** `authMiddleware` → `requireRole('X')` → `getAuthUser(req)`.
- **Neon cold-start retry:** `withRetry()` in [apps/api/src/lib/prisma.ts](apps/api/src/lib/prisma.ts) — retries P1002/P2024 with exponential backoff + jitter.
- **Serializable txns:** Event registration / invitation accept / team create+join use serializable + 3 retries with jittered exp backoff (50ms × 2^attempt + jitter) on P2034.
- **Atomic attendance:** `updateMany({ where: { id, attended: false } })`. `count === 0` = duplicate. Never check-then-update (TOCTOU race).
- **Reservation-based email dedup:** Scheduler marks `reminderSentAt` before sending; rolls back on send failure.
- **DB keep-alive:** Opt-in (`ENABLE_DB_KEEPALIVE=true`, interval `DB_KEEPALIVE_INTERVAL_MS` default 240000). Off by default.
- **Schedulers:** Default ON in production, OFF in development; `ENABLE_BACKGROUND_SCHEDULERS=true/false` overrides. **Event-status + QOTD auto-publish are event-driven** (in-memory timers that sleep until the next exact boundary; re-tuned on writes, re-hydrated on boot) — no fixed-interval polling, so the DB stays asleep between actual transitions. Event reminders still poll every 6h. `EVENT_STATUS_INTERVAL_MS` is no longer used (event-status sleeps until the next event boundary instead).
- **Email template cache:** 5-min TTL; stale fallback on DB error (prevents blank emails).
- **Sanitize HTML input:** `sanitizeHtml()`/`sanitizeMarkdown()`/`sanitizeText()` from [apps/api/src/utils/sanitize.ts](apps/api/src/utils/sanitize.ts). Backed by **`sanitize-html`** (F1 — consolidated onto the one lib that also powers the mail policy; `isomorphic-dompurify` dropped). Allowlist-based, equal-or-stricter than the old DOMPurify config (it additionally strips `data:` images + protocol-relative URLs). `escapeHtml()` for entity-escaping interpolations (sanitizers strip tags but don't escape entities).
- **Audit log:** `auditLog(userId, action, entity, entityId, metadata)` on all admin mutations.
- **Response shape:** `ApiResponse.success()`/`error()`. Frontend `api.ts` unwraps `.data`.
- **Logger:** `logger` from [apps/api/src/utils/logger.ts](apps/api/src/utils/logger.ts). Never `console.log`.
- **State mgmt:** React Query for server state. Zustand only for quiz UI cross-component sync. **Don't add new Zustand stores.**
- **Force logout via tokenVersion:** Every JWT carries `tokenVersion`; `authMiddleware` rejects when DB > claim. Legacy tokens default claim 0.
- **User feature blocks:** `prisma.userBlock` + `requireNotBlocked(feature)` ([apps/api/src/middleware/blocks.ts](apps/api/src/middleware/blocks.ts)) gates EVENT/PLAYGROUND/QOTD/QUIZ/NETWORK. Lazy expiry — no sweep job. Playground has equivalent pre-flight fail-opening on `42P01`.
- **Soft delete + restore:** `DELETE /api/users/:id` sets `isDeleted=true`, increments `tokenVersion`, upserts auto-blocks. Auth rejects soft-deleted users every request. `POST /:id/restore` (SA only) reverses + deletes auto-blocks. `?hard=true` (SA only) refuses with 409 + blocker counts on `Restrict` FK conflicts; otherwise writes audit FIRST then deletes in same txn.
- **Admin login telemetry:** `lastLoginAt`/`lastLoginIp` written fire-and-forget on every login path. IP truncated 64 chars, `::ffff:` IPv4-mapped prefix stripped. IP visible only to superAdmin on `/api/users/:id/full`.
- **`/ping` is sacred** — UptimeRobot pings every 5 min to prevent free-tier spin-down. Plain text "pong", no DB. Don't rename or remove.

---

## Frontend Conventions

- React Router v7. Pages lazy-loaded.
- React Query: staleTime 5m, gcTime 30m.
- Tailwind utility classes. `cn()` from `apps/web/src/lib/utils.ts`.
- Auth/Settings/Theme via React Context (split for perf).
- Theme localStorage key: `codescriet-theme`.
- `ProtectedRoute` with `minRole` prop. `SuperAdminOrPresidentRoute` wraps `/admin/settings`.
- Frontend `api.ts` types (key): `User`, `Settings`, `Event`, `Registration`, `EventInvitation`, `EventTeam`, `Announcement`, `TeamMember`, `Achievement`, `Credit`, `Poll`, `Problem`, `ProblemSubmission`, `SubmissionResult`, `QOTDDetail`, `CompetitionRound`, `NetworkProfile`, `AuditLogEntry`, `HomePageData` + Dashboard v2 types (`NotifItem`, `NotificationsPayload`, `GlobalSearchPayload`, `RecentSubmission`, `AroundMeLeaderboard`, `MyTeamCard`, `UploadHistoryItem`, `AdminInsights`, `AdminDashboardStats`).
- Frontend 401 → throw `UnauthorizedError` → auto-logout in `api.ts`.

---

## Environment Variables

| Var | Req | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooler |
| `DIRECT_URL` | yes | Neon non-pooler (migrations) |
| `JWT_SECRET` | yes | Fail-fast on startup |
| `SUPER_ADMIN_EMAIL` | yes | Determines superAdmin |
| `SUPER_ADMIN_PASSWORD` | yes | Seed only |
| `FRONTEND_URL` | yes | CORS + redirects |
| `BACKEND_URL` | no | default localhost:5001 |
| `GOOGLE_CLIENT_ID/SECRET` | no | |
| `GITHUB_CLIENT_ID/SECRET` | no | |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | no | |
| `BREVO_API_KEY` | no | |
| `ENABLE_DEV_AUTH` | no | dev only |
| `ATTENDANCE_TOKEN_EXPIRES_IN` | no | attendance QR JWT lifetime, default `90d` |
| `ENABLE_REQUEST_LOGGING` | no | |
| `ENABLE_DB_KEEPALIVE` | no | default off |
| `LOG_IP_DIAGNOSTICS` | no | `true` logs `req.ip` vs `cf-connecting-ip` vs XFF per request (24h S2 readback, then unset) |
| `DB_KEEPALIVE_INTERVAL_MS` | no | default 240000 |
| `ENABLE_BACKGROUND_SCHEDULERS` | no | default ON in prod, OFF in dev; `true`/`false` overrides |
| `PRUNE_QUIZ_ANSWERS` | no | `true` opts QuizAnswer (> 365d) into the retention sweep; default off |
| `EVENT_STATUS_INTERVAL_MS` | no | deprecated — event-status is now event-driven (timer until next boundary), no longer polled |
| `CODE_EXECUTION_PROVIDER` | no | playground fallback when the `Settings.codeExecutionProvider` column/DB is unavailable (`wandbox`\|`godbolt`, default `wandbox`). Normal path reads the DB setting. |
| `PORT` | no | default 5001 |

---

## Deployment (Render)

4 services in `render.yaml`:
1. **codescriet-api** — Node web. Build: `npm install --include=dev && npx prisma generate --schema=./prisma/schema.prisma && npm run build --workspace=apps/api`. Start: migration resolve/deploy + `npm run start --workspace=apps/api`. Sets `ENABLE_BACKGROUND_SCHEDULERS=true` (event-status sync + event reminders + QOTD auto-publish; safe because UptimeRobot keeps the instance warm). `buildFilter` scopes deploys to `apps/api/**, prisma/**, package.json, package-lock.json` (G2 — web-only commits no longer restart the API and kill live quizzes).
2. **codescriet-web** — static. Build: `npm install && node scripts/generate-sitemap.mjs && npm run build --workspace=apps/web && node scripts/prerender.mjs` (prerenders route-specific HTML for crawlers/social cards).
3. **codescriet-playground-api** — Node (`node execute-server.js`).
4. **codescriet-playground-web** — static (`apps/playground/dist`).

Free-tier limits: 512 MB RAM, shared CPU, auto spin-down. `UptimeRobot` pings `/ping` every 5 min.

CORS: explicit allowlist `ALLOWED_CODESCRIET_ORIGINS` = codescriet.dev, www, api, code, app + `FRONTEND_URL`. Dev: localhost/127.0.0.1/LAN. Same allowlist gates CSRF middleware.

---

## Known Issues

1. Automated coverage partial (stability + utility + Playwright), not full regression.
2. Some routes use raw `res.json()` instead of `ApiResponse`.
3. `AdminEventRegistrations` makes N+1 fetches (annotated, acceptable at current scale).
4. Certificate email fire-and-forget — `emailSent` update could fail silently during restarts.
5. Some Zod schemas use `z.unknown()` for JSON fields.

Resolved (June 2026): OAuth JWT-in-URL-hash replaced by a 30s exchange code; attendance tokens carry a 90d expiry (`ATTENDANCE_TOKEN_EXPIRES_IN`). ID path-param validation swept across all routers — shared guards `requireUuid`/`requireCuid`/`isUuid`/`isCuid` in [apps/api/src/utils/idParams.ts](apps/api/src/utils/idParams.ts) reject malformed ids with a 400 before they reach Prisma (uuid PKs: most models; cuid PKs: NetworkProfile/Signatory/Certificate). `users.ts`/`quizRouter.ts`/`competition.ts`/`qotd.ts` use `router.param()` guards (shared `uuidParamGuard` factory); `attendance.ts`/`credits.ts` refactored onto the shared helper. Note: id columns are Postgres `TEXT` (no `@db.Uuid`), so malformed ids previously fell through to 404, not 500 — the guards harden input validation + response consistency and future-proof a native-uuid migration.

---

## Security Audit (March 2026) — fixes applied

CORS subdomain wildcard removed (explicit allowlist) · URL sanitization XSS (strict protocol whitelist) · IndexNow/Playground admin endpoints now `authMiddleware` · Certificate `pdfUrl` removed from public verify · CORE_MEMBER can only edit own events · Attendance blocked for PAST events · Registration token generation moved inside serializable txn · Teams leader race fixed (atomic `WHERE leaderId=user.id`) · Signature image 3MB base64 limit · Network `rejectionReason` sanitized · Mail external emails allowed · Upload server-side magic-bytes MIME check (not client mimetype) · Stack traces stripped in prod · `dev-login` returns 404 when disabled · Mail findMany capped `take:100000` · Playground reset atomicity in `$transaction()` · Frontend 401 auto-logout · `withRetry` exponential backoff with jitter · Unknown role hierarchy warns to console.

---

## File Quick Reference

| What | Path |
|---|---|
| API entry | [apps/api/src/index.ts](apps/api/src/index.ts) |
| Auth/Role/Block middleware | [apps/api/src/middleware/{auth,role,blocks}.ts](apps/api/src/middleware/auth.ts) |
| Super admin helpers | [apps/api/src/utils/superAdmin.ts](apps/api/src/utils/superAdmin.ts) |
| Prisma client + withRetry | [apps/api/src/lib/prisma.ts](apps/api/src/lib/prisma.ts) |
| JWT utils | [apps/api/src/utils/jwt.ts](apps/api/src/utils/jwt.ts) |
| Sanitize | [apps/api/src/utils/sanitize.ts](apps/api/src/utils/sanitize.ts) |
| Audit | [apps/api/src/utils/audit.ts](apps/api/src/utils/audit.ts) |
| Email service | [apps/api/src/utils/email.ts](apps/api/src/utils/email.ts) |
| Scheduler | [apps/api/src/utils/scheduler.ts](apps/api/src/utils/scheduler.ts) |
| Code judge | [apps/api/src/utils/codeJudge.ts](apps/api/src/utils/codeJudge.ts) |
| Problems core | [apps/api/src/utils/problemsCore.ts](apps/api/src/utils/problemsCore.ts) |
| Contest scoring engine | [apps/api/src/utils/contestScoring.ts](apps/api/src/utils/contestScoring.ts) |
| Rejudge queue | [apps/api/src/utils/rejudgeJobs.ts](apps/api/src/utils/rejudgeJobs.ts) |
| Daily limit | [apps/api/src/utils/dailyLimit.ts](apps/api/src/utils/dailyLimit.ts) |
| QOTD streak | [apps/api/src/utils/qotdStreak.ts](apps/api/src/utils/qotdStreak.ts) |
| Streak backfill script | [scripts/backfill-user-streaks.ts](scripts/backfill-user-streaks.ts) |
| Certificate PDF | [apps/api/src/utils/generateCertificatePDF.ts](apps/api/src/utils/generateCertificatePDF.ts) |
| Certificate issuance (render+upload seam) | [apps/api/src/utils/certificateIssuance.ts](apps/api/src/utils/certificateIssuance.ts) |
| Certificate persistence (schema-fallback writers) | [apps/api/src/utils/certificatePersistence.ts](apps/api/src/utils/certificatePersistence.ts) |
| Signature processing | [apps/api/src/utils/processSignatureImage.ts](apps/api/src/utils/processSignatureImage.ts) |
| Attendance token | [apps/api/src/utils/attendanceToken.ts](apps/api/src/utils/attendanceToken.ts) |
| Quiz socket / store | [apps/api/src/quiz/quizSocket.ts](apps/api/src/quiz/quizSocket.ts) · [quizStore.ts](apps/api/src/quiz/quizStore.ts) |
| Attendance socket | [apps/api/src/attendance/attendanceSocket.ts](apps/api/src/attendance/attendanceSocket.ts) |
| Resource routers | [apps/api/src/routes/](apps/api/src/routes/) |
| DB schema | [prisma/schema.prisma](prisma/schema.prisma) |
| Playground executor | [apps/playground/execute-server.js](apps/playground/execute-server.js) |
| CF Worker | [workers/executor.js](workers/executor.js) |
| Frontend API client | [apps/web/src/lib/api.ts](apps/web/src/lib/api.ts) |
| Frontend routes | [apps/web/src/App.tsx](apps/web/src/App.tsx) |
| Auth/Settings/Theme ctx | [apps/web/src/context/](apps/web/src/context/AuthContext.tsx) |
| Dashboard layout | [apps/web/src/components/dashboard/DashboardLayout.tsx](apps/web/src/components/dashboard/DashboardLayout.tsx) |
| Dash primitives | [apps/web/src/components/dash/](apps/web/src/components/dash/) |
| Command palette | [apps/web/src/components/dashboard/CommandPalette.tsx](apps/web/src/components/dashboard/CommandPalette.tsx) |
| Notif menu | [apps/web/src/components/dashboard/NotifMenu.tsx](apps/web/src/components/dashboard/NotifMenu.tsx) |
| Admin pending requests | [apps/web/src/components/dashboard/AdminPendingRequestsCard.tsx](apps/web/src/components/dashboard/AdminPendingRequestsCard.tsx) |
| Attendance components | [apps/web/src/components/attendance/](apps/web/src/components/attendance/) |
| Team components | [apps/web/src/components/teams/](apps/web/src/components/teams/) |
| Polls components | [apps/web/src/components/polls/](apps/web/src/components/polls/) |
| Event invitation admin | [apps/web/src/components/events/AdminEventInvitations.tsx](apps/web/src/components/events/AdminEventInvitations.tsx) |
| Admin users (list + sheet) | [apps/web/src/pages/admin/AdminUsersPage.tsx](apps/web/src/pages/admin/AdminUsersPage.tsx) |
| Admin user detail | [apps/web/src/pages/admin/UserDetailPage.tsx](apps/web/src/pages/admin/UserDetailPage.tsx) |
| User detail body | [apps/web/src/components/admin/users/UserDetailContent.tsx](apps/web/src/components/admin/users/UserDetailContent.tsx) |
| Admin perms hook | [apps/web/src/hooks/useAdminPermissions.ts](apps/web/src/hooks/useAdminPermissions.ts) |
| User detail RQ hooks | [apps/web/src/hooks/useUserDetail.ts](apps/web/src/hooks/useUserDetail.ts) |
| Quiz frontend | [apps/web/src/pages/quiz/](apps/web/src/pages/quiz/) |
| Quiz Zustand store | [apps/web/src/lib/quizStore.ts](apps/web/src/lib/quizStore.ts) |
| Quiz scoring utils | [apps/web/src/lib/quizScoring.ts](apps/web/src/lib/quizScoring.ts) |
| Quiz socket hook | [apps/web/src/hooks/useQuizSocket.ts](apps/web/src/hooks/useQuizSocket.ts) |
| Quiz timer hook | [apps/web/src/hooks/useQuizTimer.ts](apps/web/src/hooks/useQuizTimer.ts) |
| Offline scanner hook | [apps/web/src/hooks/useOfflineScanner.ts](apps/web/src/hooks/useOfflineScanner.ts) |

---

## Living Document Protocol

Single source of truth. Update **in the same commit** as the code change. Triggers:

| Trigger | Section |
|---|---|
| New route mounted | API Routes |
| New Prisma model/enum | DB Schema / Enums |
| New frontend route | Frontend route map (App.tsx ref) |
| New Socket.io event | matching system's Socket section |
| New env var | Environment Variables |
| New Hard Constraint | Hard Constraints |
| Architecture rejected | system's "Rejected proposals" |
| New npm dep | Tech Stack |
| New quiz UI / attendance feature / problems behavior / competition status / poll behavior / team rule / email category | matching system section + File Quick Reference |

**Staleness:** Annotate `> WARNING: STALE — last verified YYYY-MM-DD.` beneath the section heading.

**Sync rule:** If docs and code contradict, **the code wins** — update the doc. Never leave aspirational claims as present fact.
