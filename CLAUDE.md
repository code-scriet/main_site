# CLAUDE.md — code.scriet Club Platform

> **For AI Agents:** This file is the single source of truth. Read it fully before making any changes. Do NOT explore the codebase speculatively — everything needed is documented here.

---

## Project Overview

**code.scriet** is a full-stack monorepo web platform for CCSU's (Chaudhary Charan Singh University) coding club. It handles events, announcements, team management, achievements, hiring applications, a professional/alumni network, live quizzes, a code playground, certificate generation, QR attendance tracking, and a credits/acknowledgements system.

**Production URLs:**
- Frontend: `https://codescriet.dev`
- API: `https://api.codescriet.dev`
- Playground: `https://code.codescriet.dev`
- Code Executor Worker: Cloudflare Worker (proxies to Wandbox API)

---

## Hard Constraints

These rules are non-negotiable. Never propose a solution that violates them without an explicit override instruction from the user.

1. **Free-tier only (512 MB RAM):** The Render API service runs on the free tier with a 512 MB RAM ceiling. Do not introduce in-memory data structures that grow proportionally with user/player count (e.g., per-session chat buffers, unbounded caches). The safe working ceiling is ~900 concurrent quiz players.
2. **WebSocket-only for real-time:** All real-time quiz and attendance communication goes through Socket.io WebSocket transport. Never introduce HTTP long-polling or SSE for real-time quiz events.
3. **Prisma connection pool is frozen:** The pool config is deliberately tuned for Neon serverless concurrent connection limits. Do not alter the `datasource` block, add pool middleware, or change connection limits without explicit approval.
4. **Node memory cap in production:** `--max-old-space-size=400` must be present in the production start script to leave headroom beneath the 512 MB limit.
5. **`prisma migrate dev --create-only` is mandatory:** Always generate migration files with `--create-only` and review the SQL before applying. Never run bare `prisma migrate dev` against a shared or production database — it can OOM on constrained machines.
6. **Optimization code is frozen during UI work:** Do not touch quiz scoring logic, leaderboard calculation, or socket throttle configs when working on UI-only tasks. These live in `apps/api/src/quiz/quizSocket.ts`. Strict separation.
7. **Leaderboard broadcasts top 10 only:** The `leaderboard_update` socket event sends only the top 10 players. This is a deliberate payload cap — do not expand the count.
8. **`answer_count_update` throttle is fixed at 1000 ms:** The server throttles this broadcast to one emission per second. Do not lower the interval.
9. **`my_rank_update` is a unicast:** This event is sent only to the individual player's socket. It must never become a broadcast.
10. **Phase transitions are server-authoritative:** Quiz phase changes (`start`, `next_question`, `end`, `pause`, `resume`) are always triggered server-side via timers or explicit host action. Client-clock / schedule-based transitions are forbidden — they break pause/resume and extend-time controls.
11. **Capacity counts must filter participants:** Any query that aggregates registrations for capacity enforcement, waitlist logic, or public "X registered" counts MUST filter `EventRegistration.registrationType = PARTICIPANT`. `GUEST` registrations do not consume participant capacity and must never be mixed into participant-only counts.

---

## Response Standards

When generating code or architectural proposals for this codebase:

- **Be stack-specific:** Reference exact file paths, Prisma model names, and existing utility functions. "Use a cache" is not acceptable — "add a bounded Map in `quizStore.ts`" is.
- **Flag O(n²) patterns immediately:** If a proposed solution nests iteration over players inside a questions loop (or any unbounded × unbounded pattern), call it out with the complexity class and the break-even value of n before anything else.
- **Socket event documentation format:** When adding a new Socket.io event, always document: `event_name` → direction (server→client or client→server) → payload TypeScript interface → trigger condition → unicast or broadcast.
- **Prisma N+1 annotation:** Any query inside a loop that cannot be batched must be annotated `// N+1: consider batching` and explain why it is acceptable at current scale or state the batching path.
- **Free-tier impact statement:** For any non-trivial new feature, estimate the peak memory delta (bytes × expected concurrent users) and confirm it fits within the 512 MB constraint.
- **No new infrastructure:** Never suggest Redis, message queues, separate worker processes, or any paid external service. We are on free tier.

---

## Monorepo Structure

```
club_site/
├── apps/
│   ├── api/                    # Express.js backend (TypeScript, ESM)
│   │   ├── src/
│   │   │   ├── index.ts        # App entry point — mounts all routers
│   │   │   ├── config/
│   │   │   │   └── passport.ts       # Passport.js Google + GitHub OAuth strategies
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # authMiddleware + getAuthUser()
│   │   │   │   └── role.ts           # requireRole()
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts           # /api/auth/*
│   │   │   │   ├── events.ts         # /api/events/*
│   │   │   │   ├── registrations.ts  # /api/registrations/*
│   │   │   │   ├── announcements.ts  # /api/announcements/*
│   │   │   │   ├── team.ts           # /api/team/*
│   │   │   │   ├── achievements.ts   # /api/achievements/*
│   │   │   │   ├── qotd.ts           # /api/qotd/*
│   │   │   │   ├── users.ts          # /api/users/*
│   │   │   │   ├── stats.ts          # /api/stats/*
│   │   │   │   ├── settings.ts       # /api/settings/*
│   │   │   │   ├── hiring.ts         # /api/hiring/*
│   │   │   │   ├── certificates.ts   # /api/certificates/*
│   │   │   │   ├── signatories.ts    # /api/signatories/*
│   │   │   │   ├── upload.ts         # /api/upload/*
│   │   │   │   ├── network.ts        # /api/network/*
│   │   │   │   ├── audit.ts          # /api/audit-logs/*
│   │   │   │   ├── mail.ts           # /api/mail/*
│   │   │   │   ├── playground.ts     # /api/playground/*
│   │   │   │   ├── credits.ts        # /api/credits/*  ← NEW
│   │   │   │   ├── attendance.ts     # /api/attendance/*
│   │   │   │   └── sitemap.ts        # /sitemap.xml, /robots.txt, IndexNow
│   │   │   ├── attendance/
│   │   │   │   └── attendanceSocket.ts  # Socket.io /attendance namespace
│   │   │   ├── quiz/
│   │   │   │   ├── quizRouter.ts     # /api/quiz/* REST routes
│   │   │   │   ├── quizSocket.ts     # Socket.io /quiz namespace
│   │   │   │   └── quizStore.ts      # In-memory quiz state (Map<quizId, QuizRoom>)
│   │   │   ├── lib/
│   │   │   │   └── prisma.ts         # Prisma client + withRetry()
│   │   │   └── utils/
│   │   │       ├── attendanceToken.ts # JWT sign/verify for attendance tokens
│   │   │       ├── audit.ts          # auditLog() helper
│   │   │       ├── email.ts          # emailService (Brevo/Sendinblue)
│   │   │       ├── eventStatus.ts    # updateEventStatuses()
│   │   │       ├── generateCertificatePDF.ts  # @react-pdf/renderer PDF generation
│   │   │       ├── processSignatureImage.ts  # sharp-based signature image cleanup
│   │   │       ├── init.ts           # initializeDatabase(), slug population
│   │   │       ├── jwt.ts            # getJwtSecret(), signToken(), verifyToken()
│   │   │       ├── logger.ts         # winston logger + requestLogger middleware
│   │   │       ├── response.ts       # ApiResponse.success() / ApiResponse.error()
│   │   │       ├── sanitize.ts       # sanitizeHtml() / sanitizeText()
│   │   │       ├── scheduler.ts      # startReminderScheduler() / stopReminderScheduler()
│   │   │       └── socket.ts         # initializeSocket() — Socket.io setup
│   │   └── public/
│   │       └── logos/               # Certificate fonts + logos (base64 or TTF/WOFF)
│   │           ├── GreatVibes.ttf
│   │           ├── Cinzel-Regular.woff / Cinzel-Bold.woff
│   │           ├── CormorantGaramond.ttf / CormorantGaramond-Italic.ttf
│   │           └── PlayfairDisplay-Bold.woff
│   │
│   ├── web/                    # React frontend (Vite + TypeScript)
│   │   └── src/
│   │       ├── App.tsx               # Router, lazy routes, QueryClient
│   │       ├── context/
│   │       │   ├── AuthContext.tsx   # useAuth() — token, user, login, logout
│   │       │   └── SettingsContext.tsx # useSettings() — settings from /api/settings/public
│   │       ├── lib/
│   │       │   ├── api.ts            # All API calls + TypeScript interfaces
│   │       │   ├── error.ts          # extractApiErrorMessage()
│   │       │   └── utils.ts          # cn() (clsx + tailwind-merge)
│   │       ├── components/
│   │       │   ├── auth/
│   │       │   │   └── ProtectedRoute.tsx  # minRole prop guard
│   │       │   ├── dashboard/
│   │       │   │   └── DashboardLayout.tsx # Sidebar nav (user + core + admin sections)
│   │       │   ├── layout/
│   │       │   │   ├── Layout.tsx    # Public page wrapper (Navbar + Footer)
│   │       │   │   ├── Navbar.tsx
│   │       │   │   └── Footer.tsx
│   │       │   ├── SEO.tsx           # <Helmet> SEO tags
│   │       │   └── ui/               # shadcn/ui components (button, card, input, etc.)
│   │       └── pages/
│   │           ├── HomePage.tsx
│   │           ├── AboutPage.tsx
│   │           ├── EventsPage.tsx / EventDetailPage.tsx
│   │           ├── TeamPage.tsx / TeamMemberProfilePage.tsx
│   │           ├── AchievementsPage.tsx / AchievementDetailPage.tsx
│   │           ├── AnnouncementsPage.tsx / AnnouncementDetailPage.tsx
│   │           ├── SignInPage.tsx
│   │           ├── JoinUsPage.tsx
│   │           ├── AuthCallbackPage.tsx
│   │           ├── NetworkPage.tsx
│   │           ├── JoinOurNetworkPage.tsx
│   │           ├── PrivacyPolicyPage.tsx
│   │           ├── ContactPage.tsx
│   │           ├── CreditsPage.tsx         # ← NEW: public /credits page
│   │           ├── VerifyCertificatePage.tsx
│   │           ├── network/
│   │           │   ├── NetworkOnboarding.tsx
│   │           │   ├── NetworkStatusPage.tsx
│   │           │   └── NetworkProfilePage.tsx
│   │           ├── dashboard/
│   │           │   ├── DashboardOverview.tsx
│   │           │   ├── DashboardEvents.tsx
│   │           │   ├── DashboardAnnouncements.tsx
│   │           │   ├── DashboardLeaderboard.tsx
│   │           │   ├── DashboardCertificates.tsx
│   │           │   ├── CreateEvent.tsx
│   │           │   ├── CreateAnnouncement.tsx
│   │           │   ├── CreateQOTD.tsx
│   │           │   ├── ProfilePage.tsx
│   │           │   ├── ImageUploadTool.tsx
│   │           │   ├── EditTeamProfile.tsx
│   │           │   ├── EditNetworkProfile.tsx
│   │           │   └── QuizManager.tsx
│   │           ├── admin/
│   │           │   ├── AdminUsersRealtime.tsx
│   │           │   ├── AdminTeam.tsx
│   │           │   ├── AdminAchievements.tsx
│   │           │   ├── AdminSettings.tsx
│   │           │   ├── AdminEventRegistrations.tsx
│   │           │   ├── EditEvent.tsx
│   │           │   ├── AdminHiring.tsx
│   │           │   ├── AdminCertificates.tsx
│   │           │   ├── AdminNetwork.tsx
│   │           │   ├── AdminCredits.tsx    # ← NEW: admin /admin/credits page
│   │           │   ├── AdminAuditLog.tsx
│   │           │   └── AdminMail.tsx
│   │           └── quiz/
│   │               ├── ActiveQuizList.tsx
│   │               ├── QuizPage.tsx
│   │               ├── QuizResultsPage.tsx
│   │               ├── AdminQuizCreator.tsx
│   │               └── QuizJoinPage.tsx
│   │
│   └── playground/             # Code playground (separate Vite app + execute-server)
│       ├── execute-server.js   # Express.js (plain JS) execute server
│       └── src/                # React frontend for code editor
│
├── packages/                   # Shared packages (currently unused)
├── prisma/
│   ├── schema.prisma           # Full DB schema (see section below)
│   └── seed.ts                 # Seeds super admin + default Settings row
├── workers/
│   └── executor.js             # Cloudflare Worker (code execution proxy)
├── scripts/                    # Shell scripts (migrate, free ports)
├── render.yaml                 # Render deployment blueprint (4 services)
└── .github/workflows/ci.yml
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js, TypeScript, Node.js 20, ESM (`"type": "module"`) |
| Frontend | React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Zustand (quiz UI state), Recharts (analytics charts) |
| Database | PostgreSQL (Neon serverless) via Prisma ORM |
| Auth | Passport.js (Google, GitHub OAuth), JWT (7-day), bcryptjs |
| Real-time | Socket.io (`/quiz` namespace) |
| Email | Brevo REST API (direct HTTP fetch to `https://api.brevo.com/v3/smtp/email`, auth via `BREVO_API_KEY`) |
| File Storage | Cloudinary (images, certificate PDFs) |
| PDF | `@react-pdf/renderer` (server-side certificate generation) |
| Image Processing | `sharp` (signature image cleanup — background removal, contrast, threshold) |
| Data Export | ExcelJS (event registrations, user lists) |
| QR Code | `qrcode.react ^4.2.0` (frontend rendering); `html5-qrcode` (scanning — used in attendance scanner) |
| Animations | Framer Motion (frontend) |
| Deployment | Render (4 services, **free tier — 512 MB RAM**), Cloudflare Workers |
| Package Manager | npm with workspaces |

---

## Key Commands

```bash
# Development
npm run dev                    # API + Web (concurrently)
npm run dev:api                # API only (port 5001)
npm run dev:web                # Web only (port 5173)

# Build
npm run build                  # All workspaces
npm run build:api
npm run build:web

# Database
npm run db:migrate             # Dev migrations — WARNING: see note below
npm run db:migrate:deploy      # Production migrations
npm run db:generate            # Regenerate Prisma client
npm run db:push                # Push schema (no migration file)
npm run db:seed                # Seed super admin + default Settings
npm run db:studio              # Open Prisma Studio

# IMPORTANT — always use --create-only to generate migrations without auto-applying:
# npx prisma migrate dev --create-only --name <migration_name>
# Review the generated SQL in prisma/migrations/ then apply with db:migrate:deploy

# Linting
npm run lint:api
npm run lint:web
```

---

## All API Routes (Mounted in `apps/api/src/index.ts`)

| Path | Router | Auth Required |
|------|--------|---------------|
| `/api/auth/*` | authRouter | No (rate-limited: 50/15min) |
| `/api/events/*` | eventsRouter | Some routes |
| `/api/registrations/*` | registrationsRouter | Yes |
| `/api/announcements/*` | announcementsRouter | Some |
| `/api/team/*` | teamRouter | Some |
| `/api/teams/*` | teamsRouter | User (create/join), Admin (list/admin actions) |
| `/api/invitations/*` | invitationsRouter | Mixed |
| `/api/achievements/*` | achievementsRouter | Some |
| `/api/qotd/*` | qotdRouter | Some |
| `/api/users/*` | usersRouter | Yes |
| `/api/stats/*` | statsRouter | No (public) |
| `/api/settings/*` | settingsRouter | Some (`/settings`, `/settings/email-templates`, `/settings/security-env` are superAdmin/PRESIDENT only) |
| `/api/hiring/*` | hiringRouter | Some |
| `/api/certificates/*` | certificatesRouter | Some |
| `/api/signatories/*` | signatoriesRouter | Admin |
| `/api/upload/*` | uploadRouter | Yes |
| `/api/network/*` | networkRouter | Some |
| `/api/audit-logs/*` | auditRouter | Admin |
| `/api/mail/*` | mailRouter | Admin |
| `/api/quiz/*` | quizRouter | Some |
| `/api/playground/*` | playgroundRouter | Some |
| `/api/credits/*` | creditsRouter | GET=public, POST/PUT/DELETE=Admin |
| `/api/attendance/*` | attendanceRouter | Some (user QR + history = auth, admin endpoints = Admin, summary = public) |
| `/api/indexnow` | indexNowRouter | Admin |
| `/sitemap.xml` | sitemapRouter | Public |
| `/robots.txt` | robotsRouter | Public |
| `/health` | inline | Public (no DB) |
| `/health/db` | inline | Public (DB ping, 2s timeout) |
| `/ping` | inline | Public (plain text "pong") |
| `/api/test-email` | inline | Admin |

**Rate Limiting:** General API = 500 req/15min per IP; Auth = 50 req/15min (successful requests not counted).

---

## Credits System (NEW)

### DB Model (`prisma/schema.prisma`)
```prisma
model Credit {
  id            String      @id @default(uuid())
  title         String
  description   String?     @db.Text
  category      String
  teamMemberId  String?     @map("team_member_id")
  teamMember    TeamMember? @relation(fields: [teamMemberId], references: [id], onDelete: SetNull)
  order         Int         @default(0)
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@index([category, order])
  @@map("credits")
}
```
`TeamMember` also has a `credits Credit[]` relation.

### API Endpoints (`apps/api/src/routes/credits.ts`)
- `GET /api/credits` — list all, optional `?teamMemberId=<uuid>` filter. Public.
- `GET /api/credits/:id` — single credit. Public.
- `POST /api/credits` — create. **Admin only.**
- `PUT /api/credits/:id` — update. **Admin only.**
- `DELETE /api/credits/:id` — delete. **Admin only.**
- `PATCH /api/credits/reorder` — bulk reorder `{ credits: [{id, order}] }`. **Admin only.**

Response format: `{ success: true, data: Credit }`.

### Frontend
- **Public page:** `apps/web/src/pages/CreditsPage.tsx` → route `/credits`
  - Fetches via `api.getCredits()`
  - Groups by category, shows styled cards with team member avatar (links to `/team/:slug`)
  - Categories with built-in styles: `Founding`, `Platform`, `Design`, `Events`, `Content`, `Infrastructure`, `Special Thanks`
- **Admin page:** `apps/web/src/pages/admin/AdminCredits.tsx` → route `/admin/credits`
  - CRUD UI with category presets + custom category input
  - Team member search/filter dropdown
  - Order field for display ordering

### API Client (`apps/web/src/lib/api.ts`)
```typescript
export interface Credit {
  id: string;
  title: string;
  description?: string;
  category: string;
  teamMemberId?: string;
  teamMember?: { id: string; name: string; slug?: string; imageUrl: string; role: string; team: string };
  order: number;
  createdAt: string;
}

api.getCredits(teamMemberId?)
api.getCredit(id)
api.createCredit(data, token)
api.updateCredit(id, data, token)
api.deleteCredit(id, token)
api.reorderCredits(credits, token)  // PATCH /api/credits/reorder
```

---

## Team Registration System

> **Status: IMPLEMENTED.** Full team-based event registration with invite codes.

### Architecture

- **Event-level toggle:** `Event.teamRegistration` boolean + `teamMinSize`/`teamMaxSize` (1-10)
- **Team creation:** User creates team → becomes leader → auto-registered → gets 8-char invite code
- **Team join:** Other users enter invite code → join team → auto-registered
- **Invite code:** 8-character uppercase hex (e.g., `A1B2C3D4`), unique globally
- **Team lifecycle:** Leader can lock (prevent new joins), transfer leadership, kick members, or dissolve team
- **Registration gate:** Solo registration blocked for team events; must create/join team

### DB Models (`prisma/schema.prisma`)

```prisma
model EventTeam {
  id         String   @id @default(uuid())
  eventId    String   @map("event_id")
  event      Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  teamName   String   @map("team_name") @db.VarChar(100)
  inviteCode String   @unique @map("invite_code") @db.VarChar(8)
  leaderId   String   @map("leader_id")
  leader     User     @relation("TeamLeader", fields: [leaderId], references: [id], onDelete: Restrict)
  isLocked   Boolean  @default(false) @map("is_locked")
  createdAt  DateTime @default(now()) @map("created_at")
  members    EventTeamMember[]

  @@unique([eventId, teamName])
  @@index([eventId])
  @@map("event_teams")
}

model EventTeamMember {
  id             String            @id @default(uuid())
  teamId         String            @map("team_id")
  team           EventTeam         @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId         String            @map("user_id")
  user           User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  registrationId String            @unique @map("registration_id")
  registration   EventRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  role           String            @default("MEMBER") @db.VarChar(20)  // "LEADER" | "MEMBER"
  joinedAt       DateTime          @default(now()) @map("joined_at")

  @@unique([teamId, userId])
  @@index([userId])
  @@map("event_team_members")
}
```

Event model additions:
```prisma
teamRegistration  Boolean  @default(false) @map("team_registration")
teamMinSize       Int      @default(1) @map("team_min_size")
teamMaxSize       Int      @default(4) @map("team_max_size")
teams             EventTeam[]
```

### API Endpoints (`apps/api/src/routes/teams.ts`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/teams/create` | POST | User | Create team + self-register as leader |
| `/api/teams/join` | POST | User | Join team via invite code (rate-limited: 15/15min) |
| `/api/teams/my-team/:eventId` | GET | User | Get user's team for event (null if not in team) |
| `/api/teams/:teamId/lock` | PATCH | Leader | Toggle team lock |
| `/api/teams/:teamId/members/:userId` | DELETE | Leader | Remove member from team |
| `/api/teams/:teamId/leave` | POST | Member | Leave team (not leader) |
| `/api/teams/:teamId/transfer-leadership` | POST | Leader | Transfer leader role to another member |
| `/api/teams/:teamId/dissolve` | DELETE | Leader | Dissolve team, cancel all registrations |
| `/api/teams/event/:eventId` | GET | Admin | List all teams for event |
| `/api/teams/:teamId/admin-lock` | PATCH | Admin | Admin force lock/unlock |
| `/api/teams/:teamId/admin-dissolve` | DELETE | Admin | Admin force dissolve |

### Frontend Components (`apps/web/src/components/teams/`)

- **TeamCreateModal** — Create team form with team name + custom fields
- **TeamJoinModal** — Join team with 8-char invite code input
- **TeamDashboard** — Team management card (members, invite code, lock, leave/dissolve)

### Frontend Integration

- **EventDetailPage** — Conditional rendering: team events show Create/Join buttons instead of Register
- **CreateEvent / EditEvent** — Team registration toggle + min/max size config
- **AdminEventRegistrations** — Team badge + "Teams" button linking to attendance hub

### API Client (`apps/web/src/lib/api.ts`)

```typescript
export interface EventTeam {
  id: string;
  eventId: string;
  teamName: string;
  inviteCode?: string;  // Only visible to leader
  leaderId: string;
  isLocked: boolean;
  createdAt: string;
  members: EventTeamMemberInfo[];
  isLeader?: boolean;
  isComplete?: boolean;
  isFull?: boolean;
}

api.createTeam(data, token)
api.joinTeam(data, token)
api.getMyTeam(eventId, token)  // Returns null if not in team
api.toggleTeamLock(teamId, token)
api.removeTeamMember(teamId, userId, token)
api.leaveTeam(teamId, token)
api.transferLeadership(teamId, newLeaderId, token)
api.dissolveTeam(teamId, token)
api.getEventTeams(eventId, token)  // Admin
api.adminToggleTeamLock(teamId, token)
api.adminDissolveTeam(teamId, token)
```

### Key Patterns

- **Serializable transactions:** Team create/join use `Prisma.TransactionIsolationLevel.Serializable` with 3 retry attempts and jittered exponential backoff for P2034 conflicts
- **Atomic capacity check:** Registration count checked inside transaction to prevent race conditions
- **Leader deletion guard:** `onDelete: Restrict` on `EventTeam.leaderId` prevents deleting users who lead teams
- **Registration cascade:** Team dissolution deletes team members and their registrations in one transaction
- **Toggle guard:** Cannot change `teamRegistration` mode once event has registrations

---

## Invitation System

> **Status: IMPLEMENTED.** Guests, speakers, judges, alumni, and other invitees use a dedicated invitation flow that lands in the same registration, attendance, and certificate pipeline as participants.

### Architecture

- **Separate door, same pipeline:** Admins invite verified `NetworkProfile` users or raw email addresses. Accepting an invitation creates an `EventRegistration` with `registrationType = GUEST`, then the existing `attendanceToken`, `QRTicket`, quiz auth, attendance scan, and certificate flows take over.
- **Capacity-safe by design:** Participant capacity checks and public registration counts filter `registrationType = PARTICIPANT` so guest invitations never consume participant seats.
- **Expiry is derived:** Stored status is `PENDING | ACCEPTED | DECLINED | REVOKED`; `EXPIRED` is computed at read time when a pending invitation belongs to an event that has already ended.
- **Email-only claim flow:** Non-user invitees receive a signed invitation-claim JWT that deep-links to `/join-our-network?invitation=<token>`. After signup/onboarding, the invitation is claimed and attached to the authenticated user account.
- **Revoke is transactional:** Revoking an accepted invitation deletes the linked guest registration inside the same transaction so the invitee immediately loses QR/attendance access.

### DB Models (`prisma/schema.prisma`)

- **`EventInvitation`** stores the invited event, inviter, invitee user or email, snapshot fields, role, certificate settings, email delivery metadata, and an optional link to the guest registration created on accept.
- **`EventRegistration.registrationType`** defaults to `PARTICIPANT`; accepted invitations create `GUEST` registrations instead of participant registrations.
- **`Settings.emailInvitationEnabled`** gates invitation and revocation emails through the existing `EmailService.send()` category guard.

### API Endpoints (`apps/api/src/routes/invitations.ts`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/invitations/search-invitees` | GET | Admin | Search verified NetworkProfile users who are not already invited for the event |
| `/api/invitations` | POST | Admin | Bulk-create invitations for users or raw email addresses |
| `/api/invitations/event/:eventId` | GET | Admin | List all invitations for one event |
| `/api/invitations/my` | GET | User | List the authenticated user's invitations with derived `EXPIRED` state |
| `/api/invitations/claim` | POST | User | Claim an email-only invitation after signup/onboarding |
| `/api/invitations/:id` | PATCH | Admin | Update role, custom message, certificate toggle, or certificate type |
| `/api/invitations/:id` | DELETE | Admin | Revoke invitation and delete linked guest registration if accepted |
| `/api/invitations/:id/resend` | POST | Admin | Resend invitation email and update resend metadata |
| `/api/invitations/:id/accept` | POST | User | Serializable accept flow: create `GUEST` registration + attendance token |
| `/api/invitations/:id/decline` | POST | User | Decline invitation and remove prior guest registration if one exists |

### Frontend Components

- **Dashboard inbox:** `apps/web/src/pages/dashboard/DashboardInvitations.tsx` renders pending, accepted, and historical invitations, with deep-link support for `/dashboard/invitations/:invitationId`.
- **Admin management:** `apps/web/src/components/events/AdminEventInvitations.tsx` handles search, staging, bulk sends, edits, resends, and revokes for an event.
- **Public event guests:** `apps/web/src/components/events/ChiefGuestsStrip.tsx` renders accepted, public network invitees on the event page.
- **Event detail integration:** `apps/web/src/pages/EventDetailPage.tsx` shows accepted guest QR tickets via the existing `QRTicket` component and a dashboard CTA for pending invitations.
- **Certificates:** `apps/web/src/components/attendance/EventCertificateWizard.tsx` adds a Guests tab sourced from accepted invitation registrations.

### API Client (`apps/web/src/lib/api.ts`)

```typescript
api.getMyInvitations(token)
api.acceptInvitation(id, token)
api.declineInvitation(id, token)
api.claimInvitation(invitationToken, token)
api.searchInvitees(query, eventId, token)
api.createInvitations(data, token)
api.getEventInvitations(eventId, token)
api.updateInvitation(id, data, token)
api.revokeInvitation(id, token)
api.resendInvitationEmail(id, token)
```

### Key Patterns

- **Serializable accept transaction:** `POST /api/invitations/:id/accept` retries serializable conflicts three times with the same jittered exponential backoff pattern used in event/team registration.
- **Claim-first email invites:** Raw-email invitations are stored with `inviteeEmail`, then bound to `inviteeUserId` after the recipient signs up and claims the token.
- **Read-time expiry derivation:** Expiration is never persisted; all invitation list/read responses compute `EXPIRED` when `status === PENDING && event.endDate < now`.
- **Capacity exemption:** Every participant-capacity/public-count query filters `registrationType = PARTICIPANT`; guests live in the same registration table but never consume participant seats.

---

## Full Database Schema (Key Models)

All models use PostgreSQL via Prisma. `DATABASE_URL` = pooler, `DIRECT_URL` = non-pooler (required for migrations to avoid P1002 advisory lock errors).

### User
```
id, name, email (unique), password?, oauthProvider, oauthId,
role (Role enum), avatar, bio, githubUrl, linkedinUrl, twitterUrl,
websiteUrl, branch, course, phone, profileCompleted, year,
createdAt, updatedAt
Relations: announcements, registrations, hiringApplications,
           qotdSubmissions, networkProfile, teamMember,
           invitationsReceived, invitationsSent,
           createdQuizzes, quizParticipants, quizAnswers, certificates
```

### Settings (singleton, id='default')
```
clubName, clubEmail, clubDescription, registrationOpen, maxEventsPerUser,
announcementsEnabled, showAchievements, showLeaderboard, showQOTD,
discordUrl, githubUrl, instagramUrl, linkedinUrl, twitterUrl,
hiringEnabled, hiringTechnical, hiringDsaChamps, hiringDesigning,
hiringSocialMedia, hiringManagement,
emailAnnouncementBody, emailEventBody, emailFooterText,
emailWelcomeBody, emailNetworkVerifiedBody, emailNetworkRejectedBody,
show_tech_blogs, showNetwork, mailingEnabled,
certificatesEnabled, playgroundEnabled, playgroundDailyLimit,
emailWelcomeEnabled, emailEventCreationEnabled, emailRegistrationEnabled,
emailAnnouncementEnabled, emailCertificateEnabled, emailReminderEnabled,
emailInvitationEnabled,
emailTestingMode, emailTestRecipients?,
attendanceJwtSecret?, indexNowKey?
```

### Event
```
id, title, slug (unique), description, status (EventStatus),
startDate, endDate?, registrationStartDate?, registrationEndDate?,
location?, venue?, capacity?, imageUrl, createdBy,
eventDays (default 1), dayLabels (JSON string[])?,
eventType?, prerequisites?, registrationFields (JSON)?,
agenda?, faqs (JSON)?, featured, highlights?, imageGallery (JSON)?,
learningOutcomes?, resources (JSON)?, shortDescription (varchar 300)?,
speakers (JSON)?, tags (String[]), targetAudience?, videoUrl?, slug,
allowLateRegistration
Relations: registrations, invitations, certificates
```

### EventRegistration
```
id, userId, eventId, timestamp, customFieldResponses (JSON)?,
reminderSentAt?, attendanceToken? (unique), attended (default false),
scannedAt?, manualOverride (default false),
registrationType (RegistrationType, default PARTICIPANT), invitation?
Unique: [userId, eventId]
Index: [eventId, attended], [eventId, registrationType, attended]
```

### EventInvitation
```
id, eventId, inviteeUserId?, inviteeEmail?,
inviteeNameSnapshot?, inviteeDesignationSnapshot?, inviteeCompanySnapshot?,
role (default "Guest"), customMessage?, status (InvitationStatus),
certificateEnabled (default true), certificateType (default SPEAKER),
invitedById, invitedAt, respondedAt?, revokedAt?,
emailSent, emailSentAt?, lastEmailResentAt?,
registrationId? (unique), createdAt, updatedAt
Relations: event, inviteeUser, invitedBy, registration
Unique: [eventId, inviteeUserId]
Indexes: [inviteeUserId, status], [inviteeEmail, status], [eventId, status]
```

### DayAttendance
```
id, registrationId, dayNumber, attended (default false),
scannedAt?, scannedBy?, manualOverride (default false), createdAt, updatedAt
Unique: [registrationId, dayNumber]
Index: [dayNumber, attended]
```

### CompetitionRound / CompetitionSubmission / CompetitionAutoSave
```
CompetitionRound:
id, eventId, title, description?, duration, status (CompetitionStatus),
participantScope (CompetitionParticipantScope; default ALL),
allowedTeamIds (String[]; default []), targetImageUrl?, startedAt?, lockedAt?,
createdAt, updatedAt
Relations: event, submissions, autoSaves

CompetitionSubmission:
id, roundId, teamId?, userId, code, submittedAt, isAutoSubmit,
score?, rank?, adminNotes?, createdAt, updatedAt
Unique: [roundId, teamId], [roundId, userId]

CompetitionAutoSave:
id, roundId, teamId?, userId, code, savedAt
Unique: [roundId, userId]
```

### Announcement
```
id, title, body, slug (unique), priority (AnnouncementPriority),
createdBy, featured, pinned, shortDescription?, imageUrl?, imageGallery?,
attachments (JSON)?, links (JSON)?, tags (String[]), expiresAt?,
createdAt, updatedAt
```

### TeamMember
```
id, name, role, team, imageUrl, github?, linkedin?, twitter?,
instagram?, order, userId? (unique FK to User), slug? (unique),
legacySlugs (String[]), bio?, vision?, story?, expertise?,
achievements?, website?, createdAt
Relations: user, credits
```

### Achievement
```
id, title, slug (unique), description, content?, shortDescription?,
eventName?, achievedBy, imageUrl?, imageGallery (JSON)?, date,
tags (String[]), featured, createdAt, updatedAt
```

### QOTD + QOTDSubmission
```
QOTD: id, date (unique), question, problemLink, difficulty, createdAt
QOTDSubmission: id, userId, qotdId, timestamp. Unique: [userId, qotdId]
```

### AuditLog
```
id, userId, action, entity, entityId?, metadata (JSON)?, timestamp
```

### HiringApplication
```
id, name, email (unique), phone?, department, year, skills?,
applyingRole (ApplyingRole), status (ApplicationStatus), userId?,
createdAt, updatedAt
```

### NetworkProfile (1:1 with User)
```
id, userId (unique), slug? (unique), legacySlugs (String[]),
fullName, designation, company, industry, bio?, profilePhoto?,
phone?, linkedinUsername?, twitterUsername?, githubUsername?,
personalWebsite?, connectionType (NetworkConnectionType),
connectionNote?, connectedSince?,
passoutYear?, degree?, branch?, rollNumber?, achievements?,
currentLocation?, vision?, story?, expertise?, adminNotes?,
events (JSON, array), isFeatured, status (NetworkStatus),
verifiedAt?, verifiedBy?, rejectionReason?,
isPublic, displayOrder, createdAt, updatedAt
```

### Certificate
```
id, certId (unique — public human-readable e.g. "ABCD-EFGH-IJKL"),
recipientId? (FK User), recipientName, recipientEmail,
eventId? (FK Event), eventName, type (CertType),
position?, domain?, description?, template (default:"gold"),
pdfUrl?,
signatoryId? (FK Signatory), signatoryName, signatoryTitle, signatoryImageUrl,
facultySignatoryId? (FK Signatory), facultyName, facultyTitle, facultySignatoryImageUrl,
issuedBy, issuedAt,
emailSent, emailSentAt?, lastEmailResentAt?,
isRevoked, revokedAt?, revokedBy?, revokedReason?,
viewCount, createdAt, updatedAt
Unique: [recipientEmail, eventId, type]
```

### Signatory
```
id, name, title (default:"Club President"), signatureUrl?,
isActive, createdAt, updatedAt
Relations: certificatesAsPrimary, certificatesAsFaculty
```

### Credit
*(see Credits System section above)*

### Quiz / QuizQuestion / QuizParticipant / QuizAnswer
*(see Quiz System Architecture section below)*

### Playground Models
```
Execution: id, userId, language, code?, outputText?, executedAt, durationMs?, status (ExecutionStatus)
UserPlaygroundPrefs: userId (PK), theme, fontSize, keybinding, lastLanguage
Snippet: id, userId, title, language, code, isPublic, shareToken? (unique), createdAt, updatedAt
PlaygroundDailyUsage: [userId, usageDate] (composite PK), count, updatedAt
PlaygroundLimitReset: id, userId, resetBy, resetAt, note?
```

### Enums
```
Role: PUBLIC | USER | CORE_MEMBER | ADMIN | PRESIDENT | MEMBER | NETWORK
EventStatus: UPCOMING | ONGOING | PAST
AnnouncementPriority: LOW | MEDIUM | HIGH | URGENT
ApplyingRole: TECHNICAL | DSA_CHAMPS | DESIGNING | SOCIAL_MEDIA | MANAGEMENT
ApplicationStatus: PENDING | INTERVIEW_SCHEDULED | SELECTED | REJECTED
CertType: PARTICIPATION | COMPLETION | WINNER | SPEAKER
RegistrationType: PARTICIPANT | GUEST
InvitationStatus: PENDING | ACCEPTED | DECLINED | REVOKED
QuizStatus: DRAFT | WAITING | ACTIVE | FINISHED | ABANDONED
QuizQuestionType: MCQ | TRUE_FALSE | SHORT_ANSWER | POLL | RATING | MULTI_SELECT | OPEN_ENDED
NetworkConnectionType: GUEST_SPEAKER | GMEET_SESSION | EVENT_JUDGE | MENTOR | INDUSTRY_PARTNER | ALUMNI | OTHER
NetworkStatus: PENDING | VERIFIED | REJECTED
ExecutionStatus: SUCCESS | ERROR | TIMEOUT
CompetitionParticipantScope: ALL | SELECTED_TEAMS
```

`EXPIRED` is intentionally **not** stored in Prisma for invitations; it is derived at read time.

---

## Role Hierarchy

```
PUBLIC    = 0  (unauthenticated)
USER      = 1  (registered)
NETWORK   = 1  (professional/alumni network members)
MEMBER    = 2  (club members)
CORE_MEMBER = 3
ADMIN     = 4
PRESIDENT = 4  (same level as ADMIN)
```

Super admin is determined by `process.env.SUPER_ADMIN_EMAIL`. Only super admin and PRESIDENT can modify settings.

Use `requireRole('ADMIN')` for admin-only routes. PRESIDENT is treated as ADMIN by the role middleware.

---

## Auth Flow

1. **Email/Password:** Register/login → JWT in response body + `scriet_session` cookie set.
2. **OAuth (Google/GitHub):**
   - Redirect to provider → callback → Passport creates/finds user
   - Network intent stored in short-lived cookies (`oauth_intent`, `network_type`)
   - Redirect to `/auth/callback#token=<jwt>&intent=...`
   - Frontend extracts token from hash, stores in `localStorage`
   - Cross-subdomain cookie `scriet_session` set on `.codescriet.dev` for playground access
3. **Token:** JWT, 7-day expiry, contains `{ userId, email, name, role }`
4. **Middleware:** `authMiddleware` (`apps/api/src/middleware/auth.ts`) — reads token from `Authorization: Bearer <token>` header OR `scriet_session` cookie. Does DB lookup per request.
5. **Dev login:** `POST /api/auth/dev-login` (only when `ENABLE_DEV_AUTH=true`)

---

## Certificate System

- PDF generated server-side via `@react-pdf/renderer` in `apps/api/src/utils/generateCertificatePDF.ts`
- **Fonts** (loaded from `apps/api/public/logos/`):
  - `GreatVibes` (.ttf) — cursive signature (fallback when no signature image)
  - `Cinzel` (.woff, 400 + 700) — headings
  - `CormorantGaramond` (.ttf, regular + italic) — serif body
  - `PlayfairDisplay` (.woff, 700) — recipient name
- **Initialization:** `initFonts()` must be called before `generateCertificatePDF()` (called automatically)
- **`CertData` interface:**
  ```typescript
  { recipientName, eventName, type, position?, domain?, description?,
    certId, issuedAt,
    signatoryName, signatoryTitle?, signatoryImageUrl?,
    facultyName?, facultyTitle?, facultySignatoryImageUrl?,
    codescrietLogoUrl?, ccsuLogoUrl? }
  ```
- **Position formatting:** `formatPosition()` converts "1"/"1st" → "First Place", etc.
- **Layout:** A4 Landscape (841.89 × 595.28 pt), maroon/gold palette
- Logos are base64 data URIs passed in `CertData`
- QR code embedded (links to `FRONTEND_URL/verify/:certId`)
- Uploaded to Cloudinary, URL stored in `Certificate.pdfUrl`
- Bulk generation supported
- Public verification: `GET /api/certificates/verify/:code` (increments `viewCount`)
- Emailed to recipients via Brevo

### Dual Signature Mechanism

Certificates support two signature rendering methods per signatory slot (primary + faculty):

1. **Signature Image (preferred):** When a `Signatory` record has a `signatureUrl`, the image is processed through `processSignatureImage()` in `apps/api/src/utils/processSignatureImage.ts`:
   - Fetches the image (URL or base64 data URI)
   - Auto-corrects EXIF orientation (`.rotate()` — fixes rotated phone camera photos)
   - Converts to grayscale, normalises contrast
   - Median filter (3px) removes noise/specks, then sharpen (σ=1.2) enhances ink edges
   - Detects dark backgrounds via mean luminance analysis — auto-inverts if light ink on dark paper
   - Adaptive threshold (`mean * 0.65`, clamped [100, 200]) instead of hardcoded value
   - Per-pixel alpha: ink → opaque black, background → fully transparent
   - Trims transparent edges, resizes to fit (max 200×70 px)
   - Returns base64 PNG data URI for embedding in the PDF
   - If processing fails, returns `undefined` → triggers text fallback

2. **Typed Name (fallback):** When no signature image is available (or processing fails), the signatory name is rendered in the `GreatVibes` handwritten-style font at 28pt, matching the original behavior.

**Detection logic in generate routes:**
- `POST /api/certificates/generate` and `POST /api/certificates/bulk` accept optional `signatoryId` and `facultySignatoryId` fields
- `resolveSignatory()` helper in `certificates.ts` fetches the `Signatory` record by ID, processes the image via `sharp`, and returns both the processed image URL (for PDF) and the raw URL (for DB storage)
- If no ID is provided, falls back to the `signatoryName`/`signatoryTitle` text fields
- For custom signatories (no ID), `signatoryCustomImageUrl` / `facultyCustomImageUrl` can pass a Cloudinary URL directly — also processed through `processSignatureImage()`
- Signature images are processed once per generate/bulk request (not per recipient)

**Layout rules:**
- Signature area: 190pt wide, positioned at bottom (58pt from bottom edge)
- Image signatures: 150×50pt, `object-fit: contain`, centered
- Text signatures: GreatVibes 28pt, centered
- Below the signature (always shown): horizontal rule, name in Cinzel 11pt caps, title in CormorantGaramond 12pt italic
- Primary signatory: left-aligned (78pt from left). Faculty signatory: right-aligned (78pt from right)

---

## Quiz System Architecture

> The quiz platform is mature and optimized. All core performance work is done. Do not propose performance refactors unless a specific regression is identified. **Never touch socket event handlers or Prisma pool config during UI work** (Hard Constraint #6).

### Server-Side Core

- **In-memory during active quiz** — `quizStore.ts` uses `Map<string, QuizRoom>`. No DB writes until quiz ends.
- **Socket.io namespace:** `/quiz` with JWT auth middleware.
- **Draft-first persistence:** Quizzes are stored in PostgreSQL first (`status: DRAFT`) and only become joinable when `POST /api/quiz/:quizId/open` transitions them to `WAITING`.
- **File import support:** `POST /api/quiz/import` parses `.csv`/`.xlsx` files into normalized question payloads (validation + row-level errors) for draft creation flows.
- **Phase transitions are server-authoritative.** See Hard Constraint #10 — never client-clock based.
- **Scoring:** Base points (1000) + time bonus (faster = more) + streak bonus (consecutive correct). Logic in `apps/api/src/quiz/quizSocket.ts`.
- **Auto-advance:** Server-side timers advance questions. Pausing clears timers.
- **Rate limiting:** 500ms per user per answer submission.
- **Persistence:** On quiz end → `QuizParticipant` + `QuizAnswer` tables. Graceful shutdown persists active sessions as `ABANDONED`.
- **Capacity ceiling:** ~900 concurrent players is the safe limit on the free-tier Render instance.

### Socket Events Reference

| Event | Direction | Audience | Notes |
|-------|-----------|----------|-------|
| `join` | client→server | — | Player/host joins room |
| `start` | client→server | — | Host starts quiz |
| `next_question` | client→server | — | Host advances question |
| `submit_answer` | client→server | — | Player submits; 500ms rate-limit per user |
| `end` | client→server | — | Host ends quiz early |
| `pause` / `resume` | client→server | — | Clears/restores server timers |
| `extend_time` | client→server | — | Host adds seconds to current question |
| `skip` | client→server | — | Host skips to results |
| `kick` | client→server | — | Host kicks a player |
| `question_start` | server→client | broadcast | New question begins |
| `answer_result` | server→client | unicast | Per-player correct/points/streak |
| `leaderboard_update` | server→client | broadcast | **Top 10 only** — Hard Constraint #7 |
| `answer_count_update` | server→client | broadcast | **Throttled 1000ms** — Hard Constraint #8 |
| `my_rank_update` | server→client | **unicast** | Per-player socket only — Hard Constraint #9 |
| `player_status_update` | server→client | **unicast to host** | Emitted at 7 locations in `quizSocket.ts` |
| `poll_results` | server→client | broadcast | Live poll distribution |
| `quiz_end` | server→client | broadcast | Triggers 2s finale splash in `QuizPage.tsx` |
| `podium` | server→client | broadcast | Final top-3 data for podium animation |

### Frontend UI Components

All files in `apps/web/src/pages/quiz/`:

- **`QuizPage.tsx`** — Root quiz view. State machine: `idle | joining | lobby | question | revealing | paused | finished`. Contains 2s finale splash (`finaleShown` flag) before showing leaderboard.
- **`QuizHostView.tsx`** — Host dashboard: sorted player list, live answer count, `player_status_update` grid, kick/skip controls.
- **`QuizAdminPanel.tsx`** — Admin controls overlay (pause, resume, extend, end).
- **`QuizLeaderboard.tsx`** — Mid-quiz: compact top-5. Final: animated 3-tier podium (rank 3 @ 500ms, rank 2 @ 800ms, rank 1 @ 1100ms) with pure CSS confetti keyframes (no external library).
- **`QuizFinaleIntro.tsx`** — Full-screen 2s splash overlay triggered on `quiz_end`.
- **`QuizResultsPage.tsx`** — Post-quiz analytics (creator/admin only): `HeatmapGrid` inline component (player × question accuracy), difficulty curve (`LineChart`), drop-off analysis, performance scatter (`ScatterChart`). Uses Recharts.
- **`AdminQuizCreator.tsx`** — Quiz authoring wizard supporting manual questions, CSV/XLSX import parsing, and explicit submit modes (`Save Draft` vs `Save & Open Now`).
- **`QuizQuestion.tsx`** — Active question with countdown timer.
- **`QuizResultReveal.tsx`** — Per-question result reveal with answer distribution.
- **`QuizAnswerDistribution.tsx`** — Answer choice bar visualization.
- **`PollResultsView.tsx`** — Live poll results.
- **`QuizLobby.tsx`** — Waiting room before quiz starts.

Supporting files:
- `apps/web/src/lib/quizScoring.ts` — Scoring formula utilities
- `apps/web/src/hooks/useQuizSocket.ts` — Socket.io connection hook
- `apps/web/src/hooks/useQuizTimer.ts` — Client-side countdown display (display only — does NOT drive phase transitions)

### Zustand Store (`apps/web/src/lib/quizStore.ts`)

```typescript
// QuizPlayer — presence and answer status only
interface QuizPlayer {
  userId: string;
  displayName: string;
  answered?: boolean;
  connected?: boolean;
}

// Key QuizState fields (per-player session stats live on QuizState, not QuizPlayer)
myScore: number;
myStreak: number;
myRank: number | null;
leaderboard: LeaderboardEntry[];  // top 10 from server
answeredCount: number;
players: Record<string, QuizPlayer>;
```

### Previously Evaluated & Rejected

| Proposal | Reason Rejected |
|----------|----------------|
| Client-clock phase transitions | Breaks pause/resume and admin extend-time controls |
| Removing `my_rank_update` unicast | UX regression — players need immediate personal rank without waiting for next broadcast |
| HTTP polling fallback on Socket.io | Overhead incompatible with free-tier constraints at 100+ concurrent |

---

## Attendance System

> **Status: IMPLEMENTED.** Full QR check-in + offline-first scanner + attendance certificates system.

### Architecture

- **QR payload:** Long-lived JWT (30-day expiry), containing `{ userId, eventId, registrationId, purpose: 'attendance' }`. Generated once per registration, stored in `EventRegistration.attendanceToken`.
- **Token generation:** Automatic on event registration (in `registrations.ts`, after the serializable transaction). Utility: `apps/api/src/utils/attendanceToken.ts`.
- **Multi-day source of truth:** Day-level attendance is stored in `DayAttendance` (`dayNumber` 1..10). Legacy `EventRegistration.attended/scannedAt/manualOverride` remains synced for compatibility.
- **Scanning:** Core members (CORE_MEMBER+) can scan. `POST /api/attendance/scan` verifies the JWT, marks attendance for a target `dayNumber`. Offline scans batch-synced via `POST /api/attendance/scan-batch`.
- **Offline support:** `useOfflineScanner` hook stores scans in localStorage (`attendance_scans:${eventId}`), syncs via 5 triggers: immediate, 3s interval batch, mount sync, visibilitychange, and `sendBeacon` on unload.
- **QR scanner:** `html5-qrcode` (installed) with `{ fps: 10, qrbox: 280 }`, rear camera preference.
- **QR display:** `qrcode.react` renders the attendee QR ticket. Visible from 30 min before event start to endDate (or startDate + 4h fallback).
- **Uniqueness:** `[userId, eventId]` composite unique on EventRegistration prevents double-marking.

### DB Fields (on EventRegistration)

```prisma
attendanceToken  String?   @unique @map("attendance_token")
attended         Boolean   @default(false)
scannedAt        DateTime? @map("scanned_at")
manualOverride   Boolean   @default(false) @map("manual_override")
@@index([eventId, attended])
```

### DB Fields (on Event + DayAttendance)

```prisma
Event.eventDays   Int      @default(1)
Event.dayLabels   Json?

model DayAttendance {
  registrationId  String
  dayNumber       Int
  attended        Boolean  @default(false)
  scannedAt       DateTime?
  scannedBy       String?
  manualOverride  Boolean  @default(false)
  @@unique([registrationId, dayNumber])
  @@index([dayNumber, attended])
}
```

### API Endpoints (`/api/attendance/*`)

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/my-qr/:eventId` | GET | User | Attendee QR token + event info |
| `/scan` | POST | CORE_MEMBER+ | Single QR scan (with `bypassWindow` option) |
| `/scan-batch` | POST | CORE_MEMBER+ | Batch sync from offline scanner |
| `/scan-beacon` | POST | Token-in-body (CORE_MEMBER+) | Beacon API fire-and-forget |
| `/manual-checkin` | POST | CORE_MEMBER+ | Manual mark present by registrationId (+ optional `dayNumber`) |
| `/unmark` | PATCH | CORE_MEMBER+ | Undo check-in (+ optional `dayNumber`) |
| `/bulk-update` | PATCH | CORE_MEMBER+ | Bulk mark/unmark selected (+ optional `dayNumber`) |
| `/edit/:registrationId` | PATCH | CORE_MEMBER+ | Edit scannedAt timestamp (+ optional `dayNumber`) |
| `/regenerate-token/:registrationId` | POST | Admin | Generate new QR token |
| `/search` | GET | CORE_MEMBER+ | Search attendees by name/email |
| `/live/:eventId` | GET | CORE_MEMBER+ | Live stats + recent scans |
| `/event/:eventId/full` | GET | CORE_MEMBER+ | Full attendance table data |
| `/event/:eventId/export` | GET | CORE_MEMBER+ | Excel download (ExcelJS, optional `dayNumber`) |
| `/email-absentees/:eventId` | POST | Admin | Email non-attendees via Brevo (optional `dayNumber`) |
| `/event/:eventId/certificate-recipients` | GET | Admin | Attendees + cert status (optional `minDays`) |
| `/my-history` | GET | User | Attendee attendance history |
| `/event/:eventId/summary` | GET | Public | Attendance count + per-day summary for event detail |
| `/backfill-tokens` | POST | Admin | Backfill tokens for existing registrations |

### Socket.io `/attendance` Namespace

| Event | Direction | Auth | Notes |
|-------|-----------|------|-------|
| `join:event` | client→server | CORE_MEMBER+ | Join room `event:${eventId}` |
| `leave:event` | client→server | Any | Leave attendance room |
| `attendance:marked` | server→client | broadcast to room | Emitted by scan/manual-checkin routes |
| `attendance:unmarked` | server→client | broadcast to room | Emitted by unmark route |
| `attendance:bulk` | server→client | broadcast to room | Emitted by bulk-update route |

### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| QRTicket | `apps/web/src/components/attendance/QRTicket.tsx` | Attendee QR display (countdown → QR → attended badge + day breakdown when available) |
| AdminScanner | `apps/web/src/components/attendance/AdminScanner.tsx` | Offline-first camera scanner with day selector, audio feedback, manual check-in, live dashboard |
| AttendanceManager | `apps/web/src/components/attendance/AttendanceManager.tsx` | Full CRUD data table with day selector (mark/unmark, bulk, export, absentees email by day) |
| EventCertificateWizard | `apps/web/src/components/attendance/EventCertificateWizard.tsx` | Attendance/competition certificate wizard with optional minimum attendance-days filter |
| EventAdminHub | `apps/web/src/components/attendance/EventAdminHub.tsx` | Tab page: Details, Scanner, Manage (all roles), + Certificates (admin only). Accessible via `/admin/events/:eventId/attendance` (Admin) or `/dashboard/events/:eventId/attendance` (CORE_MEMBER+) |
| AttendanceHistory | `apps/web/src/components/attendance/AttendanceHistory.tsx` | Attendee attendance history with day-count/day-label breakdown for multi-day events |
| useOfflineScanner | `apps/web/src/hooks/useOfflineScanner.ts` | localStorage offline sync hook (5 sync triggers) |

---

## Email Notification Control System

> **Status: IMPLEMENTED.** Centralized per-category email toggles + testing mode.

### Architecture

All email guards are enforced inside `EmailService.send()` and `EmailService.sendBulk()` — no route can bypass them. Each email is tagged with an `EmailCategory`:

```typescript
type EmailCategory = 'welcome' | 'event_creation' | 'registration' | 'announcement' | 'certificate' | 'reminder' | 'invitation' | 'admin_mail' | 'other';
```

**Guard evaluation order** (inside `send()`/`sendBulk()`):
1. Fetch notification settings (5-min cached, stale fallback on DB error, defaults to all-enabled)
2. Category toggle check → if disabled, suppress + log
3. Testing mode check → if on, redirect to test emails with `[TEST]` subject prefix + debug banner
4. Normal send via Brevo API

### Category → Toggle Mapping

| Category | Settings Field | Methods | Callers |
|----------|---------------|---------|---------|
| `welcome` | `emailWelcomeEnabled` | `sendWelcome` | auth.ts, passport.ts |
| `event_creation` | `emailEventCreationEnabled` | `sendNewEventToAll` | events.ts |
| `registration` | `emailRegistrationEnabled` | `sendEventRegistration` | registrations.ts |
| `announcement` | `emailAnnouncementEnabled` | `sendAnnouncementToAll` | announcements.ts |
| `certificate` | `emailCertificateEnabled` | `sendCertificateIssued` | certificates.ts |
| `reminder` | `emailReminderEnabled` | `sendEventReminder` | scheduler.ts |
| `invitation` | `emailInvitationEnabled` | `sendEventInvitation`, `sendEventInvitationWithdrawn` | invitations.ts |
| `admin_mail` | `mailingEnabled` (existing) | `sendBulk` via mail route | mail.ts |
| `other` | *(no toggle — always allowed)* | raw `send()` | attendance.ts, hiring.ts, network.ts |

### DB Fields (on Settings)

```prisma
emailWelcomeEnabled         Boolean  @default(true)
emailEventCreationEnabled   Boolean  @default(true)
emailRegistrationEnabled    Boolean  @default(true)
emailAnnouncementEnabled    Boolean  @default(true)
emailCertificateEnabled     Boolean  @default(true)
emailReminderEnabled        Boolean  @default(true)
emailInvitationEnabled      Boolean  @default(true)
emailTestingMode            Boolean  @default(false)
emailTestRecipients         String?
```

### Testing Mode

When `emailTestingMode` is `true`:
- All emails redirect to comma-separated `emailTestRecipients`
- Subject prefixed with `[TEST]`
- Yellow debug banner injected into HTML showing original recipient(s)
- If no test recipients configured → all emails suppressed + logged

### Admin UI

"Email & Notifications" card in AdminSettings.tsx (between Registration & Events and Feature Toggles):
- Testing Mode toggle + test recipients input (appears when active)
- Warning banner when testing mode is active
- 8 individual email category toggles (auto-save via PATCH)
- `mailingEnabled` moved from Feature Toggles into this card as "Admin Bulk Mail"

### Cache

- `getNotificationSettings()` — 5-min TTL, same pattern as email template config cache
- `invalidateNotificationSettingsCache()` — called from settings.ts PUT and PATCH handlers
- Stale cache fallback on DB error; defaults to all-enabled if no cache at all

---

## Playground Architecture

- **Frontend:** React app at `code.codescriet.dev` (separate Vite build)
- **Execute Server:** `apps/playground/execute-server.js` (plain JS, port 5002)
  - Proxies to Cloudflare Worker → Wandbox API
  - Fallback: Piston API
  - Python: Pyodide (browser-only, no server call)
  - Daily execution limits (configurable, default 100/day per `playgroundDailyLimit` in Settings)
  - Uses Prisma models: `PlaygroundDailyUsage`, `PlaygroundLimitReset`
- **Auth:** Shares JWT secret with main API, reads `scriet_session` cookie

---

## Important Patterns

- **Neon cold-start retry:** `withRetry()` in `apps/api/src/lib/prisma.ts` — retries on Prisma errors P1002/P2024 (connection issues)
- **Serializable transaction retry:** Event registration uses serializable isolation with 3 retry attempts for P2034 conflicts. Retries use jittered exponential backoff (50 ms × 2^attempt + random jitter) to prevent thundering-herd re-contention.
- **Atomic attendance scan:** All attendance mark operations use `updateMany({ where: { id, attended: false } })`. Result `count === 0` signals a duplicate. Never use check-then-update for attendance — it creates a TOCTOU race condition.
- **Reservation-based email dedup:** Scheduler marks `reminderSentAt` before sending; rolls back on send failure
- **DB keep-alive:** Opt-in `SELECT 1` interval (set `ENABLE_DB_KEEPALIVE=true`, default 4 min). Off by default to reduce Neon compute burn.
- **Background schedulers:** `ENABLE_BACKGROUND_SCHEDULERS=true` enables event status + reminder schedulers. Off by default.
- **Email template caching:** 5-minute TTL cache for email template config from DB. On DB error, returns stale cache (if available) instead of empty defaults — prevents blank emails during Neon cold-start timeouts.
- **ESM imports:** All API imports must use `.js` extension (even for `.ts` source files), e.g., `import { foo } from './bar.js'`
- **Response format:** `{ success: true, data: T }` via `ApiResponse.success()` or raw `res.json()` depending on route. Frontend `api.ts` unwraps `.data` automatically.
- **Prisma migrate --create-only:** Never apply schema changes with bare `prisma migrate dev`. Always generate first with `--create-only`, review the SQL in `prisma/migrations/`, then deploy with `db:migrate:deploy`. (Hard Constraint #5)
- **Prisma N+1 guard:** Any query executed inside a loop must be annotated `// N+1: consider batching` with justification, or replaced with `findMany({ where: { id: { in: ids } } })` batching.

---

## Frontend Routing (Full Route Map)

All pages are lazy-loaded with `React.lazy()` + `<Suspense>`.

### Public Routes
| Path | Component |
|------|-----------|
| `/` | HomePage |
| `/about` | AboutPage |
| `/events` | EventsPage |
| `/events/:id` | EventDetailPage |
| `/announcements` | AnnouncementsPage |
| `/announcements/:id` | AnnouncementDetailPage |
| `/team` | TeamPage |
| `/team/:slug` | TeamMemberProfilePage |
| `/achievements` | AchievementsPage |
| `/achievements/:id` | AchievementDetailPage |
| `/signin` | SignInPage |
| `/signup` | SignInPage (same) |
| `/join-us` | JoinUsPage |
| `/auth/callback` | AuthCallbackPage |
| `/network` | NetworkPage |
| `/network/onboarding` | NetworkOnboarding |
| `/network/status` | NetworkStatusPage |
| `/network/:slug` | NetworkProfilePage |
| `/join-our-network` | JoinOurNetworkPage |
| `/privacy-policy` | PrivacyPolicyPage |
| `/credits` | **CreditsPage** ← NEW |
| `/contact` | ContactPage |
| `/verify` | VerifyCertificatePage |
| `/verify/:certId` | VerifyCertificatePage |
| `/quiz` | ActiveQuizList |
| `/quiz/join` | QuizJoinPage |

### Protected User Routes (`minRole="USER"`)
| Path | Component |
|------|-----------|
| `/quiz/:quizId` | QuizPage |
| `/quiz/:quizId/results` | QuizResultsPage |
| `/quiz/create` | AdminQuizCreator |
| `/dashboard` | DashboardLayout > DashboardOverview |
| `/dashboard/events` | DashboardEvents |
| `/dashboard/announcements` | DashboardAnnouncements |
| `/dashboard/leaderboard` | DashboardLeaderboard |
| `/dashboard/events/new` | CreateEvent |
| `/dashboard/announcements/new` | CreateAnnouncement |
| `/dashboard/qotd` | CreateQOTD |
| `/dashboard/quiz` | QuizManager |
| `/dashboard/upload` | ImageUploadTool |
| `/dashboard/profile` | ProfilePage |
| `/dashboard/team/:id/edit` | EditTeamProfile |
| `/dashboard/network/edit/:id?` | EditNetworkProfile |
| `/dashboard/certificates` | DashboardCertificates |
| `/dashboard/invitations` | DashboardInvitations |
| `/dashboard/invitations/:invitationId` | DashboardInvitations (deep link alias) |

### Protected CORE_MEMBER Routes (`minRole="CORE_MEMBER"`, inside dashboard)
| Path | Component |
|------|-----------|
| `/dashboard/events/:eventId/attendance` | EventAdminHub (3 tabs: Details, Scanner, Manage) |

### Protected Admin Routes (`minRole="ADMIN"`)
| Path | Component |
|------|-----------|
| `/admin/users` | AdminUsersRealtime |
| `/admin/team` | AdminTeam |
| `/admin/achievements` | AdminAchievements |
| `/admin/credits` | **AdminCredits** ← NEW |
| `/admin/event-registrations` | AdminEventRegistrations |
| `/admin/events/:id/edit` | EditEvent |
| `/admin/events/:eventId/attendance` | EventAdminHub |
| `/admin/hiring` | AdminHiring |
| `/admin/network` | AdminNetwork |
| `/admin/certificates` | AdminCertificates |
| `/admin/audit-log` | AdminAuditLog (PRESIDENT/superAdmin only) |
| `/admin/mail` | AdminMail |
| `/admin/settings` | AdminSettings (superAdmin/PRESIDENT only) |

---

## Dashboard Sidebar Navigation

`DashboardLayout.tsx` builds nav dynamically:

**User nav** (always): Overview, My Events, Announcements, Live Quiz, Leaderboard (if `showLeaderboard`), My Profile, My Certificates (if `certificatesEnabled`), My Invitations (pending badge)

**Core Member nav** (CORE_MEMBER+): Create Event, Create Announcement, Manage QOTD, Quiz Manager, Upload Image

**Admin nav** (ADMIN/PRESIDENT) — built by `getAdminNavItems()`:
1. User Management
2. Team Management
3. Achievements
4. **Credits** ← NEW (always shown)
5. Hiring Applications (if `hiringEnabled`)
6. Network Management (if `showNetwork`)
7. Audit Log (PRESIDENT or superAdmin only)
8. Event Registrations
9. Certificates (if `certificatesEnabled`)
10. Send Mail
11. Settings (superAdmin/PRESIDENT only)

---

## Frontend API Client (`apps/web/src/lib/api.ts`)

Base URL: `import.meta.env.VITE_API_URL || 'http://localhost:5001/api'`

All requests use `fetch` with `credentials: 'include'` for cross-origin cookie support.

**Key types exported:** `AuthProviders`, `User`, `Settings`, `Event`, `Registration`, `EventInvitation`, `Announcement`, `TeamMember`, `Achievement`, `Credit`, `NetworkProfile`, `NetworkProfileInput`, `AuditLogEntry`, `HomePageData`

**`api` object methods (full list):**
- Auth: `getProviders`, `getMe`, `devLogin`, `register`, `login`, `exchangeAuthCode`, `logout`
- Events: `getEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`
- Registrations: `registerForEvent`, `cancelRegistration`, `getMyRegistrations`, `getEventRegistrations`, `deleteEventRegistration`, `exportEventRegistrations`
- Invitations: `getMyInvitations`, `acceptInvitation`, `declineInvitation`, `claimInvitation`, `searchInvitees`, `createInvitations`, `getEventInvitations`, `updateInvitation`, `revokeInvitation`, `resendInvitationEmail`
- Announcements: `getAnnouncements`, `getAnnouncement`, `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`
- Team: `getTeam`, `getTeamMember`, `getTeamMemberBySlug`, `createTeamMember`, `updateTeamMember`, `updateTeamMemberProfile`, `linkTeamMemberToUser`, `getMyTeamProfile`, `searchUsers`, `deleteTeamMember`
- Achievements: `getAchievements`, `getFeaturedAchievements`, `getAchievement`, `createAchievement`, `updateAchievement`, `deleteAchievement`
- **Credits:** `getCredits`, `getCredit`, `createCredit`, `updateCredit`, `deleteCredit`, `reorderCredits`
- QOTD: `getTodayQOTD`, `getQOTDHistory`, `createQOTD`, `submitQOTD`, `getQOTDStats`
- Stats: `getPublicStats`, `getHomePageData`, `getDashboardStats`
- Users (Admin): `getUsers`, `getUser`, `updateUser`, `updateUserRole`, `deleteUser`
- Settings: `getSettings`, `updateSettings`, `patchSetting`, `getSecurityEnvStatus`, `updateSecurityEnvSettings`
- Profile: `getProfile`, `updateProfile`, `changePassword`, `addPassword`
- Hiring: `getMyHiringApplication`
- Network (public): `getNetworkProfiles`, `getNetworkProfile`
- Network (user): `joinNetwork`, `getMyNetworkProfile`, `createNetworkProfile`, `updateNetworkProfile`
- Network (admin): `getNetworkPending`, `getNetworkAll`, `getNetworkPendingUsers`, `revertPendingNetworkUser`, `deletePendingNetworkUser`, `verifyNetworkProfile`, `rejectNetworkProfile`, `updateNetworkProfileAdmin`, `deleteNetworkProfile`, `getNetworkStats`
- Audit Logs: `getAuditLogs`
- Quiz: `getMyQuizDashboard`, `getQuizAdminList`, `importQuizFile`, `createQuiz`, `updateQuiz`, `getQuiz`, `joinQuizByPin`, `openQuiz`, `checkQuizHost`, `getQuizResults`, `deleteQuiz`
- Certificates: `getCertificates`, `generateCertificate`, `bulkGenerateCertificates`, `downloadCertificate`, `getMyCertificates`, `revokeCertificate`, `deleteCertificate`, `resendCertificateEmail`

---

## Coding Conventions

- **API routes:** Express Router, Zod validation, `ApiResponse.success()`/`ApiResponse.error()` preferred. Some older routes use raw `res.json()`.
- **Auth in routes:** Always `authMiddleware` then `requireRole('ROLENAME')`. Get current user with `getAuthUser(req)`.
- **Database:** Prisma client from `apps/api/src/lib/prisma.ts`. Wrap risky queries in `withRetry()`.
- **Logging:** `logger` from `apps/api/src/utils/logger.ts`. Never use `console.log`.
- **HTML sanitization:** `sanitizeHtml()`/`sanitizeText()` from `apps/api/src/utils/sanitize.ts` for all HTML input.
- **Audit logging:** Call `auditLog(userId, action, entity, entityId, metadata)` from `apps/api/src/utils/audit.ts` on all admin mutations.
- **Frontend routing:** `React.lazy()` + `<Suspense fallback={<PageLoader />}>` for all pages.
- **State management:** React Query (`@tanstack/react-query`) for server state (staleTime: 5min, gcTime: 30min). React context for auth/settings.
- **Styling:** TailwindCSS utility classes. `cn()` from `apps/web/src/lib/utils.ts` for conditional classes.
- **ESM imports:** Use `.js` extensions in all API TypeScript imports.
- **Zustand (quiz UI only):** Use Zustand exclusively for quiz player/host UI state requiring cross-component sync without prop drilling (`apps/web/src/lib/quizStore.ts`). Do not use for server-fetched data (use React Query instead). Do not create additional Zustand stores without discussion.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL pooler connection string (Neon) |
| `DIRECT_URL` | Yes | PostgreSQL non-pooler connection (for migrations) |
| `JWT_SECRET` | Yes | JWT signing secret (fail-fast check on startup) |
| `SUPER_ADMIN_EMAIL` | Yes | Email for super admin |
| `SUPER_ADMIN_PASSWORD` | Yes | Password for super admin (seed only) |
| `FRONTEND_URL` | Yes | Frontend origin for CORS + redirects |
| `BACKEND_URL` | No | Backend URL (defaults to localhost:5001) |
| `GOOGLE_CLIENT_ID/SECRET` | No | Google OAuth credentials |
| `GITHUB_CLIENT_ID/SECRET` | No | GitHub OAuth credentials |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `BREVO_API_KEY` | No | Brevo (Sendinblue) email API key |
| `ENABLE_DEV_AUTH` | No | Enable `/api/auth/dev-login` (dev only) |
| `ENABLE_REQUEST_LOGGING` | No | Enable request logging in production |
| `ENABLE_DB_KEEPALIVE` | No | Enable 4-min `SELECT 1` keep-alive (default: off) |
| `DB_KEEPALIVE_INTERVAL_MS` | No | Keep-alive interval (default: 240000) |
| `ENABLE_BACKGROUND_SCHEDULERS` | No | Enable event status + reminder schedulers (default: off) |
| `EVENT_STATUS_INTERVAL_MS` | No | Event status check interval (default: 1800000 = 30min) |
| `PORT` | No | API port (default: 5001) |

---

## Known Issues

1. Session cookie `httpOnly: false` — XSS can steal tokens
2. JWT in URL hash fragment after OAuth — security concern
3. No test suite anywhere in the codebase
4. Some routes use raw `res.json()` instead of `ApiResponse` utility
5. `AdminEventRegistrations` makes N+1 fetch calls (one per event for registrations) — acceptable at current scale, annotated in code
6. Certificate email fire-and-forget pattern means `emailSent` flag update could fail silently — try-catch added but pattern is inherently lossy during restarts

---

## Security Audit (March 2026)

A comprehensive security audit was performed covering CORS, XSS, auth guards, race conditions, input validation, and error handling. Key fixes applied:

### Critical Fixes Applied
- **CORS subdomain wildcard** — Changed from `endsWith('.codescriet.dev')` to explicit domain allowlist (prevents `attacker.codescriet.dev` spoofing)
- **URL sanitization XSS** — Fixed regex bypass allowing `jAvAsCrIpT:` URLs; now uses strict protocol whitelist
- **IndexNow/Playground auth** — Added missing `authMiddleware` to admin endpoints
- **Certificate pdfUrl exposure** — Removed direct Cloudinary URL from public verify endpoint
- **Events ownership** — CORE_MEMBER can only modify their own events (not any event)
- **Attendance event status** — Blocked scanning for PAST events
- **Registration token race** — Moved attendance token generation inside serializable transaction
- **Teams leader race** — Added atomic `WHERE leaderId = user.id` checks for lock/transfer/dissolve

### High Priority Fixes
- **Signature image size** — Added 3MB base64 limit validation
- **Network rejectionReason** — Applied `sanitizeHtml()` before storage
- **Mail external emails** — Specific-audience admin mail supports any valid email address (registered or external)
- **Upload MIME validation** — Server-side magic bytes check (not client mimetype)
- **Stack trace filtering** — Strips stack traces from error responses in production
- **dev-login discoverability** — Returns 404 (not 403) when disabled

### Medium Priority Fixes
- **Unbounded findMany** — Added `take: 100000` limits to mail routes
- **Playground reset atomicity** — Wrapped in `prisma.$transaction()`

### Additional Fixes (Batch 2)
- **Frontend 401 auto-logout** — Added `UnauthorizedError` class, caught in API requests
- **isSuperAdmin population** — Added field to User interface, already returned by /auth/me
- **withRetry exponential backoff** — Changed from linear to exponential backoff with jitter
- **Role hierarchy logging** — Unknown roles now warn to console instead of silent fallback
- **AuthContext cleanup** — Added mount check ref to prevent state updates after unmount
- **Export blob error handling** — Added try-catch for blob() parsing in attendance export

### Remaining Known Issues (Low Priority)
- UUID validation missing on some path params
- Some Zod schemas use `z.unknown()` for JSON fields
- Attendance token has no expiration (relies on attended flag)

---

## Deployment (Render)

Four services in `render.yaml`:
1. **club-api** — Web service, `npm run start:api`, port 5001
2. **club-web** — Static site, Vite build, serves `apps/web/dist`
3. **playground-api** — Web service, `node apps/playground/execute-server.js`, port 5002
4. **playground-web** — Static site, Vite build, serves `apps/playground/dist`

Build command includes `prisma generate` and `prisma migrate deploy`.

**Free-tier limits:** `club-api` and `playground-api` run on Render's free web service tier: 512 MB RAM, shared CPU, automatic spin-down after 15 minutes of inactivity. This is a hard architectural constraint — see Hard Constraints section.

**UptimeRobot:** An external UptimeRobot monitor pings `GET /ping` every 5 minutes to prevent free-tier spin-down. The `/ping` endpoint returns plain text `"pong"` with no DB call. Do not remove or rename this endpoint.

CORS: Uses explicit domain allowlist: `codescriet.dev`, `www.codescriet.dev`, `api.codescriet.dev`, `code.codescriet.dev`, `playground.codescriet.dev`, plus `FRONTEND_URL` env var. In dev: any `localhost` or LAN IP.

---

## Architecture Debate Standards

When proposing any non-trivial architectural change — new system, new DB model, new real-time event, background job, or external dependency — the proposal must include:

1. **Explicit tradeoffs:** List pros and cons. State what is gained and what is lost. Never propose only one side.
2. **Capacity math:** Estimate memory delta (bytes × expected concurrent users at peak), DB query count per request, and socket event frequency at 900 players.
3. **Two alternatives compared:** Example: "Option A: in-memory Map (fast, lost on restart, fits free tier) vs Option B: Redis (persistent, survives restart, requires paid service)."
4. **O(n²) flag:** If the proposal involves nested iteration over any collection that scales with users or questions, state the complexity class and the value of n at which it becomes problematic.
5. **Free-tier impact check:** Confirm the proposal fits within 512 MB RAM. If it requires a paid external service, explicitly flag it and justify the cost.

---

## File Quick Reference

| What | Where |
|------|-------|
| API entry point | `apps/api/src/index.ts` |
| Auth routes | `apps/api/src/routes/auth.ts` |
| Credits routes | `apps/api/src/routes/credits.ts` |
| Teams routes | `apps/api/src/routes/teams.ts` |
| Invitation routes | `apps/api/src/routes/invitations.ts` |
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Role middleware | `apps/api/src/middleware/role.ts` |
| JWT utilities | `apps/api/src/utils/jwt.ts` |
| Prisma client | `apps/api/src/lib/prisma.ts` |
| HTML sanitizer | `apps/api/src/utils/sanitize.ts` |
| Audit logger | `apps/api/src/utils/audit.ts` |
| Email service | `apps/api/src/utils/email.ts` |
| Event scheduler | `apps/api/src/utils/scheduler.ts` |
| API response helpers | `apps/api/src/utils/response.ts` |
| Quiz socket | `apps/api/src/quiz/quizSocket.ts` |
| Quiz state | `apps/api/src/quiz/quizStore.ts` |
| Certificate PDF | `apps/api/src/utils/generateCertificatePDF.ts` |
| Signature image processing | `apps/api/src/utils/processSignatureImage.ts` |
| Frontend auth context | `apps/web/src/context/AuthContext.tsx` |
| Frontend settings context | `apps/web/src/context/SettingsContext.tsx` |
| Frontend API client | `apps/web/src/lib/api.ts` |
| Frontend routes | `apps/web/src/App.tsx` |
| Dashboard layout | `apps/web/src/components/dashboard/DashboardLayout.tsx` |
| Dashboard invitations page | `apps/web/src/pages/dashboard/DashboardInvitations.tsx` |
| Credits public page | `apps/web/src/pages/CreditsPage.tsx` |
| Credits admin page | `apps/web/src/pages/admin/AdminCredits.tsx` |
| Event invitation admin UI | `apps/web/src/components/events/AdminEventInvitations.tsx` |
| Event guest strip | `apps/web/src/components/events/ChiefGuestsStrip.tsx` |
| Team components | `apps/web/src/components/teams/` |
| Team create modal | `apps/web/src/components/teams/TeamCreateModal.tsx` |
| Team join modal | `apps/web/src/components/teams/TeamJoinModal.tsx` |
| Team dashboard | `apps/web/src/components/teams/TeamDashboard.tsx` |
| Layout wrapper | `apps/web/src/components/layout/Layout.tsx` |
| DB Schema | `prisma/schema.prisma` |
| Playground executor | `apps/playground/execute-server.js` |
| CF Worker | `workers/executor.js` |
| Quiz host view | `apps/web/src/pages/quiz/QuizHostView.tsx` |
| Quiz leaderboard (podium + confetti) | `apps/web/src/pages/quiz/QuizLeaderboard.tsx` |
| Quiz finale splash | `apps/web/src/pages/quiz/QuizFinaleIntro.tsx` |
| Quiz results + HeatmapGrid | `apps/web/src/pages/quiz/QuizResultsPage.tsx` |
| Quiz admin controls | `apps/web/src/pages/quiz/QuizAdminPanel.tsx` |
| Quiz Zustand store (frontend) | `apps/web/src/lib/quizStore.ts` |
| Quiz scoring utilities | `apps/web/src/lib/quizScoring.ts` |
| Quiz socket hook | `apps/web/src/hooks/useQuizSocket.ts` |
| Quiz timer hook | `apps/web/src/hooks/useQuizTimer.ts` |
| Attendance routes | `apps/api/src/routes/attendance.ts` |
| Attendance token util | `apps/api/src/utils/attendanceToken.ts` |
| Attendance socket | `apps/api/src/attendance/attendanceSocket.ts` |
| Attendance admin hub | `apps/web/src/components/attendance/EventAdminHub.tsx` |
| Attendance QR scanner | `apps/web/src/components/attendance/AdminScanner.tsx` |
| Attendance manager | `apps/web/src/components/attendance/AttendanceManager.tsx` |
| Attendance QR ticket | `apps/web/src/components/attendance/QRTicket.tsx` |
| Attendance cert wizard | `apps/web/src/components/attendance/EventCertificateWizard.tsx` |
| Attendance history | `apps/web/src/components/attendance/AttendanceHistory.tsx` |
| Offline scanner hook | `apps/web/src/hooks/useOfflineScanner.ts` |
| Registration status utility | `apps/web/src/lib/registrationStatus.ts` |

---

## Living Document Protocol

This file is the **single source of truth** for AI agents working on this codebase. It must stay in sync with the actual implementation. Update the relevant section **in the same commit** as the code change when any of the following occur:

| Trigger | Section to update |
|---------|------------------|
| New route mounted in `apps/api/src/index.ts` | All API Routes |
| New Prisma model or enum in `schema.prisma` | Full Database Schema, Enums |
| New frontend page/route in `apps/web/src/App.tsx` | Frontend Routing |
| New Socket.io event in `quizSocket.ts` | Quiz System Architecture → Socket Events Reference |
| New environment variable | Environment Variables |
| New Hard Constraint identified | Hard Constraints |
| Architectural proposal evaluated and rejected | Relevant system's "Previously Evaluated & Rejected" subsection |
| New npm dependency installed | Tech Stack |
| New quiz UI component created | Quiz System Architecture → Frontend UI Components + File Quick Reference |
| Attendance system feature implemented | Attendance System (move from "planned" to actual description) |
| New attendance socket event | Attendance System → Socket.io Namespace |

### Staleness Rule

If a section is known to be out of date but not yet corrected, add this annotation directly below the section heading:

```
> WARNING: STALE — last verified YYYY-MM-DD. Do not rely on this section until updated.
```

### Sync Rule

**Do not let this file become aspirational documentation.** If the code does not yet do something (e.g., attendance system routes), clearly mark it "planned" or "NOT IMPLEMENTED" — never state planned work as present fact. If this file and the actual codebase ever contradict each other, **the codebase wins** — update this file to reflect reality.
