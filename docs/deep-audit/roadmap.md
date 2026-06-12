# Roadmap — sequenced PRs (impact-per-effort order)

> Assumes PRs #46–#50 (perf plan) merge first; nothing below conflicts with them. Effort S < ½ day, M ≈ 1–2 days, L > 2 days. Verification gates reference [report.md §7-style recipes inline per finding].

## Wave 0 — config, not code (do this week)

| PR/Action | Contents | Effort | Impact | Risk | Gate |
|---|---|---|---|---|---|
| **0a. Ship security headers** [CONFIG] | Render dashboard headers or CF Transform Rule from render.yaml block; CSP as Report-Only first week | S | Security (high) | Low (report-only ramp) | `curl -sI` shows CSP-RO/HSTS/XFO on cache MISS; zero CSP reports after a week → enforce |
| **0b. API buildFilter** [CONFIG] | `buildFilter` on codescriet-api (apps/api/**, prisma/**) | S | Ops — web deploys stop killing live quizzes | None | push a web-only commit, API doesn't redeploy |
| **0c. $0 observability** [CONFIG] | UptimeRobot keyword monitor on `/health/db`; Render log alerts on quiz-persist failures; Sentry free on web | S | Ops | None | trigger `/health/db` 503 in dev path; see alert |
| **0d. IP-resolution experiment** | 24 h prod log of `req.ip` vs `cf-connecting-ip` vs XFF | S | Settles S2/S8 + the open June Cloudflare item | None | log analysis → follow-up PR if mismatched |

## Wave 1 — `fix/security-logic` (one PR, all S-effort code fixes)

| Item | Finding | Gate |
|---|---|---|
| JWT purpose allowlist + single-use exchange code | S1 | unit: oauth_exchange token → 401 on /me; double exchange → 400 |
| tokenVersion bump on change/add-password (+ fresh token in response) | S6 | tab-B 401 test |
| `start_quiz` status guard | B1 | double-emit test, index stays 0 |
| Quiz questions hidden mid-quiz | B4 | participant fetch during ACTIVE → `questions: []` |
| Null pin/joinCode on quiz end | B5 | open → finish → open new quiz with forced same pin seed |
| start_quiz hydration passes joinCode/pin | B2 | restart-lobby manual check |
| Kick list per room | B3 | kicked join_quiz → KICKED error |
| crash handlers → graceful shutdown | G1 | dev throw-in-timer → clean drain log |
| users export cursor-batched | C1 | 150-user export has 150 rows |
| settings reset preserves security-env | S9 | reset → attendanceJwtSecret intact |
| per-route limiters (hiring, polls vote/feedback) + mail emails .max(500) | S10 | 429 tests |

Effort: M total. Impact: closes every blocker/high/medium logic+security finding. Risk: low — each item is a few lines with a test.

## Wave 2 — `perf/web-chunks` (S) + `design/public-system` (L)

| PR | Contents | Effort | Impact | Gate |
|---|---|---|---|---|
| **2a. Chunk surgery** | Split vendor-qr (render vs scan); drop jsqr (use html5-qrcode.scanFile); delete rehype-highlight + stale manualChunk; run visualizer on the 95 KB index chunk and act on the report | S | User-facing: −148 KB gz on quiz join + tickets | build-output sizes; QuizLobby network tab |
| **2b. Public design resolution (W3)** | Owner decision first: **finish** cream/ink/Newsreader (recommended — distinctive, matches taste) or **excise** it. If finish: Home → Events → EventDetail → Team-adjacent pages, then delete amber tokens + Outfit/Sora/Fira from index.html | L (finish) / S (excise) | User-facing: brand coherence + ~100–150 KB fonts | Lighthouse before/after on `/`, `/events`; screenshot review per page |
| **2c. UX fixes #1–#4** | QR-encodes-join-link, ?next= return-after-signin, host-disconnect countdown, leaderboard states | M | User-facing (top of the ranked list) | manual flows + 1 Playwright spec each |

## Wave 3 — `db/constraints-and-retention`

| PR | Contents | Effort | Impact | Risk | Gate |
|---|---|---|---|---|---|
| **3a. M1+M2 migrations** | unique (quizId,position), lower(email) unique, CHECKs, enums | S | Server/data integrity | Pre-flight SELECTs for violating rows | `--create-only` review; migrate on staging copy first |
| **3b. M5 retention** | pruner covers NotificationFeed, CompetitionAutoSave (+ QuizAnswer policy decision); AuditLog policy decision logged | S | Server (storage flat at 3-yr scale) | deletes are batched like Executions | dry-run counts vs expectations |
| **3c. M3 hiring cycles** | cycle column + unique swap + UX copy (Fix #7) | S | User-facing next hiring season | low | re-apply flow test |

## Wave 4 — quality-of-life & deferred

| PR | Contents | Effort | Notes |
|---|---|---|---|
| 4a. `test/e2e-core-flows` | 5 Playwright specs: register-for-event (incl. capacity race via two contexts), team join, quiz happy-path, attendance scan, password reset | M | **Gates the Express-5/zod-4 upgrades**; do before them |
| 4b. ExcelJS streaming for quiz export | B6 | S | only blocking for >~400-player quizzes |
| 4c. `chore/response-shape` | ApiResponse sweep, one router per commit | M | mechanical; do opportunistically |
| 4d. M4 email-templates table | A1 | M | next time an email category is added |
| 4e. Dep upgrades | Prisma 6 → (later) Express 5, zod 4 (api), Tailwind 4 | M each | sequenced, each behind 4a's e2e gate |
| 4f. ProfileContent extraction (A2) + uuid migration (A9) | bundled together when the next big schema feature lands | L | scoped in schema-redesign.md §3 |
| 4g. RHF adoption for remaining forms + inline field errors (UX #5) | M | piggybacks on existing dep |
| 4h. Doc sync | CLAUDE.md: route map (+/admin/notifications), public design system reality, requireRole('PRESIDENT') note, audit-retention endpoint | S | same-commit rule applies |

## Dependencies between waves
- 0d → (possible) follow-up IP fix in Wave 1 scope.
- 2b before any other public-page UX/styling work.
- 4a before 4e (upgrades) — e2e is the regression net.
- 3a's enum migration before any code that writes new enum values.

## Explicitly not scheduled (decided against)
Redis/queues/SSE; framework swaps; monorepo restructure; Settings→KV; standalone uuid migration; client-clock quiz timing. Reasons in [report.md — Rejected](report.md).
