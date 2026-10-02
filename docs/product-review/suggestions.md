# code.scriet — Product Review & Suggestions

*June 2026. Written for two readers at once: the club leadership (no technical background needed — every technical detail sits in a clearly marked "For developers" box you can skip), and the developers who will build whatever gets picked.*

*Scope note: this is a product review — what the platform should become. Code quality, speed, and security were reviewed separately (see `docs/deep-audit/`). Where this review tripped over a technical issue, it's a one-liner in Appendix B, nothing more.*

---

# Part 1 — Who we are today

## The identity statement

**code.scriet is the official coding club of SCRIET, CCS University Meerut — and it is probably the only student club at the university that runs its entire operation on software it built itself.**

Founded on 1 January 2026, the club describes itself in its own words as a place where "curiosity beats credentials," where "QOTD is the heartbeat" (QOTD — the Question of the Day, a coding problem published every morning that members try to solve before midnight), and which is "not a placement-prep cell, not a workshop schedule, not a Discord server with a logo."

The club is organized into six teams — Admin, Technical, DSA, Design, Content, and Management — and the platform you are reading about is itself the Technical team's flagship project: real production software, live at codescriet.dev, that the club actually depends on every day.

**Who it serves:**

- **The curious fresher** who finds the website and is deciding whether to apply.
- **The regular member** who attends events, keeps a daily problem-solving streak, and plays live quizzes.
- **The competitor** who joins timed coding contests and wants them to feel fair.
- **The core member** who runs event days — scanning attendance QR codes, hosting quizzes, judging rounds.
- **The admin and president** who issue certificates, manage members, and watch the numbers.
- **The alumni and guest speakers** who are invited to events and carry the club's name outward.
- **The faculty and institution** who need the club to be legitimate, documented, and surprise-free.
- **The recruiter or outsider** who lands on a certificate verification link or a member's page and forms an impression in ten seconds.

**What it does, in plain words:** events you can register for (alone, in teams, or as an invited guest), attendance taken by scanning a QR code at the door (works across multi-day events, works offline), live quiz games projected in a hall with up to ~900 phones playing at once, a daily coding problem with personal streaks, practice problems and judged contests with an automatic code-checker, an in-browser coding playground, certificates with a public verification page, polls, announcements, a recruitment application form, an alumni & professionals directory, and an admin dashboard that ties it all together.

## Feature inventory

Legend: ✅ mature · 🟡 works but rough · 🔒 built but switched off · 🧩 half-built · 🌑 invisible (exists, but users can't find it)

| Feature | What it does, for whom | State |
|---|---|---|
| Public website (home, about, events, team, achievements, network, contact, credits) | The club's face for freshers, faculty, recruiters. Strong, distinctive writing; pages are pre-rendered so Google and social previews see real content. | ✅ |
| Events & registration (solo, team, guest) | Members register for events; team events get invite codes; capacity is enforced; guests never eat participant seats. | ✅ |
| QR attendance (multi-day, offline-capable) | Core members scan tickets at the door; works without internet and syncs later; per-day records for multi-day events. | ✅ |
| Live quizzes | A host projects questions; up to ~900 players answer on phones; scores, streak bonuses, podium finale, post-quiz analytics. | ✅ |
| Quiz question types beyond trivia (poll, rating, open-ended, multi-select) | The same engine can run audience feedback, icebreakers, and opinion polls during a session — fully built, almost certainly never used that way. | 🌑 |
| QOTD (daily problem) + streaks | A problem drops each morning; solving it extends a member's streak (days-in-a-row counter); leaderboards exist. | ✅ |
| Reference solutions to problems | Problem authors already write an official solution when creating a problem — but solvers never see it, even after the day ends. | 🌑 |
| Practice problems & contests | A shared problem bank used for daily problems, practice, and timed contests; automatic judging; submission caps with an appeal flow. | ✅ |
| Coding playground | In-browser code editor and runner at code.codescriet.dev; daily usage quota; snippet saving and sharing. | ✅ |
| Certificates + public verification | Admins bulk-issue elegant PDF certificates keyed to attendance or contest results; anyone can verify one at /verify. | ✅ |
| Certificate view counts | Every verification visit is counted — but only admins see the number. Recipients never learn their certificate is being looked at. | 🌑 |
| Polls + per-person feedback | Single/multi-choice polls with deadlines and anonymous mode; a feedback text box per voter. Discovered only via announcements or direct links. | 🟡 |
| Announcements | News posts with priority levels, pinning, expiry, email blast. | ✅ |
| Recruitment (Join Us) | Application form by team; admins move applicants through a pipeline; selection/rejection emails fire automatically. **But:** the page promises applicants they'll "login to select your interview slot" — no such feature exists. And the system allows one application per email address *ever* — the next recruitment season will reject every past applicant. | 🧩 |
| Alumni & professionals network | Guests, mentors, and alumni get public profile pages; admin verification flow; "featured" flag exists for spotlighting. | ✅ |
| Guest invitations | Admins invite speakers/judges/alumni to events; accepting creates a guest registration that flows into QR tickets and certificates. | ✅ |
| Email moments | Welcome, registration confirmed, event reminder, announcement, poll, certificate, invitation, hiring decisions, network verification — all wired with admin on/off switches per category. **But:** a finished "Registration Now Open" email exists in the codebase and is connected to nothing. | 🟡 |
| Bell notifications (in-app) | A notification bell aggregating invitations, certificates, quiz starts, daily-problem drops; admins can send targeted custom notifications. | ✅ |
| Tech blogs | A `show_tech_blogs` on/off switch exists in admin settings — there is no blog feature behind it. A switch wired to nothing. | 🔒 |
| Admin insights dashboard | 12 live tiles: member growth, event activity, certificate counts, streak averages, quiz sessions, and more. Admin-only; nothing shareable outward. | ✅ |
| Audit log, user management, feature blocks | Deep admin control: who did what, soft-delete, per-feature user blocks, force logout. | ✅ |
| Achievements pages | Editorial write-ups of club wins, shown publicly. **But:** the "achieved by" line is plain text — wins are not connected to member accounts, so they never appear on anything a member owns. | 🟡 |

## A year in the life

*One semester, narrated through the platform's eyes. The quiet stretches are where the product gaps hide.*

**January.** The club launches. The website goes live with the manifesto, the team page, the founding story. Recruitment opens on /join-us: applications arrive, admins drag cards across the pipeline, selection emails go out with a real sense of occasion ("Welcome to the Elite"). *Quiet moment #1: the page told applicants they'd pick an interview slot online — they couldn't, so the actual scheduling happened over WhatsApp.*

**February.** The first workshops. An admin creates the event; everyone with an account gets a "new event" email. Members register, get a QR ticket, and on the day a core member with a phone scans them in at the door — even when the hall Wi-Fi dies, the scanner keeps working and syncs later. Mid-session, the host runs a live quiz; two hundred phones buzz; there's a podium animation at the end. It's the best moment of the day. *Quiet moment #2: the event was announced when it was created — but nobody was told when registration actually opened. The members who registered were the ones who happened to check.*

**March.** The QOTD rhythm sets in. A problem drops each morning; streaks grow on the dashboard's streak ring. A member hits a 30-day streak. *Quiet moment #3: nothing happens. No bell, no mention. The number ticks from 29 to 30 in silence.* A member misses a tricky problem and wants to know the right approach. *Quiet moment #4: the author wrote an official solution when creating the problem — it's sitting in the database, shown to no one.*

**April.** The DSA contest. Teams form with invite codes, the round starts server-side, auto-locks on time, judging happens, results publish. Winners get certificates the same week — generated in bulk, keyed to actual attendance and scores, each with a public verification link. A recruiter actually clicks one; the platform counts the visit. *Quiet moment #5: the winner never finds out anyone looked. And there's no one-click way to put the certificate on LinkedIn — the place certificates exist to be seen.*

**May.** A guest speaker is invited through the network module; she accepts, gets a guest QR ticket, speaks, receives a speaker certificate, and her profile joins the public network page. *Quiet moment #6: that's the last time the platform ever speaks to her.* An event's venue changes two days before. *Quiet moment #7: there is no "event updated" notice of any kind — the correction travels by WhatsApp, or doesn't.*

**June.** Semester ends. Inside the admin dashboard, the numbers are genuinely impressive — members, events, scans, streaks, certificates. *Quiet moment #8: none of it leaves the dashboard. There is no end-of-semester artifact for the faculty advisor, no "here's what we did" page for next year's freshers, no digest for the alumni who spoke. The club's best evidence of being alive is locked behind an admin login.*

---

# Part 2 — Suggestions

## Do these first

Five suggestions that are Small, Free, and visible to everyone within a week of shipping:

1. **[S-01] Announce when registration opens** — the email already exists in the code; connect it.
2. **[S-02] Make the recruitment page tell the truth** — remove the promise of a feature that doesn't exist.
3. **[S-03] "Add to LinkedIn" on every certificate** — one button, free, and it puts the club's name on the world's largest professional network.
4. **[S-04] "Add to calendar" on every event** — the single most-asked-for thing on any event page.
5. **[S-05] Celebrate streak milestones** — the platform already counts them; make day 7, 30, and 100 feel like something.

---

## Theme: Bringing people in

### [S-01] Announce when event registration opens
**For:** regular member, curious fresher · **Theme:** Bringing people in · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** Right now, members get an email when an event is *created* — which can be weeks before they can actually register. When registration actually opens, nothing happens. This suggestion: the moment an event's registration window opens, send the announcement email and ring the in-app bell. The email for this already exists in the codebase, fully designed, subject line and all ("Now Open · {event}") — it has simply never been connected to anything.

**Why it matters.** Capacity-limited events fill on a first-come basis, and today the members who get seats are the ones who happen to check the site. That quietly rewards the already-engaged and shuts out exactly the people the club wants to pull in. A finished, never-fired email is the cheapest possible product win: someone already did the hard part.

**What success looks like.** Registrations cluster in the first hours after opening instead of trickling in, and "when does registration open?" disappears from the group chats.

> **For developers:** `EmailTemplates.registrationOpens` and `emailService.sendRegistrationOpens` (apps/api/src/utils/email.ts:1240) exist with zero callers. The event-status scheduler (`utils/scheduler.ts`) is already event-driven on date boundaries — arm a timer on `registrationStartDate` the same way status transitions work, and reuse `broadcastQotdLive()`-style bell fan-out (`utils/notifications.ts`). Respect the `email_event_creation`-style category guard (add a category or reuse `event_creation`). Brevo free tier ≈ 300 emails/day — batch like `sendNewEventToAll` already does.

### [S-02] Make the recruitment page tell the truth
**For:** curious fresher, admin · **Theme:** Bringing people in · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** The Join Us page tells applicants: "You'll receive login credentials via email. Login to select your interview slot." There is no interview-slot feature — admins schedule interviews manually and the applicant finds out by email. Fix the copy to describe what actually happens: "We review your application and email you an interview time." If the club later wants real slot-picking, that's a separate decision (see S-18 for the recruitment-season work that should come first).

**Why it matters.** The very first promise the platform makes to its newest, most impressionable audience is currently false. A fresher who signs up, logs in, and hunts for a slot-picker that doesn't exist starts their club life with "the website lied to me." For a club whose manifesto is "build it before you talk about it," this one page talks about something that was never built.

**What success looks like.** No applicant asks "where do I pick my slot?" — because the page never said they could.

> **For developers:** Copy-only change in `apps/web/src/pages/JoinUsPage.tsx` (lines ~86–96, ~543, ~633–646 reference slot selection and "recruitment portal announcements"). While in there, verify the described flow matches `AdminHiring.tsx`'s actual pipeline (PENDING → INTERVIEW_SCHEDULED → SELECTED → REJECTED, emails fire on the last two).

### [S-06] A "start here" path for brand-new members
**For:** curious fresher · **Theme:** Bringing people in · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Today a fresh sign-up lands on a dashboard built for people who already have streaks, events, and certificates — for them it's a wall of empty boxes. Add a first-week checklist that replaces the empty states: complete your profile → solve your first QOTD → register for your first event → save your first playground snippet. Each item links straight to the action and ticks itself off automatically.

**Why it matters.** The platform already tracks whether a profile is complete (`profileCompleted` exists in the database) but nothing anywhere nudges anyone about it. Meanwhile every dashboard section ("Earned", "My Events", "Standing") assumes history the new member doesn't have. The clubs' own About page says the streak is "the only leaderboard anyone actually checks" — so the most important onboarding job is getting a member to day 1 of a streak, and nothing currently does that job.

**What success looks like.** A larger share of new accounts solve at least one QOTD in their first week — the single behavior most predictive of staying active.

> **For developers:** All four checklist facts are already queryable per user (profileCompleted, QOTD submissions, registrations, snippets) — this is a frontend card in `DashboardOverview.tsx` plus one small aggregate endpoint (or piggyback on existing dashboard queries). No schema change needed if computed live; hide the card once all items are done. Keep it inside `[data-dashboard]` scope per Dashboard v2 rules.

---

## Theme: Keeping members engaged

### [S-05] Celebrate streak milestones
**For:** regular member · **Theme:** Keeping members engaged · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** When a member's streak (days in a row solving the daily problem) hits 7, 30, 50, 100 — ring their bell: "🔥 30-day streak. Genuinely rare." Optionally, when someone's streak crosses 50, feature it in the admin's custom-notification tool so the whole club sees it.

**Why it matters.** The About page calls QOTD "the heartbeat" and the streak "the only leaderboard that matters" — the club's own manifesto says this number is the core of member identity. Yet the platform, which computes the number transactionally on every submission, lets every milestone pass in total silence. This is the cheapest possible loyalty feature: the data, the bell infrastructure, and the audience already exist.

**What success looks like.** More members reach a 10+ day streak each month, and members screenshot milestone notifications into the group chat (free marketing the club doesn't have to do).

> **For developers:** Streaks update in `recomputeUserStreakSafe()` (apps/api/src/utils/qotdStreak.ts) — after a recompute, if `currentStreak` crossed a milestone threshold, insert a `NotificationFeed` row (source AUTO, audience CUSTOM with that one userId). The bell already polls and renders custom rows. Idempotency: only fire when old < threshold ≤ new. Zero new tables, negligible memory.

### [S-07] Reveal the official solution after the day's problem closes
**For:** regular member, competitor · **Theme:** Keeping members engaged · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Every problem author already writes a reference solution when creating a problem — the platform requires it to validate test cases. Today that solution is buried in the admin screens forever. This suggestion: once a daily problem's day is over (or once a member has solved it), show the official solution and approach on the problem page.

**Why it matters.** The club says it exists for *learning*, but the daily problem currently teaches nothing to the people who couldn't solve it — they fail, see "Wrong Answer," and the day ends. The single most valuable piece of educational content the club produces daily is written, stored, and never published. For the member who got stuck at 11 PM, tomorrow's problem arrives before yesterday's lesson ever does.

**What success looks like.** Members who failed a problem come *back* to its page the next day — measurable as return visits — and "how was yesterday's supposed to be done?" gets answered by the platform instead of seniors-on-demand.

> **For developers:** `Problem.referenceSolution` + `referenceLanguage` exist (prisma/schema.prisma). Gate exposure in `GET /api/problems` detail: include the field only when (a) contextType QOTD and the QOTD's IST date < today, or (b) the requester has an ACCEPTED submission, or (c) admin. Careful: the same Problem can be reused in CONTEXT=CONTEST — never expose while any round referencing it is ACTIVE/LOCKED (check `CompetitionRoundProblem`). Frontend: a "Solution" tab on the solve/detail page, markdown-rendered (react-markdown already in stack).

### [S-08] A monthly "what happened" digest
**For:** regular member, alumni, faculty · **Theme:** Keeping members engaged · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Once a month, an automatic email (and matching announcement post): events held, attendance totals, the month's longest streaks, contest podiums, certificates issued, new network members. Assembled from data the platform already tracks — no one has to write it (though the Content team can add a human paragraph on top before it goes out).

**Why it matters.** The club's activity is its best recruitment and retention asset, and right now it evaporates monthly. Members who skipped a busy month have no easy way to feel what they missed; alumni and faculty have no ambient awareness that the club is thriving. Every number needed already exists — the admin dashboard computes most of them today, for an audience of two.

**What success looks like.** The digest's read rate stays high month over month, and inactive members measurably return after digest sends (sign-ins in the 48h after).

> **For developers:** The 12-tile insights endpoint (`/api/stats/dashboard`) already computes most aggregates — extract a shared month-window summary util. Delivery: an admin-triggered "compose digest" flow in AdminMail (preview → edit → `sendBulk`, category `admin_mail`) is safer than full automation on Brevo's ~300/day free cap — chunk sends or send over 2 days if membership exceeds the cap. Draft-for-approval, not auto-send: keeps volunteers in control of voice.

### [S-09] Topic ladders: curated problem sheets
**For:** regular member, competitor · **Theme:** Learning & competition · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Problems already carry tags ("arrays", "graphs") and difficulty levels. Add curated, ordered sheets — "Arrays: 10 problems, easy to hard", "Recursion starter pack" — that the DSA team assembles from the existing bank, with per-member progress shown as a simple "7 of 10 solved."

**Why it matters.** The practice tab is currently a flat list — fine for the competitor who knows what to practice, useless as a path for the fresher who doesn't. The DSA team's whole stated job is "contest prep and practice" — this gives their curation a home inside the platform instead of in PDFs and chat messages. It also multiplies the value of every problem already written: the same bank, re-cut into journeys.

**What success looks like.** Freshers' solved-problem counts stop clustering at zero; "what should I practice?" gets answered with a link to a sheet.

> **For developers:** New model `ProblemSheet` (id, slug, title, description, createdBy) + `ProblemSheetItem` (sheetId, problemId, order) — additive migration, trivially small. Progress is computed live from existing `ProblemSubmission` rows (verdict ACCEPTED, contextType PRACTICE) — no per-user state stored, so no 512 MB concern. Surface as a new section in `DashboardCoding`'s Practice tab. CORE_MEMBER+ can author, mirroring problem-authoring permissions.

---

## Theme: Event days that run themselves

### [S-04] "Add to calendar" on every event
**For:** regular member, curious fresher, alumni/guest · **Theme:** Event days that run themselves · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** A button on every event page and inside the registration-confirmation email: "Add to Google Calendar / Download calendar file." One tap and the event — title, venue, time — lands in the member's phone calendar, the one place their day actually gets planned.

**Why it matters.** The platform sends one reminder email the day before. That's good, but a calendar entry is better: it survives, it alarms, it shows the venue when you're walking there. There is currently zero calendar integration anywhere — surprising for a platform whose core object is the event. For guests and faculty (people who live by their calendars), this is also a professionalism signal.

**What success looks like.** Fewer "what time does it start?" messages on event mornings; attendance rate ticks up for events with long lead times.

> **For developers:** No backend needed for Google: a templated `calendar.google.com/calendar/render?action=TEMPLATE&...` URL from existing Event fields. For .ics, a tiny `GET /api/events/:id/ics` endpoint that string-builds the VCALENDAR (no dependency needed) — or generate client-side as a Blob download. Add to `EventDetailPage` action row + the `eventRegistration` email template. Mind `endDate` nullability (fall back to start + 2h like the QR-display window logic does).

### [S-10] Close the loop after every event
**For:** organizer, admin, regular member · **Theme:** Event days that run themselves · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** The day after an event ends, attendees automatically get one email: "Thanks for coming. Two questions?" linking to a feedback poll for that event. Organizers see responses in the existing poll results screen. Today the platform's event lifecycle simply *stops* at the last QR scan — polls exist, per-person feedback boxes exist, email exists, attendance records know exactly who came — but nothing connects them.

**Why it matters.** The club currently learns whether an event was good from hallway vibes. Meanwhile every ingredient of a feedback loop is already built and tested; they've just never been introduced to each other. For organizers this is also the missing "thank you" moment — the platform thanks people for registering but never for actually showing up.

**What success looks like.** Every event gets ≥30% feedback response within 48 hours, and the next semester's planning meeting opens with real numbers instead of recollections.

> **For developers:** Build on: `Poll` (link via a nullable `eventId` or a naming convention), `DayAttendance`/`EventRegistration.attended` for the audience, `sendBulk` for delivery, the 6h reminder scheduler tick for the "day after end" trigger (reservation-pattern dedup like `reminderSentAt` — add `feedbackSentAt` to Event or registration). Admin opt-in per event (mirror `remindersEnabled`). Keep the poll auto-created as a draft the organizer publishes — humans approve, machines deliver.

### [S-11] Tell people when an event changes or is cancelled
**For:** regular member, organizer · **Theme:** Event days that run themselves · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** When an admin edits a registered-for event's date, time, or venue — or cancels it — registrants get a bell notification and (for date/venue changes) an email. Today, editing an event is completely silent: the platform that knows exactly who registered tells none of them.

**Why it matters.** This is the highest-stakes silent moment in the platform. A venue change two days out currently propagates by WhatsApp or not at all, and the people most likely to miss the correction are the casual members the club most wants to keep. Every notification channel needed already exists; what's missing is only the trigger.

**What success looks like.** Zero members standing outside the wrong room. The WhatsApp "VENUE CHANGED PLEASE FORWARD" message goes extinct.

> **For developers:** In the event update route (`apps/api/src/routes/events.ts`), diff startDate/venue/location before write; on change, insert a `NotificationFeed` row (audience CUSTOM, userIds from registrations) + optional email to registrants via `sendBulk`. Cancellation: there's no cancelled status (EventStatus is UPCOMING|ONGOING|PAST) — either add CANCELLED to the enum (migration, `--create-only`) or treat delete-with-registrations as the trigger. Gate emails behind a settings toggle like every other category.

### [S-13] Use the quiz engine for feedback and icebreakers
**For:** organizer, core member · **Theme:** Event days that run themselves · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** The live-quiz engine already supports poll questions, rating scales (1–5), and open-ended text — not just right/wrong trivia. Almost nobody knows. This suggestion is mostly *packaging*: a "Session feedback" template in the quiz creator (three pre-written questions: rate the session, one word for how it felt, what next?) and a line in the host guide. Run it in the last five minutes of any workshop while everyone's phone is already connected.

**Why it matters.** This is the purest case of a built feature nobody can find: the question types are fully implemented in the creator, the player screens, and the results analytics. A live 200-person rating with the score animating on the projector is a *moment* — and it doubles as the feedback collection S-10 wants, captured at peak energy instead of by next-day email.

**What success looks like.** At least one non-trivia quiz runs per event; organizers quote live rating numbers in their recap posts.

> **For developers:** Zero engine work. Add a template chip in `AdminQuizCreator.tsx` (it already supports POLL/RATING/OPEN_ENDED/MULTI_SELECT — see the type selector at line ~567) that pre-fills a 3-question draft. Optionally label such quizzes "Feedback" in `ActiveQuizList` history. Documentation beats code here: a one-page host playbook in the repo or admin UI.

---

## Theme: Learning & competition

### [S-12] Quiz seasons: standings across quiz nights
**For:** competitor, regular member · **Theme:** Learning & competition · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Every finished quiz already stores each player's final score and rank. Add a "season" view: across all quizzes this semester, who's accumulating the most points? A simple table on the leaderboard page, reset each semester, with the top three named in the end-of-season digest.

**Why it matters.** Quiz night is the platform's most-loved moment, but each one is an island — the podium animation plays, and the result vanishes into a history list nobody revisits. A season turns one great evening into a semester-long storyline ("I'm 40 points behind Priya going into the last quiz"), and gives the club a recurring-event format that markets itself. The data is already persisted; this is aggregation plus a page.

**What success looks like.** Repeat quiz attendance rises — the same players come back for the *next* quiz because the season makes consecutive ones matter.

> **For developers:** `QuizParticipant` rows (finalScore, finalRank, quiz relation) persist post-quiz. Season standing = `SUM(finalScore)` grouped by user across quizzes in a date window — one indexed aggregate query, cacheable for 5 min with React Query defaults. Add a tab to `DashboardLeaderboard`. Decide whether ABANDONED quizzes count (recommend: no — filter `status = FINISHED`). Semester window can be a Settings date pair or just "last 6 months" rolling. No new tables.

---

## Theme: Recognition & proof

### [S-03] "Add to LinkedIn" on every certificate
**For:** regular member, alumni/guest, recruiter · **Theme:** Recognition & proof · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** On the member's certificates page and the public verification page: an "Add to LinkedIn profile" button. LinkedIn provides a free link format that opens its "add certification" form pre-filled — name of the certificate, issuing organization, issue date, and the verification URL. One click and the club's name sits permanently on a member's professional profile.

**Why it matters.** The certificate system is one of the platform's most polished features — elegant PDFs, tamper-proof verification links, even a counter of how many times each certificate has been viewed. But the only sharing tool offered is "copy link." Certificates exist to be *displayed*, and the place students display credentials is LinkedIn. Every certificate added there is a public, durable advertisement that links recruiters straight back to codescriet.dev.

**What success looks like.** Club certificates start appearing on members' LinkedIn profiles, and the certificate view counts (already tracked!) visibly climb from recruiter traffic.

> **For developers:** Pure frontend: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name={type+event}&organizationName=code.scriet&issueYear=&issueMonth=&certUrl={FRONTEND_URL}/verify/{certId}&certId={certId}` — build from fields already on the cert card. Add to `DashboardCertificates.tsx` (next to the existing copyLink at ~line 77) and `VerifyCertificatePage.tsx` (only when viewer is the recipient, or unconditionally — it's harmless). While there: surface `viewCount` to the recipient ("Viewed 14 times") — the API already stores it; check what the non-admin cert payload includes.

### [S-14] Connect achievements to member accounts
**For:** regular member, recruiter · **Theme:** Recognition & proof · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** The achievements pages are beautiful editorial write-ups of club wins — but the "achieved by" field is just typed text. The platform doesn't know that "Rahul Sharma" in an achievement is the same Rahul with the 60-day streak and three certificates. This suggestion: let admins optionally tag the actual member account(s) on each achievement, so wins follow people.

**Why it matters.** Recognition that isn't attached to an identity evaporates. Today a member's biggest moment — winning an inter-college contest, say — lives on a page that will scroll away, with their name spelled however the admin typed it. Linking achievements to accounts makes them appear in the member's dashboard "Earned" section, makes them counted, and is the prerequisite for the public member profiles in S-19. It also fixes a real data problem: typed names go stale when people graduate or change names.

**What success looks like.** Every new achievement is tagged to at least one account, and members can point at a single place that lists everything they've won.

> **For developers:** Additive: `AchievementCredit` join table (achievementId, userId) or a `String[]` of userIds — prefer the join table for FK integrity (`onDelete: Cascade`). Keep `achievedBy` text as the display string (covers non-member awardees and groups). Admin UI: a user-search multi-select in the achievement editor (the invitee-search pattern in `AdminEventInvitations` already does user lookup). Surface in dashboard "Earned" alongside certificates.

---

## Theme: Alumni & the outside world

### [S-16] An alumni rhythm: spotlight rotation + the yearly return
**For:** alumni/guest, curious fresher, admin · **Theme:** Alumni & the outside world · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Two small habits, supported by features that already exist. First: the network directory has a "featured" flag — rotate it monthly so a different alumnus/mentor is spotlighted on the homepage, with a line on what they're building now. Second: once a year, use the existing invitation system to invite every verified alumni profile back for one event — an "alumni evening" where they speak, judge, or just attend, flowing through the normal guest-QR-certificate pipeline.

**Why it matters.** The platform does a genuinely good job *acquiring* alumni and guests — invitation, profile, certificate, public page — and then never speaks to them again (the only alumni emails are welcome/verification ones). Alumni are the club's highest-leverage asset: proof to freshers that the path leads somewhere, and the most likely source of referrals, judges, and eventually sponsorship. The features are built; what's missing is the recurring use of them.

**What success looks like.** Each homepage spotlight is fresh within the month, and the yearly alumni event has more returning faces than the year before.

> **For developers:** Almost no code. `NetworkProfile.isFeatured` + `displayOrder` exist and feed `NetworkHighlight` on home; bulk-invite exists (`POST /api/invitations` admin bulk, searchable invitees). Optional small build: an "invite all verified alumni" filter in the invite search, and a `featuredSince` timestamp so stale spotlights are visible in admin. The rest is an operations calendar entry, which is the point.

---

## Theme: Knowing what's working

### [S-17] A semester report the president can hand to faculty
**For:** admin/president, faculty/institution · **Theme:** Knowing what's working · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** A one-click export from the admin dashboard: a clean, printable semester summary — events held with attendance numbers, members joined, certificates issued, contest results, network growth — with the club's branding. The kind of document a faculty advisor can put in a file, attach to a budget request, or show a dean.

**Why it matters.** The institution persona currently gets *nothing* from the platform except the public website. Every figure a faculty report needs is already computed live in the 12-tile admin insights dashboard — for an audience of two people with admin logins. Universities run on documents; a club that can produce a professional activity report in one click is a club that gets rooms booked and budgets approved. This is also armor: when leadership changes, the club's institutional memory survives as artifacts.

**What success looks like.** The next faculty meeting includes a platform-generated report, and the president stops assembling semester numbers by hand from screenshots.

> **For developers:** Reuse `/api/stats/dashboard` aggregates with a date-range parameter; render server-side with `@react-pdf/renderer` (already used for certificates — fonts and Cloudinary upload pipeline exist) or as a printable HTML route. ExcelJS for a data appendix is already in stack. Admin-only endpoint + a button in the insights view. Watch memory on the PDF path (512 MB): generate on demand, never cache documents in memory.

### [S-18] Recruitment seasons
**For:** admin, curious fresher · **Theme:** Knowing what's working · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Give recruitment a concept of *seasons* ("Autumn 2026"). Each season has its own applicant pool, its own open/close dates shown publicly on Join Us, and its own pipeline view for admins. Critically: someone who applied last season can apply again this season.

**Why it matters.** Right now the system allows exactly one application per email address, forever — a guarantee that next season, every re-applicant (including people the club explicitly told "try again next time" in the rejection flow) gets a confusing error. The club has run one recruitment; the second one will hit this wall on day one. Seasons also give admins what they actually need operationally: a clean slate per drive, comparisons between drives, and an honest "applications closed, next season opens in October" state for the public page instead of a form that's always on.

**What success looks like.** The second recruitment drive opens without a single "it says my email already exists" complaint, and rejected-then-improved candidates from season one show up in season two's pipeline.

> **For developers:** Deep-audit finding A11 scoped this: add `cycle String` to `HiringApplication`, change unique to `[email, cycle]` (one `--create-only` migration), current-cycle value in Settings. Frontend: cycle filter in `AdminHiring.tsx`, open/closed state + season name on `JoinUsPage`. Backfill existing rows with "2026-spring". Pairs naturally with the S-02 copy fix — do them in one PR if convenient.

---

## Big bets

Three Large ideas that would change what the club *is*. Each is described honestly, including the volunteer time it would really cost.

### [S-19] Public member profiles — proof-of-work pages
**For:** regular member, recruiter, curious fresher · **Theme:** Recognition & proof · **Size:** Large (a semester project)
**Cost:** Free

**What it is.** Every member (who opts in) gets a public page — codescriet.dev/members/their-name — showing their streak, problems solved, contest results, quiz finishes, certificates, and tagged achievements. A living, verifiable portfolio generated from things they actually did, not things they claim.

**Why it matters.** This is the platform's most valuable unexploited asset. It already *verifies* more about a student's consistency and skill than any resume line: a 90-day streak can't be faked, contest ranks are judged by machine, attendance is scanned at a door. But today every bit of that evidence is locked behind login. The only people with public pages are core team and alumni. The club's thesis — "it's where the line on the resume comes from" — is literally unfulfilled: there is no link a member can put on a resume. For recruiters who land on a certificate verification page (it's already counted — they do), the next click should be the person, and currently it's a dead end. Honest cost: beyond the build, this needs privacy care (opt-in only, granular hiding) and a moderation eye, and it raises the stakes of every leaderboard bug. It's a semester project including the arguing.

**What success looks like.** Members put their profile link on resumes and LinkedIn; the club can show a wall of public proof at recruitment time; at least one member reports a profile link mattering in an interview.

> **For developers:** Builds on: existing slug machinery (TeamMember/NetworkProfile slugs + legacySlugs), prerender.js (add member pages to the SEO pipeline), materialized streaks on User, `ProblemSubmission`/`QuizParticipant`/`Certificate` aggregates, S-14's achievement links. New: opt-in flag + visibility prefs on User, a public route + API endpoint with strict field allow-listing (no email/phone — mirror the anonymous-poll discipline). Prototype first: one static profile for one consenting member, then the privacy controls before any listing/index page.

### [S-20] Turn the dead blog switch into member write-ups
**For:** regular member, recruiter, curious fresher, faculty · **Theme:** Alumni & the outside world · **Size:** Large (a semester project — the writing, not the code)
**Cost:** Free

**What it is.** A `show_tech_blogs` switch has sat in admin settings since early in the platform's life, wired to nothing — someone wanted a blog and never got to build it. Build it: member-written posts ("how we built the quiz engine", "what I learned losing the DSA contest", event recaps), drafted by members, reviewed by the Content team, published under the club's domain.

**Why it matters.** The About page promises "write-ups of what we built" as the Content team's job, and the club's identity is "learn in public" — yet the platform has no surface for public learning artifacts at all. The SEO infrastructure (pre-rendering, sitemaps, structured data) is unusually good for a club site and is currently spent only on event listings; articles are what that machinery is *for*. Honest cost: the code is the easy half (markdown rendering, an editor, a listing page — mostly existing pieces). The hard half is editorial: a blog with three posts from January looks worse than no blog. This bet only pays if the Content team commits to a cadence — one post per event plus one member post a month is sustainable; anything more ambitious isn't, for volunteers.

**What success looks like.** Six months in: 12+ published posts, search traffic arriving at articles, and at least one fresher saying "I applied because I read the quiz-engine post."

> **For developers:** Reuse: react-markdown + sanitization pipeline, Announcement-style model shape (slug, tags, featured, imageUrl), upload pipeline, prerender.js patterns (add `/blog/:slug` emission), the existing CORE_MEMBER-authors / admin-publishes permission split from problems. The Settings flag already exists — finally honor it. Prototype: render 2 hand-written markdown files through the pipeline before building any editor.

### [S-21] Open the platform to other clubs
**For:** admin/president, the institution, the wider community · **Theme:** Alumni & the outside world · **Size:** Large (a semester project, then ongoing)
**Cost:** Free (volunteer time is the real cost)

**What it is.** Package the platform so another student club — at CCSU or anywhere — can run their own copy: their name, their colors, their events. The repo already took its first deliberate step here (governance documents for an open-source launch landed in May); this bet is about going from "code is public" to "another club actually runs it."

**Why it matters.** The platform is genuinely unusual — most student communities run on Discord + Google Forms + a link-in-bio, and this codebase replaces that stack with something coherent. If a second club adopts it, code.scriet stops being a club with a website and becomes the *maintainer of campus-club infrastructure* — a much bigger line on every contributor's resume and a magnet for exactly the curious builders the club recruits for. Honest cost: this is the most expensive idea in this document. Supporting outside users means issue triage, deployment docs that strangers can follow, removing hard-coded club identity from dozens of places, and saying no to feature requests — a permanent volunteer tax. Done half-heartedly it produces an abandoned repo with open issues, which is worse for the club's image than not trying. Only take this bet if two named maintainers want to own it for a year.

**What success looks like.** One other club (even one) running its own instance through a documented setup, with its first event's attendance scanned successfully.

> **For developers:** Most club identity is already in Settings (name, description, socials, accent color) — audit the hard-coded remainder ("code.scriet" in email templates, aboutContent.ts, prerender constants, cert layout). The 4-service render.yaml is effectively a deploy blueprint; a SETUP.md walking through Neon/Render/Cloudinary/Brevo free tiers is the first deliverable. Prototype: stand up a second instance yourselves from docs alone, timing every stumble.

---

# Part 3 — What we should NOT build

Scope discipline is a deliverable. Six things that sound appealing and don't fit:

1. **A chat or community feed.** The club already lives in WhatsApp (the site links to it), and WhatsApp/Discord are better at chat than a volunteer team will ever make a custom feed. The platform's real-time budget (one small free server) is deliberately reserved for the thing nothing else can do: 900-player live quizzes. A feed would also demand daily moderation — a permanent tax on volunteers.

2. **A native mobile app.** The website already works well on phones — QR tickets, the scanner, quizzes are all mobile-first, and the offline scanner covers the worst connectivity case. An app store presence means build pipelines, review delays, and update lag, owned by students who graduate. The moment an app feels necessary, the answer is making the existing site installable (a home-screen web app), not a rewrite.

3. **Payments and paid ticketing.** Club events are free, and the moment money enters the platform so do refunds, disputes, tax questions, and an entirely different liability conversation with the university. If a flagship event ever charges, a UPI QR code on the registration desk costs nothing and keeps money out of the codebase.

4. **An AI assistant / AI judging.** The judge's value is that it's *deterministic* — same code, same verdict, fair by construction, which is exactly what competitors need to trust. Bolting on AI feedback adds per-use costs, an external dependency, and "the AI told me my solution was fine" disputes. The reference solutions (S-07) deliver the learning value with zero of that.

5. **A badge/XP/points economy.** The platform already has the right motivators, each tied to something real: streaks (consistency), quiz podiums (event nights), contest ranks (skill), certificates (proof). A generic points layer on top needs constant economic tuning ("how much XP for attendance?") and inflates into meaninglessness — the failure mode of every campus app that tried. Celebrate the real numbers (S-05, S-12) instead of minting a fake one.

6. **Hosting video.** Recordings belong on YouTube — free, infinite, where people already search. The Event model already stores a video link per event; using that field is the whole feature.

---

# Part 4 — Appendices

## Appendix A — Prioritization

Impact = visible difference to a named persona within a month of shipping. Order weighs impact against size, and sequences hard deadlines (S-18 must precede the next recruitment drive) and dependencies (S-14 before S-19).

| # | Suggestion | Impact | Size | Cost | Suggested order |
|---|---|---|---|---|---|
| S-01 | Announce registration opening | High | Small | Free | 1 |
| S-02 | Truthful recruitment copy | High | Small | Free | 2 |
| S-11 | Event change/cancel notices | High | Small | Free | 3 |
| S-03 | Add to LinkedIn (+ show view counts) | High | Small | Free | 4 |
| S-04 | Add to calendar | Medium | Small | Free | 5 |
| S-05 | Streak milestone celebrations | Medium | Small | Free | 6 |
| S-18 | Recruitment seasons | High (deadline: next drive) | Medium | Free | 7 |
| S-13 | Feedback quizzes (packaging) | Medium | Small | Free | 8 |
| S-07 | Reveal official solutions | High | Medium | Free | 9 |
| S-10 | Post-event thank-you + feedback | High | Medium | Free | 10 |
| S-06 | New-member "start here" | Medium | Medium | Free | 11 |
| S-12 | Quiz seasons | Medium | Medium | Free | 12 |
| S-16 | Alumni rhythm | Medium | Medium | Free | 13 |
| S-09 | Topic ladders | Medium | Medium | Free | 14 |
| S-14 | Achievements → accounts | Medium (enables S-19) | Medium | Free | 15 |
| S-08 | Monthly digest | Medium | Medium | Free | 16 |
| S-17 | Faculty semester report | Medium | Medium | Free | 17 |
| S-19 | Public member profiles | High | Large | Free | 18 (big bet) |
| S-20 | Member write-ups / blog | High (if cadence holds) | Large | Free | 19 (big bet) |
| S-21 | Open platform to other clubs | High (if owned) | Large | Free | 20 (big bet) |

A realistic semester: ship 1–8 (all small except S-18), pick two of 9–17, and commit to at most one big bet with named owners.

## Appendix B — Technical notes parked during this review

The full technical audit lives in `docs/deep-audit/` (report, roadmap, schema redesign, UI/UX walkthrough) — these are only the items *this* review tripped over, one line each:

- The admin toggles "registration open" and "max events per user" are not actually enforced by the server — they look like controls but are cosmetic (deep-audit L2).
- The admin "Export all users" file silently contains only the newest 100 users (deep-audit C1) — fix before anyone trusts an export for an official list.
- The About page promises "QOTD daily at 09:00 IST" but the publishing default is midnight IST and the time is admin-chosen per problem — either make 09:00 the default or soften the copy.
- The hiring one-application-per-email-forever constraint is deep-audit A11; S-18 above is its product-shaped resolution.
- `show_tech_blogs` is a settings column, context field, and admin toggle wired to no feature — resolve via S-20 or remove it.

---

# Part 5 — New territory: the next playground-sized module

*Added after review. Everything before this point improves or finishes what exists. This part answers a different question: the playground was a whole new product bolted onto the platform — what's the next thing of that size? Which areas deserve a brand-new module, and which don't?*

## 5.1 Where the product is over- and under-invested

Before proposing anything new, here is an honest map of where five months of building actually went, area by area:

| Area | Investment so far | Verdict |
|---|---|---|
| **Running events** (registration, teams, QR attendance, invitations) | Very heavy — the most engineered area of the platform | Saturated. Don't build more here; polish only (Part 2). |
| **Competition** (quizzes, contests, judging, results) | Heavy and mature | Saturated for *formats that exist*. One format is missing (see N-02). |
| **Individual practice** (QOTD, problems, playground) | Heavy — three connected systems | Strong. Needs content curation (S-07, S-09), not new machinery. |
| **Administration** (insights, audit, user control, mail) | Heavy — arguably over-served relative to member-facing features | Stop. The admin two already have more tools than they use. |
| **Recognition & identity** (certificates, achievements, profiles) | Medium — certificates polished, everything else thin | Under-invested. Part 2 covers it (S-03, S-14, S-19). |
| **What members BUILD** (projects, code, shipped work) | **Zero.** No model, no page, no field anywhere stores a member project | **The hole.** See N-01. |
| **Knowledge that outlives an event** (recaps, materials, writing) | Near zero — per-event resource links exist, nothing club-wide | Under-invested. S-20, N-06. |
| **People helping people** (mentorship, review, Q&A) | Zero on-platform — the manifesto's most repeated theme has no feature | Under-invested. N-04, N-05. |
| **Opportunities** (internships, referrals, gigs) | Zero — the network module collects industry people, then doesn't use them | Under-invested. N-03. |

Two structural observations fall out of this table:

**First — the platform records everything about members except the thing the club says it values most.** The manifesto says "Build it before you talk about it." The About page promises members "freedom to ship anything" with the club's backing. The Technical team's own description is "engineers who build the platform." And yet: the platform has attendance records, quiz scores, streaks, and certificates — but *no record that any member has ever built anything*. The word "project" appears in the codebase only as marketing copy. This is the single biggest mismatch between what the club claims to be and what its software can show.

**Second — three of the six club teams have no home in the product.** Technical owns the platform itself, DSA owns the problem bank, Content owns announcements. But Design (posters, brand), Management (logistics, event ops), and to a large degree the mentorship culture the Admin team preaches all happen entirely off-platform. A new module is most defensible when it gives a homeless team a home.

## 5.2 The fit test — how to judge any new module idea

The club will keep having ideas. Before any of them gets built, it should pass all five of these (the playground passes all five — that's why it worked):

1. **Does it create public proof?** The platform's superpower is turning club activity into verifiable, outside-visible evidence (certificates, results, streaks). A module that only serves internal convenience is weaker than one that produces something a member can point at.
2. **Does it run itself?** Volunteer-run means any feature needing daily human feeding will starve. Good modules are member-fed (members create the content) with light admin review — like problems and snippets today.
3. **Does it fit the free tier?** No new servers, no per-use costs, nothing that grows memory with user count. (Hard constraint, not a preference.)
4. **Would a named team own it?** Not "the club" — a specific team whose stated job it advances.
5. **Is it something Discord + Google Forms genuinely can't do?** If a free general-purpose tool does it well, the platform shouldn't (that's why Part 3 rejects chat).

## 5.3 The candidates

### [N-01] Project Showcase — a public gallery of what members build
**For:** regular member, recruiter, curious fresher, faculty · **Theme:** Recognition & proof / What members build · **Size:** Large (a semester project)
**Cost:** Free

**What it is.** A new top-level section — codescriet.dev/projects — where members publish what they've built: title, description, screenshots, a repository link, a live-demo link, the team members who built it (real accounts, not typed names), and the event it came from if any (a hackathon entry, a workshop outcome, a side project the club backed). Core members review before anything goes public, same as problems today. Think of it as a permanent, club-curated exhibition hall.

**Why it matters.** This is the missing half of the club's identity. The About page's proudest story is "freedom to ship anything" — a member pitches, the club backs it, the member keeps creative control. The platform should be where those shipped things *live*, and today it isn't; a member's project exists as a GitHub link in a WhatsApp message that scrolls away. For freshers, a project gallery answers "what do people actually do here?" better than any manifesto. For recruiters, it's the strongest possible landing page. For faculty, it's evidence. And it passes every fit-test question: public proof (its entire purpose), member-fed (members submit, core reviews), free tier (text + Cloudinary images already in stack), owned by Technical + Design jointly, and not something Discord can do (Discord is where project links go to die). Honest cost: the gallery is only as good as its first ten entries — seed it with the platform itself, the quiz engine, and every hackathon entry before announcing it.

**What success looks like.** Twenty projects with real screenshots within a semester; project pages cited in member resumes; the gallery becomes the recruitment pitch's first slide.

> **For developers:** New models: `Project` (id, slug, title, description markdown, repoUrl, demoUrl, imageGallery JSON, eventId?, status DRAFT/PUBLISHED, createdBy) + `ProjectMember` (projectId, userId, role) — mirrors the Achievement + S-14 credit pattern. Reuse: upload pipeline + Cloudinary, sanitization, slug + prerender machinery (add /projects/:slug to prerender.js for SEO), CORE_MEMBER-review gate from problem authoring. Surfaces: public listing + detail, a "My projects" dashboard card, optional home-page showcase row. Prototype: hand-seed 3 projects via Prisma studio, build the public detail page first.

### [N-02] Hackathon mode — project-judged competition rounds
**For:** competitor, organizer, regular member · **Theme:** Learning & competition · **Size:** Large (a semester project)
**Cost:** Free

**What it is.** The competition system today judges two things: code against test cases (DSA rounds) and code against a target image. Add a third round type: **project rounds** — teams build something over 24–48 hours, submit a repository link plus screenshots plus a short write-up through the platform, and judges score against a visible rubric (idea, execution, polish, presentation). In other words: make the platform able to run a real hackathon end to end — registration, teams, submission, judging, results, certificates — the way it already runs a DSA contest.

**Why it matters.** Hackathons are the flagship event format for every serious coding club, and right now the platform can host every part of one *except the actual hackathon*: team registration exists, event days exist, attendance exists, judging screens exist, winner certificates exist. The missing piece is just a submission shape that isn't "code that passes tests." This is the highest-leverage new build in this document because it's 70% assembled from existing parts — and it feeds N-01 directly: every hackathon ends with a batch of ready-made showcase entries. Honest cost: the build is the small half; running a good hackathon (sponsors, food, judges, a weekend of volunteer time) is the real expense, and the module is pointless unless Management commits to running at least one per semester.

**What success looks like.** One full hackathon runs start-to-finish on the platform — zero Google Forms involved — and its entries appear in the project gallery the following week.

> **For developers:** Extend `CompetitionRoundType` with PROJECT (one enum migration). Submission shape: reuse `CompetitionSubmission` with structured JSON (repoUrl, demoUrl, summary) instead of raw code — or FK to a draft N-01 `Project`, which is cleaner and auto-populates the gallery on finish. Judging: `CompetitionJudge` screen gains a rubric (per-criterion scores summing into the existing `score` field; store breakdown in `adminNotes` JSON or a small `rubric` column). Timer/lock/results/cert pipelines work unchanged. The existing 48h-scale duration, autosave, and participant-scope machinery all transfer.

### [N-03] Opportunities board — internships, referrals, and gigs from the network
**For:** regular member, alumni/guest, recruiter · **Theme:** Alumni & the outside world · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** A members-only board where vetted people — admins, verified alumni, network mentors — post opportunities: an internship at their company, a referral they're willing to give, a freelance gig, a hackathon worth entering. Members browse and express interest; the poster gets the list of interested members with their (consented) profile info. No applications processed on-platform, no recruiting pipeline — just a trusted notice-board that ends in a conversation.

**Why it matters.** The network module is the platform's most forward-looking feature: it has already collected verified industry professionals, with companies and designations on record — and then it does nothing with them except display a directory. Meanwhile the club's thesis is literally "it's where the line on the resume comes from." An opportunities board is the shortest path from that collected network to member outcomes, and it gives alumni a concrete, low-effort way to give back (fit test #4: owned by whoever runs the network — Admin team). Honest cost: it needs moderation discipline (only verified posters, expiry dates on posts so the board never looks stale) and it must stay a notice-board — the moment it tries to become a mini-LinkedIn it violates fit test #5.

**What success looks like.** The first member internship traceable to a board post; alumni posting without being chased.

> **For developers:** New model `Opportunity` (id, title, body markdown, type INTERNSHIP/REFERRAL/GIG/EXTERNAL_EVENT, postedById, company?, applyUrl?, expiresAt, status) + `OpportunityInterest` (opportunityId, userId) — both tiny. Posting gated to ADMIN + verified NetworkProfile owners; viewing gated to USER+. Lazy expiry like UserBlock (filter `expiresAt > now`, no sweep job). Bell notification on new post (NotificationFeed AUTO, audience USERS). Surfaces: a dashboard tab + a card on DashboardOverview. Email digest of open posts can ride S-08.

### [N-04] Mentorship & code-review exchange
**For:** curious fresher, regular member, core member · **Theme:** People helping people · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Two small, connected features. **Review requests:** a member submits a link to their code (a repo, or a playground snippet — sharing already exists) with "what I want feedback on," and it lands in a queue that core members and volunteers claim and answer, visibly. **Office hours:** seniors publish recurring availability ("DSA doubts, Thursdays 6 PM, lab 2 / Meet link") that any member can see in one place. No matching algorithms, no chat — just a queue and a noticeboard.

**Why it matters.** Count the manifesto lines about this: "code review without ego," "every line gets read by at least one other member before it ships," "seniors don't wait to be asked to pair — they pair," "help the next first-year before they ask," "run the session you wish someone had run for you." Five of the club's core claims are about members helping members — and the platform has *zero* features for it. Today this culture lives or dies on personality and WhatsApp; the people least served are exactly the shy freshers who won't DM a senior. A visible queue makes asking normal and answering countable (review counts are themselves recognition — surfaceable on S-19 profiles later). Honest cost: a queue nobody answers is worse than no queue — this needs 3–4 named volunteers committed to a response-time norm before it ships.

**What success looks like.** Median review-request answered within 72 hours; at least a third of requests come from first-years; "who do I even ask?" disappears as a question.

> **For developers:** `ReviewRequest` (id, userId, title, url, note, status OPEN/CLAIMED/ANSWERED, claimedBy?, answeredAt?, responseNote) — answers can simply be markdown on the request, no threading (fit test #5: discussion continues wherever the member prefers). Office hours: a `MentorSlot` model or, cheaper, a structured field on TeamMember rendered as a "Get help" page. Reuse playground snippet shareTokens as first-class reviewable links. Bell-notify the requester on claim/answer. Strictly no real-time component — keep Socket.io budget untouched.

### [N-05] Live session Q&A — the quiz engine's quieter sibling
**For:** organizer, regular member, alumni/guest speaker · **Theme:** Event days that run themselves · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** During a guest talk or workshop, attendees open a session page on their phones and type questions; everyone sees the queue and taps to upvote; the host's projector view shows questions sorted by votes. The speaker answers the room's actual top questions instead of whoever is boldest with a raised hand. Optionally anonymous — the shy-fresher mode.

**Why it matters.** The club already proved the pattern: a hall of phones connected to a projector is its signature move (the quiz). Q&A is the same hardware, same moment, same socket plumbing — pointed at guest sessions, where today the question round is awkward silence followed by the same three seniors talking. For invited speakers (a persona the club works hard to impress), a smooth upvoted Q&A is a professionalism signal they'll remember. Honest cost and constraint: it shares the real-time budget with quizzes — it must stay memory-light and must not run simultaneously with a mega-quiz; a question queue is far lighter than quiz scoring (no per-player state beyond a vote set), so it fits, but it should be built with the same bounded-memory discipline.

**What success looks like.** Guest sessions end with 15+ submitted questions instead of 2 spoken ones; speakers comment on it; the anonymous option visibly pulls questions from first-years.

> **For developers:** New Socket.io namespace `/qa` or piggyback room semantics on the session's eventId. State: one in-memory room per active session — questions array (capped, e.g. 200) + per-question voter `Set<userId>` — same bounded-Map pattern as `quizStore.ts`; persist nothing or batch-persist on session end for the recap. Throttle submissions per user (reuse the 500ms gate pattern). Host view = a projector route like QuizHostView. Hard rule: refuse to open a Q&A room while a quiz room exceeds N players, or simply document "not during quizzes."

### [N-06] The library — club knowledge that outlives the event
**For:** regular member, curious fresher, content team · **Theme:** Knowledge that outlives an event · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** Every event already stores resource links (slides, repos, recordings) — shown only on that event's own page, where nobody looks after the day passes. The library is one searchable page: every resource from every past event plus standalone entries the Content/DSA teams add directly (cheat sheets, setup guides, "watch this before the graph session"). Filterable by topic, linked from the dashboard's coding section.

**Why it matters.** The club generates teaching material constantly and the platform scatters it across event pages by date — the one axis nobody searches by. A fresher wanting "everything the club has on Git" currently has to know which past event covered it. This is a classic invisible-feature situation (the data exists, the aggregation doesn't), it gives the Content team a second surface beyond announcements, and it compounds: every event makes the library more valuable. Honest cost: someone must curate titles and tags or it becomes a link dump — pair it with a norm that closing an event includes filing its resources.

**What success looks like.** The library is the answer link for every "does anyone have the slides from…" message; resources get visits months after their event ended.

> **For developers:** Cheapest version is read-only aggregation: a page querying `Event.resources` JSON across PAST events, grouped by tag (events already have `tags String[]`). Better version adds a small `LibraryItem` model (title, url, type, tags, eventId?, addedBy) so standalone items exist and event resources can be promoted/curated into it. Search rides the existing `/api/search/global` pattern. No uploads needed — links only (slides live in Drive/YouTube; fit test #5).

### [N-07] Streak badges for GitHub — the club, embedded elsewhere
**For:** regular member, recruiter · **Theme:** Recognition & proof · **Size:** Small (a weekend)
**Cost:** Free

**What it is.** A live badge image any member can embed in their GitHub README or portfolio: a small card showing their code.scriet streak, problems solved, and the club logo — always current, linking back to the club. The same trick GitHub stats cards and LeetCode badges use, which CS students demonstrably love pasting everywhere.

**What it matters.** It's the smallest possible version of S-19's idea (member identity made public) shipped in a weekend: opt-in, one image URL, zero privacy surface beyond two numbers the member chooses to publish. Every embedded badge is a permanent backlink and a daily-refreshed advertisement in exactly the habitat (GitHub profiles) where the club's target audience lives. And it makes streaks more precious — a number on your public README is a number you protect.

**What success looks like.** Badges appear in members' GitHub profiles unprompted; new sign-ups mention seeing one.

> **For developers:** One public endpoint `GET /api/badge/:slugOrId.svg` returning a hand-built SVG string (no rendering deps — string templates, like prerender.js does for HTML) with `Cache-Control: max-age=3600`. Opt-in flag on User; 404 when off. Data: `currentStreak`, accepted-count — two indexed lookups, cacheable in the existing LRU pattern. Keep it < 5 KB, no external fonts. This is also the cheapest proving ground for S-19's opt-in/visibility model.

### [N-08] Event-day runbook — a home for the Management team
**For:** core member / organizer, management team · **Theme:** Event days that run themselves · **Size:** Medium (some weeks)
**Cost:** Free

**What it is.** A private checklist attached to each event: template tasks (book the room, confirm the speaker, print the banner, test the projector, brief the scanners) with assignees and a day-of view everyone running the event can see on their phone. Templates are reusable — "workshop runbook," "contest runbook" — so the second event of a kind starts 80% planned.

**Why it matters.** Management is the team the About page credits as "the reason events happen on time" — and it is the only club team with literally zero platform surface; its entire craft lives in WhatsApp and memory that graduates with seniors. A runbook module is institutional memory for operations: the painful lessons of event one become the printed checklist of event five. Honest verdict, though: this is the most "internal tool" idea on the list — it fails fit test #1 (no public proof) and general-purpose tools (Notion, Google Tasks) do 80% of it. It earns its place only through integration: tasks that link to the event's actual scanner page, invitation status, and certificate wizard. **Build it only if the Management team asks for it after trying a Notion template first.**

**What success looks like.** The third event of a semester reuses a refined template, and a venue-booking step never gets forgotten again.

> **For developers:** `EventTask` (eventId, title, assigneeId?, dueAt?, done, order) + `TaskTemplate` (name, items JSON). CORE_MEMBER+ visibility, rendered as a tab in the existing `EventAdminHub`. Deliberately no notifications beyond the daily bell digest — this must not become a noisy task manager. Two small models, one admin surface; the restraint is the design.

### [N-09] Coding duels — flagged, not recommended yet
**For:** competitor · **Theme:** Learning & competition · **Size:** Medium build, but gated
**Cost:** Free until it isn't (judge usage)

**What it is.** Two members, one problem, first correct solution wins; a live head-to-head with an audience option. Genuinely exciting, very on-brand — and listed here mainly to document *why not yet*: every duel submission hits the code judge, which runs on a free external execution service reached through the club's worker. Duels turn judging from "a few submissions per problem per day" into "rapid-fire submissions as a game mechanic," which is exactly the usage pattern that gets free tiers throttled — and the platform's daily-quota system exists precisely to prevent this. If quiz nights ever feel stale, revisit with strict caps (duel-specific submission limits, scheduled duel events rather than always-on matchmaking). Until then, the quiz engine is the club's head-to-head format.

> **For developers:** If ever built: reuse problem bank + judge + a bounded in-memory room (quizStore pattern); the binding constraint is Wandbox throughput via `workers/executor.js`, not server memory. Hard per-duel submission caps and admin-scheduled sessions only — no open matchmaking.

## 5.4 Comparison and a recommended path

| # | Module | Fit-test score | Builds on | New surface for | Verdict |
|---|---|---|---|---|---|
| N-01 | Project Showcase | 5/5 | Uploads, slugs, prerender, review gates | The club's core identity claim | **Build next** |
| N-02 | Hackathon mode | 5/5 | Teams, competition, judging, certs | Flagship event format | **Build next** (pairs with N-01) |
| N-03 | Opportunities board | 4/5 | Network, bell, dashboard | Alumni giving back | Build later |
| N-04 | Mentorship & review exchange | 4/5 | Snippets, bell, team pages | The manifesto's culture claims | Build later (needs named volunteers) |
| N-05 | Session Q&A | 4/5 | Socket.io patterns, host views | Guest-speaker experience | Build later (mind the real-time budget) |
| N-06 | The library | 4/5 | Event resources, tags, search | Content team, freshers | Build later (cheap) |
| N-07 | GitHub streak badges | 5/5 | Streaks, LRU cache | Outside-world visibility | **Any weekend** |
| N-08 | Event-day runbook | 2/5 | EventAdminHub | Management team | Only if asked (try Notion first) |
| N-09 | Coding duels | 3/5, gated | Judge, quiz patterns | — | Not yet (judge-quota risk) |

**The recommended path, stated as one paragraph:** the platform's next era should be about *what members make and who helps them make it* — the two areas with literally zero footprint today despite being the loudest claims in the manifesto. Concretely: ship N-07 (badges) any weekend as the appetizer; build **N-01 (Project Showcase)** as the next semester project, with **N-02 (Hackathon mode)** landing alongside it so the first hackathon both stress-tests and populates the gallery; queue N-03/N-04/N-06 behind those as medium follow-ups, choosing by which team raises its hand first. Everything in this part is Free in money; the binding currency is volunteer attention — which is why the verdict column says "build next" exactly twice.
