# Agent Task: Full Repo Analysis + Live Quiz System Integration

> Read this entire prompt before touching a single file. Every section is load-bearing.

---

## PART 0 — RESEARCH FINDINGS THAT DRIVE ALL DECISIONS BELOW

Before you begin, internalize these non-negotiable technical facts gathered from official docs and benchmarks:

**Socket.io:**
- At 300 concurrent connections, Socket.io uses ~15–20MB RAM. Well within Render's 512MB free tier limit.
- Install optional native binaries `bufferutil` and `utf-8-validate` alongside socket.io for faster WebSocket frame masking/unmasking. These are optional but measurably improve throughput.
- Since Socket.io v4.6.0 (Feb 2023), **Connection State Recovery** is a built-in feature that automatically buffers missed events during a disconnection (up to configurable duration) and replays them on reconnect — eliminating the need for a manual `request_state` event in most cases.
- Discard the raw HTTP request reference per socket to save significant memory: `io.engine.on("connection", (rawSocket) => { rawSocket.request = null; })`. This is an official Socket.io performance recommendation.
- Active WebSocket connections count as inbound traffic on Render. A quiz in progress will naturally prevent server spin-down.

**Neon PostgreSQL:**
- **Critical:** The free tier with a direct (unpooled) connection only allows ~97 usable connections (104 total minus 7 reserved for Neon superuser on a 0.25 CU compute).
- **Solution:** Use Neon's built-in PgBouncer pooler by adding `-pooler` to the endpoint hostname in the connection string. This raises the client connection ceiling to **10,000** while routing through a smaller pool of actual Postgres connections.
- Neon PgBouncer runs in **transaction mode**. This means: SQL-level `PREPARE`/`EXECUTE` statements are NOT supported. Protocol-level prepared statements through the driver (e.g., named queries in `node-postgres`) are also not supported with the pooler. Use plain parameterized queries (`$1, $2`) only.
- `LISTEN`/`NOTIFY` is NOT supported with PgBouncer. Do not use it.
- Use the pooled connection string for ALL application queries. Use a direct connection string ONLY for migrations/schema changes (run once, not in the live server).
- Neon aggressively suspends compute on the free tier after ~5 min of inactivity. The first query after suspension has ~500ms cold start. Mitigate with a `SELECT 1` keep-alive every 4 minutes from within the Express server.

**Render Free Tier:**
- 512MB RAM, shared CPU, single process.
- Spins down after **15 minutes of zero inbound traffic** (both HTTP and WebSocket messages count).
- Spin-up after sleep takes **30–60 seconds** — catastrophic if it happens mid-quiz.
- Strategy: Admin must ping the health endpoint before starting any quiz to ensure the server is awake. The quiz UI must include a "warm up server" step before showing the Start Quiz button.
- Ephemeral filesystem: all in-memory quiz state is lost on restart. Handle this with the graceful shutdown strategy below.

**Frontend State Management:**
- Benchmarks show Zustand provides ~85ms average update time vs 220ms for naive useState for real-time state. More importantly, Zustand allows **selective subscriptions** — a component that only needs the leaderboard won't re-render when the timer ticks.
- Use **Zustand** (not useReducer, not Context) for the quiz store. It's 3KB, zero boilerplate, and perfectly suited for real-time socket-driven state where many different components need different slices.
- Use Zustand's `subscribeWithSelector` middleware so individual components only re-render when their specific slice changes.

---

## PART 1 — REPO ANALYSIS (DO THIS FIRST, WRITE NOTHING)

Spend as many steps as needed to fully understand the codebase before creating any files.

**Read and document:**
1. Full directory tree of both frontend and backend packages
2. Both `package.json` files — every dependency, every script, Node version
3. Express entry point — is it `app.listen()` or `http.createServer(app)`? Does an `httpServer` variable already exist? This is critical for Socket.io attachment.
4. React entry point + router setup — v5 or v6? How are protected routes implemented?
5. Auth system — JWT or session? Where is the token stored on the client (localStorage, cookie, memory)? What does `req.user` look like after the auth middleware runs? What is the auth middleware's function name?
6. Existing DB connection — is there already a `pg.Pool` instance? What is it named? What file exports it? What is its current `max` setting? Is it using a pooled or unpooled Neon connection string?
7. All existing DB schema/migration files — table names, column names, UUID vs integer PKs, timestamp conventions
8. All existing API route files — naming conventions (`/api/...`?), error response shape (`{ success, message, data }` or `{ error }` or other?), how auth middleware is applied to routes
9. Frontend API utility — Axios instance? What's the base URL env variable name? How are auth headers attached?
10. Existing user profile page component path and how tabs are implemented there
11. CORS configuration — what origins are allowed, how is it set up?
12. Existing `.env.example` or any env var documentation

**After analysis, before writing code, output a brief analysis summary** listing every integration point you will touch, what conventions you will follow, and any conflicts or risks you identified.

---

## PART 2 — DATABASE SETUP

### 2A — Connection Configuration

Find the existing DB pool. If it exists and uses an unpooled Neon connection string:
- Add a second pool specifically using the **pooled** connection string (`DATABASE_POOLED_URL` env var with `-pooler` in the hostname)
- The pooled pool is for all quiz read/write operations during live quiz
- The existing unpooled pool can remain for any existing code that uses it
- Set `max: 8` on the quiz pool — this leaves headroom for the existing pool

If the existing pool is already using a pooled connection string, reuse it with care, ensuring the combined `max` doesn't exceed 15 total.

Add a Neon keep-alive in the server init:
```javascript
// In server entry point, after pool initialization:
setInterval(async () => {
  try { await quizPool.query('SELECT 1'); } catch (e) { /* silent */ }
}, 4 * 60 * 1000); // every 4 minutes
```

### 2B — Migration File

Create `backend/src/quiz/migrations/001_quiz_schema.sql`. This file is idempotent and safe to re-run. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` everywhere. Match the PK type (UUID or integer) of existing tables.

**IMPORTANT: Do NOT use `SERIAL` if existing tables use UUID PKs. Use `gen_random_uuid()`. Do NOT use named prepared statements anywhere — they are incompatible with Neon's PgBouncer pooler.**
```sql
-- Quiz sessions
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'waiting', 'active', 'finished', 'abandoned')),
  current_question_index INT DEFAULT -1,
  question_count INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions belonging to a quiz
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INT NOT NULL,
  question_text TEXT NOT NULL,
  question_type VARCHAR(20) DEFAULT 'mcq'
    CHECK (question_type IN ('mcq', 'true_false', 'short_answer', 'poll')),
  options JSONB,             -- string array for mcq/true_false/poll, null for short_answer
  correct_answer TEXT,       -- null for poll type
  time_limit_seconds INT DEFAULT 20 CHECK (time_limit_seconds BETWEEN 5 AND 120),
  points INT DEFAULT 100 CHECK (points > 0),
  media_url TEXT,            -- optional image URL for the question
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Who participated in which quiz
CREATE TABLE IF NOT EXISTS quiz_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  final_score INT DEFAULT 0,
  final_rank INT,
  correct_count INT DEFAULT 0,
  total_answer_time_ms BIGINT DEFAULT 0,  -- sum of all answer times (for fastest finger tiebreaker)
  UNIQUE(quiz_id, user_id)
);

-- Per-question answers
CREATE TABLE IF NOT EXISTS quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_submitted TEXT,
  is_correct BOOLEAN DEFAULT FALSE,
  points_awarded INT DEFAULT 0,
  answer_time_ms INT NOT NULL CHECK (answer_time_ms >= 0),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, user_id)  -- enforce one answer per question per user at DB level
);

-- Performance indexes — critical, never allow sequential scans on hot paths
CREATE INDEX IF NOT EXISTS idx_quiz_participants_user_id ON quiz_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_participants_quiz_id ON quiz_participants(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question_id ON quiz_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_user_id ON quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_quiz_id ON quiz_answers(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status) WHERE status IN ('waiting', 'active');
CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON quizzes(created_by);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_position ON quiz_questions(quiz_id, position);
```

Create a migration runner `backend/src/quiz/migrations/run.js` that connects via the **direct** (unpooled) connection string (not the pooler — DDL and migrations require direct connections) and executes the SQL file, then exits. This is run once manually or as a build step, NOT as part of the server startup.

---

## PART 3 — IN-MEMORY QUIZ STORE

Create `backend/src/quiz/quizStore.js` — the central in-RAM state manager. The database is NEVER touched during an active quiz. Only at quiz load (read questions) and quiz end (write results).

**Data structure per quiz room:**
```javascript
{
  quizId: String (UUID),
  meta: {
    title: String,
    totalQuestions: Number,
    createdBy: String (userId)
  },
  status: 'waiting' | 'active' | 'finished',
  currentQuestionIndex: Number,      // -1 = lobby, 0+ = question in progress
  currentQuestionStartTime: Number,  // Date.now() when question was shown
  questions: Array<QuestionObject>,  // loaded once from DB, never re-queried
  players: Map<userId, {
    socketId: String,
    displayName: String,
    score: Number,
    correctCount: Number,
    totalAnswerTimeMs: Number,   // cumulative, used for fastest-finger tiebreaker
    streak: Number,              // consecutive correct answers
    answeredCurrentQuestion: Boolean,
    connected: Boolean           // track disconnected players
  }>,
  currentAnswers: Map<userId, {  // CLEARED on each new question
    answer: String,
    timeMs: Number,
    isCorrect: Boolean,
    pointsAwarded: Number
  }>,
  autoAdvanceTimer: NodeJS.Timeout | null,
  adminUserId: String,
  adminSocketId: String | null,
  emptyRoomTimer: NodeJS.Timeout | null  // auto-cleanup if abandoned
}
```

**Methods to implement:**

`initQuiz(quizId, questionsArray, adminUserId, adminSocketId)` — Creates quiz room in memory. Validates questions array is not empty.

`addPlayer(quizId, userId, socketId, displayName)` — Idempotent. If player already exists (reconnect), update their socketId and connected=true. If quiz is active, return current question data alongside confirmation so reconnected player is immediately caught up. If player is new, add them. Returns `{ isNew, currentState }`.

`updateAdminSocket(quizId, userId, newSocketId)` — Admin reconnected.

`submitAnswer(quizId, userId, answerText, clientTimestamp)` — 
  - Validate: quiz is 'active', question index valid, player exists, player hasn't answered current question yet (idempotent check), time limit not exceeded (use `Date.now() - currentQuestionStartTime`)
  - Compute `timeMs = Date.now() - currentQuestionStartTime` (server-side only, client timestamp is only for display)
  - Determine correctness (case-insensitive trim for short_answer, exact match for others)
  - Compute points using the scoring formula below
  - Update player totals: score, correctCount, totalAnswerTimeMs, streak
  - Set `answeredCurrentQuestion = true`
  - Store in `currentAnswers` map
  - Returns `{ isCorrect, pointsAwarded, timeMs, allAnswered: players.size === currentAnswers.size }`

**Scoring formula (implement exactly this):**
```javascript
function calculatePoints(question, timeMs, streak) {
  if (!isCorrect) return 0;
  const timeLimitMs = question.time_limit_seconds * 1000;
  const timeRatio = Math.max(0, (timeLimitMs - timeMs) / timeLimitMs); // 0–1
  const basePoints = question.points;                                    // default 100
  const timeBonus = Math.floor(timeRatio * 50);                         // 0–50
  const streakBonus = Math.min((streak - 1) * 10, 50);                  // 0–50, starts after 1st correct
  return basePoints + timeBonus + streakBonus;
  // Max possible per question: 200 (100 base + 50 time + 50 streak)
  // Answering last millisecond: 100 base only
  // Wrong answer: always 0
}
```

`advanceQuestion(quizId)` — Increments `currentQuestionIndex`. Clears `currentAnswers` map. Resets all players' `answeredCurrentQuestion = false`. Clears and nullifies `autoAdvanceTimer`. If index >= totalQuestions, sets status to 'finished' and returns `{ done: true }`. Returns `{ done: false, question: nextQuestion, questionIndex }`.

`getLeaderboard(quizId)` — Returns array sorted by: (1) score descending, (2) totalAnswerTimeMs ascending (fastest finger tiebreaker — lower cumulative time wins on tie). Shape: `[{ rank, userId, displayName, score, correctCount, totalAnswerTimeMs }]`

`getAnswerDistribution(quizId)` — For the just-answered question, returns how many players chose each option. Shape: `{ [optionText]: count }`. Used for post-question reveal.

`persistResultsAndCleanup(quizId, pool)` — Uses a DB TRANSACTION to:
  1. `UPDATE quizzes SET status='finished', ended_at=NOW(), current_question_index=$1 WHERE id=$2`
  2. Bulk insert all `quiz_answers` rows using a single multi-row INSERT (not individual inserts per answer — construct `VALUES ($1,$2,...), ($3,$4,...)` for all answers at once)
  3. Bulk update all `quiz_participants` rows with final scores, ranks, correct counts, total answer times using a single query with `unnest` arrays
  4. On transaction commit: call `cleanupQuiz(quizId)`
  5. On transaction error: log error but DO NOT crash — quiz data is still in memory for retry

`cleanupQuiz(quizId)` — Deletes quiz from the Map. Clears any pending timers.

`markPlayerDisconnected(quizId, userId)` — Sets `connected = false`. Does NOT remove player.

`scheduleEmptyRoomCleanup(quizId, io)` — If called when 0 players are connected, starts a 10-minute timer. If still 0 players after 10 minutes, runs `persistResultsAndCleanup` with status='abandoned' then `cleanupQuiz`.

`cancelEmptyRoomCleanup(quizId)` — Called when a player reconnects. Cancels the 10-min timer.

`getAllActiveQuizIds()` — Returns array of quizIds currently in the store (for health/active-quiz list endpoint).

---

## PART 4 — SOCKET.IO SERVER

### 4A — Attaching to Existing Server

Find the existing Express entry point. The critical constraint is that Socket.io must attach to the **same HTTP server** that Express listens on. Implement exactly one of these patterns depending on what you find:
```javascript
// PATTERN A — if you find: app.listen(PORT, callback)
// Change to:
const httpServer = app.listen(PORT, callback);
const io = new Server(httpServer, { /* options */ });

// PATTERN B — if you find: const server = http.createServer(app); server.listen(...)
// Just add:
const io = new Server(server, { /* options */ });

// NEVER create a second http.createServer() or second listen() call
```

Socket.io server options:
```javascript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,      // 60s — prevents false disconnects on slow mobile
  pingInterval: 25000,     // 25s heartbeat
  transports: ['websocket', 'polling'],  // polling as fallback for restrictive networks
  connectionStateRecovery: {
    // Socket.io v4.6+ built-in: automatically replays missed events on reconnect
    maxDisconnectionDuration: 2 * 60 * 1000,  // buffer events for 2 minutes
    skipMiddlewares: false  // re-run auth middleware on recovery attempts
  }
});

// Performance: discard raw HTTP request reference per socket (saves ~1KB per connection)
io.engine.on('connection', (rawSocket) => {
  rawSocket.request = null;
});
```

Install performance packages in backend `package.json`:
```json
"bufferutil": "^4.0.8",
"utf-8-validate": "^6.0.3"
```
These are optionally loaded by the `ws` package automatically when present.

### 4B — Socket Event Handler

Create `backend/src/quiz/quizSocket.js`. Export a function `initQuizSocket(io)` that sets up all event handlers.

**Authentication middleware on socket connection:**
```javascript
io.use((socket, next) => {
  // Extract JWT from handshake auth (not headers — more reliable across transports)
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    const decoded = verifyJWT(token);  // use the SAME jwt verify function as existing middleware
    socket.userId = decoded.id;        // or decoded.userId — match existing JWT payload shape
    socket.userDisplayName = decoded.name || decoded.username || decoded.email;
    next();
  } catch (err) {
    next(new Error('AUTH_INVALID'));
  }
});
```

**On connection handler structure:**
```javascript
io.on('connection', (socket) => {
  // socket.recovered = true if connectionStateRecovery replayed missed events
  // If recovered, player state is already restored — no need to re-join room
  if (socket.recovered) {
    // Silently re-attach socket to the quiz room it was in
    // The connectionStateRecovery already replayed any missed show_question etc.
    return;
  }
  
  socket.on('join_quiz', handleJoinQuiz(socket, io));
  socket.on('start_quiz', handleStartQuiz(socket, io));
  socket.on('next_question', handleNextQuestion(socket, io));
  socket.on('submit_answer', handleSubmitAnswer(socket, io));
  socket.on('end_quiz', handleEndQuiz(socket, io));
  socket.on('disconnect', handleDisconnect(socket, io));
  
  // Acknowledgement-based error handling on all events:
  // each handler uses socket.emit('quiz_error', { code, message }) for failures
});
```

**Event: `join_quiz` `{ quizId }`**
- Look up quiz in quizStore. If not found, fetch from DB to verify it exists and status is 'waiting' or 'active'.
- If status is 'finished', emit `quiz_error: { code: 'QUIZ_ENDED' }` and return.
- If quiz is in memory: call `store.addPlayer()`. If `isNew`, emit `player_joined` to the room (not to the socket itself).
- Join socket to room `quizId`.
- Emit `join_confirmed` back to the socket with current state: `{ quizId, status, players[], currentQuestion (if active), yourScore, yourRank }`.
- If quiz was 'active' (mid-question on rejoin), also emit `show_question` to the socket only with `{ ...question, timeElapsedMs: Date.now() - store.currentQuestionStartTime }` so the client timer syncs correctly.
- Upsert `quiz_participants` row in DB (handles both new join and re-join after page refresh): `INSERT INTO quiz_participants ... ON CONFLICT (quiz_id, user_id) DO UPDATE SET display_name=$3` — use the pooled connection.
- Cancel any empty room cleanup timer.

**Event: `start_quiz` `{ quizId }`**
- Verify `socket.userId === quiz.createdBy` (only creator can start).
- Load questions from DB: `SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY position ASC`
- Call `store.initQuiz(quizId, questions, socket.userId, socket.id)`
- Update DB: `UPDATE quizzes SET status='active', started_at=NOW() WHERE id=$1`
- Emit `quiz_started` to entire room: `{ quizId, title, totalQuestions, playerCount }`
- Immediately call the same logic as `next_question` to show question 0.

**Event: `next_question` `{ quizId }`**
- Admin-only check.
- If there is a pending `autoAdvanceTimer`, clear it.
- Before advancing, emit `question_results` to the room with results for the question that just ended: `{ correctAnswer, leaderboard: store.getLeaderboard(quizId), answerDistribution: store.getAnswerDistribution(quizId), questionIndex: currentIndex }`. This shows players what happened before moving on.
- Wait 3 seconds (using a Promise/setTimeout) then call `store.advanceQuestion(quizId)`.
- If `done === true`: emit `quiz_finishing` to room, call `store.persistResultsAndCleanup()`, then emit `final_leaderboard` to room with full ranked results.
- If `done === false`: emit `show_question` to room: `{ questionIndex, totalQuestions, questionText, questionType, options, timeLimitSeconds, points, mediaUrl }` — **NEVER include correctAnswer in this payload**.
- Start `autoAdvanceTimer`: `setTimeout(() => { /* auto trigger next_question logic */ }, (timeLimitSeconds + 3) * 1000)` — the +3s grace period lets slow connections submit before auto-advance.

**Event: `submit_answer` `{ quizId, answer, questionId }`**
- Call `store.submitAnswer(quizId, socket.userId, answer, Date.now())`.
- On validation failure (already answered, time expired, wrong question): emit `quiz_error: { code: 'ANSWER_REJECTED', reason }` back to socket only. Do NOT crash, do NOT penalize.
- On success: emit `answer_received` back to submitter only: `{ isCorrect, pointsAwarded, timeMs, newScore, newStreak }`.
- If `allAnswered === true`: emit `all_answered` to admin socket only (prompts admin to click next). Do NOT auto-advance immediately — admin controls the pace. The auto-advance timer is the fallback.
- Emit `answer_count_update` to the room (including admin): `{ answered: currentAnswers.size, total: players.size }` — so everyone can see the live count of responses.

**Event: `end_quiz` `{ quizId }`**
- Admin-only check.
- Clears any pending `autoAdvanceTimer`.
- Calls `store.persistResultsAndCleanup(quizId, pool)`.
- Emits `final_leaderboard` to room with full results.
- Updates DB status to 'finished'.

**Event: `disconnect`**
- Call `store.markPlayerDisconnected(quizId, socket.userId)`.
- Emit `player_disconnected` to room: `{ userId, displayName, connectedPlayers }`.
- If admin disconnects: emit `admin_disconnected` to room (players should see a notice).
- If `connectedPlayers === 0`: call `store.scheduleEmptyRoomCleanup(quizId, io)`.

**Complete socket events reference:**

Client → Server:
```
join_quiz        { quizId }
start_quiz       { quizId }
next_question    { quizId }
submit_answer    { quizId, answer, questionId }
end_quiz         { quizId }
```

Server → Client:
```
join_confirmed          { quizId, status, players, currentQuestion?, yourScore, yourRank }
quiz_started            { quizId, title, totalQuestions, playerCount }
player_joined           { userId, displayName, totalPlayers }
player_disconnected     { userId, displayName, connectedPlayers }
admin_disconnected      {}
show_question           { questionIndex, totalQuestions, questionText, questionType,
                          options, timeLimitSeconds, points, mediaUrl }
answer_received         { isCorrect, pointsAwarded, timeMs, newScore, newStreak }
answer_count_update     { answered, total }  ← broadcast to room
all_answered            {}  ← to admin only
question_results        { correctAnswer, leaderboard[], answerDistribution, questionIndex }
quiz_finishing          {}  ← signals final leaderboard incoming
final_leaderboard       { leaderboard[], totalQuestions }
quiz_error              { code, message }
```

---

## PART 5 — REST API ROUTES

Create `backend/src/quiz/quizRouter.js`. Apply existing auth middleware to all routes. Match existing error response shape exactly.
```
POST   /api/quiz                    Create quiz + questions (admin)
GET    /api/quiz/active             List active/waiting quizzes (all auth users)
GET    /api/quiz/:quizId            Get quiz details + questions (no correct answers)
GET    /api/quiz/:quizId/results    Get final leaderboard (auth, quiz must be finished)
GET    /api/quiz/history/me         Quizzes current user participated in
PATCH  /api/quiz/:quizId            Edit quiz or questions (admin, only if status=draft)
DELETE /api/quiz/:quizId            Delete quiz (admin, only if draft/finished)
POST   /api/quiz/:quizId/warmup     Returns 200 immediately — used to wake Render server
```

**`GET /api/quiz/active` — important optimization:**
- First, check `quizStore.getAllActiveQuizIds()`. If the in-memory store has active quizzes, build the response from RAM (zero DB hits).
- If the store is empty (server just woke from sleep), fall back to DB query: `SELECT id, title, status, question_count, (SELECT COUNT(*) FROM quiz_participants WHERE quiz_id=q.id) as participant_count FROM quizzes q WHERE status IN ('waiting', 'active') ORDER BY created_at DESC LIMIT 20`
- Never poll this endpoint continuously from the frontend — it should only be fetched on tab mount.

**`POST /api/quiz` body shape:**
```json
{
  "title": "Club Quiz Night",
  "description": "Optional",
  "questions": [
    {
      "position": 0,
      "questionText": "...",
      "questionType": "mcq",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "B",
      "timeLimitSeconds": 20,
      "points": 100,
      "mediaUrl": null
    }
  ]
}
```
Validate: min 1 question, max 50 questions. Insert quiz then bulk insert questions in a transaction.

**`GET /api/quiz/history/me`:**
```sql
SELECT 
  q.id, q.title, q.ended_at, q.question_count,
  qp.final_score, qp.final_rank, qp.correct_count,
  (SELECT COUNT(*) FROM quiz_participants WHERE quiz_id = q.id) AS total_participants
FROM quiz_participants qp
JOIN quizzes q ON qp.quiz_id = q.id
WHERE qp.user_id = $1 AND q.status = 'finished'
ORDER BY q.ended_at DESC
LIMIT 20
```

Register the router in the Express app exactly as existing routers are registered. Do not break the existing route hierarchy.

---

## PART 6 — FRONTEND FILE STRUCTURE

Create files inside the existing `src/` folder following the existing directory conventions you discovered in Part 1. If the project uses a `features/` structure, use that. If it uses `pages/components/hooks`, use that.
```
features/quiz/   (or equivalent based on what you found)
├── store/
│   └── quizStore.js          ← Zustand store (THE source of truth for all quiz state)
├── hooks/
│   ├── useQuizSocket.js      ← socket connection & event binding
│   └── useQuizTimer.js       ← countdown timer (requestAnimationFrame-based)
├── components/
│   ├── QuizPage.jsx           ← top-level state machine, renders child based on status
│   ├── QuizLobby.jsx          ← waiting room
│   ├── QuizQuestion.jsx       ← question display + answer input (all types)
│   ├── QuizTimer.jsx          ← animated countdown bar
│   ├── QuizResultReveal.jsx   ← post-question reveal (answer + leaderboard)
│   ├── QuizLeaderboard.jsx    ← both mid-quiz and final leaderboard
│   ├── QuizAnswerDistribution.jsx  ← bar chart of how people answered
│   ├── AdminPanel.jsx         ← admin controls overlay
│   ├── AdminQuizCreator.jsx   ← quiz creation form
│   ├── ActiveQuizList.jsx     ← list of joinable quizzes  
│   └── JoinedQuizzesTab.jsx   ← user profile tab
└── utils/
    └── scoring.js             ← mirror of backend scoring formula (for optimistic display)
```

---

## PART 7 — ZUSTAND QUIZ STORE

Create `quizStore.js` using Zustand with `subscribeWithSelector` middleware. This is the ONLY place quiz state lives on the frontend.
```javascript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const useQuizStore = create(subscribeWithSelector((set, get) => ({
  // Connection
  socketStatus: 'disconnected',  // 'disconnected' | 'connecting' | 'connected'
  
  // Quiz meta
  quizId: null,
  title: '',
  totalQuestions: 0,
  isAdmin: false,
  
  // Session state (maps to server-side status)
  quizStatus: 'idle',  // 'idle' | 'joining' | 'lobby' | 'question' | 'revealing' | 'finished'
  
  // Players (lobby + live count)
  players: [],              // [{ userId, displayName }]
  connectedCount: 0,
  
  // Current question
  currentQuestion: null,    // full question object
  questionIndex: 0,
  questionStartTime: null,  // Date.now() when show_question received — for timer
  hasAnswered: false,
  myAnswer: null,
  
  // Post-answer feedback
  lastAnswerResult: null,   // { isCorrect, pointsAwarded, timeMs, newScore, newStreak }
  
  // Post-question reveal
  questionReveal: null,     // { correctAnswer, answerDistribution, leaderboard }
  
  // Scores
  myScore: 0,
  myStreak: 0,
  myRank: null,
  leaderboard: [],
  
  // Answer count live update
  answeredCount: 0,
  
  // Admin-only
  allAnswered: false,
  
  // Actions — all return void, reducers are pure
  setSocketStatus: (s) => set({ socketStatus: s }),
  joinedQuiz: (data) => set({ quizId: data.quizId, title: data.title, quizStatus: 'lobby', players: data.players, myScore: data.yourScore ?? 0, isAdmin: data.isAdmin }),
  playerJoined: (data) => set((s) => ({ players: [...s.players, { userId: data.userId, displayName: data.displayName }] })),
  playerLeft: (data) => set((s) => ({ players: s.players.filter(p => p.userId !== data.userId), connectedCount: data.connectedPlayers })),
  quizStarted: () => set({ quizStatus: 'lobby' }),
  showQuestion: (q) => set({ currentQuestion: q, questionIndex: q.questionIndex, questionStartTime: Date.now(), hasAnswered: false, myAnswer: null, lastAnswerResult: null, questionReveal: null, answeredCount: 0, allAnswered: false, quizStatus: 'question' }),
  answerReceived: (data) => set({ hasAnswered: true, lastAnswerResult: data, myScore: data.newScore, myStreak: data.newStreak }),
  answerCountUpdate: (data) => set({ answeredCount: data.answered }),
  allAnsweredReceived: () => set({ allAnswered: true }),
  questionResultsReceived: (data) => set({ questionReveal: data, leaderboard: data.leaderboard, quizStatus: 'revealing' }),
  finalLeaderboardReceived: (data) => set({ leaderboard: data.leaderboard, quizStatus: 'finished' }),
  reset: () => set({ quizId: null, quizStatus: 'idle', players: [], currentQuestion: null, leaderboard: [], myScore: 0, myStreak: 0, isAdmin: false }),
})));

export default useQuizStore;
```

**Usage in components (selective subscriptions prevent unnecessary re-renders):**
```javascript
// Only re-renders when currentQuestion changes:
const currentQuestion = useQuizStore(state => state.currentQuestion);

// Only re-renders when leaderboard changes:
const leaderboard = useQuizStore(state => state.leaderboard);

// Only re-renders when hasAnswered changes:
const hasAnswered = useQuizStore(state => state.hasAnswered);
```

---

## PART 8 — SOCKET HOOK

Create `useQuizSocket.js`. This hook manages the socket lifecycle and binds all server events to Zustand actions. Nothing else in the app should interact with socket.io directly.
```javascript
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import useQuizStore from '../store/quizStore';

export function useQuizSocket() {
  const socketRef = useRef(null);
  const store = useQuizStore;  // get the store reference, not reactive
  
  useEffect(() => {
    // Get token from wherever the existing app stores it (localStorage, cookie, context — match existing auth pattern)
    const token = getAuthToken();
    
    const socket = io(import.meta.env.VITE_SOCKET_URL || process.env.REACT_APP_SOCKET_URL, {
      autoConnect: false,   // IMPORTANT: don't connect until we need it
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    
    socketRef.current = socket;
    
    // Status tracking
    socket.on('connect', () => store.getState().setSocketStatus('connected'));
    socket.on('disconnect', () => store.getState().setSocketStatus('disconnected'));
    socket.on('connect_error', () => store.getState().setSocketStatus('disconnected'));
    
    // On reconnect (socket.recovered=false means state recovery failed, need to re-join)
    socket.io.on('reconnect', () => {
      const { quizId } = store.getState();
      if (quizId && !socket.recovered) {
        // State recovery failed — re-join the quiz room to get current state
        socket.emit('join_quiz', { quizId });
      }
    });
    
    // Quiz events — all update Zustand
    socket.on('join_confirmed',         store.getState().joinedQuiz);
    socket.on('quiz_started',           store.getState().quizStarted);
    socket.on('player_joined',          store.getState().playerJoined);
    socket.on('player_disconnected',    store.getState().playerLeft);
    socket.on('show_question',          store.getState().showQuestion);
    socket.on('answer_received',        store.getState().answerReceived);
    socket.on('answer_count_update',    store.getState().answerCountUpdate);
    socket.on('all_answered',           store.getState().allAnsweredReceived);
    socket.on('question_results',       store.getState().questionResultsReceived);
    socket.on('final_leaderboard',      store.getState().finalLeaderboardReceived);
    socket.on('quiz_error',             (err) => console.warn('[QuizSocket]', err));
    
    // Connect now
    socket.connect();
    
    return () => {
      // Cleanup on unmount — remove all listeners, disconnect socket
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // empty deps — socket created once per mount
  
  // Stable action functions — these never change reference
  const joinQuiz = useCallback((quizId) => {
    socketRef.current?.emit('join_quiz', { quizId });
  }, []);
  
  const submitAnswer = useCallback((quizId, answer, questionId) => {
    socketRef.current?.emit('submit_answer', { quizId, answer, questionId });
  }, []);
  
  const nextQuestion = useCallback((quizId) => {
    socketRef.current?.emit('next_question', { quizId });
  }, []);
  
  const startQuiz = useCallback((quizId) => {
    socketRef.current?.emit('start_quiz', { quizId });
  }, []);
  
  const endQuiz = useCallback((quizId) => {
    socketRef.current?.emit('end_quiz', { quizId });
  }, []);
  
  return { joinQuiz, submitAnswer, nextQuestion, startQuiz, endQuiz };
}
```

---

## PART 9 — TIMER HOOK

Create `useQuizTimer.js`. Uses `requestAnimationFrame` for smooth animation, not `setInterval`.
```javascript
import { useState, useEffect, useRef } from 'react';

export function useQuizTimer(questionStartTime, timeLimitSeconds) {
  const [timeLeftMs, setTimeLeftMs] = useState(timeLimitSeconds * 1000);
  const rafRef = useRef(null);
  
  useEffect(() => {
    if (!questionStartTime || !timeLimitSeconds) return;
    
    const endTime = questionStartTime + (timeLimitSeconds * 1000);
    
    function tick() {
      const remaining = endTime - Date.now();
      setTimeLeftMs(Math.max(0, remaining));
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [questionStartTime, timeLimitSeconds]);
  
  const progress = timeLeftMs / (timeLimitSeconds * 1000);  // 1.0 → 0.0
  const isUrgent = timeLeftMs < 5000;
  const isExpired = timeLeftMs === 0;
  
  return { timeLeftMs, progress, isUrgent, isExpired };
}
```

The timer derives from `questionStartTime` (set when `show_question` is received). This means:
- If the component re-mounts or re-renders, the timer is always accurate
- Refreshing the page and rejoining mid-question will show the correct remaining time because the server sends `timeElapsedMs` in the rejoin payload

---

## PART 10 — QUESTION COMPONENT

`QuizQuestion.jsx` — renders the appropriate input based on `questionType`. Zero reloads, fully socket-driven.

**General behavior for ALL types:**
- On any answer selection/submission: immediately set `hasAnswered = true` in Zustand (optimistic lock — disable all inputs before server confirms)
- Start answer time tracking: `const answerTimeMs = Date.now() - questionStartTime` — compute at the moment of click, before emitting
- Emit `submit_answer` with the answer
- Show a subtle "Submitted!" confirmation state while waiting for `answer_received`
- On `answer_received`: update to show isCorrect state (green/red feedback), points awarded, streak info

**MCQ (`question_type = 'mcq'`)**
- Display 4 option buttons (or however many are in the `options` array)
- Add keyboard shortcuts: press 1, 2, 3, 4 to select option at that index
- Button visual states: default → selected/submitted → correct (green) / wrong (red) after reveal
- Show option letters: A, B, C, D

**True/False (`question_type = 'true_false'`)**
- Two large buttons: "True" and "False"
- Keyboard: T for true, F for false

**Short Answer (`question_type = 'short_answer'`)**
- Text input + Submit button
- Trim and lowercase before submitting
- Disable input and button immediately on submit
- After reveal: show what the correct answer was

**Poll (`question_type = 'poll'`)**
- Same as MCQ visually but after reveal shows NO correct/wrong highlighting — only shows distribution bars
- Scoring system still awards points but based on most popular answer (or the admin-set "correct" answer for a poll can be used as a "fun fact" reveal — show it after)

**After `question_results` is received:**
The `QuizQuestion` parent (`QuizPage`) transitions to `quizStatus = 'revealing'` and renders `QuizResultReveal` instead — which shows:
- Correct answer highlighted
- User's answer highlighted (correct green or wrong red)
- Points awarded this round with a "+X" animation
- Current streak indicator
- `QuizAnswerDistribution` component: horizontal bars showing percentage who chose each option
- Compact leaderboard showing top 5

---

## PART 11 — TIMER BAR COMPONENT

`QuizTimer.jsx` — receives `progress` (0–1) and `timeLimitSeconds` from `useQuizTimer`.
```jsx
// CSS transition: green → yellow (< 40%) → red (< 15%)
// Width: progress * 100%
// Smooth: CSS transition: width 0.1s linear
// The bar updates ~60fps via requestAnimationFrame
// Pulse animation when isUrgent (< 5 seconds)
// Show numeric countdown: Math.ceil(timeLeftMs / 1000) seconds
```

Do NOT use `setInterval` for this. The `requestAnimationFrame` in `useQuizTimer` drives the state updates.

---

## PART 12 — ADMIN PANEL

`AdminPanel.jsx` — rendered inside `QuizPage.jsx` when `store.isAdmin === true`. Overlays or sits alongside the player view.

**Lobby state:**
- Live list of players who have joined (updates via `player_joined` socket event — no API call)
- Player count badge
- "Start Quiz" button: disabled until at least 1 player is present. Shows "Waiting for players..." if count is 0.
- Server warmup section: on component mount, hit `POST /api/quiz/:quizId/warmup`. Show "Server ready ✓" or "Waking server..." with a spinner. Start Quiz button is also disabled until warmup returns 200.

**Question state:**
- Shows the current question text and the correct answer (admin sees it, players don't)
- Live response counter: "X / Y players answered" — updates via `answer_count_update` socket event
- "Next Question" button: always available but pulses/highlights when `allAnswered === true` or `autoAdvanceTimer` is within 5 seconds
- Auto-advance countdown display: shows how many seconds until server auto-advances
- "End Quiz Early" button: opens a confirmation modal before emitting `end_quiz`

**Reveal state:**
- Sees the same leaderboard players see
- "Next Question →" button visible prominently to advance
- If this was the last question, button becomes "Finish Quiz & Show Final Results"

---

## PART 13 — QUIZ CREATOR

`AdminQuizCreator.jsx` — form for creating quizzes. Only accessible to admins (match existing role check pattern).

**Features:**
- Quiz title + description inputs
- Dynamic question list: add/remove questions
- Each question card has:
  - Question type selector (MCQ / True-False / Short Answer / Poll)
  - Question text textarea
  - Options list (for MCQ/Poll): add/remove option buttons, min 2, max 6
  - Correct answer marker (radio button next to each option for MCQ; toggle for True-False; text field for Short Answer; optional for Poll)
  - Time limit slider: 5–120 seconds, default 20
  - Points input: default 100
  - Optional media URL input
- Drag-to-reorder questions (or up/down arrows as fallback)
- Question preview: "Preview as Player" toggle shows the question as a player would see it
- Validation before submit: all questions must have text, MCQ must have at least 2 options and a correct answer marked
- On submit: `POST /api/quiz` → on success: redirect to `/quiz/:newQuizId` (which shows AdminPanel in lobby state)

---

## PART 14 — LEADERBOARD COMPONENT

`QuizLeaderboard.jsx` — used in two contexts:
1. **Mid-quiz (after each question):** compact top-5 list inside `QuizResultReveal`
2. **Final leaderboard:** full ranked list on `quizStatus === 'finished'`

Wrap in `React.memo` — it receives the leaderboard array as a prop and should only re-render when that array reference changes.

**Display columns:** Rank | Name | Score | Correct/Total | Avg Speed

**Fastest Finger indicator:** Players with the same score are ordered by `totalAnswerTimeMs` (lower = better). Display a ⚡ icon next to the player with the lowest `totalAnswerTimeMs` among tied players.

**Current user highlight:** The row matching `store.myUserId` (add userId to store) should be visually distinct (subtle background highlight) so users can quickly find themselves.

**Rank change animation:** Between questions, if a player's rank improved, show a subtle upward arrow animation next to their name.

---

## PART 15 — USER PROFILE INTEGRATION

Find the existing user profile page component. Add "Joined Quizzes" tab following the exact same tab implementation pattern already used in the file.

`JoinedQuizzesTab.jsx`:

**Section 1 — Active Quizzes (rendered at top):**
- On tab mount: `GET /api/quiz/active`
- Show each active quiz as a card: title, status badge (Waiting/In Progress), player count, "Join" button
- "Join" button navigates to `/quiz/:quizId`
- Manual refresh button (no auto-polling)
- If no active quizzes: friendly empty state message

**Section 2 — Quiz History (rendered below):**
- On tab mount: `GET /api/quiz/history/me`
- Show each past quiz: title, date, final rank (e.g., "#3 of 47"), score, correct/total
- Clicking a row navigates to `/quiz/:quizId/results`
- Paginate if more than 10 entries

---

## PART 16 — ROUTING

Add routes to the existing React Router setup. Match the exact pattern used for other routes (especially protected route wrapper):
```
/quiz                        → ActiveQuizList (show all active quizzes)
/quiz/create                 → AdminQuizCreator (protected: admin only)
/quiz/:quizId                → QuizPage (the full state-machine component)
/quiz/:quizId/results        → Static results page (no socket, REST-only, public)
```

`QuizPage.jsx` is a state machine. It renders different child components based on `quizStatus` from Zustand, never navigates between routes during a quiz:
```
quizStatus === 'idle'       → loading/joining state, emit join_quiz on mount
quizStatus === 'lobby'      → QuizLobby + AdminPanel (if admin)
quizStatus === 'question'   → QuizQuestion + QuizTimer + AdminPanel (if admin)
quizStatus === 'revealing'  → QuizResultReveal + AdminPanel (if admin)
quizStatus === 'finished'   → QuizLeaderboard (final) + "Back to profile" button
```

`QuizPage.jsx` on mount:
1. Extract `quizId` from URL params
2. Connect socket (call `useQuizSocket` hook which handles connection)
3. Emit `join_quiz` once connected
4. The rest is driven purely by socket events → Zustand store → re-renders

**ZERO page navigation happens during a quiz. ZERO API calls happen during a quiz. Everything mid-quiz is socket-driven.**

---

## PART 17 — NO-RELOAD GUARANTEE (EXPLICIT VERIFICATION)

The following transitions must happen with zero page reload, zero navigation, zero API call:

| Transition | How it happens |
|---|---|
| Lobby → Question starts | Server emits `quiz_started` → `show_question` → Zustand updates → QuizPage re-renders |
| Question N → Question N+1 | Admin clicks Next → server emits `question_results` then `show_question` → Zustand → re-render |
| Question ends (timer) | Server auto-emits `question_results` → `show_question` → same flow |
| Player joins mid-lobby | Server emits `player_joined` → `players` array in Zustand updates → lobby list re-renders |
| Player disconnects | Server emits `player_disconnected` → Zustand → re-renders |
| Answer submitted | Optimistic lock in Zustand immediately disables buttons, server confirms via `answer_received` |
| Post-question reveal | `question_results` event → Zustand `quizStatus = 'revealing'` → QuizPage renders QuizResultReveal |
| Final leaderboard | `final_leaderboard` event → Zustand `quizStatus = 'finished'` → QuizPage renders final LeaderBoard |
| User reconnects mid-quiz | Socket.io connectionStateRecovery replays missed events → OR join_quiz re-emitted manually → `join_confirmed` with `currentQuestion` and `timeElapsedMs` → QuizPage renders correct state |

**Active quiz list update (pre-join):** User is on profile "Joined Quizzes" tab. They click refresh button. `GET /api/quiz/active` is called. If a new quiz appeared, the list updates. This is the only fetch during "discovery" phase — it is intentional and acceptable.

---

## PART 18 — GRACEFUL SHUTDOWN & DATA INTEGRITY

Render sends a `SIGTERM` before killing the process (e.g., on redeploy or restart). Add this to the server entry point:
```javascript
process.on('SIGTERM', async () => {
  console.log('[SIGTERM] Graceful shutdown: persisting active quiz sessions...');
  
  const activeIds = quizStore.getAllActiveQuizIds();
  
  await Promise.allSettled(
    activeIds.map(quizId => quizStore.persistResultsAndCleanup(quizId, quizPool))
  );
  
  // Close DB pool cleanly
  await quizPool.end();
  
  // Close HTTP server (stop accepting new connections)
  httpServer.close(() => {
    console.log('[SIGTERM] Clean exit');
    process.exit(0);
  });
  
  // Force exit after 10 seconds if clean close doesn't happen
  setTimeout(() => process.exit(1), 10000);
});
```

---

## PART 19 — SECURITY & ANTI-CHEAT

**Server-side answer time calculation:**
The client sends `answer` and `questionId` but NOT a timestamp for scoring purposes. Server calculates `timeMs = Date.now() - store.currentQuestionStartTime`. Client timestamps are used only for display.

**Answer idempotency:**
The in-memory `answeredCurrentQuestion` flag is the first check. The DB `UNIQUE(question_id, user_id)` constraint is the second line of defense.

**Admin spoofing prevention:**
All admin actions (`start_quiz`, `next_question`, `end_quiz`) verify `socket.userId === quiz.meta.createdBy`. This check happens in quizStore, not just in the socket handler.

**Correct answer never sent to client:**
The `show_question` socket event payload must never include `correctAnswer`. Double-check this in `handleNextQuestion`. The correct answer is only sent in `question_results` AFTER the question ends.

**Rate limiting for socket events:**
Implement a simple per-user rate limiter map in memory for `submit_answer`:
```javascript
const answerRateLimit = new Map(); // userId → lastSubmitTime
// In handleSubmitAnswer:
const last = answerRateLimit.get(socket.userId) || 0;
if (Date.now() - last < 500) {
  socket.emit('quiz_error', { code: 'RATE_LIMITED' });
  return;
}
answerRateLimit.set(socket.userId, Date.now());
// Clear this map between questions (in advanceQuestion)
```

**Express REST routes:**
Apply `express-rate-limit` middleware to the quiz creation route: max 10 quiz creations per hour per IP.

---

## PART 20 — COMPLETE OPTIMIZATION CHECKLIST

**Backend — implement every item:**
- [ ] Neon POOLED connection string (`-pooler` suffix) used for all quiz queries — no direct connection during live traffic
- [ ] `bufferutil` and `utf-8-validate` packages installed for Socket.io native performance
- [ ] `rawSocket.request = null` set in `io.engine.on('connection')` to save RAM
- [ ] `connectionStateRecovery` enabled with 2-minute buffer — handles most reconnects transparently
- [ ] Neon keep-alive `SELECT 1` every 4 minutes to prevent cold connection starts
- [ ] ALL quiz live state in RAM — zero DB reads during active quiz
- [ ] Questions loaded ONCE into memory at quiz start — not re-fetched per question
- [ ] Batch DB writes at quiz end: single transaction, multi-row INSERT, `unnest` array UPDATE
- [ ] Socket rooms used for ALL broadcasting — `socket.to(quizId).emit()` — never iterate sockets manually
- [ ] Auto-advance timer references stored in quizStore and properly cleared/reset
- [ ] Graceful SIGTERM handler persists in-progress quiz data before exit
- [ ] `scheduleEmptyRoomCleanup` prevents abandoned quiz data from leaking memory
- [ ] Admin-only events verified against `quiz.meta.createdBy` not just socket role claim
- [ ] Rate limiter on `submit_answer` socket event: 500ms debounce per userId
- [ ] Correct answer NEVER included in `show_question` event payload
- [ ] Answer time calculated server-side using `Date.now() - currentQuestionStartTime`
- [ ] `UNIQUE(question_id, user_id)` DB constraint as second line of defense against duplicate answers
- [ ] Warmup endpoint `POST /api/quiz/:quizId/warmup` returns 200 immediately

**Frontend — implement every item:**
- [ ] Zustand with `subscribeWithSelector` — components only re-render for their slice
- [ ] `React.memo` on `QuizLeaderboard` and `QuizAnswerDistribution`
- [ ] Socket `autoConnect: false` — connect only when on a quiz route
- [ ] Socket disconnected and listeners removed on component unmount
- [ ] All event listeners registered OUTSIDE the `connect` event (to prevent duplicate registration on reconnect)
- [ ] Socket reconnect handler: if `socket.recovered === false`, re-emit `join_quiz`
- [ ] Timer uses `requestAnimationFrame` not `setInterval`
- [ ] Answer buttons disabled immediately on click (optimistic Zustand update) before server confirms
- [ ] `answer_time_ms` computed client-side at click time: `Date.now() - questionStartTime`
- [ ] No API calls during active quiz — all state changes driven by socket events
- [ ] `show_question` event sets `questionStartTime = Date.now()` — timer derives from this
- [ ] `join_confirmed` with `timeElapsedMs` on reconnect sets correct timer start: `questionStartTime = Date.now() - timeElapsedMs`
- [ ] `QuizPage` is a state machine rendering different children based on `quizStatus` — no navigation between routes mid-quiz
- [ ] `useQuizSocket` has no state of its own — it bridges socket events to Zustand only
- [ ] `getAuthToken()` uses the same token source as the rest of the app (match existing auth pattern)

---

## PART 21 — ENVIRONMENT VARIABLES

Add to backend `.env` (and Render environment):
```
DATABASE_POOLED_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
# Note the -pooler in the hostname above
# DATABASE_URL (existing direct URL) stays for migrations only
FRONTEND_URL=https://your-club-frontend.onrender.com
```

Add to frontend `.env` (and Render static site env):
```
VITE_SOCKET_URL=https://your-club-backend.onrender.com
# or REACT_APP_SOCKET_URL= depending on whether it's Vite or CRA
```

---

## PART 22 — DO NOT DO LIST

- ❌ Do NOT add Redis, BullMQ, Pusher, Ably, Convex, or any new external service
- ❌ Do NOT create a second Express server or second `http.createServer()`
- ❌ Do NOT use `LISTEN`/`NOTIFY` — not supported by Neon's PgBouncer pooler
- ❌ Do NOT use named prepared statements with the pooled connection — not supported by Neon PgBouncer transaction mode
- ❌ Do NOT open `new pg.Client()` per request — always use the shared pool
- ❌ Do NOT send `correctAnswer` in the `show_question` event payload
- ❌ Do NOT calculate answer time from client-submitted timestamp for scoring
- ❌ Do NOT use `io.emit()` (broadcasts to ALL sockets) — always use `socket.to(roomId).emit()`
- ❌ Do NOT use `useEffect(() => { socket.on(...) }, [])` if that creates duplicate listeners — register ALL socket listeners once on socket creation
- ❌ Do NOT use localStorage for quiz session state
- ❌ Do NOT poll the database for live quiz state during an active quiz
- ❌ Do NOT break any existing routes, components, or features
- ❌ Do NOT start the quiz without the admin warmup step completing

---

## PART 23 — FINAL VERIFICATION CHECKLIST

Before finishing, verify every item:
- [ ] Existing site still works completely — no regressions
- [ ] Migration runs cleanly on the Neon instance using the direct (unpooled) connection
- [ ] Socket connects with existing JWT token
- [ ] Admin creates quiz → redirected to lobby → warmup completes → Start Quiz enabled
- [ ] 2 browser tabs (one admin, one player) can go through a full 3-question quiz with no page reload
- [ ] Timer counts down smoothly with no jank
- [ ] Correct answer is NOT visible in browser DevTools Network tab during an active question
- [ ] Disconnecting and reconnecting mid-question restores correct timer position
- [ ] Final leaderboard ranks correctly by score then by cumulative answer time
- [ ] Profile "Joined Quizzes" tab shows active quizzes and past history
- [ ] No `console.error` DB connection errors under normal use
- [ ] No memory leaks: Socket listeners are removed on unmount, quiz rooms are cleaned up on quiz end
- [ ] `npm run build` completes with no errors on the frontend