# UI/UX Walkthrough — every route in App.tsx (+ playground)

> Method: code-level walkthrough (component structure, loading/empty/error branches, responsive classes, focus handling) plus a repo-wide three-state heuristic sweep. Routes were **not** screenshotted in a running browser this pass — items marked ✱ should be eyeballed before acting. The design-system context for everything below: the public site is mid-migration between **amber/Outfit-Sora** and **cream-ink-ember/Newsreader** ([report W3](report.md)) — that one resolution outranks every individual polish item.

Legend: L/E/X = loading / empty / error state present in code. ✱ = verify visually.

## Public routes

| Route | L | E | X | Assessment |
|---|---|---|---|---|
| `/` HomePage | via hook | — | — | Data via `useHomePageData` with cached fallbacks, so 0 inline states is acceptable; hero is the brand moment — **first page to migrate in the W3 resolution** ✱ |
| `/about` | static | — | — | OK (file-managed content) |
| `/events` | ✓ | ✓ | ✓ | OK; card grid is information-dense ✱ |
| `/events/:id` EventDetailPage | ✓ | ✓ | ✓ | 1,838 lines — the platform's most important public page. Registration CTA states are thorough (closed/full/late/team). The 30 s competition poll for every visitor is PR-3 territory. **Flow gap:** anonymous visitor → "Sign in to register" → after OAuth lands on `/dashboard`, not back on the event ✱ — see Fix #2 |
| `/announcements`, `/:id` | ✓ | ✓ | ✓ | OK |
| `/polls/:slug` | ✓ | ✓ | ✓ | OK; anonymous votes handled |
| `/team` | ✓ | — | — | Shipped reference design (warm hero + portraits) — owner-approved, leave alone |
| `/team/:slug` | ✓ | ✓ | — | allowHtml rich content verified sanitized; no error state — broken slug shows infinite skeleton ✱ → Fix #9 |
| `/achievements`, `/:id` | ✓ | ✓ | ✓ | Only page on the new `--pub-*` system — currently the odd one out |
| `/signin`, `/signup` | ✓ | — | ✓ | Good provider detection + registrationOpen messaging (UI-only — see report L2) |
| `/forgot-password`, `/reset-password` | ✓ | — | ✓ | Clean dual-mode page |
| `/join-us` | ✓ | — | ✓ | Hiring form; per-team toggles respected. **Microcopy gap:** submitting twice says "email already exists" — confusing for returning applicants (report A11) |
| `/join-our-network` | ✓ | — | — | Invitation-claim deep link works; error path silent ✱ |
| `/network` | ✓ | ✓ | ✓ | OK |
| `/network/onboarding` | ✓ | — | ✓ | The one react-hook-form page — ironically the best-validated form in the app. 1,015 lines, multi-step; keep |
| `/network/:slug`, `/network/status` | ✓ | — | — | Missing error states ✱ |
| `/verify`, `/verify/:certId` | ✓ | — | ✓ | QR-image upload decode (jsqr). Good public artifact. Mobile camera-roll flow works ✱ |
| `/credits`, `/contact`, `/privacy-policy` | static | — | — | OK |
| `/qotd/leaderboard` | ✓ | ✓ | — | OK |
| `/competition/:roundId/results` | ✓ | ✓ | ✓ | OK |

## Quiz routes

| Route | Assessment |
|---|---|
| `/quiz` ActiveQuizList | ✓✓✓ — OK |
| `/quiz/join` | PIN entry — clean. **Fix #1 below: this is the highest-traffic moment in the platform and it currently costs a 152 KB QR chunk + manual PIN typing from a projected screen** |
| `/quiz/:quizId` QuizPage | State machine is solid (idle→lobby→question→revealing→paused→finished). Reconnect mid-question resyncs (server sends timeElapsedMs). Kicked players see `player_kicked`. **Gap:** when host disconnects, players see "admin disconnected" with no guidance/next action ✱ → dead-end state |
| `/quiz/:quizId/results` | Analytics-rich (creator view); participant view ranks OK |
| `/quiz/create` AdminQuizCreator | 4-step wizard incl. CSV/XLSX import with per-row errors — genuinely good |

## Dashboard (USER) routes

| Route | Assessment |
|---|---|
| `/dashboard` Overview | 11 loading + 7 empty branches — thorough. Admin variant prepends stats |
| `/dashboard/events` | ✓ ticket-style cards w/ QR (pays W1 chunk cost) |
| `/dashboard/announcements`, `/leaderboard` | Leaderboard page has **0 loading/empty/error branches in code** ✱ → Fix #8 |
| `/dashboard/coding` | 7/13 L/E branches — most state-complete page in the app |
| `/dashboard/profile` | ✓; password change works (see report S6 for the session gap) |
| `/dashboard/certificates`, `/invitations` | ✓; invitation deep-link route works |
| `/dashboard/quiz`, `/upload`, `/attendance` (CORE+) | ✓ |

## Admin routes
All gated correctly (verified against the role matrix). Notable: `AdminSettings` has 17 error-toasts (most defensive page); `AdminEventRegistrations` keeps its annotated N+1 (accepted); `UserDetailPage` delegates states to `UserDetailContent` (fine). `EventCertificateWizard` (2,575 lines — largest file in the repo) works but is four features in one file; split when next touched.

**Accent-picker discrepancy:** CLAUDE.md says "Admin picks in BrandAccentCard", but `PATCH /api/settings/accentColor` requires President/SuperAdmin — a plain ADMIN sees the card and gets a 403 on click ✱. Either gate the card or relax the route.

---

## Top 10 UX fixes, ranked by user-minutes saved × frequency

1. **Quiz join: split the QR chunk + add join-by-link/QR.** [FREE] Every player, every quiz, pays 152 KB gz to *show* a QR (report W1); and joining means hand-typing a 6-digit PIN from a projector. Host lobby already renders a QR — make it encode `/quiz/join?pin=XXXXXX` and have the page auto-fill+submit. Saves ~30–60 s × every player × every quiz, and removes the most common join-typo failure.
2. **Return-to-event after sign-in.** Anonymous → "Sign in to register" should carry `?next=/events/:slug` through OAuth and land back on the event with the registration sheet open. Today's flow strands users on the dashboard; this is the platform's primary conversion path. ✱
3. **Resolve W3 (one public design system).** Every public-page polish item is downstream of this; do it before any other public-site work.
4. **Host-disconnect guidance in QuizPage.** Replace the bare "admin disconnected" with a 30 s countdown + "the host is reconnecting — hold tight", and auto-resume on `admin` rejoin. Removes the mass-confusion moment when a host's laptop sleeps mid-quiz.
5. **Event registration sheet: surface field validation inline.** Custom registration fields validate server-side (good) but errors return as a list-toast; map them to the inputs (the RHF adoption from report F-deps makes this nearly free).
6. **Attendance scanner: show offline-queue depth persistently.** `useOfflineScanner` queues silently; scanners at a door with bad Wi-Fi need a visible "12 queued, will sync" pill instead of discovering it on unload. (Component exists; surface its count.)
7. **Hiring re-application message.** "Application failed. If you applied before, contact us" → with A11 cycles, becomes "You applied in 2026 — applications for the new cycle open Sept." Converts a dead end into information.
8. **DashboardLeaderboard states.** Add skeleton + empty ("no ranked solvers yet — be first") + error retry. Currently the page can render blank. ✱
9. **TeamMemberProfilePage / NetworkProfilePage error states.** Bad slug → infinite skeleton; add a 404 panel with a link back to the directory. ✱
10. **Certificate verify: paste-a-code affordance.** `/verify` without a cert id shows only the QR-upload; add a text input ("ABCD-EFGH-IJKL") — recruiters receiving a PDF have the code, not a QR screenshot. ✱

**Flows with avoidable steps (summary):** quiz join (Fix 1: 3 steps → 1), event registration for anonymous users (Fix 2: 5 → 3), certificate claim for guests (already good — email deep link), password reset (already minimal), attendance scan (already optimized offline-first).
