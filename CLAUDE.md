# CLAUDE.md — code.scriet Club Platform

## Project Overview

**code.scriet** is a full-stack web platform for CCSU's (Chaudhary Charan Singh University) coding club. It handles events, announcements, team management, achievements, hiring applications, a professional/alumni network, live quizzes, a code playground, and certificate generation.

**Production URLs:**
- Frontend: `https://codescriet.dev`
- API: `https://api.codescriet.dev`
- Playground: `https://code.codescriet.dev`
- Code Executor Worker: Cloudflare Worker (proxies to Wandbox API)

## Monorepo Structure

```
club_site/
├── apps/
│   ├── api/          # Express.js backend (TypeScript)
│   ├── web/          # React frontend (Vite + TypeScript)
│   └── playground/   # Code playground (React frontend + Express execute-server)
├── packages/         # Shared packages (currently unused)
├── prisma/           # Database schema and migrations
│   ├── schema.prisma
│   └── seed.ts
├── workers/
│   └── executor.js   # Cloudflare Worker for code execution proxy
├── scripts/          # Shell scripts (migrate, free ports)
├── render.yaml       # Render deployment blueprint (4 services)
└── .github/workflows/ci.yml
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js, TypeScript, Node.js 20 |
| Frontend | React 18, Vite, TypeScript, TailwindCSS |
| Database | PostgreSQL (Neon serverless) via Prisma ORM |
| Auth | Passport.js (Google, GitHub OAuth), JWT, bcryptjs |
| Real-time | Socket.io (quiz system, live updates) |
| Email | Brevo (Sendinblue) API via `sib-api-v3-sdk` |
| File Storage | Cloudinary (images, certificate PDFs) |
| PDF | @react-pdf/renderer (server-side certificate generation) |
| Data Export | ExcelJS (event registrations, user lists) |
| Deployment | Render (4 services), Cloudflare Workers |
| Package Manager | npm with workspaces |

## Key Commands

```bash
# Development
npm run dev                    # Start API + Web in dev mode (concurrently)
npm run dev:api                # API only (port 5001)
npm run dev:web                # Web only (port 5173)

# Build
npm run build                  # Build all workspaces
npm run build:api              # Build API only
npm run build:web              # Build Web only

# Database
npm run db:migrate             # Run migrations (dev)
npm run db:migrate:deploy      # Run migrations (production)
npm run db:generate            # Regenerate Prisma client
npm run db:push                # Push schema without migration
npm run db:seed                # Seed super admin + default settings
npm run db:studio              # Open Prisma Studio

# Linting
npm run lint:api               # Lint API
npm run lint:web               # Lint Web
```

## Database Schema (Key Models)

- **User** — id, name, email, password?, oauthProvider, oauthId, role, avatar, profile fields, profileSlug
- **Event** — id, title, slug, description, dates, venue, capacity, registrations, customFields (JSON), status enum
- **EventRegistration** — userId + eventId (unique), customFieldValues (JSON), reminderSentAt
- **Announcement** — title, content (rich HTML), slug, priority, pinned
- **TeamMember** — name, role, position, social links
- **Achievement** — title, description, image, date
- **QOTD** — question of the day, active flag
- **HiringApplication** — userId, type enum, status enum, answers (JSON)
- **NetworkProfile** — userId (1:1), type (professional/alumni), bio (rich HTML), skills, experience, verified flag, slug + legacySlugs
- **Certificate** — eventId, recipientName/Email, certificateCode (unique), pdfUrl, verified, viewCount
- **Quiz/QuizQuestion/QuizParticipant/QuizAnswer** — live quiz system with scoring
- **Execution** — playground code execution records
- **Snippet** — saved playground code snippets
- **AuditLog** — admin action logging
- **Settings** — singleton (id='default'), feature toggles, social URLs, email templates

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

Super admin is determined by matching `process.env.SUPER_ADMIN_EMAIL`. Only super admin and PRESIDENT can modify settings.

## Auth Flow

1. **Email/Password:** Register/login → JWT returned in response body + `scriet_session` cookie
2. **OAuth (Google/GitHub):**
   - Redirect to provider → callback → Passport creates/finds user
   - Network intent stored in short-lived cookies (`oauth_intent`, `network_type`)
   - Redirect to `/auth/callback#token=<jwt>&intent=...`
   - Frontend extracts token from hash, stores in `localStorage`
   - Cross-subdomain cookie `scriet_session` set on `.codescriet.dev` for playground access
3. **Token:** JWT with 7-day expiry, contains `userId`, `email`, `name`, `role`
4. **Middleware:** `authMiddleware` extracts token from Bearer header or cookie, does DB lookup

## Quiz System Architecture

- **In-memory only during active quiz** — `quizStore.ts` uses `Map<string, QuizRoom>`. No DB writes until quiz ends.
- **Socket.io namespace:** `/quiz` with JWT auth middleware
- **Events:** `join`, `start`, `next_question`, `submit_answer`, `end`, `pause`, `resume`, `extend_time`, `skip`, `kick`
- **Scoring:** Base points (1000) + time bonus (faster = more points) + streak bonus (consecutive correct answers)
- **Auto-advance:** Server-side timers advance questions. Pausing clears timers.
- **Rate limiting:** 500ms per user per answer submission
- **Persistence:** On quiz end, results written to `QuizParticipant` + `QuizAnswer` tables. Graceful shutdown persists active sessions as `ABANDONED`.

## Certificate System

- PDF generated server-side via `@react-pdf/renderer`
- Logo pre-loaded as base64 (CCSU logo from `apps/api/public/logos/`)
- QR code embedded (links to public verification URL)
- Uploaded to Cloudinary, URL stored in DB
- Bulk generation supported (loops through registered users)
- Public verification at `/api/certificates/verify/:code` (increments view count)
- Emailed to recipients via Brevo

## Playground Architecture

- **Frontend:** React app at `code.codescriet.dev` with Monaco-like editor
- **Execute Server:** Express.js (`apps/playground/execute-server.js`, plain JS)
  - Proxies code execution to Cloudflare Worker → Wandbox API
  - Fallback: Piston API for additional languages
  - Python: Pyodide (runs in browser, no server call)
  - Manages daily execution limits (200/day for C/C++/Java)
  - Creates its own DB tables via raw SQL (not in Prisma schema)
- **Auth:** Shares JWT secret with main API, reads `scriet_session` cookie

## Important Patterns

- **Neon cold-start retry:** `withRetry()` in `apps/api/src/lib/prisma.ts` retries on P1002/P2024 errors
- **Serializable transaction retry:** Event registration uses serializable isolation with 3 retry attempts for P2034 conflicts
- **Reservation-based email dedup:** Scheduler marks `reminderSentAt` before sending, rolls back on failure
- **Keep-alive:** 4-minute interval `SELECT 1` to prevent Neon cold starts
- **Email template caching:** 5-minute TTL cache for email template config from DB

## Environment Variables (Key)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Neon) |
| `JWT_SECRET` | Yes | JWT signing secret (checked against insecure defaults) |
| `SUPER_ADMIN_EMAIL` | Yes | Email for super admin account |
| `SUPER_ADMIN_PASSWORD` | Yes | Password for super admin (used in seed) |
| `FRONTEND_URL` | Yes | Frontend origin for CORS and redirects |
| `BACKEND_URL` | No | Backend URL (defaults to localhost:5001) |
| `GOOGLE_CLIENT_ID/SECRET` | No | Google OAuth credentials |
| `GITHUB_CLIENT_ID/SECRET` | No | GitHub OAuth credentials |
| `CLOUDINARY_*` | No | Cloudinary cloud name, API key, secret |
| `BREVO_API_KEY` | No | Brevo email API key |
| `ENABLE_DEV_AUTH` | No | Enable dev-login endpoint (dev only) |
| `ENABLE_REQUEST_LOGGING` | No | Enable request logging in production |

## Coding Conventions

- **API routes:** Express Router, Zod validation, `ApiResponse.success()`/`ApiResponse.error()` for responses (though not consistently used — some routes use raw `res.json()`)
- **Auth:** Always use `authMiddleware` + `requireRole()` middleware chain. Get user with `getAuthUser(req)`.
- **Database:** Use Prisma client from `apps/api/src/lib/prisma.ts`. Wrap flaky queries in `withRetry()`.
- **Logging:** Use `logger` from `apps/api/src/utils/logger.ts` (not `console.log`)
- **HTML input:** Sanitize with `sanitizeHtml()`/`sanitizeText()` from `apps/api/src/utils/sanitize.ts`
- **Frontend routing:** Lazy-loaded with `React.lazy()` + `Suspense`, protected by `ProtectedRoute` component
- **State management:** React Query (`@tanstack/react-query`) for server state, React context for auth
- **Imports:** Use `.js` extensions in API imports (ESM compatibility with TypeScript)

## Known Issues

See `issues.md` for the full list. Critical items:
1. Session cookie `httpOnly: false` — XSS can steal tokens
2. JWT in URL hash fragment after OAuth
3. Playground tables managed via raw SQL outside Prisma
4. No test suite anywhere in the codebase
5. 38+ AI-generated markdown files tracked in git

## Deployment (Render)

Four services defined in `render.yaml`:
1. **club-api** — Web service, `npm run start:api`, port 5001
2. **club-web** — Static site, built with Vite, serves from `apps/web/dist`
3. **playground-api** — Web service, `node apps/playground/execute-server.js`, port 5002
4. **playground-web** — Static site, built with Vite, serves from `apps/playground/dist`

Build command includes `prisma generate` and `prisma migrate deploy`.

## File Quick Reference

| What | Where |
|------|-------|
| API entry point | `apps/api/src/index.ts` |
| Auth routes | `apps/api/src/routes/auth.ts` |
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Role middleware | `apps/api/src/middleware/role.ts` |
| JWT utilities | `apps/api/src/utils/jwt.ts` |
| Prisma client | `apps/api/src/lib/prisma.ts` |
| HTML sanitizer | `apps/api/src/utils/sanitize.ts` |
| Email service | `apps/api/src/utils/email.ts` |
| Event scheduler | `apps/api/src/utils/scheduler.ts` |
| Quiz socket | `apps/api/src/quiz/quizSocket.ts` |
| Quiz state | `apps/api/src/quiz/quizStore.ts` |
| Certificate PDF | `apps/api/src/utils/generateCertificatePDF.ts` |
| Frontend auth | `apps/web/src/context/AuthContext.tsx` |
| Frontend API client | `apps/web/src/lib/api.ts` |
| Frontend routes | `apps/web/src/App.tsx` |
| Playground executor | `apps/playground/execute-server.js` |
| CF Worker | `workers/executor.js` |
| DB Schema | `prisma/schema.prisma` |
