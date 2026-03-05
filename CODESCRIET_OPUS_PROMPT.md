# 🧠 Code.Scriet Playground — Full Overhaul Prompt for Claude Opus 4.6

> Feed this prompt to Claude Opus 4.6 along with your full codebase. Opus will analyze, plan, and implement everything end-to-end.

---

## SYSTEM CONTEXT

You are a senior full-stack engineer and architect being handed the **Code.Scriet Playground** — a multi-language online code editor and executor that lives at `code.codescriet.dev`. It is part of a monorepo hosted on Render, alongside the main marketing/app site at `codescriet.dev`.

Your job is to **read the entire codebase**, understand it deeply, then perform a complete overhaul covering:
- Bug fixes and optimizations
- Auth integration with the main site
- UI/UX redesign to match the main site's design system
- CORS hardening
- Render monorepo blueprint fix
- Code execution reliability improvements
- Security hardening
- New dashboard features

Work systematically. Think before you write. Show your full plan before implementing.

---

## PHASE 0 — CODEBASE ANALYSIS (Do this first, always)

Before writing a single line of code, analyze the entire repo:

1. Read `render.yaml` — identify why blueprint sync is failing (missing `rootDir`, schema errors, service dependency issues)
2. Read `package.json` files (root + playground + web) — understand the monorepo structure, scripts, and dependencies
3. Read `vite.config.ts` — understand build setup and any proxy configs
4. Read all `.md` docs (DEPLOYMENT.md, BUGFIXES.md, FIXES.md, RENDER_DEPLOYMENT.md, API_SETUP.md, EXECUTION_SETUP.md) — extract known issues, what's already been tried, and existing architecture decisions
5. Read `src/` directory fully — understand all components, hooks, API calls, and routing
6. Identify the current code execution provider (JDoodle) and its limitations
7. Map the auth flow (or lack thereof)

Output a structured analysis report covering:
- Current architecture diagram (text-based)
- List of all bugs and issues found
- List of all optimization opportunities
- Your full implementation plan before touching anything

---

## PHASE 1 — FIX RENDER MONOREPO BLUEPRINT SYNC

The `render.yaml` blueprint sync is failing. Fix it with these rules:

**Root cause diagnosis:**
- Check if `rootDir` is set for each service in `render.yaml`
- Check for YAML indentation or schema errors
- Verify service names don't conflict
- Check for environment variable issues

**Correct `render.yaml` structure for this monorepo:**

```yaml
services:
  - name: codescriet-playground
    type: web
    runtime: node
    rootDir: playground          # ← CRITICAL for monorepo
    buildCommand: npm install && npm run build
    startCommand: npm run start  # or node execute-server.js
    buildFilter:
      paths:
        - playground/**          # only redeploy on playground changes
    envVars:
      - key: NODE_ENV
        value: production
      - key: ALLOWED_ORIGIN
        value: https://codescriet.dev
      - key: JDOODLE_CLIENT_ID
        sync: false              # set manually in Render dashboard
      - key: JDOODLE_CLIENT_SECRET
        sync: false
      - key: DATABASE_URL
        sync: false

  - name: codescriet-web
    type: web
    runtime: node  
    rootDir: web                 # ← main site
    buildCommand: npm install && npm run build
    startCommand: npm run start
    buildFilter:
      paths:
        - web/**
```

Validate the final YAML is syntactically correct. Add comments explaining each decision.

---

## PHASE 2 — FIX CODE EXECUTION (JDoodle 429 Daily Limit)

The playground is hitting JDoodle's daily API limit (error 429). Fix this with a **multi-provider execution strategy**:

**Implementation:**

1. **Primary: Piston API** (free, self-hostable, no rate limits)
   - Endpoint: `https://emkc.org/api/v2/piston/execute`
   - Supports: Python, JavaScript, C++, Java, C, TypeScript
   - No API key needed
   - Request format:
     ```json
     {
       "language": "python",
       "version": "*",
       "files": [{ "content": "print('hello')" }],
       "stdin": "user input here"
     }
     ```

2. **Fallback: JDoodle** (keep as backup, respect limits)
   - Add a daily usage counter stored in DB/memory
   - Switch to fallback automatically when limit approached
   - Show user a soft warning at 80% daily limit

3. **Fallback 2: Judge0** (for when both above fail)
   - Free tier available at `https://api.judge0.com`

**Create an `ExecutionRouter` class/module:**
```
ExecutionRouter
  ├── try Piston (primary)
  ├── if fail → try JDoodle (with daily counter check)
  ├── if fail → try Judge0 (last resort)
  └── if all fail → return meaningful error with retry options
```

Add execution time limits (max 10s), memory limits, and output size limits (max 50KB) for security.

---

## PHASE 3 — AUTH INTEGRATION (Main Site Login Gate)

Users must be logged into `codescriet.dev` to use the playground at `code.codescriet.dev`.

**Architecture:**

Since both are on subdomains of `codescriet.dev`, use **shared cookie-based auth**:

1. **Main site** sets an auth cookie with `domain=.codescriet.dev` (note the dot — makes it available to all subdomains):
   ```
   Set-Cookie: scriet_session=<jwt_token>; Domain=.codescriet.dev; HttpOnly; Secure; SameSite=Lax
   ```

2. **Playground backend** (`execute-server.ts/js`) reads this cookie on every request:
   ```typescript
   // Middleware: verifyAuth
   const token = req.cookies['scriet_session'];
   if (!token) return res.status(401).json({ error: 'Login required', redirect: 'https://codescriet.dev/login?next=https://code.codescriet.dev' });
   
   // Verify JWT
   const user = jwt.verify(token, process.env.JWT_SECRET);
   req.user = user;
   ```

3. **Playground frontend** — on load, check auth status via `/api/auth/me`:
   - If not authenticated → show a full-screen gate (not a redirect, an elegant overlay):
     ```
     ┌─────────────────────────────────────┐
     │  🔐  Code.Scriet Playground         │
     │                                     │
     │  Sign in to start coding            │
     │                                     │
     │  [→ Login to Code.Scriet]           │
     │  [  Create free account  ]          │
     └─────────────────────────────────────┘
     ```
   - If authenticated → load playground normally, show user avatar/name in navbar

4. **Add user context to execution** — tag each execution with `userId` for rate limiting per user (e.g., 100 runs/day per free user):
   ```typescript
   // Per-user rate limiting
   const userKey = `exec:${req.user.id}:${today}`;
   const count = await db.increment(userKey);
   if (count > 100) return res.status(429).json({ error: 'Daily execution limit reached. Upgrade for more.' });
   ```

**Database schema additions (add to existing DB):**
```sql
-- Track executions per user
CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  language TEXT NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW(),
  duration_ms INTEGER,
  status TEXT -- 'success' | 'error' | 'timeout'
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_playground_prefs (
  user_id TEXT PRIMARY KEY,
  theme TEXT DEFAULT 'dark',
  font_size INTEGER DEFAULT 14,
  keybinding TEXT DEFAULT 'default', -- 'vim' | 'emacs' | 'default'
  last_language TEXT DEFAULT 'python'
);
```

---

## PHASE 4 — CORS HARDENING

Update CORS in `execute-server.ts`/`execute-server.js`:

```typescript
import cors from 'cors';

const ALLOWED_ORIGINS = [
  'https://codescriet.dev',
  'https://www.codescriet.dev',
  'https://code.codescriet.dev',
  // Dev only — remove in production
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5174', 'http://localhost:3000'] : [])
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman in dev)
    if (!origin && process.env.NODE_ENV === 'development') return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin} is not allowed`));
  },
  credentials: true,           // ← needed for cookie auth
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400                // Cache preflight for 24h
}));

// Also set security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

---

## PHASE 5 — UI REDESIGN (Match Main Site + Dashboard)

**Design Principles:**
- Read the main `web/` site's CSS/Tailwind config to extract the exact color palette, font, and spacing system
- Apply those exact tokens to the playground
- The playground should feel like a native page of the main site, not a separate product

**Color scheme to extract and apply** (read from `web/` source):
- Primary brand color (likely the green from the "Run Code" button — extract exact hex)
- Background colors (dark navy/black)
- Text colors
- Border colors
- Accent colors

**New Layout — Dashboard-style:**

```
┌──────────────────────────────────────────────────────────────────┐
│  [Code.Scriet Logo]  Playground          [Snippets] [Username ▼] │  ← Navbar (matches main site exactly)
├────────────┬─────────────────────────────┬───────────────────────┤
│            │                             │                       │
│  SIDEBAR   │    EDITOR (Monaco)          │   OUTPUT PANEL        │
│            │                             │                       │
│  Language  │  // Python                  │  ▶ Output             │
│  ─────────  │  print("Hello!")           │  ─────────────────    │
│  🐍 Python  │                             │  Hello!               │
│  ⚡ JS      │                             │                       │
│  ☕ Java    │                             │  ─────────────────    │
│  🔷 C++    │                             │  ⏱ 0.12s  ✓ Success  │
│  ⚙ C       │                             │                       │
│  📘 TS     │                             │  📥 Custom Input      │
│  🌐 HTML   │                             │  ─────────────────    │
│            │                             │  [stdin textarea]     │
│  ─────────  │                             │                       │
│  📁 My     │                             │  ─────────────────    │
│  Snippets  │                             │  📊 My Usage Today    │
│            │                             │  47 / 100 runs        │
│  + New     │                             │  [▓▓▓▓▓▓░░░░] 47%   │
│            │  ─────────────────────────  │                       │
│            │  [▶ Run Code F5]  [Clear]   │                       │
└────────────┴─────────────────────────────┴───────────────────────┘
```

**Key UI components to build/redesign:**

1. **Navbar** — identical to main site, show logged-in user's avatar + name, dropdown with: Profile, My Snippets, Settings, Logout
2. **Language selector sidebar** — pill-style with language icons, show recently used at top
3. **Monaco Editor** — dark theme matching site palette, configure:
   - Font: match main site (likely `JetBrains Mono` or `Fira Code`)
   - Line numbers: on
   - Minimap: off (cleaner)
   - Auto-bracket matching, auto-indent
   - Keyboard shortcut: `Ctrl+Enter` / `Cmd+Enter` to run
4. **Output panel** — tabbed: Output | Errors | Execution History
5. **Usage meter** — show daily run count with progress bar
6. **Snippets panel** — saved code snippets per user, per language, from DB

**Dark mode specifics:**
- Background: match `web/`'s dark background exactly  
- Editor background: slightly lighter than page bg (depth effect)
- Line numbers: muted color
- Active line highlight: subtle
- Selection: brand color at 20% opacity

---

## PHASE 6 — SNIPPETS SYSTEM (New Feature)

Build a full snippets system since there's already a "Snippets" nav link:

```typescript
// API endpoints to add to execute-server
POST   /api/snippets          // save snippet (auth required)
GET    /api/snippets          // list user's snippets (auth required)  
GET    /api/snippets/:id      // get single snippet (auth required, must own)
PUT    /api/snippets/:id      // update snippet (auth required, must own)
DELETE /api/snippets/:id      // delete snippet (auth required, must own)
GET    /api/snippets/shared/:id  // get a publicly shared snippet (no auth)
```

```sql
CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  is_public BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,      -- for shareable links
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

UI:
- Save current code as snippet with a name
- Load any saved snippet into editor
- Share button generates `code.codescriet.dev/s/<share_token>` — viewable without login, but not runnable
- Snippets panel searchable by title/language

---

## PHASE 7 — SECURITY HARDENING

1. **Input sanitization** — strip/escape dangerous patterns before execution:
   ```typescript
   const BLOCKED_PATTERNS = [
     /import\s+os/i,            // Python OS access
     /subprocess/i,             // Python subprocess
     /exec\s*\(/i,              // shell exec
     /system\s*\(/i,            // C system()
     /Runtime\.getRuntime/i,    // Java runtime exec
     /process\.env/i,           // Node env access
     /require\s*\(\s*['"]fs/i,  // Node fs access
   ];
   ```
   → Show a friendly warning: "This code pattern is not allowed for security reasons"

2. **Rate limiting** (express-rate-limit):
   ```typescript
   const execLimiter = rateLimit({
     windowMs: 60 * 1000,       // 1 minute window
     max: 10,                   // 10 executions per minute per IP
     message: 'Too many requests, slow down!',
     keyGenerator: (req) => req.user?.id || req.ip
   });
   app.use('/api/execute', execLimiter);
   ```

3. **Output sanitization** — strip ANSI escape codes from output before sending to frontend

4. **JWT refresh** — if session token is close to expiry, silently refresh it

5. **CSP headers** for the frontend:
   ```
   Content-Security-Policy: default-src 'self' https://codescriet.dev; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; connect-src 'self' https://emkc.org https://api.judge0.com https://codescriet.dev
   ```

---

## PHASE 8 — PERFORMANCE OPTIMIZATION

1. **Frontend bundle size** — run `vite-bundle-analyzer`, identify and fix large imports (Monaco is heavy — use dynamic import)
2. **Monaco lazy loading** — load Monaco only after user interacts:
   ```typescript
   const Editor = lazy(() => import('@monaco-editor/react'));
   ```
3. **Debounce** — debounce any live-syntax-check features (min 500ms)
4. **Execution cancellation** — add an AbortController to cancel in-flight execution requests if user clicks "Stop"
5. **Output streaming** — if using Piston/Judge0, stream output instead of waiting for full response

---

## PHASE 9 — DEPLOYMENT CHECKLIST

After all changes, verify:

- [ ] `render.yaml` passes `render blueprint validate`
- [ ] `rootDir` set correctly for both `playground` and `web` services
- [ ] All env vars documented in `.env.example` (never committed, just the keys)
- [ ] CORS tested: `code.codescriet.dev` ↔ `codescriet.dev` cookie flow works
- [ ] Auth gate tested: unauthenticated users see login screen, not 401 JSON
- [ ] Code execution tested across all 7 languages using Piston (primary)
- [ ] JDoodle fallback triggers correctly on Piston failure
- [ ] Snippets CRUD all working
- [ ] Rate limiting working (try hitting 11 requests/minute)
- [ ] Security patterns blocked (try `import os; os.system('ls')`)
- [ ] Mobile responsive layout

---

## OUTPUT FORMAT

For each phase, provide:
1. **Analysis** — what you found in the existing code
2. **Plan** — exactly what you'll change and why
3. **Implementation** — the actual code changes (full files, not diffs unless minor)
4. **Verification** — how to test this change worked

Start with Phase 0 analysis. Do not skip it. The quality of your implementation depends on understanding the existing code first.

---

## IMPORTANT NOTES

- The database URL will be provided separately — add a placeholder `process.env.DATABASE_URL` wherever DB is needed and document the required schema
- Keep all existing functionality working — this is an additive overhaul, not a rewrite
- The main site's design tokens are in `web/` — always read from there, never invent colors
- Preserve all existing `.md` documentation files, just update them to reflect changes
- The playground's `execute-server.ts` and `execute-server.js` seem to be dual-format — consolidate to TypeScript only
