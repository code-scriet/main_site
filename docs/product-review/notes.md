# Product Review — Working Notes (discovery record)

> Scratchpad for the product review. The deliverable is `suggestions.md` in this folder.
> Date: 2026-06-12. Sources: public pages, CLAUDE.md, Settings model, email templates,
> git log (repo born 2025-12-30; club founded 2026-01-01), deep-audit docs (tech scope).

## Identity (from primary sources)

- **Who:** code.scriet — official coding club of SCRIET, CCS University Meerut. Founded 1 Jan 2026. Six teams: Admin, Technical, DSA, Design, Content, Management (`aboutContent.ts` TEAM_NAMES).
- **Voice:** "Curiosity beats credentials", "QOTD is the heartbeat", "Build it before you talk about it", "Not a placement-prep cell. Not a Discord server with a logo." (About manifesto.)
- **Why the platform exists:** the club runs its *entire operation* on its own software — events, attendance, quizzes, daily problems, contests, certificates, recruitment, alumni network. The platform is itself the Technical team's flagship "real production code" project (About: "Engineers who build the platform").
- **Direction of travel (git log, ~5.5 months):** problem/judge engine → admin deep-control → dashboard v2 → public-site v2 + SEO/prerender → certificates polish → playground solve flow → security hardening → perf plan (#46–#50) → open-source governance docs (commit e590cd2).

## Personas ↔ current surfaces

| Persona | Today's surface | Gap noted |
|---|---|---|
| Curious fresher | Home/About/Join Us (strong editorial copy), live stats | Join Us copy over-promises interview slots; no "start here" after signup |
| Regular member | Dashboard v2, QOTD streaks, quizzes, playground | Streak milestones uncelebrated; no solution reveal after QOTD closes |
| Competitor | Contests (IMAGE_TARGET/DSA), problem caps, results pages | Cross-quiz / season standing absent |
| Core member / organizer | Scanner (offline-first), AttendanceManager, quiz host view | Post-event loop (thanks + feedback) manual/absent |
| Admin / president | 12-tile insights, audit log, mail, deep-control | No shareable/faculty-facing report; export caps (deep audit C1) |
| Alumni / guest | Invitations → guest QR → certificate; NetworkProfile | Nothing brings them back after the event |
| Faculty / institution | Certificate verification page, public site | No periodic report artifact |
| Recruiter / outsider | /verify/:certId, /team/:slug, /network/:slug | Regular members have **no public profile**; achievements not linked to accounts |

## Dormant / half-built / invisible inventory (evidence)

1. **`show_tech_blogs` setting** — present in Settings model, SettingsContext, AdminSettings UI; **no blog feature exists anywhere**. 🔒 switch with no machine.
2. **`registrationOpens` email** (`emailTemplates.ts:388` "Now Open · {event}") + `sendRegistrationOpens` (`email.ts:1240`) — **zero callers**. Built moment that never fires. `Event.registrationStartDate` exists; event-status scheduler is event-driven.
3. **Join Us copy promises slot selection** (`JoinUsPage.tsx:91,645` "Login to select your interview slot") — no such feature; AdminHiring is a manual kanban (PENDING → INTERVIEW_SCHEDULED → SELECTED → REJECTED).
4. **`HiringApplication.email @unique`** — one application per person *ever*; next recruitment season breaks (deep-audit A11).
5. **`Problem.referenceSolution`** — collected at authoring (CreateProblem, BulkImportCard) but **never shown to solvers**, even after the QOTD day closes.
6. **`Certificate.viewCount`** — incremented on every public verification; displayed only in AdminCertificates. Recipients never learn their cert is being viewed.
7. **No LinkedIn share on certificates** — DashboardCertificates has copy-link only. LinkedIn "Add to Profile" is a free URL scheme.
8. **No calendar export** — zero hits for `.ics` / `text/calendar` / Google Calendar links across web+api.
9. **`Achievement.achievedBy` is a plain string** (`schema.prisma:597`) — wins are not linked to user accounts; no member identity accrues them.
10. **No event-update/cancellation email or bell** — `events.ts` has no update notification path; only creation email exists.
11. **`User.profileCompleted`** — only read in AuthContext; nothing nudges completion.
12. **Quiz types POLL / RATING / OPEN_ENDED / MULTI_SELECT** — fully supported in creator + player + results; positioned only as "quiz", likely unused for session feedback/icebreakers.
13. **Player quiz history exists** (ActiveQuizList QuizHistoryItem: finalRank/finalScore per quiz) — no cross-quiz aggregation ("season" standings).
14. **`NetworkProfile.isFeatured` + `displayOrder`** — featured mechanism exists (NetworkHighlight on home); no editorial routine around it.
15. **Polls discovery** — no public listing; PollCard surfaces via Announcements page + dashboard. `/polls/:slug` deep-link only.
16. **Admin custom bell notifications** (NotificationFeed: ADMIN source, audience targeting incl. CUSTOM roles/user-ids) — exists, powerful, presumably underused.
17. **About page says "QOTD daily at 09:00 IST"** — publish time is admin-chosen per QOTD (default 00:00 IST). Copy/behavior consistency depends on ops discipline.

## Email moments — present vs silent

**Present:** welcome, event created, registration confirmed, event reminder (tomorrow), announcement, new poll, certificate issued (+faculty appreciation), invitation (+withdrawn), password reset, hiring received/selected/rejected, network welcome/verified/rejected, alumni welcome, admin bulk mail.
**Silent:** registration opens (template built, unwired), event changed/cancelled, post-event thank-you / feedback ask, streak milestones, quiz results recap, any periodic digest, semester wrap.

## Constraints to respect in suggestions

- Free tier: 512 MB RAM API, Neon free Postgres, Brevo free (~300 emails/day), Cloudinary free, Render free spin-down (UptimeRobot keeps warm).
- No new infra (no Redis/queues/workers). WebSocket budget reserved for quiz (~900 ceiling).
- Volunteer-run; anything needing constant tuning = Large by definition.

## Parked one-line technical notes (for appendix)

- Deep technical audit already exists at `docs/deep-audit/` (report/roadmap/schema-redesign/uiux-walkthrough) — this review does not duplicate it.
- `registrationOpen=false` and `maxEventsPerUser` admin toggles are not enforced server-side (deep-audit L2) — they *look* like product controls but are cosmetic.
- Admin "Export all users" silently exports only the newest 100 (deep-audit C1) — trust issue with the artifact admins use most.
- About-page "QOTD daily at 09:00 IST" vs default publish 00:00 IST — pick one and make the default match the promise.

## Deliverable plan (suggestions.md)

- Part 1: identity statement, feature inventory table (~20 rows with ✅🟡🔒🧩🌑), "a year in the life".
- Part 2: ~21 suggestions across 7 themes; quick wins first (S-01..S-05); big bets last (public member profiles, tech blog, open-source for other clubs).
- Part 3: do-not-build (chat clone, native app, payments, AI chatbot, badge economy, video hosting).
- Part 4: prioritization table + parked tech notes above.
- Part 5 (added on request): new-territory analysis — over/under-investment map by area, 5-question fit test, 9 candidate modules (N-01..N-09). Key structural findings: zero footprint for member *projects* despite "build it before you talk about it" manifesto (verified: no Project model, "project" appears only in copy); Design/Management/mentorship-culture have no platform surface. Verdicts: build next = N-01 Project Showcase + N-02 Hackathon mode (PROJECT round type — 70% assembled from teams/judging/certs); weekend win = N-07 GitHub streak badges; gated = N-09 duels (Wandbox quota risk).
