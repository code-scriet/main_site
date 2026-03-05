import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const app = express();
const PORT = process.env.PORT || process.env.EXECUTE_PORT || 5002;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ---------------------------------------------------------------------------
// CORS — controlled via ALLOWED_ORIGIN env var
// ---------------------------------------------------------------------------

// Always-allowed production origins (hardcoded fallback so the server works
// even if ALLOWED_ORIGIN env var is not set in the Render dashboard).
const HARDCODED_PROD_ORIGINS = [
  'https://code.codescriet.dev',
  'https://codescriet.dev',
  'https://www.codescriet.dev',
];

const PROD_ORIGINS = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

const ALLOWED_ORIGINS = [
  ...new Set([
    ...HARDCODED_PROD_ORIGINS,
    ...PROD_ORIGINS,
    ...(NODE_ENV === 'development' ? DEV_ORIGINS : []),
  ]),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin) or requests from known origins
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked request from: ${origin}`);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '1mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP allows Pyodide WASM from CDN + cloud execution via backend proxy
  const cspParts = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' cdn.jsdelivr.net blob:",
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    `connect-src 'self' cdn.jsdelivr.net ${PROD_ORIGINS.join(' ')}`,
    "img-src 'self' data: blob: https:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "frame-ancestors 'self'",
  ];
  if (NODE_ENV === 'production') {
    res.setHeader('Content-Security-Policy', cspParts.join('; '));
  }
  next();
});

// ---------------------------------------------------------------------------
// JWT Authentication (shared with main site)
// ---------------------------------------------------------------------------
const JWT_SECRET_CANDIDATES = ['JWT_SECRET', 'JWT_SECRET_KEY', 'AUTH_JWT_SECRET', 'AUTH_SECRET'];
const DEV_JWT_SECRET = 'dev_local_jwt_secret_change_me_before_production';

function getJwtSecret() {
  for (const key of JWT_SECRET_CANDIDATES) {
    const val = (process.env[key] || '').trim();
    if (val && !['secret', 'your_super_secret_key_change_this_in_production'].includes(val)) {
      return val;
    }
  }
  if (NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return DEV_JWT_SECRET;
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7);
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.split(';').find(c => c.trim().startsWith('scriet_session='));
    if (match) return decodeURIComponent(match.split('=').slice(1).join('=').trim());
  }
  return null;
}

function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      req.user = { id: decoded.userId || decoded.id, email: decoded.email, role: decoded.role };
    } catch { /* continue as anonymous */ }
  }
  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in at codescriet.dev' });
    }
    next();
  });
}

app.use(optionalAuth);

// ---------------------------------------------------------------------------
// PostgreSQL Connection — shared database with main codescriet.dev site
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
let dbReady = false;

// Determine whether SSL is needed: enable for any non-localhost URL.
// This covers Render, Railway, Neon, Supabase, and any other cloud provider.
function needsSsl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    // Fallback: if URL contains common cloud provider keywords use SSL
    return url.includes('neon') || url.includes('render') || url.includes('supabase')
      || url.includes('railway') || url.includes('planetscale') || url.includes('amazonaws');
  }
}

if (DATABASE_URL) {
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: needsSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  });

  // Verify connection on startup (with retry — DB may take a moment after deploy)
  async function connectWithRetry(attemptsLeft = 5, delayMs = 2000) {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
      console.log('[DB] Connected to PostgreSQL ✓');
      // Ensure limit-reset table exists (safe to run every startup)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS playground_limit_resets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          reset_by TEXT NOT NULL,
          reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          note TEXT
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS plr_user_id_idx ON playground_limit_resets(user_id)
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS playground_daily_usage (
          user_id TEXT NOT NULL,
          usage_date DATE NOT NULL,
          count INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, usage_date)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS pdu_usage_date_idx ON playground_daily_usage(usage_date)
      `);
      console.log('[DB] playground_limit_resets table ready ✓');
    } catch (err) {
      if (attemptsLeft > 1) {
        console.warn(`[DB] Connection attempt failed (${err.message}), retrying in ${delayMs}ms...`);
        setTimeout(() => connectWithRetry(attemptsLeft - 1, delayMs * 1.5), delayMs);
      } else {
        console.error('[DB] All connection attempts failed — running in memory-only mode:', err.message);
        console.error('[DB] DATABASE_URL prefix:', DATABASE_URL.slice(0, 30) + '...');
      }
    }
  }
  connectWithRetry();
} else {
  console.warn('[DB] DATABASE_URL not set — snippets and history will use in-memory storage');
}

/** Fire-and-forget DB query — never blocks, never throws */
function dbExec(sql, params = []) {
  if (!pool) return Promise.resolve(null);
  if (!dbReady) {
    // Pool exists but startup check hasn't passed — attempt anyway (pool may be healthy now)
    return pool.query(sql, params).then(result => {
      dbReady = true; // mark ready if this succeeds
      return result;
    }).catch(err => {
      console.error('[DB] Query error:', err.message);
      return null;
    });
  }
  return pool.query(sql, params).catch(err => {
    console.error('[DB] Query error:', err.message);
    return null;
  });
}

/** Query and return rows — returns [] on failure */
async function dbQuery(sql, params = []) {
  if (!pool) return [];
  try {
    const res = await pool.query(sql, params);
    if (!dbReady) dbReady = true; // mark ready on first successful query
    return res.rows;
  } catch (err) {
    console.error('[DB] Query error:', err.message);
    return [];
  }
}

// Max 20 execution history entries with code per user
const MAX_HISTORY_PER_USER = 20;

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------
const MAX_EXECUTIONS_PER_DAY = 200;
const userExecCounts = new Map(); // in-memory fallback cache
const MAX_IP_EXECUTIONS = 30;
const ipExecCounts = new Map();
const NON_METERED_LANGUAGES = new Set(['javascript', 'typescript', 'python', 'web']);

function shouldMeterLanguage(language) {
  return !NON_METERED_LANGUAGES.has(String(language || '').toLowerCase());
}

const USER_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes idle TTL

const userSessions = new Map();

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function toHistoryItem(row) {
  return {
    id: row.id,
    language: row.language,
    code: row.code || '',
    output: row.output_text || '',
    durationMs: row.duration_ms || 0,
    status: row.status || 'SUCCESS',
    executedAt: row.executed_at instanceof Date ? row.executed_at.toISOString() : String(row.executed_at),
  };
}

async function loadUserSession(userId) {
  const dateKey = todayDateKey();

  // Read once on session start
  const usageRows = await dbQuery(
    `SELECT count::int as count FROM playground_daily_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE LIMIT 1`,
    [userId]
  );
  const todayCount = usageRows[0]?.count || 0;

  const historyRows = await dbQuery(
    `SELECT id, language, code, output_text, duration_ms, status, executed_at
     FROM executions
     WHERE user_id = $1 AND code IS NOT NULL
     ORDER BY executed_at DESC LIMIT $2`,
    [userId, MAX_HISTORY_PER_USER]
  );

  const session = {
    userId,
    dateKey,
    todayCount,
    history: historyRows.map(toHistoryItem),
    dirtyUsage: false,
    dirtyHistory: false,
    lastTouchedAt: Date.now(),
  };

  userSessions.set(userId, session);
  return session;
}

async function getUserSession(userId) {
  const dateKey = todayDateKey();
  const existing = userSessions.get(userId);
  if (!existing) return loadUserSession(userId);

  existing.lastTouchedAt = Date.now();
  if (existing.dateKey !== dateKey) {
    await flushUserSession(userId, 'day-rollover');
    return loadUserSession(userId);
  }

  return existing;
}

async function flushUserSession(userId, reason = 'manual') {
  const session = userSessions.get(userId);
  if (!session || !pool) return;
  if (!session.dirtyUsage && !session.dirtyHistory) return;

  try {
    await pool.query('BEGIN');

    if (session.dirtyUsage) {
      await pool.query(
        `INSERT INTO playground_daily_usage (user_id, usage_date, count, updated_at)
         VALUES ($1, CURRENT_DATE, $2, NOW())
         ON CONFLICT (user_id, usage_date)
         DO UPDATE SET count = EXCLUDED.count, updated_at = NOW()`,
        [userId, session.todayCount]
      );
    }

    if (session.dirtyHistory) {
      await pool.query(`DELETE FROM executions WHERE user_id = $1 AND code IS NOT NULL`, [userId]);

      for (const item of session.history.slice(0, MAX_HISTORY_PER_USER)) {
        await pool.query(
          `INSERT INTO executions (id, user_id, language, code, output_text, duration_ms, status, executed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::"ExecutionStatus", $8)`,
          [
            item.id || crypto.randomUUID(),
            userId,
            item.language,
            (item.code || '').slice(0, 5000),
            (item.output || '').slice(0, 5000),
            item.durationMs || 0,
            item.status || 'SUCCESS',
            item.executedAt || new Date().toISOString(),
          ]
        );
      }
    }

    await pool.query('COMMIT');
    session.dirtyUsage = false;
    session.dirtyHistory = false;
    console.log(`[SessionFlush] user=${userId} reason=${reason} usage=${session.todayCount} history=${session.history.length}`);
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[SessionFlush] Failed:', err.message);
  }
}

async function flushAllDirtySessions(reason = 'periodic') {
  const now = Date.now();
  for (const [userId, session] of userSessions.entries()) {
    if (now - session.lastTouchedAt > USER_SESSION_TTL_MS) {
      await flushUserSession(userId, `${reason}-idle-ttl`);
      userSessions.delete(userId);
      continue;
    }
    if (session.dirtyUsage || session.dirtyHistory) {
      await flushUserSession(userId, reason);
    }
  }
}

setInterval(() => {
  flushAllDirtySessions('periodic').catch((err) => {
    console.error('[SessionFlush] Periodic flush error:', err.message);
  });
}, 60_000);

async function gracefulFlushAndExit(signal) {
  try {
    console.log(`[SessionFlush] Received ${signal}, flushing sessions...`);
    await flushAllDirtySessions(`shutdown-${signal}`);
  } catch (err) {
    console.error('[SessionFlush] Shutdown flush failed:', err.message);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => {
  gracefulFlushAndExit('SIGTERM');
});

process.on('SIGINT', () => {
  gracefulFlushAndExit('SIGINT');
});

/**
 * Optimized DB-backed rate limit check.
 * Uses a compact per-user/day counter table instead of scanning executions.
 * This makes checks O(1) and drastically reduces database load.
 */
async function checkUserRateLimit(userId) {
  if (pool) {
    try {
      const session = await getUserSession(userId);
      const allowed = session.todayCount < MAX_EXECUTIONS_PER_DAY;
      return { allowed, remaining: Math.max(0, MAX_EXECUTIONS_PER_DAY - session.todayCount) };
    } catch (err) {
      console.error('[RateLimit] Session check failed, falling back to in-memory:', err.message);
    }
  }

  // In-memory fallback
  const today = new Date().toISOString().slice(0, 10);
  const entry = userExecCounts.get(userId);
  if (!entry || entry.date !== today) {
    userExecCounts.set(userId, { date: today, count: 1 });
    return { allowed: true, remaining: MAX_EXECUTIONS_PER_DAY - 1 };
  }
  entry.count++;
  return { allowed: entry.count <= MAX_EXECUTIONS_PER_DAY, remaining: Math.max(0, MAX_EXECUTIONS_PER_DAY - entry.count) };
}

function checkIpRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = ipExecCounts.get(ip);
  if (!entry || entry.date !== today) {
    ipExecCounts.set(ip, { date: today, count: 1 });
    return { allowed: true, remaining: MAX_IP_EXECUTIONS - 1 };
  }
  entry.count++;
  return { allowed: entry.count <= MAX_IP_EXECUTIONS, remaining: Math.max(0, MAX_IP_EXECUTIONS - entry.count) };
}

// ---------------------------------------------------------------------------
// Security — blocked code patterns
// ---------------------------------------------------------------------------
const BLOCKED_PATTERNS = [
  /import\s+os\b/i,
  /from\s+os\s+import/i,
  /subprocess\.(run|call|Popen|check_output)/i,
  /\bsystem\s*\(/i,
  /Runtime\.getRuntime\s*\(\s*\)/i,
  /ProcessBuilder/i,
  /process\.env/i,
  /require\s*\(\s*['"]child_process/i,
  /require\s*\(\s*['"]fs['"]/i,
  /require\s*\(\s*['"]net['"]/i,
  /require\s*\(\s*['"]http['"]/i,
  /import\s+.*child_process/i,
  /__import__\s*\(\s*['"]os['"]/i,
  /open\s*\(\s*['"]\/etc/i,
  /open\s*\(\s*['"]\/proc/i,
];

function checkSecurityPatterns(code) {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) return { safe: false, pattern: pattern.toString() };
  }
  return { safe: true };
}

// ---------------------------------------------------------------------------
// Cloud Execution via Cloudflare Worker Proxy
// ---------------------------------------------------------------------------
//
// All server-side code execution is routed through a Cloudflare Worker:
//   POST ${EXECUTOR_URL}
//   { compiler, code, stdin, options }
//
// The worker forwards to the upstream compiler service using Cloudflare's
// rotating IP pool. The frontend never sees any third-party URLs.
//
// Compiler ID mapping:
//   JavaScript  → nodejs-20.17.0
//   Python      → cpython-3.12.7
//   C++         → gcc-13.2.0
//   C           → gcc-13.2.0-c
//   Java        → openjdk-jdk-22+36
//   TypeScript  → typescript-5.6.2
// ---------------------------------------------------------------------------

const EXECUTOR_URL = process.env.EXECUTOR_URL || 'https://codescriet-executor.developer-aary.workers.dev/execute';
const EXECUTION_TIMEOUT = 15_000; // 15 seconds
const MAX_OUTPUT_SIZE = 50_000; // 50 KB

// Language → compiler mapping
const COMPILERS = {
  javascript: { compiler: 'nodejs-20.17.0',      version: 'Node.js 20.17',  options: '' },
  python:     { compiler: 'cpython-3.12.7',       version: 'Python 3.12',    options: '' },
  cpp:        { compiler: 'gcc-13.2.0',            version: 'GCC 13.2',      options: 'warning,c++17' },
  c:          { compiler: 'gcc-13.2.0-c',          version: 'GCC 13.2',      options: 'warning' },
  java:       { compiler: 'openjdk-jdk-22+36',     version: 'JDK 22',        options: '' },
  typescript: { compiler: 'typescript-5.6.2',      version: 'TypeScript 5.6', options: '' },
};

const SUPPORTED_LANGUAGES = Object.keys(COMPILERS);

function trimOutput(text) {
  if (!text) return '';
  if (text.length > MAX_OUTPUT_SIZE) return text.slice(0, MAX_OUTPUT_SIZE) + '\n\n[output truncated]';
  return text;
}

function stripAnsi(text) {
  if (!text) return '';
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function clean(text) {
  return trimOutput(stripAnsi(text || ''));
}

// Sanitize error messages — never expose upstream provider details to users
function sanitizeError(message) {
  if (!message) return '';
  return message
    .replace(/wandbox/gi, 'execution service')
    .replace(/wandbox\.org/gi, 'execution service')
    .replace(/https?:\/\/wandbox\.org[^\s]*/gi, '[upstream]')
    .replace(/compile\.json/gi, 'compiler endpoint')
    .replace(/prog\.(java|c|cpp|py|js|ts)/g, (_, ext) => `source.${ext}`);
}

async function executeCode(language, code, stdin) {
  const config = COMPILERS[language];
  if (!config) throw new Error(`Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT);

  try {
    const body = {
      compiler: config.compiler,
      code,
      stdin: stdin || '',
    };

    // Add compiler options if specified
    if (config.options) {
      body.options = config.options;
    }

    console.log(`[Execute] Running ${language} via ${config.compiler}...`);

    const response = await fetch(EXECUTOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Execution service HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const result = await response.json();

    // Check if the worker returned an error envelope
    if (result.error) {
      throw new Error(sanitizeError(result.error));
    }

    // Parse Wandbox response fields:
    //   program_output  = stdout from the program
    //   program_error   = stderr from the program (may contain warnings, not always errors)
    //   compiler_error  = compiler stderr (warnings + errors)
    //   compiler_output = compiler stdout
    //   status          = exit code as string ("0" = success)
    //   signal          = signal name if killed (e.g. "SIGKILL")
    const exitCode = parseInt(result.status, 10) || 0;
    const stdout = clean(result.program_output);
    const stderr = clean(result.program_error);
    const compilerErr = clean(result.compiler_error);
    const compilerOut = clean(result.compiler_output);
    const signal = result.signal || null;

    // Determine if this is truly an error:
    // - If we have stdout (program_output), the program ran successfully.
    //   stderr may contain warnings which are informational, not errors.
    // - compiler_error for C/C++/Java may contain warnings even on success.
    //   It's only a real compile error if there's NO program_output.
    // - A non-zero exit code WITH output is a runtime error but we still show output.
    const hasOutput = !!stdout;
    const isCompileError = !!compilerErr && !hasOutput;
    const isRuntimeError = exitCode !== 0 && !hasOutput;
    const isSignalKill = !!signal && !hasOutput;

    // Only sanitize actual error messages, not warnings
    const runStderr = isRuntimeError || isSignalKill
      ? sanitizeError(stderr) || sanitizeError(compilerErr)
      : (stderr ? sanitizeError(stderr) : '');

    return {
      language,
      version: config.version,
      provider: 'codescriet',
      run: {
        stdout,
        stderr: isCompileError ? '' : runStderr,
        code: exitCode,
        signal,
        output: stdout || stderr,
      },
      compile: (compilerErr || compilerOut) ? {
        stdout: compilerOut,
        stderr: isCompileError ? sanitizeError(compilerErr) : '',
        code: isCompileError ? 1 : 0,
        signal: null,
        output: isCompileError ? sanitizeError(compilerErr) : sanitizeError(compilerOut),
      } : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Routes — Execution
// ---------------------------------------------------------------------------

app.post('/api/execute', async (req, res) => {
  try {
    const { language, code, stdin = '' } = req.body;

    if (!language || !code) {
      return res.status(400).json({ success: false, error: 'Language and code are required' });
    }

    if (!COMPILERS[language]) {
      return res.status(400).json({
        success: false,
        error: `Language '${language}' not supported for cloud execution. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      });
    }

    // Security check
    const security = checkSecurityPatterns(code);
    if (!security.safe) {
      return res.status(400).json({
        success: false,
        error: 'This code contains patterns that are not allowed for security reasons.',
      });
    }

    let userSession = null;

    const meterThisRun = shouldMeterLanguage(language);

    // Rate limiting
    if (req.user) {
      if (meterThisRun) {
        const limit = await checkUserRateLimit(req.user.id);
        res.setHeader('X-RateLimit-Remaining', limit.remaining);
        if (!limit.allowed) {
          return res.status(429).json({
            success: false,
            error: `Daily execution limit (${MAX_EXECUTIONS_PER_DAY}) reached. Try again tomorrow.`,
          });
        }
      } else {
        res.setHeader('X-RateLimit-Remaining', MAX_EXECUTIONS_PER_DAY);
      }

      if (pool && meterThisRun) {
        userSession = await getUserSession(req.user.id);
        userSession.todayCount += 1;
        userSession.dirtyUsage = true;
        userSession.lastTouchedAt = Date.now();
      }
    } else {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const limit = checkIpRateLimit(ip);
      res.setHeader('X-RateLimit-Remaining', limit.remaining);
      if (!limit.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Sign in for higher limits.',
        });
      }
    }

    const startMs = Date.now();
    const result = await executeCode(language, code, stdin);
    const durationMs = Date.now() - startMs;

    // Session-first persistence: keep history in memory and flush on session end.
    if (req.user) {
      const status = result.run.code === 0 ? 'SUCCESS' : 'ERROR';
      const output = result.run.stdout || result.run.stderr || '';

      if (pool) {
        const session = userSession || await getUserSession(req.user.id);
        session.history.unshift({
          id: crypto.randomUUID(),
          language,
          code: code.slice(0, 5000),
          output: output.slice(0, 5000),
          durationMs,
          status,
          executedAt: new Date().toISOString(),
        });
        session.history = session.history.slice(0, MAX_HISTORY_PER_USER);
        session.dirtyHistory = true;
        session.lastTouchedAt = Date.now();
      }
    }

    return res.json({
      success: true,
      data: result,
      meta: { durationMs, userId: req.user?.id || null, provider: 'codescriet' },
    });
  } catch (error) {
    console.error('[Execute] Execution error:', error);
    const message = error instanceof Error ? error.message : 'Code execution failed';
    if (message.includes('abort')) {
      return res.status(408).json({ success: false, error: 'Execution timed out (15s limit).' });
    }
    return res.status(500).json({ success: false, error: sanitizeError(message) || 'Code execution failed' });
  }
});

// Auth check endpoint
app.get('/api/auth/status', (req, res) => {
  if (req.user) return res.json({ authenticated: true, user: req.user });
  return res.json({ authenticated: false });
});

// ---------------------------------------------------------------------------
// DB-backed Snippets
// ---------------------------------------------------------------------------

function generateShareToken() {
  return crypto.randomBytes(8).toString('base64url');
}

app.post('/api/snippets', requireAuth, async (req, res) => {
  const { title, language, code, isPublic = false } = req.body;
  if (!title || !language || !code) {
    return res.status(400).json({ success: false, error: 'title, language, and code are required' });
  }
  const shareToken = isPublic ? generateShareToken() : null;
  const rows = await dbQuery(
    `INSERT INTO snippets (id, user_id, title, language, code, is_public, share_token, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING *`,
    [req.user.id, title.slice(0, 100), language, code, Boolean(isPublic), shareToken]
  );
  if (!rows.length) {
    // Fallback: return a fake response if DB is down
    return res.status(201).json({ success: true, data: {
      id: crypto.randomUUID(), userId: req.user.id, userName: req.user.email,
      title: title.slice(0, 100), language, code,
      isPublic: Boolean(isPublic), shareToken,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } });
  }
  return res.status(201).json({ success: true, data: mapSnippetRow(rows[0]) });
});

app.get('/api/snippets', requireAuth, async (req, res) => {
  const rows = await dbQuery(
    `SELECT * FROM snippets WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
    [req.user.id]
  );
  return res.json({ success: true, data: rows.map(mapSnippetRow) });
});

app.get('/api/snippets/shared/:token', async (req, res) => {
  const rows = await dbQuery(
    `SELECT * FROM snippets WHERE share_token = $1 AND is_public = true LIMIT 1`,
    [req.params.token]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: 'Snippet not found' });
  return res.json({ success: true, data: mapSnippetRow(rows[0]) });
});

app.get('/api/snippets/:id', requireAuth, async (req, res) => {
  const rows = await dbQuery(`SELECT * FROM snippets WHERE id = $1 LIMIT 1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (rows[0].user_id !== req.user.id) return res.status(403).json({ success: false, error: 'Not your snippet' });
  return res.json({ success: true, data: mapSnippetRow(rows[0]) });
});

app.put('/api/snippets/:id', requireAuth, async (req, res) => {
  const rows = await dbQuery(`SELECT * FROM snippets WHERE id = $1 LIMIT 1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (rows[0].user_id !== req.user.id) return res.status(403).json({ success: false, error: 'Not your snippet' });

  const { title, language, code, isPublic } = req.body;
  const s = rows[0];
  const newTitle = title !== undefined ? title.slice(0, 100) : s.title;
  const newLang = language !== undefined ? language : s.language;
  const newCode = code !== undefined ? code : s.code;
  let newPublic = s.is_public;
  let newToken = s.share_token;
  if (isPublic !== undefined) {
    newPublic = Boolean(isPublic);
    if (newPublic && !newToken) newToken = generateShareToken();
    if (!newPublic) newToken = null;
  }

  const updated = await dbQuery(
    `UPDATE snippets SET title=$1, language=$2, code=$3, is_public=$4, share_token=$5, updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [newTitle, newLang, newCode, newPublic, newToken, req.params.id]
  );
  return res.json({ success: true, data: mapSnippetRow(updated[0] || rows[0]) });
});

app.delete('/api/snippets/:id', requireAuth, async (req, res) => {
  const rows = await dbQuery(`SELECT user_id FROM snippets WHERE id = $1 LIMIT 1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (rows[0].user_id !== req.user.id) return res.status(403).json({ success: false, error: 'Not your snippet' });
  await dbExec(`DELETE FROM snippets WHERE id = $1`, [req.params.id]);
  return res.json({ success: true, message: 'Snippet deleted' });
});

/** Map DB row to API response shape */
function mapSnippetRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    language: row.language,
    code: row.code,
    isPublic: row.is_public,
    shareToken: row.share_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Execution History — last 20 per user (with code), all-time stats (no code)
// ---------------------------------------------------------------------------

app.get('/api/executions/history', requireAuth, async (req, res) => {
  if (pool) {
    const session = await getUserSession(req.user.id);
    return res.json({ success: true, data: session.history });
  }

  const rows = await dbQuery(
    `SELECT id, language, code, output_text, duration_ms, status, executed_at
     FROM executions
     WHERE user_id = $1 AND code IS NOT NULL
     ORDER BY executed_at DESC LIMIT $2`,
    [req.user.id, MAX_HISTORY_PER_USER]
  );
  return res.json({ success: true, data: rows.map(r => ({
    id: r.id,
    language: r.language,
    code: r.code,
    output: r.output_text,
    durationMs: r.duration_ms,
    status: r.status,
    executedAt: r.executed_at,
  })) });
});

app.get('/api/executions/stats', requireAuth, async (req, res) => {
  if (pool) {
    const session = await getUserSession(req.user.id);
    const languageStatsMap = new Map();
    for (const item of session.history) {
      languageStatsMap.set(item.language, (languageStatsMap.get(item.language) || 0) + 1);
    }
    const languageStats = [...languageStatsMap.entries()]
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count);

    return res.json({
      success: true,
      data: {
        languageStats,
        todayCount: session.todayCount,
        dailyLimit: MAX_EXECUTIONS_PER_DAY,
      },
    });
  }

  const rows = await dbQuery(
    `SELECT language, COUNT(*)::int as count FROM executions WHERE user_id = $1 GROUP BY language ORDER BY count DESC`,
    [req.user.id]
  );
  // Optimized today count from compact daily usage table
  const today = await dbQuery(
    `SELECT count::int as count
     FROM playground_daily_usage
     WHERE user_id = $1 AND usage_date = CURRENT_DATE
     LIMIT 1`,
    [req.user.id]
  );
  return res.json({
    success: true,
    data: {
      languageStats: rows,
      todayCount: today[0]?.count || 0,
      dailyLimit: MAX_EXECUTIONS_PER_DAY,
    },
  });
});

// Session bootstrap: one DB read on session start for both limit + history
app.get('/api/session/bootstrap', requireAuth, async (req, res) => {
  const session = await getUserSession(req.user.id);

  const languageStatsMap = new Map();
  for (const item of session.history) {
    languageStatsMap.set(item.language, (languageStatsMap.get(item.language) || 0) + 1);
  }

  const languageStats = [...languageStatsMap.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);

  return res.json({
    success: true,
    data: {
      history: session.history,
      stats: {
        languageStats,
        todayCount: session.todayCount,
        dailyLimit: MAX_EXECUTIONS_PER_DAY,
      },
    },
  });
});

// Preflight: check current session limit before execution starts
app.get('/api/session/preflight', requireAuth, async (req, res) => {
  const session = await getUserSession(req.user.id);
  const language = String(req.query.language || '').toLowerCase();
  const metered = shouldMeterLanguage(language);
  const allowed = metered ? session.todayCount < MAX_EXECUTIONS_PER_DAY : true;
  const remaining = metered
    ? Math.max(0, MAX_EXECUTIONS_PER_DAY - session.todayCount)
    : MAX_EXECUTIONS_PER_DAY;

  return res.json({
    success: true,
    data: {
      allowed,
      metered,
      todayCount: session.todayCount,
      dailyLimit: MAX_EXECUTIONS_PER_DAY,
      remaining,
    },
  });
});

// Record client-side execution into in-memory session cache
app.post('/api/session/record', requireAuth, async (req, res) => {
  const { language, code = '', output = '', durationMs = 0, status = 'SUCCESS', executedAt } = req.body || {};
  if (!language) {
    return res.status(400).json({ success: false, error: 'language is required' });
  }

  const session = await getUserSession(req.user.id);
  const meterThisRun = shouldMeterLanguage(language);

  if (meterThisRun && session.todayCount >= MAX_EXECUTIONS_PER_DAY) {
    return res.status(429).json({
      success: false,
      error: `Daily execution limit (${MAX_EXECUTIONS_PER_DAY}) reached. Try again tomorrow.`,
      data: {
        todayCount: session.todayCount,
        dailyLimit: MAX_EXECUTIONS_PER_DAY,
        remaining: 0,
      },
    });
  }

  if (meterThisRun) {
    session.todayCount += 1;
    session.dirtyUsage = true;
  }
  session.history.unshift({
    id: crypto.randomUUID(),
    language,
    code: String(code).slice(0, 5000),
    output: String(output).slice(0, 5000),
    durationMs: Math.max(0, Number(durationMs) || 0),
    status: status === 'ERROR' ? 'ERROR' : 'SUCCESS',
    executedAt: executedAt || new Date().toISOString(),
  });
  session.history = session.history.slice(0, MAX_HISTORY_PER_USER);
  session.dirtyHistory = true;
  session.lastTouchedAt = Date.now();

  return res.json({
    success: true,
    data: {
      metered: meterThisRun,
      todayCount: session.todayCount,
      dailyLimit: MAX_EXECUTIONS_PER_DAY,
      remaining: Math.max(0, MAX_EXECUTIONS_PER_DAY - session.todayCount),
    },
  });
});

// Session end: flush in-memory usage/history to DB once
app.post('/api/session/end', requireAuth, async (req, res) => {
  await flushUserSession(req.user.id, 'session-end');
  return res.json({ success: true, message: 'Session flushed' });
});

// ---------------------------------------------------------------------------
// Admin — Execution Limit Management (ADMIN / CORE_MEMBER only)
// ---------------------------------------------------------------------------

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!['ADMIN', 'CORE_MEMBER'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

/** Reset a specific user's daily execution limit */
app.post('/api/admin/reset-limit/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { note = '' } = req.body;

  // Insert a reset record — the rate limit query will now count from this moment
  const result = await dbExec(
    `INSERT INTO playground_limit_resets (user_id, reset_by, note) VALUES ($1, $2, $3)`,
    [userId, req.user.id, note.slice(0, 200)]
  );

  if (!result) {
    return res.status(500).json({ success: false, error: 'Failed to reset limit (DB unavailable)' });
  }

  // Reset today's usage counter to 0 (cheap O(1) operation)
  await dbExec(
    `INSERT INTO playground_daily_usage (user_id, usage_date, count, updated_at)
     VALUES ($1, CURRENT_DATE, 0, NOW())
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET count = 0, updated_at = NOW()`,
    [userId]
  );

  // Also clear in-memory cache so next check re-queries DB
  userExecCounts.delete(userId);
  const activeSession = userSessions.get(userId);
  if (activeSession) {
    activeSession.todayCount = 0;
    activeSession.dirtyUsage = true;
    activeSession.lastTouchedAt = Date.now();
  }

  console.log(`[Admin] ${req.user.email} reset daily limit for user ${userId}`);
  return res.json({
    success: true,
    message: `Daily limit reset for user ${userId}`,
    resetAt: new Date().toISOString(),
  });
});

/** Get today's execution counts for all users (admin dashboard) */
app.get('/api/admin/execution-counts', requireAuth, requireAdmin, async (req, res) => {
  const rows = await dbQuery(
    `SELECT
       p.user_id,
       p.count::int AS today_count,
       MAX(e.executed_at) AS last_run_at
     FROM playground_daily_usage p
     LEFT JOIN executions e ON e.user_id = p.user_id AND e.executed_at >= CURRENT_DATE
     WHERE p.usage_date = CURRENT_DATE
     GROUP BY p.user_id, p.count
     ORDER BY today_count DESC
     LIMIT 100`
  );

  const resets = await dbQuery(
    `SELECT user_id, MAX(reset_at) AS last_reset_at
     FROM playground_limit_resets
     WHERE reset_at >= CURRENT_DATE
     GROUP BY user_id`
  );

  const resetMap = Object.fromEntries(resets.map(r => [r.user_id, r.last_reset_at]));

  return res.json({
    success: true,
    data: rows.map(r => ({
      userId: r.user_id,
      todayCount: r.today_count,
      dailyLimit: MAX_EXECUTIONS_PER_DAY,
      lastRunAt: r.last_run_at,
      lastResetAt: resetMap[r.user_id] || null,
    })),
  });
});

// ---------------------------------------------------------------------------
// User Preferences (DB-backed with in-memory fallback)
// ---------------------------------------------------------------------------
const userPrefsMemory = new Map();

app.get('/api/prefs', requireAuth, async (req, res) => {
  const defaultPrefs = { theme: 'vs-dark', fontSize: 14, keybinding: 'default', lastLanguage: 'python' };
  // Try DB first
  const rows = await dbQuery(
    `SELECT * FROM user_playground_prefs WHERE user_id = $1 LIMIT 1`,
    [req.user.id]
  );
  if (rows.length) {
    return res.json({ success: true, data: {
      theme: rows[0].theme,
      fontSize: rows[0].fontSize || rows[0].fontsize,
      keybinding: rows[0].keybinding,
      lastLanguage: rows[0].last_language,
    } });
  }
  // Fallback to memory
  const prefs = userPrefsMemory.get(req.user.id) || defaultPrefs;
  return res.json({ success: true, data: prefs });
});

app.put('/api/prefs', requireAuth, async (req, res) => {
  const { theme, fontSize, keybinding, lastLanguage } = req.body;
  const defaultPrefs = { theme: 'vs-dark', fontSize: 14, keybinding: 'default', lastLanguage: 'python' };
  const existing = userPrefsMemory.get(req.user.id) || defaultPrefs;

  if (theme !== undefined) existing.theme = theme;
  if (fontSize !== undefined) existing.fontSize = Math.min(Math.max(Number(fontSize), 10), 24);
  if (keybinding !== undefined) existing.keybinding = keybinding;
  if (lastLanguage !== undefined) existing.lastLanguage = lastLanguage;
  userPrefsMemory.set(req.user.id, existing);

  // Persist to DB (upsert)
  dbExec(
    `INSERT INTO user_playground_prefs (user_id, theme, "fontSize", keybinding, last_language)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET theme=$2, "fontSize"=$3, keybinding=$4, last_language=$5`,
    [req.user.id, existing.theme, existing.fontSize, existing.keybinding, existing.lastLanguage]
  );

  return res.json({ success: true, data: existing });
});

// ---------------------------------------------------------------------------
// Health & Info
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'code-execution',
    version: '5.0.0',
    provider: 'codescriet',
    executorUrl: EXECUTOR_URL,
    supportedLanguages: SUPPORTED_LANGUAGES,
    dbConnected: dbReady,
    activeSessions: userSessions.size,
  });
});

app.get('/', (_req, res) => {
  res.json({
    service: 'Code Execution API',
    version: '5.0.0',
    provider: 'codescriet',
    architecture: 'Tier 1 (client-side) → Tier 2 (Cloudflare Worker proxy)',
    storage: dbReady ? 'PostgreSQL' : 'in-memory',
    endpoints: {
      execute: 'POST /api/execute  — Tier 2 cloud execution',
      snippets: 'CRUD /api/snippets',
      history: 'GET /api/executions/history',
      stats: 'GET /api/executions/stats',
      prefs: 'GET|PUT /api/prefs',
      authStatus: 'GET /api/auth/status',
      health: 'GET /health',
    },
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log('');
  console.log('Code Execution Server v5.0 — DB-backed + Cloudflare Worker Proxy');
  console.log(`Listening:    http://localhost:${PORT}`);
  console.log(`Executor:     ${EXECUTOR_URL}`);
  console.log(`Database:     ${DATABASE_URL ? 'PostgreSQL' : 'in-memory (no DATABASE_URL)'}`);
  console.log(`Languages:    ${SUPPORTED_LANGUAGES.join(', ')}`);
  console.log(`Timeout:      ${EXECUTION_TIMEOUT / 1000}s`);
});
