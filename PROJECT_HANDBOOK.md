# PROJECT HANDBOOK — Code.Scriet Club Platform

Last updated: 2026-02-19  
Audience: AI coding agents and developers who need end-to-end project context

---

## 1) What this project is

Code.Scriet Club Platform is a monorepo web system for running a technical club.

It includes:
- Public club website (events, announcements, achievements, team)
- Member dashboard (profile, registrations, QOTD, announcements)
- Admin panel (users, settings, hiring, event registrations, team, achievements)
- API backend with JWT + OAuth auth, Prisma/PostgreSQL, Socket.io, email notifications, and scheduled reminder jobs

Core objective: manage club operations from one platform with feature flags so admins can enable/disable modules without redeploying.

---

## 2) Monorepo structure

```txt
club_site/
├── apps/
│   ├── api/                 # Express + TypeScript backend
│   └── web/                 # React + Vite + TypeScript frontend
├── packages/
│   └── auth/                # Built package output currently in dist/
├── prisma/
│   ├── schema.prisma        # Canonical DB schema
│   ├── seed.ts              # Seed data
│   └── migrations/          # Migration history
├── PROJECT_HANDBOOK.md      # This document
├── claude.md                # High-level quick reference
└── package.json             # Workspace orchestration
```

Workspace config (root `package.json`):
- npm workspaces: `apps/*`, `packages/*`
- Root scripts orchestrate both apps and Prisma lifecycle

---

## 3) Tech stack

### Frontend (`apps/web`)
- React 19 + TypeScript + Vite
- Tailwind CSS + shadcn/ui primitives
- React Router v7
- TanStack Query
- React Hook Form + Zod
- Framer Motion
- Socket.io client

### Backend (`apps/api`)
- Express + TypeScript (ESM)
- Prisma ORM + PostgreSQL
- Passport (Google/GitHub OAuth), JWT for API auth
- Helmet, CORS, express-rate-limit
- Zod validation
- Excel export (`exceljs`, `xlsx`)
- Email delivery + templating (Brevo flow in `utils/email.ts`)
- Reminder scheduler for upcoming events

---

## 4) How the system boots and runs

### Backend runtime path (`apps/api/src/index.ts`)
1. Loads env via `dotenv`
2. Configures middleware (helmet, CORS, JSON, logging, rate limits)
3. Initializes Passport
4. Mounts root health/SEO endpoints and `/api/*` routes
5. Initializes DB and announcement slug backfill helpers
6. Starts event reminder scheduler
7. Starts HTTP server and Socket.io

### Frontend runtime path (`apps/web/src/App.tsx`)
Provider composition:
- `QueryClientProvider`
- `SocketProvider`
- `AuthProvider`
- `SettingsProvider`
- `Router`

Routes are lazy loaded and role-protected using `ProtectedRoute` for dashboard/admin branches.

---

## 4.1) Architecture diagram (quick scan)

```mermaid
flowchart TB
	subgraph Users[User Types]
		PU[Public Visitor]
		AU[Authenticated User]
		AD[Admin]
	end

	subgraph Web[apps/web React + Vite]
		W1[Public Pages]
		W2[Dashboard Pages]
		W3[Admin Pages]
		WC[Context Layer\nAuth + Settings + Socket]
		APIClient[lib/api.ts]
	end

	subgraph API[apps/api Express]
		R1[/auth + users + settings]
		R2[/events + registrations]
		R3[/announcements + achievements + team]
		R4[/hiring + qotd + stats + upload]
		MW[Middleware\nauth, role, cors, rate-limit, helmet]
		SCHED[Reminder Scheduler]
		EMAIL[Email Service]
		SOCK[Socket.io Server]
	end

	subgraph Data[Data Layer]
		DB[(PostgreSQL)]
		PR[Prisma Client]
		SET[(Settings Singleton)]
	end

	PU --> W1
	AU --> W1
	AU --> W2
	AD --> W3

	W1 --> WC
	W2 --> WC
	W3 --> WC
	WC --> APIClient
	APIClient --> MW
	MW --> R1
	MW --> R2
	MW --> R3
	MW --> R4

	R1 --> PR
	R2 --> PR
	R3 --> PR
	R4 --> PR
	PR --> DB
	PR --> SET

	SCHED --> R2
	SCHED --> EMAIL
	EMAIL --> SET
	SOCK --- WC
```

How to read this quickly:
- Web app sends all server calls through `lib/api.ts` into guarded API routes.
- API routes use Prisma to read/write PostgreSQL and `Settings` feature toggles.
- Background services (scheduler/email/socket) are backend-native and depend on the same data model.

---

## 5) Current route map

### API route modules (mounted in `apps/api/src/index.ts`)
- `/api/auth`
- `/api/events`
- `/api/registrations`
- `/api/announcements`
- `/api/team`
- `/api/achievements`
- `/api/qotd`
- `/api/users`
- `/api/stats`
- `/api/settings`
- `/api/hiring`
- `/api/upload`
- root-level SEO: `/sitemap.xml`, `/robots.txt`

### Web route branches (`apps/web/src/App.tsx`)
Public:
- `/`, `/about`, `/events`, `/events/:id`
- `/announcements`, `/announcements/:id`
- `/team`, `/achievements`, `/achievements/:id`
- `/signin`, `/signup`, `/join-us`, `/auth/callback`

Protected user (`minRole=USER`):
- `/dashboard` + child routes (`events`, `announcements`, `leaderboard`, `events/new`, `announcements/new`, `qotd`, `upload`, `profile`)

Protected admin (`minRole=ADMIN`):
- `/admin/users`, `/admin/team`, `/admin/achievements`, `/admin/event-registrations`, `/admin/events/:id/edit`, `/admin/hiring`, `/admin/settings`

---

## 6) Data model (Prisma) — source of truth

Primary models in `prisma/schema.prisma`:
- `User`
- `Settings`
- `Event`
- `EventRegistration`
- `Announcement`
- `TeamMember`
- `Achievement`
- `QOTD`
- `QOTDSubmission`
- `AuditLog`
- `HiringApplication`

Important enums:
- `Role`: `PUBLIC`, `USER`, `CORE_MEMBER`, `ADMIN`, `MEMBER`
- `EventStatus`: `UPCOMING`, `ONGOING`, `PAST`
- `AnnouncementPriority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- `ApplyingRole`: `TECHNICAL`, `DSA_CHAMPS`, `DESIGNING`, `SOCIAL_MEDIA`, `MANAGEMENT`
- `ApplicationStatus`: `PENDING`, `INTERVIEW_SCHEDULED`, `SELECTED`, `REJECTED`

Notable schema details:
- `Settings` is singleton-style (`id = "default"`)
- Event/announcement/achievement slugs are first-class fields
- Event registrations include `customFieldResponses` JSON
- Email template custom text is now persisted in `Settings` (`emailWelcomeBody`, `emailAnnouncementBody`, `emailEventBody`, `emailFooterText`)

---

## 7) Auth and authorization model

Auth methods:
- Email/password
- Google OAuth
- GitHub OAuth

JWT is used for API authorization. Role checks are enforced by:
- `authMiddleware`
- `requireRole(...)`

Role intent (operational):
- `USER`: basic authenticated usage
- `MEMBER`: member-level access where applicable
- `CORE_MEMBER`: content creation privileges in some modules
- `ADMIN`: full management access

---

## 8) Settings-driven feature toggles

Global toggles are in `Settings` and consumed in web context + server behavior.

Common toggles:
- `registrationOpen`
- `announcementsEnabled`
- `showLeaderboard`
- `showQOTD`
- `showAchievements`
- `hiringEnabled`
- `show_tech_blogs`

Behavioral note:
- `hiringEnabled=false` should hide/disable user-facing and admin hiring entry points (UI and flow guarding).

---

## 9) Time and timezone policy (critical)

Project policy: **use IST everywhere for display/business-facing time**.

Current implementation baseline:
- Frontend date utility layer in `apps/web/src/lib/dateUtils.ts` uses `Asia/Kolkata`
- Admin/user-facing formatted date strings are expected to include IST logic
- Scheduler logging now prints IST check windows

Rule for future changes:
- Never introduce new default locale/date formatting without explicit `timeZone: 'Asia/Kolkata'` for user-visible output.
- Persist timestamps in DB as UTC-backed `DateTime` (Prisma default behavior), convert at presentation time.

---

## 10) Email and reminders

### Email templates
- Runtime uses DB-backed template fields from `Settings`
- Avoid file-based template mutation in `dist/` paths
- `apps/api/src/utils/email.ts` caches template settings briefly to reduce DB load

### Reminder scheduler
- Located at `apps/api/src/utils/scheduler.ts`
- Started on server boot and stopped on graceful shutdown
- Uses time window checks for upcoming events and deduplicates via in-memory set

Operational caveat:
- In-memory dedupe resets on process restart; if stronger guarantees are required, migrate reminder tracking to DB.

---

## 11) Security and ops controls

Implemented controls:
- `helmet` headers
- CORS allowlist logic (localhost, configured frontend, codescriet.dev domains)
- API rate limiting and separate auth limiter
- Password hashing (bcrypt)
- JWT auth
- Audit logs for admin actions

Agent expectation:
- Preserve auth guards and role checks when editing routes/pages
- Avoid widening CORS/permissions unless explicitly requested

---

## 12) Dev workflow and commands

From repo root:

```bash
npm run dev                # Run API + Web concurrently
npm run web                # Frontend only
npm run api                # Backend only
npm run build              # Build Web then API
npm run start:prod         # Production-style start for both
npm run db:migrate         # Prisma dev migration
npm run db:migrate:deploy  # Prisma deploy migration
npm run db:seed            # Seed database
npm run db:studio          # Prisma Studio
npm run db:reset           # Destructive reset
npm run setup              # install + migrate + seed
```

Per-app:
- API build: `npm run build --workspace=apps/api`
- Web build: `npm run build --workspace=apps/web`

---

## 13) How to safely make changes (AI agent playbook)

### A) Add or change database fields
1. Edit `prisma/schema.prisma`
2. Create migration (`npm run db:migrate`)
3. Update API selects/creates/updates and validation
4. Update frontend types in `apps/web/src/lib/api.ts`
5. Update related forms/pages/context defaults
6. Build both apps

### B) Add API endpoint
1. Add handler in appropriate `apps/api/src/routes/*.ts`
2. Apply auth/role middleware as required
3. Ensure consistent response shape
4. Register router in `apps/api/src/index.ts` (if new router)
5. Update frontend API client methods

### C) Add frontend page/flow
1. Create page under `apps/web/src/pages/`
2. Add route in `apps/web/src/App.tsx`
3. Add nav entry in layout/header/dashboard if needed
4. Wire data via existing API client + query/mutation patterns

### D) Add or modify settings toggle
1. Add field in `Settings` model
2. Migrate DB
3. Expose in settings routes
4. Add to frontend settings types/context
5. Implement UI + behavior checks where needed

### E) Change role permissions
1. Update backend role checks (`requireRole`) first
2. Mirror corresponding UI access gates (`ProtectedRoute`, conditional menus)
3. Verify forbidden path behavior with non-admin token

---

## 14) High-impact files to check first

Backend:
- `apps/api/src/index.ts` (boot, route mounts, middleware)
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/middleware/role.ts`
- `apps/api/src/routes/settings.ts`
- `apps/api/src/routes/events.ts`
- `apps/api/src/utils/email.ts`
- `apps/api/src/utils/scheduler.ts`

Frontend:
- `apps/web/src/App.tsx` (routing)
- `apps/web/src/context/AuthContext.tsx`
- `apps/web/src/context/SettingsContext.tsx`
- `apps/web/src/components/auth/ProtectedRoute.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/dateUtils.ts`

Database:
- `prisma/schema.prisma`
- `prisma/seed.ts`

---

## 15) Known project quirks

- OAuth flow includes callback handling that may branch based on hiring intent.
- Some historical backup files may exist; avoid using backups as active sources.
- `packages/auth` currently contains built output (`dist/`) and may not be central to runtime unless explicitly imported.
- Scheduler dedupe is process-memory only.

---

## 16) Validation checklist after changes

Minimum:
1. `npm run build`
2. If DB changed: run migration + regenerate client as needed
3. Verify affected route/page manually
4. Verify role guards for privileged actions
5. Verify date/time output remains IST for user-facing displays

For production-sensitive edits also verify:
- CORS behavior
- rate limits unaffected
- no file-path assumptions against `dist` artifacts

---

## 17) Contribution style expectations for AI agents

- Prefer minimal, targeted patches
- Preserve existing architectural patterns
- Fix root cause, not superficial symptoms
- Keep API contracts stable unless requested
- Do not add new documentation files unless asked
- Update this handbook when introducing major behavioral/system changes

---

## 18) Quick mental model for agents

Think of this platform as five connected systems:
1. Public content site
2. Authenticated member dashboard
3. Admin control plane
4. API + DB domain logic
5. Background automations (emails, reminders, sockets)

Most safe changes are vertical slices:
- Schema (if needed) → API route/service → frontend client/types → UI route/page → validation/build

If a change touches visibility or capability, always check:
- role guard
- settings toggle
- timezone display
- audit/security impact
