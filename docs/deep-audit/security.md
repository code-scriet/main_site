# Security & Trust Boundaries Audit (Dimension H)

**Scope:** Every trust boundary in the codebase — HTTP routes, Socket.io namespaces, internal server-to-server, code-execution chain, secret handling, input validation, data exposure, CSRF/CORS/cookies, abuse/DoS, multi-tenant leakage.

**Verdict:** **Good** — HS256 pinning, purpose allowlist partitions special tokens, tokenVersion force-logout, attendance QR separate secret, code-exec chain hardened. Only gap: JWT middleware uses blocklist instead of allowlist for `purpose` claim.

---

## Trust Boundary Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL INPUTS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  HTTP:  body / query / param / header / cookie / file upload                │
│  WS:    socket.io payloads (quiz / competition / attendance)                │
│  OAuth: Google / GitHub profile + code exchange                             │
│  Code:  user-submitted source (playground / judge / contest)                │
│  Webhook: Brevo email events, Cloudinary upload notifications               │
│  Internal: /internal/* endpoints (contest relay, plagiarism offload)        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION GATES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  authMiddleware (HTTP)          → HS256, purpose blocklist, tokenVersion,  │
│                                  soft-delete, 30s userAuthCache            │
│  optionalAuthMiddleware         → fail-open on DB error (minor)            │
│  authenticateSocketConnection   → same verifyToken, QUIZ block gate        │
│  optionalAuth (playground)      → FAIL-OPEN on revocation check (F-P5)     │
│  verifyAttendanceToken          → separate ATTENDANCE_JWT_SECRET, 20min TTL│
│  verifyOAuthExchangeCode        → 30s TTL, single-use jti, purpose=oauth   │
│  verifyInvitationClaimToken     → 30d TTL, purpose=invitation_claim        │
│  verifyQotdReopenToken          → 180d TTL, nonce per reopen session       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHORIZATION MATRIX                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Role hierarchy: PUBLIC=0 → USER/NETWORK=1 → MEMBER=2 → CORE_MEMBER=3 →    │
│  ADMIN/PRESIDENT=4 (requireRole(minRole) uses roleTier >=)                 │
│                                                                             │
│  Per-route gates (sample):                                                  │
│  - /api/users/*                  → ADMIN (self /export capped 100)         │
│  - /api/registrations (POST)     → serializable txn, capacity gate         │
│  - /api/events (PUT/DELETE)      → ownership check (createdBy)             │
│  - /api/competition/*            → ADMIN + state machine guards            │
│  - /api/certificates (POST/bulk) → ADMIN, backdate PRES/SA only            │
│  - /api/attendance/*             → CORE_MEMBER, scan window, backdate gate │
│  - /api/quiz socket              → token + registration + role + QUIZ block│
│  - /competition socket (relay)   → live DB role + tokenVersion + reg check │
│  - /internal/*                   → constant-time INTERNAL_API_SECRET       │
│                                                                             │
│  Admin-deep-control verified:                                              │
│  - PRESIDENT/ADMIN cannot be demoted by ADMIN (roleFloor on promotion)     │
│  - Self-edit banned for role ≥ ADMIN                                       │
│  - Self-delete banned for role ≥ ADMIN                                     │
│  - Force-logout via tokenVersion bump + userAuthCache invalidate           │
│  - Soft-delete (isDeleted) checked at every auth middleware                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INPUT VALIDATION & INJECTION                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Zod schemas on every route (exports ~120 schemas)                         │
│  JSON fields: registrationFields, customFieldResponses, hiddenTests,       │
│  difficultyWeights, answerDistribution — all z.unknown() but sanitized     │
│  on read via sanitizeHtml/sanitizeText (DOMPurify allowlist)               │
│  SQL: ALL raw queries use Prisma $queryRaw/$executeRaw with tagged         │
│  templates — NO string interpolation found (grep verified)                 │
│  XSS: sanitizeHtml on write (rich fields) + DOMPurify on render (client)   │
│  SSRF: Cloudinary fetch (signature images), OAuth, webhooks, CF Worker →   │
│  Wandbox/godbolt — all Origin/URL allowlisted, no user-controlled fetch    │
│  Path traversal: none (no local fs writes; uploads → Cloudinary)           │
│  Upload pipeline: magic-byte MIME check (PNG/JPEG/WEBP/PDF) + 5MB cap      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CODE EXECUTION SURFACE (HOSTILE BY DEFINITION)    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Playground → execute-server.js (Tier 2) → CF Worker → Wandbox/godbolt     │
│                                                                             │
│  Hardening:                                                                 │
│  - 100 KB code cap, 10 KB stdin cap (enforced BEFORE regex scan)           │
│  - Security regex patterns (os, subprocess, fs, net, http, child_process)  │
│  - execute-server rate limits: daily quota (Settings) + 30/min/IP          │
│  - CF Worker: Origin allowlist + M1 constant-time secret (EXECUTOR_SECRET) │
│  - CF Worker: bounded upstream fetch (12s timeout + client abort awareness)│
│  - Provider chain: primary first, fallback on infra failure (EAGAIN/126)   │
│  - Response sanitization: strips wandbox/godbolt URLs, normalizes filenames│
│  - Pyodide (Python) runs client-side — no server call                      │
│  - Plagiarism offload: reads code from DB, O(N²) on playground box         │
│                                                                             │
│  Gaps:                                                                      │
│  - F-P5: optionalAuth fail-open on revocation check (30s TTL)              │
│  - F-W2: CF Worker no per-request body size cap                            │
│  - F-P7: execCache 64-bit prefix collision possible (not practical)        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SECRETS & DATA EXPOSURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  JWT secret: fail-fast in prod if default/insecure (getJwtSecret)          │
│  ATTENDANCE_JWT_SECRET: separate from API secret, stored in Settings       │
│  INDEXNOW_KEY, EXECUTOR_SECRET, INTERNAL_API_SECRET: privileged, never     │
│  leaked to client (settingsCache strips them from responses)               │
│  PII in public payloads:                                                   │
│  - Certificate verify: pdfUrl EXCLUDED (line 1370 certs.ts), revoked only  │
│  - Quiz leaderboard: displayName only, no email/avatar                     │
│  - Attendance live: participant lane only (participantsOnly filter)        │
│  - Network profiles: phone private (admin contact only)                    │
│  Error responses: prod stack traces stripped (Pino + no res.stack)         │
│  JWT secret checked against insecure defaults at startup                   │
│  Attendance JWT secret: separate runtime secret from API JWT               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CSRF / CORS / COOKIES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  CSRF: Bearer token auth (stateless) — no cookie CSRF on mutating writes   │
│  BUT: scriet_session cookie IS httpOnly+Secure+SameSite=Lax (set by API)   │
│  Cross-subdomain cookie on .codescriet.dev for playground SSO              │
│  CORS: explicit allowlist (FRONTEND_URL, code.codescriet.dev, etc.)        │
│  NO subdomain wildcard regression (explicit origins array)                 │
│  Cookie flags: httpOnly=true, secure=true (prod), sameSite=lax            │
│  Playground reads cookie via optionalAuth (decodeURIComponent guarded)     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ABUSE & DoS (FREE-TIER REALITY)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Rate limits present:                                                       │
│  - /api/execute: daily quota + 30/min/IP                                   │
│  - /internal/*: 60/min (skip if validInternalSecret)                       │
│  - /auth/*: general 500/15m (no per-route)                                 │
│  - /scan-beacon: 10/min/IP                                                 │
│  - Quiz submit_answer: 500ms per user per question (in-memory)             │
│  - Quiz join: MAX_ACTIVE_ROOMS=60 (env override)                           │
│  - Attendance scan-batch: 500 tokens max                                   │
│  - Certificate bulk: 200 recipients max                                    │
│  - Email absentees: 250 cap per request                                    │
│  - Quiz export: 900-player leaderboard capped at 10 broadcast              │
│                                                                             │
│  Gaps:                                                                      │
│  - No rate limit on /api/auth/register (UI-only gate F-L2)                 │
│  - No rate limit on hiring apply (general 500/15m only)                    │
│  - No per-route limit on PDF generation (certificates)                     │
│  - No per-route limit on Excel export (events)                             │
│  - Quiz/competition emit paths: amplification vector (throttled 1s)        │
│  - ReDoS: no user-fed regex found (blocked patterns are static)            │
│  - OOM risk: MAX_ACTIVE_ROOMS=60, per-room ~50KB = 3MB safe                │
│  - Neon connection pool: max 5 (playground) + shared PrismaClient          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-TENANT LEAKAGE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Event capacity: PARTICIPANT vs GUEST counted separately                   │
│  Team membership: serializable create/join + invite-code candidates        │
│  Invitation claim: status + email match + registrationId link              │
│  Competition scope: ALL vs SELECTED_TEAMS (allowedTeamIds enforced)        │
│  Round participation: getRoundParticipationError checks scope + team       │
│  Certificate dedup: per-event per-type per-recipient (position for comp)   │
│  QOTD streak: materialized currentStreak/longestStreak on User             │
│  No cross-event data leakage found in queries (all scoped by eventId)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Findings (Dimension H)

### F-S1 [low] — JWT middleware uses blocklist instead of allowlist for `purpose`
- **Where:** `apps/api/src/middleware/auth.ts:87`, `apps/playground/execute-server.js:274`
- **What:** `if (typeof decoded.purpose === 'string') return 401` — rejects any token with a `purpose` claim
- **Problem:** Future special-purpose tokens (e.g., `purpose: 'password_reset'`) would slip through because blocklist misses new values. Allowlist (`purpose === undefined`) is safer.
- **Exploit:** If a new token type is added without updating both middlewares, it could authenticate as a session.
- **Fix:** Change to `if (decoded.purpose !== undefined) return 401` (allowlist).
- **Cost:** FREE

### F-P5 [high] — Playground `optionalAuth` swallows revocation failures fail-open
- **Where:** `apps/playground/execute-server.js:283-284`
- **What:** `isAccountRevoked` returns `false` on any DB error (catch → allow). Force-logout is cosmetic for up to 30s TTL.
- **Problem:** Admin force-logout (tokenVersion bump) does not immediately revoke playground access.
- **Exploit:** Cheater force-logged from contest can keep executing code for up to 30s.
- **Fix:** On DB error, return `true` (fail-closed) OR invalidate cache and re-check. Prefer fail-closed for security gate.
- **Cost:** FREE

### F-S2 [low] — Socket IP from raw X-Forwarded-For (spoofable)
- **Where:** `apps/api/src/utils/socket.ts` (rate-limit keying)
- **What:** Socket.io rate limiting uses raw `socket.handshake.headers['x-forwarded-for']` without trust-proxy validation.
- **Problem:** Behind Cloudflare, `req.ip` is the CF edge IP; socket handshake may differ. Inconsistent with HTTP `getClientIp()`.
- **Fix:** Align socket IP extraction with `utils/clientIp.ts` logic (x-forwarded-for → x-real-ip → remoteAddress) and set `trust proxy` in Express.
- **Cost:** CONFIG

### F-W2 [medium] — CF Worker no per-request body size cap
- **Where:** `workers/executor.js` (no size check before `request.json()`)
- **What:** Upstream body unbounded; a malicious caller could POST large JSON to exhaust worker memory.
- **Fix:** Check `Content-Length` header or stream with size limit before parsing.
- **Cost:** FREE

### F-G2 [low] — Trust proxy / CF rate-limit keying unverified
- **Where:** `apps/api/src/index.ts` (no `app.set('trust proxy', 1)`)
- **What:** Express doesn't trust Cloudflare proxy; `req.ip` = CF edge IP for all requests.
- **Problem:** Rate limiters keyed on `req.ip` (or `getClientIp`) would bucket all traffic together if `x-forwarded-for` not used correctly.
- **Fix:** Add `app.set('trust proxy', 1)` and verify `getClientIp` extracts real client IP.
- **Cost:** CONFIG

---

## Per-Route Authorization Matrix (Actual vs Intended)

| Route | Auth | Role Gate | Ownership / Scope Check | Verified |
|---|---|---|---|---|
| POST /api/auth/register | ✓ | — | email unique | ✓ (but F-L2: registrationOpen not enforced) |
| POST /api/auth/login | ✓ | — | bcrypt + tokenVersion | ✓ |
| POST /api/auth/oauth/callback | ✓ | — | state/CSRF via cookie | ✓ |
| GET /api/users/me | ✓ | — | self | ✓ |
| GET /api/users/export | ✓ | ADMIN | — | ✓ (F-C1: caps at 100) |
| PATCH /api/users/:id | ✓ | ADMIN | self-edit banned for ≥ADMIN | ✓ |
| POST /api/registrations | ✓ | — | serializable txn + capacity | ✓ |
| PUT /api/events/:id | ✓ | ADMIN | createdBy ownership | ✓ |
| POST /api/certificates/generate | ✓ | ADMIN | backdate PRES/SA only | ✓ |
| POST /api/attendance/scan | ✓ | CORE_MEMBER | scan window + registration bound | ✓ |
| POST /api/quiz/join | ✓ | — | quizAccessToken + registration | ✓ |
| /quiz socket | ✓ | — | token + QUIZ block + registration | ✓ |
| /competition socket | ✓ | — | live DB role + tokenVersion + reg | ✓ |
| /internal/* | ✓ | — | constant-time INTERNAL_API_SECRET | ✓ |

---

## Verification Recipes

1. **Force-logout propagation:** `curl -H "Authorization: Bearer <old_token>" /api/users/me` after admin bumps tokenVersion → 401
2. **Attendance QR secret isolation:** Sign QR with ATTENDANCE_JWT_SECRET, verify with API JWT secret → must fail
3. **Quiz block gate:** Create block `INSERT INTO user_blocks (user_id, feature) VALUES ('...', 'QUIZ')`, join quiz → must reject
4. **Internal secret timing:** `time curl -H "X-Internal-Secret: wrong" /internal/contest-emit` vs valid → constant-time
5. **CF Worker secret gate:** Call worker without `X-Executor-Secret` when `EXECUTOR_SECRET` set → 403
6. **CORS origin spoof:** `curl -H "Origin: https://evil.com" /api/execute` → 403
7. **SQL injection:** `curl "GET /api/events?search=' OR 1=1--"` → sanitized, no error
8. **File upload:** POST `/api/upload/image` with PHP shell → magic-byte reject