# Agent Task: Quiz System — Complete UI Redesign + Feature Audit & Implementation

> You are working in an existing monorepo. This task has three phases that must
> be executed in strict order. Do not skip phases or merge them.

---

## PHASE 1 — DEEP CODEBASE & DESIGN SYSTEM ANALYSIS

### Step 1A — Read the entire quiz system first
Before looking at anything else, find and read every file related to the quiz:
- All quiz page components (`QuizPage`, `QuizLobby`, `QuizQuestion`, `AdminPanel`,
  `QuizLeaderboard`, `QuizTimer`, `QuizResultReveal`, `PollResultsView`, etc.)
- Quiz Zustand store
- Quiz socket hook (`useQuizSocket`)
- Quiz REST API routes
- Quiz socket server handler
- Quiz Prisma models in `schema.prisma`

Read them fully. Do not skim. Understand every prop, every state shape, every
socket event being used, every component tree.

### Step 1B — Extract the FULL website design system
Read every non-quiz page and component that exists. You are extracting:

**Colors — find the exact values, not approximations:**
- Primary brand color (the main accent — button backgrounds, links, highlights)
- Secondary/complementary color
- Background colors (page bg, card bg, elevated surface bg, modal bg)
- Text colors (primary text, secondary text, muted/placeholder text)
- Border colors (default border, focus ring, divider lines)
- Status colors (success green, error red, warning yellow, info blue)
- Any gradient definitions being used anywhere

Look in: Tailwind config (`tailwind.config.js` or `tailwind.config.ts`),
CSS variables in `index.css` or `globals.css`, any theme provider files,
any `constants/colors.ts` or similar utility files. Extract exact hex/HSL values.

**Typography — find the exact values:**
- Font families in use (headings vs body vs monospace)
- Font size scale being used
- Font weight patterns (which weights are used for headings, body, captions)
- Line height conventions
- Letter spacing patterns (especially for headings and labels)

**Spacing & Layout:**
- Card/container border radius values (are they `rounded-lg`, `rounded-2xl`, specific px?)
- Card shadow styles (exact box-shadow values or Tailwind shadow classes)
- Page max-width and padding conventions
- Section spacing patterns (how much vertical space between sections)
- Gap/padding inside cards

**Component Patterns — analyze existing premium components:**
- How are buttons styled? (primary, secondary, ghost, danger variants)
- How are input fields styled? (border, focus state, padding)
- How are badges/tags styled?
- How are modals/dialogs constructed?
- How are loading states shown? (skeleton screens? spinners? shimmer?)
- How are empty states designed?
- How are tables styled?
- What animation patterns exist? (hover transitions, page transitions, micro-animations)
- Are there any existing gradient cards, glassmorphism effects, or special treatment
  for premium/highlighted content?

**Existing animations:**
- CSS transition durations used (100ms? 200ms? 300ms?)
- Easing functions (ease, ease-in-out, specific cubics?)
- Any Framer Motion usage? If yes, read every `motion` component and `variants` definition
- Any CSS keyframe animations?
- Hover effects on interactive elements

**Dark mode:**
- Does the site use dark mode? Is it the default? Is it toggleable?
- Extract the exact dark mode color set if it exists

Document ALL of this in a structured analysis block before writing a single line
of new code. Output it as a comment at the top of a new file called
`quiz-design-tokens.md` in the project root. This file is your reference for
the entire redesign.

---

## PHASE 2 — FEATURE AUDIT AGAINST REQUESTED SPEC

Before writing any UI code, audit every feature that was requested in the project
context. Check each one: EXISTS AND WORKING / EXISTS BUT BROKEN / MISSING ENTIRELY.

### Feature checklist to audit:

**PIN Join System:**
- [ ] 6-digit PIN generated at quiz creation time
- [ ] `/quiz/join` page with OTP-style 6-box digit input
- [ ] Auto-advance cursor on digit entry
- [ ] Backspace moves to previous box
- [ ] Paste fills all boxes
- [ ] `inputMode="numeric"` on mobile
- [ ] `POST /api/quiz/join { pin }` endpoint exists and validates correctly
- [ ] Invalid PIN shows inline error (not toast/alert)
- [ ] Expired/finished quiz PIN returns appropriate message
- [ ] QR code displayed on admin lobby (`qrcode.react`)
- [ ] QR download as PNG works
- [ ] Copy PIN button works
- [ ] Copy join link button works
- [ ] `?pin=` query param pre-fills boxes on `/quiz/join`
- [ ] Direct navigation to `/quiz/:quizId` without PIN verification is blocked

**Mid-Quiz Join:**
- [ ] Joining while a question is active shows that question immediately
- [ ] Timer syncs correctly using `timeElapsedMs` from server
- [ ] Mid-quiz joiner cannot re-answer questions they missed
- [ ] "Joined mid-quiz" badge stored in DB (`joinedMidQuiz: true`)
- [ ] Badge shown on leaderboard for late joiners

**Poll Questions (must NOT have right/wrong):**
- [ ] `POLL` type has no `correctAnswer` field in creation form
- [ ] Scoring logic returns 0 points and `isCorrect: null` for polls
- [ ] Post-poll reveal shows ONLY distribution — no green/red highlighting
- [ ] Horizontal bar chart with percentages and vote counts
- [ ] Pie/donut chart (toggle-able)
- [ ] Word cloud for open-text polls
- [ ] "Save Chart" dropdown: PNG, SVG, CSV export
- [ ] `html2canvas` used for PNG export

**Rating Question Type:**
- [ ] `RATING` enum value exists in Prisma schema
- [ ] Creation form shows slider (1–10) or star input
- [ ] No correct answer, no scoring
- [ ] Post-reveal shows average rating + histogram

**Persistent Storage:**
- [ ] All answers batch-inserted in single transaction at quiz end
- [ ] Per-question `answerDistribution` JSON saved
- [ ] Per-question `avgAnswerTimeMs`, `correctCount`, `totalAnswers` saved
- [ ] Participant `finalScore`, `finalRank`, `correctCount`, `totalAnswerTimeMs` saved
- [ ] Quiz `pinActive` set to `false` on finish/abandon
- [ ] SIGTERM handler persists in-progress quiz data

**User Dashboard "My Quizzes" tab:**
- [ ] Tab exists on user profile/dashboard
- [ ] Active quizzes section fetches `GET /api/quiz/active`
- [ ] Shows PIN in bold monospace font on each active quiz card
- [ ] "Join" button on each active quiz card
- [ ] Quiz history section fetches `GET /api/quiz/my-history`
- [ ] History shows rank, score, correct count, date
- [ ] Expanding a row shows per-question breakdown with user's answer vs correct answer
- [ ] "View Full Leaderboard" links to `/quiz/:quizId/results`

**Admin Dashboard:**
- [ ] `/admin/quizzes` page lists ALL quizzes
- [ ] Status filter tabs: All / Draft / Waiting / Active / Finished / Abandoned
- [ ] Edit action (DRAFT only)
- [ ] Duplicate action (creates new draft with new PIN)
- [ ] Delete with confirmation (hard delete if no participants, archive if has participants)
- [ ] Export quiz results as CSV
- [ ] Per-quiz analytics page at `/admin/quizzes/:quizId/results`
- [ ] Overview stat cards (participants, avg score, avg time, accuracy)
- [ ] Full leaderboard with 🥇🥈🥉 medals
- [ ] Per-question breakdown with charts
- [ ] Per-participant answer detail (expandable rows)
- [ ] Export: CSV (full results), CSV (leaderboard only), PDF summary report
- [ ] PDF uses `jspdf` + `html2canvas`

**Admin Live Controls:**
- [ ] Kick player (`kick_player` socket event)
- [ ] Extend time by 10s (`extend_time` socket event)
- [ ] Skip question (`skip_question` socket event)
- [ ] Pause quiz (`pause_quiz` socket event + client timer freezes)
- [ ] Resume quiz (`resume_quiz` socket event + client timer resumes)
- [ ] Live player list with connected/disconnected dots
- [ ] "X of Y answered" live counter

**No-Reload Guarantee:**
- [ ] Every state transition happens via socket → Zustand → re-render
- [ ] Zero API calls during active quiz
- [ ] Timer uses `requestAnimationFrame` not `setInterval`
- [ ] Answer buttons disabled immediately on click (optimistic Zustand update)
- [ ] Reconnect flow: `socket.recovered` check → re-emit `join_quiz` if false

**Optimization (DO NOT BREAK THESE — VERIFY THEY EXIST):**
- [ ] ALL live quiz state is in-memory (quizStore Map) — zero DB reads during active quiz
- [ ] Questions loaded ONCE into memory at quiz start
- [ ] Socket rooms used for broadcasting (`socket.to(quizId).emit()`)
- [ ] `rawSocket.request = null` in `io.engine.on('connection')`
- [ ] `connectionStateRecovery` enabled on Socket.io server
- [ ] Neon keep-alive `SELECT 1` every 4 minutes
- [ ] `bufferutil` and `utf-8-validate` installed
- [ ] Neon POOLED connection string used for app queries

**For each item above:**
- Mark it WORKING / BROKEN / MISSING
- For BROKEN: identify the exact bug and fix it
- For MISSING: implement it completely
- For WORKING: leave the logic untouched, only restyle if it has UI

Output the full audit as a table in a file called `quiz-feature-audit.md` before
writing any implementation code.

---

## PHASE 3 — PREMIUM UI REDESIGN

Only begin this phase after Phase 2 is complete. You now have:
1. `quiz-design-tokens.md` — the exact design system
2. `quiz-feature-audit.md` — every feature status
3. Working implementations of all features

Now redesign every quiz UI component to be premium, cohesive, and beautiful —
matching the website's exact design language.

### Design philosophy to follow

Study how the best quiz platforms look:
- **Kahoot** — high contrast, bold colors, energetic, dark backgrounds during questions
- **Mentimeter** — clean, minimal, lots of whitespace, elegant typography
- **AhaSlides** — modern gradients, glassmorphism cards, smooth animations

Your goal: take the website's existing design language and apply it to the quiz
with the energy and polish of these platforms. Do NOT invent a new design language.
Do NOT use colors that don't exist in the website's palette. Make it feel like
the quiz was always part of the website — just the most premium section of it.

### Rules for the redesign

**NEVER:**
- Use inline styles unless absolutely unavoidable
- Use colors not found in `quiz-design-tokens.md`
- Use font sizes outside the existing type scale
- Use border-radius values that differ from existing card patterns
- Add `setTimeout` for visual delays in place of proper CSS transitions
- Touch any state management, socket logic, scoring, or DB query code
- Add DB queries where in-memory store is currently used
- Replace existing working logic — only replace the JSX/CSS around it

**ALWAYS:**
- Use the exact Tailwind classes or CSS variables already used in the codebase
- Match the existing component patterns (button styles, card styles, input styles)
- Keep all event handlers, hooks, and Zustand selectors exactly as they are
- Only replace JSX structure and className attributes
- Ensure all redesigned components are fully responsive (mobile-first)

### Component-by-component redesign spec

**`/quiz/join` — PIN Entry Page**

Premium treatment: This is the first thing users see. It must be iconic.

Layout:
- Full-height centered layout matching the site's auth pages (login/register styling)
- Site logo at top
- Headline: "Join Quiz" — use the site's heading font, largest size in the scale
- Subheading: "Enter the 6-digit code from your host"

PIN input boxes:
- 6 boxes in a row, centered
- Each box: large (min 56px × 72px on desktop, 44px × 56px mobile)
- Border: use the site's default border color, 2px
- Focus state: use the site's primary brand color as border + subtle glow/ring
  matching the site's existing focus ring pattern
- Filled state: slightly elevated background, primary text color, bold monospace font
- Font size inside boxes: at minimum 28px, monospace font
- Gap between boxes: 8–12px, slightly wider gap between box 3 and 4 for readability
- Smooth transition on focus/fill state changes (match site transition duration)

"Join" button: full width below boxes, primary button style from site, disabled
state when not all 6 digits filled (match site's disabled button styling).

Error state: inline below the boxes, error text color from site, with a subtle
shake animation on the box group (CSS keyframe: translate ±4px, 3 cycles, 300ms total).

QR alternative: small "or scan QR code" link below the button — only shown if
the URL has a `?pin=` param already filled (meaning they came from a QR link,
show confirmation instead).

**`QuizLobby` — Waiting Room**

Split layout on desktop (admin on right panel, players on left):

Player side:
- Quiz title in large heading
- Host name in muted secondary text
- Animated waiting state: pulsing dot or subtle breathing animation on
  "Waiting for host to start..." — use CSS animation, not a spinner
- Live player list: each player appears with a slide-in animation from the bottom
  as they join (CSS transform: translateY + opacity, 200ms ease-out)
  Use the site's card/chip styling for each player name
- Player count badge prominently displayed

Admin side (or full screen if admin):
- PIN displayed in massive monospace font (min 64px)
  Style: use the site's primary color, high contrast, with a subtle card behind it
  labeled "Game PIN"
- QR code card: clean card with white background (regardless of dark mode) for QR
  scannability, rounded corners matching site's card radius
- Action buttons row: "Copy PIN", "Copy Link", "Download QR"
  Use ghost/outline button style from site for these secondary actions
- Player list on the right with the same join animations
- "Start Quiz" button: primary button, large, full-width or prominently placed
  Disabled + grayed until ≥1 player. Show "Waiting for players..." text inside
  the button when disabled.
- Server warmup indicator: small status dot (yellow pulsing = waking, green = ready)

**`QuizQuestion` — The Core Experience**

This is where the quiz lives. Make it immersive.

Question display area (top ~40% of screen):
- Full-width card with slightly elevated background (one step above page bg)
- Question number indicator: "Question 3 of 10" — small, muted, top left
- Points value: "100 pts" — small badge, top right, using the site's badge style
- Question text: large, centered, site's heading font, generous padding
- If `mediaUrl` exists: image displayed below question text, max height 200px,
  object-fit contain, rounded corners

Timer bar:
- Full-width below the question card
- Height: 8px, rounded full
- Filled from left to right, depleting right to left
- Color transitions using CSS custom properties (update via JS):
  - 100% → 40%: site's success/green color
  - 40% → 15%: site's warning/yellow color
  - 15% → 0%: site's error/red color
- Countdown number displayed above bar, right-aligned, bold, color matches bar
- When < 5 seconds: bar pulses (scale 1 → 1.02 → 1, loop, CSS animation)

Answer options (MCQ/Poll):
- Grid layout: 2 columns on desktop, 1 column on mobile
- Each option is a large button card (not a small button — full card with padding)
- Match the site's card styling (border, radius, shadow)
- Option letter badge (A, B, C, D) in a circle on the left — use the site's
  primary color for the badge background
- Option text centered/left aligned depending on length
- Hover: elevate shadow + slightly shift primary color on border
  (match site's hover transition duration, ease-in-out)
- Selected/submitted state: fill with primary color, white text, check icon on right
- After `question_results` received:
  - Correct option: green fill (site's success color), checkmark icon
  - Wrong selected option: red fill (site's error color), X icon
  - Other unselected options: grayed out (site's muted/disabled color)
  - Transition: 300ms ease-in-out color fill animation

True/False:
- Two large full-width buttons stacked (mobile) or side by side (desktop)
- True: slightly green-tinted card, checkmark icon on left
- False: slightly red-tinted card, X icon on left
- Same selected/revealed states as MCQ

Short Answer:
- Large text input, site's input styling, autofocus on question show
- Submit button: primary style, right-aligned or full-width below
- Submitted state: input disabled, "Answer submitted ✓" text

After answering (while waiting for results):
- Show the answer the player chose with a "Submitted ✓" state
- Show their current score: "Your score: 820 pts" — update without re-render flash
- Show a subtle animated waiting indicator ("Waiting for others...")

**`QuizResultReveal` — Post-Question Reveal**

Points awarded animation (most important moment):
- Large "+120" text pops in — use CSS keyframe:
  scale from 0.5 → 1.2 → 1.0, opacity 0 → 1, duration 400ms
  Color: site's success color if correct, site's error color if wrong
- Streak indicator: "🔥 3 streak!" — shown if streak >= 2
- "Correct!" or "Not quite..." text in appropriate colors

Answer distribution:
- `QuizAnswerDistribution` component: animated horizontal bars
  (recharts BarChart or pure CSS, your choice based on what's already in codebase)
  Bars animate width from 0 to final value on mount (300ms ease-out)
  Correct answer bar: site's success color. Others: site's secondary/muted color.

Mini leaderboard (top 5):
- Compact table card with medal emojis for top 3
- Highlight current user's row with subtle background (site's primary color at 10% opacity)
- "Your rank: #7" text if not in top 5

**`QuizLeaderboard` — Final Results**

This is the payoff screen. Make it celebratory.

Top 3 podium visual (optional but premium):
- 3 player cards arranged as a podium: 2nd (left, slightly lower), 1st (center, highest, slightly larger), 3rd (right, lowest)
- Gold/silver/bronze colors for the position medals: use literal gold (#FFD700), silver (#C0C0C0), bronze (#CD7F32) for medals only — these are universal and not overridden by the site theme
- Confetti animation on mount if the current user is in top 3:
  Use a simple CSS-only confetti using `@keyframes` with multiple `::before`/`::after`
  pseudo-elements — NO external confetti library to keep bundle small

Full ranked table below podium:
- Clean table using site's table styling pattern
- Columns: Rank | Name | Score | Correct | Avg Time | Badge
- Current user row: subtle highlight
- Late joiner badge: small pill using site's warning/info color
- Sort indicator on Score column (default sort, not interactive)

**`AdminPanel` — Live Admin Controls**

Split layout:
- Left: current question view (what players see + correct answer highlighted in green)
- Right: live stats panel

Right panel:
- "X / Y answered" with a circular progress ring (SVG, pure CSS — no library)
  Ring fills as more players answer. Color: site's primary brand color.
- Connected players list: each player name with a colored dot
  Green dot = connected, gray dot = disconnected (CSS circle, 8px)
- "All answered!" banner appears when count matches total — use site's success color
  with a subtle pulsing glow animation to prompt admin to click Next

Control buttons:
- "Next Question →": primary button, large, prominent
  Pulsing highlight border animation when `allAnswered === true`
- "Extend Time +10s": outline/ghost button, smaller
- "Pause" / "Resume": toggle button, use site's secondary styling
- "Skip Question": ghost/danger button
- "End Quiz": danger/destructive button, requires confirmation modal
  Modal styling must match site's existing modal/dialog pattern exactly

**`PollResultsView` — Poll Charts**

Clean data visualization:
- Tabs for switching between chart types: "Bar" | "Pie" | "Word Cloud"
  Use site's existing tab component pattern
- Chart area: card with generous padding, white/elevated bg for chart readability
- Recharts components styled to use site's color palette
  (pass `fill` props using the CSS variable values you extracted)
- "Save Chart" button: outline style, with a download icon, top-right of chart card
  Dropdown uses site's existing dropdown/menu component pattern

**`AdminQuizCreator` — Quiz Creation Form**

Multi-step form (wizard pattern if the site has one, single-page if not):

Step 1: Quiz basics (title, description, settings)
Step 2: Add questions (dynamic list)
Step 3: Review + Create

Question cards in the list:
- Drag handles on left (show drag cursor, use `⋮⋮` icon)
- Collapsed view: question number, first 60 chars of question text, type badge
- Expanded view: all fields
- "Add Question" button: dashed border card at the bottom of the list
  (match this pattern to site's existing "add item" patterns if any)

Success screen after creation:
- Full-screen success state (not a toast)
- Huge PIN number with label "Your Game PIN"
- QR code card
- Three action buttons: "Copy PIN", "Download QR", "Go to Lobby"

**`/admin/quizzes` — Admin List Page**

Data table:
- Match the site's existing table/list patterns exactly
- Status badges: colored pills matching site's badge component style
  DRAFT=gray, WAITING=blue, ACTIVE=green (pulsing dot), FINISHED=purple, ABANDONED=red
- Action menu: three-dot (⋮) button per row, dropdown with: View, Edit, Duplicate,
  Export, Delete — match site's existing dropdown/context menu pattern
- Filter tabs across top: match existing tab pattern
- Search input: filter by title client-side — match site's input style

**`/quiz/:quizId/results` — Post-Quiz Public Results Page**

Clean results page:
- Hero section: quiz title, end date, total participants
- Leaderboard card: top 10 default, "Show all" expander
- Per-question breakdown: accordion list, each question expandable
  Inside: correct answer, answer distribution bar, accuracy percentage
- User's personal result card (if authenticated + participated):
  Highlight card using site's primary color at low opacity, "Your Result" heading
  Shows their rank, score, questions breakdown

---

## CRITICAL CONSTRAINTS — READ BEFORE WRITING ANY CODE

### DO NOT TOUCH — EVER:
1. `quizStore.js` / `quizStore.ts` — the in-memory store logic
2. Any `store.submitAnswer()`, `store.advanceQuestion()`, `store.getLeaderboard()` calls
3. Any `store.persistResultsAndCleanup()` logic
4. Any code that reads from the in-memory Map during active quiz
5. Any `socket.to(room).emit()` calls
6. The `bufferutil`/`utf-8-validate` setup
7. `rawSocket.request = null` line
8. `connectionStateRecovery` configuration
9. The Neon keep-alive `SELECT 1` interval
10. The SIGTERM handler
11. Any Prisma query that runs at quiz END (the persist transaction)
12. The `generateUniquePin()` collision-check logic
13. The `answeredCurrentQuestion` flag logic
14. The scoring formula (base + time bonus + streak bonus)

### HOW TO REDESIGN SAFELY:
- Copy the existing component
- Keep all hooks, event handlers, Zustand selectors IDENTICAL
- Only change JSX structure and `className` attributes
- Test that the component still functions identically after restyling
- If in doubt about whether a change is "UI only": it is NOT safe if it's inside
  a function body that isn't a render/return statement

### RESPONSIVE REQUIREMENTS:
Every component must work on:
- Mobile: 375px minimum width
- Tablet: 768px
- Desktop: 1280px+

The quiz question and PIN entry pages in particular must be fully usable on mobile
since most quiz participants will join on their phones.

---

## PHASE 3 COMPLETION CHECKLIST

- [ ] `quiz-design-tokens.md` created with all extracted values
- [ ] `quiz-feature-audit.md` created with every feature status
- [ ] All MISSING features implemented
- [ ] All BROKEN features fixed
- [ ] All in-memory optimization code verified untouched
- [ ] PIN entry page redesigned — OTP boxes, large font, animated error
- [ ] Lobby redesigned — large PIN display, QR code, player join animations
- [ ] Question page redesigned — immersive, timer bar with color transitions
- [ ] Answer options redesigned — large card buttons, smooth reveal animations
- [ ] Result reveal redesigned — points pop animation, distribution bars
- [ ] Leaderboard redesigned — podium for top 3, confetti for winner
- [ ] Admin panel redesigned — live counter ring, pulsing controls
- [ ] Poll charts redesigned — recharts with site colors, save dropdown
- [ ] Quiz creator redesigned — wizard steps, drag handles, success screen
- [ ] Admin list page redesigned — status badges, action menus, filters
- [ ] Results page redesigned — hero, accordion breakdown, personal result card
- [ ] All components mobile-responsive tested
- [ ] No new DB queries introduced in any previously in-memory code path
- [ ] Zero page reloads during active quiz — verified manually in two tabs