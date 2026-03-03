# Agent Task: Quiz System — Phase 2 Fix & Feature Expansion

> The base quiz system is built and working but has critical UX/logic flaws.
> This prompt fixes them, adds industry-standard features benchmarked from
> Kahoot, Mentimeter, Slido, and AhaSlides, and builds complete persistent
> storage with full dashboards. Read everything before touching any file.

---

## PART 0 — REPO CONTEXT (ALREADY KNOWN, DON'T RE-ANALYZE)

- **Backend:** Express + Prisma ORM + Neon PostgreSQL, UUID PKs, pooled connection
- **Frontend:** React 19 + Vite + React Router v7, `pages/components/hooks` structure
- **Auth:** JWT in `localStorage` key `'token'`, payload `{ userId, id, email, role }`
- **Middleware:** `authMiddleware`, admin check: `requireRole('ADMIN')`
- **API shape:** `{ success: true, data }` or `{ success: false, error: { code, message } }`
- **Socket:** `initializeSocket(httpServer)` already in `socket.ts`
- **State:** Zustand with `subscribeWithSelector`
- **Schema:** Prisma models already exist for Quiz, QuizQuestion, QuizParticipant, QuizAnswer

---

## PART 1 — CRITICAL FIX: 6-DIGIT PIN SYSTEM (COMPLETE REDESIGN)

### Why the current system is broken
Right now clicking "Join" gives direct entry. This means anyone who finds the
quiz page can enter without the admin's knowledge. There is zero access control.
**Industry standard (Kahoot, Mentimeter, Slido, AhaSlides) is a PIN/code system.**
Kahoot uses 6 digits — 1,000,000 combinations, fast to type, expires when quiz
ends. 4 digits is only 10,000 combinations — too collision-prone for a reused platform.

### Prisma schema changes

Add to the `Quiz` model in `schema.prisma`:
```prisma
model Quiz {
  // ADD THESE:
  pin          String    @unique @db.VarChar(6)
  pinActive    Boolean   @default(true)   // false when quiz finishes/abandoned
}
```

Run `npx prisma migrate dev --name add_quiz_pin`.

### PIN generation service

In the quiz service/controller where quiz creation happens, add:
```typescript
async function generateUniquePin(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const conflict = await prisma.quiz.findFirst({
      where: { pin, pinActive: true }  // only block if an ACTIVE quiz has this PIN
    });
    if (!conflict) return pin;
  }
  throw new Error('PIN_GENERATION_FAILED');
}
```

Generate the PIN at **quiz creation time**, not start time. This lets the admin
share the code before the session begins (Kahoot does this too).

When quiz status transitions to `FINISHED` or `ABANDONED`, also set `pinActive = false`.
This frees the PIN number for future reuse.

### New join flow (fully replacing the old one)

**Step 1:** User navigates to `/quiz/join` (accessible from navbar, profile tab, and a
prominent "Join a Quiz" button on the homepage/dashboard).

**Step 2:** They see a large, clean PIN entry UI — **6 individual digit boxes** side by side
(OTP-style input). Implementation rules:
- Each box accepts exactly one digit (0–9), ignores letters
- On typing a digit, cursor auto-advances to the next box
- Backspace on an empty box moves cursor back to previous box
- Pasting "123456" fills all 6 boxes instantly (handle `onPaste`)
- Mobile keyboard: use `inputMode="numeric"` for numeric keypad
- "Join" button disabled until all 6 digits are filled
- On Enter or button click: submit the PIN

**Step 3:** `POST /api/quiz/join { pin: "123456" }`

**Step 4 — Server validates:**
```typescript
// In quizRouter.ts
router.post('/join', authMiddleware, async (req, res) => {
  const { pin } = req.body;
  
  if (!pin || !/^\d{6}$/.test(pin)) {
    return res.json({ success: false, error: { code: 'INVALID_PIN', message: 'Enter a valid 6-digit code' }});
  }
  
  const quiz = await prisma.quiz.findFirst({
    where: { pin, pinActive: true },
    select: { id: true, title: true, status: true, pin: true,
               _count: { select: { participants: true } },
               createdBy: { select: { name: true } } }
  });
  
  if (!quiz) {
    return res.json({ success: false, error: { code: 'PIN_NOT_FOUND',
      message: 'No active quiz found with this code. Check the PIN and try again.' }});
  }
  
  if (quiz.status === 'FINISHED') {
    return res.json({ success: false, error: { code: 'QUIZ_ENDED',
      message: 'This quiz has already ended.' }});
  }
  
  return res.json({ success: true, data: {
    quizId: quiz.id, title: quiz.title, status: quiz.status,
    participantCount: quiz._count.participants, hostName: quiz.createdBy.name
  }});
});
```

**Step 5:** On success, frontend navigates to `/quiz/:quizId`. The quiz page
handles both `WAITING` (lobby) and `ACTIVE` (mid-quiz join) states.

**Step 6 — Error states on the PIN entry page:**
- Invalid format: "Please enter all 6 digits" (inline, no API call yet)
- PIN not found: "No active quiz found with this code"
- Quiz ended: "This quiz has ended. Check with your host for a new code."
- Network error: "Connection failed. Check your internet and try again."
- All errors shown inline below the digit boxes, NOT as alerts/toasts

### QR Code support (Kahoot/Slido both do this)

On the **admin quiz lobby screen**, display alongside the PIN:
- A QR code pointing to `https://[SITE_DOMAIN]/quiz/join?pin=XXXXXX`
  generated using the `qrcode.react` package (`npm install qrcode.react`)
- A "Copy join link" button that copies the URL to clipboard
- A "Download QR" button — render QR to canvas and call `toDataURL('image/png')`
  to trigger a PNG download
- Show PIN in **large, readable font** (min 48px, monospaced, letter-spacing wide)
  so it's readable when projected on a screen

On the `/quiz/join` page, read the `?pin=` query param on mount and pre-fill the
digit boxes if present. This means scanning the QR takes the user directly to a
pre-filled join form.

---

## PART 2 — CRITICAL FIX: MID-QUIZ JOIN (MUST WORK SEAMLESSLY)

Currently joining after a quiz starts is broken or undefined. Fix it completely.

### Server-side (in quizSocket.ts `join_quiz` handler)

When a player emits `join_quiz` and the quiz status is `ACTIVE`:
1. Add them to the in-memory player map (or update their socketId if reconnecting)
2. Upsert `QuizParticipant` row: `prisma.quizParticipant.upsert({ where: { quizId_userId }, create: {...}, update: { displayName } })`
3. Join their socket to the quiz room
4. Emit `join_confirmed` back to their socket ONLY with the full current state:
```typescript
socket.emit('join_confirmed', {
  quizId,
  title: quiz.meta.title,
  status: 'active',
  isAdmin: socket.userId === quiz.meta.createdBy,
  currentQuestion: {             // send the ACTIVE question (no correctAnswer)
    index: quiz.currentQuestionIndex,
    totalQuestions: quiz.questions.length,
    questionText: q.questionText,
    questionType: q.questionType,
    options: q.options,
    timeLimitSeconds: q.timeLimitSeconds,
    points: q.points,
    timeElapsedMs: Date.now() - quiz.currentQuestionStartTime  // so timer syncs
  },
  myScore: quiz.players.get(socket.userId)?.score ?? 0,
  leaderboard: store.getLeaderboard(quizId)
});
```
5. Emit `player_joined` broadcast to the room so existing players see the new arrival

### Client-side (in useQuizSocket.ts)

When `join_confirmed` is received and `status === 'active'`:
- Set `quizStatus = 'question'` in Zustand immediately
- Set `questionStartTime = Date.now() - currentQuestion.timeElapsedMs`
  so the timer picks up from the correct point
- The `QuizPage` state machine will render `QuizQuestion` automatically

Mid-quiz joiners who join after question results have been shown for a question
they missed: they simply don't have answers for those questions. Their scores start
from 0. This is correct and expected behavior — clearly communicate this in the UI:
show a small "You joined mid-quiz" badge on their player card.

---

## PART 3 — CRITICAL FIX: POLL QUESTION TYPE (COMPLETE REDESIGN)

### The bug
Polls currently have a correct/wrong answer. **This is conceptually wrong.**
Polls are for gathering opinions. They should behave like Mentimeter/Slido polls:
pure distribution visualization, no scoring, no right/wrong.

### Prisma schema fix

The `QuizQuestion` model should enforce this. Add a validation comment and handle
it in the application layer:
```prisma
// In QuizQuestion model, correctAnswer is nullable
// Application must enforce: if questionType == POLL, correctAnswer must be null
// and pointsAwarded must be 0 for all answers to this question
```

In the quiz creation API, validate:
```typescript
if (q.questionType === 'POLL' && q.correctAnswer) {
  throw new Error('Poll questions cannot have a correct answer');
}
```

In the quiz answer scoring logic, short-circuit:
```typescript
if (question.questionType === 'POLL') {
  return { isCorrect: null, pointsAwarded: 0 };  // polls don't score
}
```

### Poll behavior during live quiz

**During the question (players answering):**
- Players see the poll options and select one (or multiple if `allowMultiSelect: true`)
- No timer pressure feel — keep the timer bar but make it visually softer (gray, not red)
- No "Submitted ✓" confirmation that implies right/wrong — say "Vote recorded ✓"
- Live vote count updates in real-time: `answer_count_update` event shows `X of Y voted`

**After poll closes (admin clicks Next or timer expires):**
- Server emits `poll_results` event (separate from `question_results` to make it explicit)
- NO green/red highlighting — no correct answer to reveal
- NO points awarded display
- Show ONLY the distribution visualization (see charts below)
- Admin panel shows "Poll closed" not "Question results"

### Poll visualization — show ALL of these charts

Use `recharts` (already in the project or install it). Display charts in `PollResultsView.jsx`:

**Chart 1 — Horizontal Bar Chart (primary, always shown)**
```
Option A  ████████████████████░░░░  62% (18 votes)
Option B  ████████░░░░░░░░░░░░░░░░  24% (7 votes)  
Option C  ████░░░░░░░░░░░░░░░░░░░░  14% (4 votes)
```
- Sort by vote count descending
- Show both percentage AND raw vote count
- Animate bars growing from left on mount (recharts has built-in animation)
- Color each bar a distinct, accessible color

**Chart 2 — Pie/Donut Chart (toggle-able)**
- Donut chart with each option as a segment
- Hovering a segment shows tooltip: "Option B — 7 votes (24%)"
- Legend below the chart

**Chart 3 — for Short Answer polls — Word Cloud**
- If `questionType === 'POLL'` and `options` is null (open text poll):
  - Collect all text answers
  - Count word frequency
  - Render a word cloud using `react-wordcloud` or `d3-cloud`
  - Bigger word = more mentions

### Saving poll charts

On the `PollResultsView.jsx` component, add a **"Save Chart" dropdown button:**
```
[ ↓ Save Chart ▾ ]
  → Save as PNG
  → Save as SVG  
  → Copy to clipboard
  → Export data as CSV
```

**Implementation for PNG/SVG export:**
Use `html2canvas` to capture the chart container div, then `canvas.toDataURL('image/png')` to download it. Name the file `poll-[questionText]-[date].png`.

**CSV export:**
```typescript
const csvContent = [
  ['Option', 'Votes', 'Percentage'],
  ...distribution.map(d => [d.option, d.count, d.percentage + '%'])
].map(row => row.join(',')).join('\n');
downloadFile(csvContent, 'text/csv', `poll-results-${quizId}.csv`);
```

---

## PART 4 — PERSISTENT STORAGE: STORE EVERYTHING

Currently quiz results may not be fully persisted. Ensure complete, durable storage.

### What must be stored (verify each exists in Prisma schema, add if missing)

**Quiz level:**
```prisma
model Quiz {
  // Ensure these exist:
  title           String
  description     String?
  pin             String    @unique @db.VarChar(6)
  pinActive       Boolean   @default(true)
  status          QuizStatus
  currentQuestionIndex Int  @default(-1)
  questionCount   Int       @default(0)
  startedAt       DateTime?
  endedAt         DateTime?
  totalParticipants Int     @default(0)  // snapshot at quiz end
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relations:
  questions       QuizQuestion[]
  participants    QuizParticipant[]
  answers         QuizAnswer[]
}
```

**Per-question storage:**
```prisma
model QuizQuestion {
  // Ensure these exist:
  position        Int
  questionText    String
  questionType    QuizQuestionType   // MCQ, TRUE_FALSE, SHORT_ANSWER, POLL
  options         Json?              // string array
  correctAnswer   String?            // null for POLL
  timeLimitSeconds Int               @default(20)
  points          Int               @default(100)
  mediaUrl        String?
  
  // Post-quiz analytics stored per question:
  totalAnswers    Int               @default(0)  // filled at quiz end
  correctCount    Int               @default(0)  // filled at quiz end (0 for POLL)
  avgAnswerTimeMs Int               @default(0)  // filled at quiz end
  answerDistribution Json?          // { "Option A": 12, "Option B": 7 } filled at quiz end
}
```

**Per-participant storage:**
```prisma
model QuizParticipant {
  quizId          String
  userId          String
  displayName     String
  joinedAt        DateTime  @default(now())
  joinedMidQuiz   Boolean   @default(false)  // true if joined after Q1 started
  finalScore      Int       @default(0)
  finalRank       Int?
  correctCount    Int       @default(0)
  totalAnswerTimeMs BigInt  @default(0)
  questionCount   Int       @default(0)  // how many questions they actually answered
  
  @@unique([quizId, userId])
}
```

**Per-answer storage:**
```prisma
model QuizAnswer {
  quizId          String
  questionId      String
  userId          String
  answerSubmitted String?
  isCorrect       Boolean?          // null for POLL
  pointsAwarded   Int              @default(0)
  answerTimeMs    Int
  submittedAt     DateTime         @default(now())
  
  @@unique([questionId, userId])
}
```

Run `npx prisma migrate dev --name complete_quiz_storage` after schema updates.

### Persist at quiz end (in quizStore.ts `persistResultsAndCleanup`)

Use a **single database transaction** for everything. Never do individual inserts:
```typescript
async function persistResultsAndCleanup(quizId: string, prisma: PrismaClient) {
  const room = quizStore.get(quizId);
  if (!room) return;
  
  const leaderboard = getLeaderboard(quizId);
  
  await prisma.$transaction(async (tx) => {
    // 1. Update quiz record
    await tx.quiz.update({
      where: { id: quizId },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
        pinActive: false,
        totalParticipants: room.players.size,
        currentQuestionIndex: room.currentQuestionIndex
      }
    });
    
    // 2. Bulk insert all answers (build VALUES array, one query)
    const allAnswers = collectAllAnswers(room);  // from room.allAnswersLog (see below)
    if (allAnswers.length > 0) {
      await tx.quizAnswer.createMany({
        data: allAnswers,
        skipDuplicates: true  // idempotent
      });
    }
    
    // 3. Update per-question analytics
    for (const q of room.questions) {
      const qAnswers = allAnswers.filter(a => a.questionId === q.id);
      const distribution: Record<string, number> = {};
      qAnswers.forEach(a => {
        const key = a.answerSubmitted ?? 'No answer';
        distribution[key] = (distribution[key] ?? 0) + 1;
      });
      const correctAnswers = qAnswers.filter(a => a.isCorrect);
      const avgTime = qAnswers.length > 0
        ? Math.floor(qAnswers.reduce((s, a) => s + a.answerTimeMs, 0) / qAnswers.length)
        : 0;
      
      await tx.quizQuestion.update({
        where: { id: q.id },
        data: {
          totalAnswers: qAnswers.length,
          correctCount: correctAnswers.length,
          avgAnswerTimeMs: avgTime,
          answerDistribution: distribution
        }
      });
    }
    
    // 4. Update all participants with final scores and ranks
    for (const entry of leaderboard) {
      const player = room.players.get(entry.userId)!;
      await tx.quizParticipant.update({
        where: { quizId_userId: { quizId, userId: entry.userId } },
        data: {
          finalScore: entry.score,
          finalRank: entry.rank,
          correctCount: player.correctCount,
          totalAnswerTimeMs: BigInt(player.totalAnswerTimeMs),
          questionCount: player.questionsAnswered
        }
      });
    }
  });
  
  cleanupQuiz(quizId);
}
```

**Important: add `allAnswersLog` to the in-memory room structure** — an append-only array that stores every answer as it comes in during the quiz. This is what gets batch-inserted at the end. Never lose answers that arrive before `persistResultsAndCleanup` is called.

---

## PART 5 — USER DASHBOARD: "MY QUIZZES" TAB

Find the existing user profile/dashboard page. Add a "My Quizzes" tab using the existing tab pattern.

### Tab structure
```
[ My Quizzes ]
├── Section A: Active Now
│   └── Quizzes with status WAITING or ACTIVE
│       → Shows: title, PIN (large), host, player count, "Join" button
│
└── Section B: Quiz History  
    └── Quizzes with status FINISHED that this user participated in
        → Table/cards showing: title, date, rank, score, correct/total
        → Clicking a row expands details or navigates to results page
```

### API endpoints needed

**`GET /api/quiz/active`**
```typescript
// Return quizzes currently WAITING or ACTIVE
// First check in-memory quizStore (zero DB hit if server is warm)
// Fall back to DB if store is empty (server cold start)
const active = await prisma.quiz.findMany({
  where: { status: { in: ['WAITING', 'ACTIVE'] } },
  select: {
    id: true, title: true, status: true, pin: true,
    _count: { select: { participants: true } },
    createdBy: { select: { name: true } }
  },
  orderBy: { createdAt: 'desc' },
  take: 20
});
```

**`GET /api/quiz/my-history`** (authenticated)
```typescript
const history = await prisma.quizParticipant.findMany({
  where: { userId: req.user.id },
  include: {
    quiz: {
      select: {
        id: true, title: true, endedAt: true, questionCount: true,
        _count: { select: { participants: true } }
      }
    }
  },
  orderBy: { quiz: { endedAt: 'desc' } },
  take: 50
});
// Return: [{ quizId, title, endedAt, finalRank, finalScore, correctCount,
//            questionCount, totalParticipants, joinedMidQuiz }]
```

**`GET /api/quiz/:quizId/my-result`** (authenticated)
Returns the current user's detailed result for a specific quiz including per-question breakdown.

### User dashboard component: `MyQuizzesTab.jsx`

**Active quizzes section:**
- Fetch on tab mount only (no auto-polling — wastes DB connections)
- Each card shows: title, status badge (green "Live" / blue "Waiting"), host name,
  player count, the PIN in bold monospace font, a "Join →" button
- Refresh icon button to re-fetch manually
- Empty state: "No active quizzes right now. Ask your host for the PIN."

**History section:**
- Paginated table (10 per page): Date | Quiz Title | Rank | Score | Correct
- Rank shows as "#2 of 47 players" — format it properly
- Score column shows both score and a visual bar relative to max possible
- Clicking any row expands an accordion showing per-question performance:
```
  Q1: "What is..." ✓ +120pts  (answered in 4.2s)
  Q2: "Name the..." ✗ +0pts   (answered in 18.9s)
  Q3: [POLL] "Which do you prefer..." — Voted (no score)
```
- "View Full Leaderboard" button navigates to `/quiz/:quizId/results`

---

## PART 6 — ADMIN DASHBOARD: FULL MANAGEMENT

The admin must be able to do everything from a dedicated admin panel.
Use `requireRole('ADMIN')` middleware on all these routes.

### Admin quiz list page: `/admin/quizzes`

A full data table showing ALL quizzes ever created with:
- Title, PIN (masked: `12****` — reveal on hover/click), Status badge, Created date,
  End date, Total participants, Actions column

**Status filter tabs:** All | Draft | Waiting | Active | Finished | Abandoned

**Actions per quiz:**
- **View Results** — navigates to results/analytics page
- **Copy PIN** — copies PIN to clipboard (for active/waiting quizzes)
- **Edit** — opens edit modal (only if `DRAFT` status — cannot edit active quizzes)
- **Duplicate** — creates a new `DRAFT` copy of the quiz with all questions, new PIN
- **Archive/Delete** — soft delete (set `archived: true`) with confirmation modal.
  Hard delete only if no participants (no data loss possible). If there ARE participants,
  only allow archiving (preserve data integrity)
- **Export** — downloads full results as CSV

**Bulk actions (checkbox select multiple):**
- Delete selected (with confirmation)
- Export selected as CSV

### Admin quiz results & analytics page: `/admin/quizzes/:quizId/results`

This is the richest page in the system. Show everything:

**Section 1 — Quiz Overview Stats (top cards)**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 47           │ │ 823 pts      │ │ 8.2s         │ │ 68%          │
│ Participants │ │ Avg Score    │ │ Avg Ans Time  │ │ Accuracy     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Section 2 — Final Leaderboard**
- Full ranked table: Rank | Name | Score | Correct/Total | Avg Time | Joined Mid-Quiz badge
- Highlight top 3 with 🥇🥈🥉 medals
- Export leaderboard as CSV button

**Section 3 — Per-Question Breakdown**
For each question, an expandable card showing:
- Question text and type
- For MCQ/TF/Short Answer: correct answer, accuracy %, avg time, answer distribution bar chart
- For POLL: answer distribution only (no correct/wrong), with all chart types from Part 3
- "Hardest question" badge on the question with lowest accuracy
- "Fastest question" badge on the question with lowest avg answer time

**Section 4 — Per-Participant Detail**
Searchable/sortable table:
- Player name | Score | Rank | Correct count | Mid-quiz joiner | Joined at
- Expanding a row shows their answer to every question with time taken

**Export options (top right of results page):**
```
[ Export ▾ ]
  → Full Results (CSV) — all participants × all questions
  → Leaderboard only (CSV)
  → Poll charts (ZIP of PNGs) — one chart per poll question
  → Summary Report (PDF) — uses html2canvas + jsPDF
```

**PDF Summary Report** (implement with `jspdf` + `html2canvas`):
- Page 1: Quiz title, date, overview stats
- Page 2+: Per-question results with chart screenshots
- Final page: Full leaderboard
- Trigger: `[ Export → Summary Report (PDF) ]` button

### Admin live quiz control panel (while quiz is active)

The admin sees a split view:
- **Left panel:** Live leaderboard updating in real-time via socket
- **Center:** Current question (with correct answer visible to admin)
- **Right panel:** Player list with green/gray dots for connected/disconnected status,
  live "X of Y answered" counter
- **Bottom bar:** Previous question summary | Next Question button | End Quiz button

**Additional admin controls during quiz:**
- "Kick player" — emits `player_kicked` to that socket, removes from room and store
- "Extend time" — adds 10 seconds to current question timer (emits `timer_extended { addedMs: 10000 }` to room)
- "Skip question" — immediately ends current question and shows results without waiting
- "Pause quiz" — emits `quiz_paused` to room, freezes timer server-side (set `pausedAt` timestamp, subtract from remaining time when resumed)
- "Resume quiz" — emits `quiz_resumed`, resumes timer

### New socket events for admin controls
```
Client → Server:
  kick_player        { quizId, targetUserId }   → admin only
  extend_time        { quizId, addMs: 10000 }   → admin only  
  skip_question      { quizId }                 → admin only
  pause_quiz         { quizId }                 → admin only
  resume_quiz        { quizId }                 → admin only

Server → Client (broadcast to room):
  player_kicked      { userId, displayName }
  timer_extended     { newEndTime }              // absolute timestamp
  quiz_paused        { pausedAt, timeRemainingMs }
  quiz_resumed       { resumeTime, timeRemainingMs }
```

**Client-side timer handling for pause/resume:**
The `useQuizTimer` hook must handle pause. When `quiz_paused` received: stop the
`requestAnimationFrame` loop, freeze display at `timeRemainingMs`.
When `quiz_resumed`: restart `requestAnimationFrame` from `Date.now()` using `timeRemainingMs` as the new duration.

---

## PART 7 — QUIZ RESULTS PAGE (PUBLIC, POST-QUIZ)

Route: `/quiz/:quizId/results` — accessible to anyone who participated.

Shows:
1. Quiz title + ended date
2. Final leaderboard (top 10 shown, expandable to full)
3. Your result highlighted (if authenticated and participated)
4. Per-question summary: question text, correct answer, how you answered
5. Poll results with charts

This page is REST-only (no socket). Fetch from `GET /api/quiz/:quizId/results`.

---

## PART 8 — COMPLETE QUESTION TYPE FEATURE MATRIX

Implement all question types properly. Research from Kahoot/Mentimeter shows
the best platforms support at minimum: MCQ, True/False, Short Answer, Poll,
and Range/Rating. Implement these 5:

| Type | Correct Answer | Scored | Player UI | Post-reveal |
|---|---|---|---|---|
| `MCQ` | Yes (one option) | Yes | 2-6 option buttons | Green/red highlight |
| `TRUE_FALSE` | Yes | Yes | Two big buttons | Green/red highlight |
| `SHORT_ANSWER` | Yes (fuzzy match) | Yes | Text input | Show correct answer |
| `POLL` | **No** | **No** | Option buttons | Distribution charts only |
| `RATING` | **No** | **No** | 1-5 star or 1-10 slider | Avg rating + distribution |

**Short answer fuzzy matching:**
```typescript
function isAnswerCorrect(submitted: string, correct: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase()
    .replace(/[^a-z0-9]/g, '');  // remove punctuation
  return normalize(submitted) === normalize(correct);
}
```

**Rating question:**
- Player sees a 1–10 slider or 1–5 star rating input
- No correct answer, no scoring (like poll)
- After closing: show average rating prominently, plus a histogram bar chart
  showing distribution (how many rated 1, 2, 3... etc.)
- Add `RATING` to the `QuizQuestionType` enum in Prisma

Add `RATING` to the `QuizQuestionType` enum. Run migration.

---

## PART 9 — QUIZ CREATION FORM IMPROVEMENTS

The `AdminQuizCreator.jsx` form must enforce all the rules above:

**Per-question validation rules:**
- If `questionType === POLL` or `RATING`: hide the "correct answer" field entirely
  and show a note: "Polls and ratings don't have correct answers — just distribution results"
- If `questionType === MCQ`: require at least 2 options, at least 1 marked as correct
- If `questionType === TRUE_FALSE`: show only "True" and "False" options pre-filled,
  admin just marks which one is correct
- `timeLimitSeconds`: slider from 5–120s, default 20s. Show "Quick (5-10s)",
  "Normal (15-30s)", "Extended (60s+)" labels at respective positions
- `points`: default 100, range 10–1000, step 10

**PIN display after creation:**
After successfully creating a quiz, show a success screen with:
- The generated 6-digit PIN in massive font
- QR code (from `qrcode.react`)
- Copy PIN button, Copy Link button, Download QR button
- "Go to Lobby" button → navigate to `/quiz/:quizId`

---

## PART 10 — NO-RELOAD GUARANTEE (EVERY TRANSITION LISTED)

Every single state change during a quiz must happen without any page reload,
navigation, or API call. Verify every row of this table is implemented:

| Event | Socket event | Zustand action | Component that re-renders |
|---|---|---|---|
| Lobby opens | `join_confirmed` | `joinedQuiz` | `QuizLobby` |
| Player joins | `player_joined` | `playerJoined` | Player list only |
| Player leaves | `player_disconnected` | `playerLeft` | Player list only |
| Quiz starts | `quiz_started` | `quizStarted` | `QuizPage` (shows Q1) |
| Question shown | `show_question` | `showQuestion` | `QuizQuestion` + `QuizTimer` |
| Answer submitted | `answer_received` | `answerReceived` | Answer buttons only |
| Vote count updates | `answer_count_update` | `answerCountUpdate` | Counter only |
| Timer ticks | RAF loop in `useQuizTimer` | (local, no Zustand update) | `QuizTimer` only |
| Question ends | `question_results` | `questionResultsReceived` | `QuizResultReveal` |
| Poll ends | `poll_results` | `pollResultsReceived` | `PollResultsView` |
| Next question | `show_question` | `showQuestion` | `QuizQuestion` + `QuizTimer` |
| All answered | `all_answered` | `allAnsweredReceived` | Admin panel only |
| Quiz paused | `quiz_paused` | `quizPaused` | `QuizTimer` (freezes) |
| Quiz resumed | `quiz_resumed` | `quizResumed` | `QuizTimer` (resumes) |
| Player kicked | `player_kicked` | redirect if self | `QuizPage` shows "removed" |
| Final results | `final_leaderboard` | `finalLeaderboardReceived` | `QuizLeaderboard` |

**Zero. Page. Reloads. During. A. Quiz.**

---

## PART 11 — ROBUSTNESS & EDGE CASES

**Handle every one of these:**

1. **Admin closes browser mid-quiz:** Timer auto-advances. After 10 min of zero
   connected players, `scheduleEmptyRoomCleanup` fires, persists results, marks quiz abandoned.

2. **Player refreshes the page mid-quiz:** Socket reconnects, emits `join_quiz`,
   gets `join_confirmed` with current question and `timeElapsedMs`. Timer syncs.
   Their previous answers are in memory so they can't re-answer already-answered questions.

3. **Server restarts mid-quiz (Render redeploy):** SIGTERM handler fires,
   `persistResultsAndCleanup` called for all active rooms. Data saved. On reconnect,
   users see quiz as `FINISHED` — data preserved.

4. **Two players submit same answer simultaneously:** `UNIQUE(questionId, userId)` 
   constraint at DB level + `answeredCurrentQuestion` flag in memory = idempotent.
   Second submission silently ignored (no error to user, they already see "Vote recorded").

5. **PIN collision on creation:** The `generateUniquePin()` function retries up to
   10 times. If all 10 attempts collide (astronomically unlikely), returns a clear
   server error so the admin knows to try creating again.

6. **Mid-quiz joiner on the last question:** They join, see the last question, submit
   their answer. Their score is just from that one question. They appear on the
   leaderboard with a "Late joiner" badge. Their `joinedMidQuiz = true` is stored.

7. **Quiz with 0 questions:** Prevent creation — validate `questions.length >= 1` in
   the creation API. Show "Add at least one question" on the form.

8. **Very long question text:** Truncate display at 300 characters in the question
   card but show full text in the answer phase. Store full text in DB (TEXT column, no limit).

9. **Duplicate quiz participant (browser tab opened twice):** `updatePlayerSocket()`
   replaces the old socket ID. The old socket gets a `duplicate_session` event and
   the client shows "You joined from another tab — this session ended."

10. **Network throttle / mobile data switch:** Socket.io's `polling` fallback transport
    handles this. `connectionStateRecovery` buffers 2 minutes of missed events.
    The reconnect flow resumes seamlessly.

---

## PART 12 — PACKAGES TO INSTALL

**Backend:**
```bash
# No new packages needed — Prisma already handles everything
```

**Frontend:**
```bash
npm install qrcode.react recharts html2canvas jspdf react-wordcloud
```

- `qrcode.react` — QR code generation in the admin lobby
- `recharts` — all charts (bar, pie, histogram, area)
- `html2canvas` — screenshot chart divs for PNG export
- `jspdf` — PDF report generation
- `react-wordcloud` — word cloud for open-text poll results

---

## PART 13 — FINAL VERIFICATION CHECKLIST

Before finishing, verify every item manually:

**PIN System:**
- [ ] Joining without a PIN is impossible — `/quiz/:quizId` direct URL without prior PIN 
      verification gets redirected to `/quiz/join`
- [ ] 6-digit OTP input works: auto-advance, backspace, paste, mobile numeric keyboard
- [ ] Invalid PIN shows inline error (not alert, not toast)
- [ ] QR code on admin lobby renders and download works
- [ ] PIN is visible in large font on admin lobby screen

**Mid-Quiz Join:**
- [ ] Joining while a question is active shows that question immediately with correct timer
- [ ] Mid-quiz joiner cannot answer questions they weren't present for
- [ ] "Joined mid-quiz" badge appears on leaderboard for late joiners

**Poll:**
- [ ] Poll questions have no correct answer field in the creation form
- [ ] Poll results show bar chart, pie chart, no green/red highlighting
- [ ] "Save Chart → PNG/CSV" works on poll results
- [ ] RATING question type works with slider, shows average + histogram

**Storage:**
- [ ] All answers persisted after quiz ends via single transaction
- [ ] Per-question `answerDistribution` JSON saved to DB
- [ ] Participant final scores and ranks saved
- [ ] Quiz `pinActive` set to false on quiz finish

**User Dashboard:**
- [ ] "My Quizzes" tab shows active quizzes with PIN displayed
- [ ] History tab shows past quizzes with rank, score, per-question breakdown
- [ ] Expanding a history row shows correct answer vs user's answer

**Admin Dashboard:**
- [ ] `/admin/quizzes` shows all quizzes with filter tabs
- [ ] Edit works for DRAFT only, disabled for ACTIVE/FINISHED
- [ ] Duplicate creates new quiz with new PIN
- [ ] Delete with confirmation, archive if participants exist
- [ ] Export CSV downloads correctly formatted file
- [ ] PDF report generates and downloads
- [ ] Per-question analytics page shows all breakdown data
- [ ] Live admin controls: kick, extend time, pause, resume all work via socket

**No-Reload:**
- [ ] Go through a full quiz in two browser tabs — zero page reloads required
- [ ] Pause/resume works without reload
- [ ] Player kick removes player without reload for kicked player