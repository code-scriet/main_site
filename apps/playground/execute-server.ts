import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || process.env.EXECUTE_PORT || 5002;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ---------------------------------------------------------------------------
// CORS — controlled via ALLOWED_ORIGIN env var
// ---------------------------------------------------------------------------
const PROD_ORIGINS = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : [];

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

const ALLOWED_ORIGINS = [
  ...PROD_ORIGINS,
  ...(NODE_ENV === 'development' ? DEV_ORIGINS : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin && NODE_ENV === 'development') return callback(null, true);
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '1mb' }));

// Security headers (incl. CSP)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const cspParts = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    `connect-src 'self' https://emkc.org https://judge0-ce.p.rapidapi.com ${PROD_ORIGINS.join(' ')}`,
    "img-src 'self' data: blob: https:",
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
import jwt from 'jsonwebtoken';

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

/** Parse session token from cookie or Authorization header */
function extractToken(req) {
  // Bearer header
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7);
  // Cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.split(';').find(c => c.trim().startsWith('scriet_session='));
    if (match) return decodeURIComponent(match.split('=').slice(1).join('=').trim());
  }
  return null;
}

/** Optional auth — sets req.user if valid token present, otherwise continues */
function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      req.user = { id: decoded.userId || decoded.id, email: decoded.email, role: decoded.role };
    } catch { /* token invalid — continue as anonymous */ }
  }
  next();
}

/** Required auth — rejects if no valid token */
function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in at codescriet.dev' });
    }
    next();
  });
}

// Apply optional auth globally so user info is available where needed
app.use(optionalAuth);

// ---------------------------------------------------------------------------
// Per-user rate limiting (in-memory, resets daily)
// ---------------------------------------------------------------------------
const MAX_EXECUTIONS_PER_DAY = 200;
const userExecCounts = new Map(); // userId -> { date: string, count: number }

function checkUserRateLimit(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = userExecCounts.get(userId);
  if (!entry || entry.date !== today) {
    userExecCounts.set(userId, { date: today, count: 1 });
    return { allowed: true, remaining: MAX_EXECUTIONS_PER_DAY - 1 };
  }
  entry.count++;
  const remaining = Math.max(0, MAX_EXECUTIONS_PER_DAY - entry.count);
  return { allowed: entry.count <= MAX_EXECUTIONS_PER_DAY, remaining };
}

// ---------------------------------------------------------------------------
// IP-based rate limiting (fallback for non-authenticated requests in dev)
// ---------------------------------------------------------------------------
const ipExecCounts = new Map(); // ip -> { date: string, count: number }
const MAX_IP_EXECUTIONS = 30;   // much stricter for anonymous

function checkIpRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = ipExecCounts.get(ip);
  if (!entry || entry.date !== today) {
    ipExecCounts.set(ip, { date: today, count: 1 });
    return { allowed: true, remaining: MAX_IP_EXECUTIONS - 1 };
  }
  entry.count++;
  const remaining = Math.max(0, MAX_IP_EXECUTIONS - entry.count);
  return { allowed: entry.count <= MAX_IP_EXECUTIONS, remaining };
}

// ---------------------------------------------------------------------------
// Security — blocked code patterns
// ---------------------------------------------------------------------------
const BLOCKED_PATTERNS = [
  /import\s+os\b/i,
  /from\s+os\s+import/i,
  /subprocess\.(run|call|Popen|check_output)/i,
  /\bexec\s*\(\s*['"`]/i,
  /\bsystem\s*\(/i,
  /Runtime\.getRuntime\s*\(\s*\)/i,
  /ProcessBuilder/i,
  /process\.env/i,
  /require\s*\(\s*['"]child_process/i,
  /require\s*\(\s*['"]fs['"]/i,
  /require\s*\(\s*['"]net['"]/i,
  /require\s*\(\s*['"]http['"]/i,
  /import\s+.*\bfs\b.*from/i,
  /import\s+.*child_process/i,
  /__import__\s*\(\s*['"]os['"]/i,
  /open\s*\(\s*['"]\/etc/i,
  /open\s*\(\s*['"]\/proc/i,
];

function checkSecurityPatterns(code) {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, pattern: pattern.toString() };
    }
  }
  return { safe: true };
}

// ---------------------------------------------------------------------------
// Language Config — Piston runtime names + Judge0 language IDs
// ---------------------------------------------------------------------------
const LANGUAGES = {
  javascript: { piston: 'javascript', pistonVersion: '18.15.0', judge0Id: 63 },
  python:     { piston: 'python',     pistonVersion: '3.10.0',  judge0Id: 71 },
  cpp:        { piston: 'c++',        pistonVersion: '10.2.0',  judge0Id: 54 },
  java:       { piston: 'java',       pistonVersion: '15.0.2',  judge0Id: 62 },
  c:          { piston: 'c',          pistonVersion: '10.2.0',  judge0Id: 50 },
  typescript: { piston: 'typescript', pistonVersion: '5.0.3',   judge0Id: 74 },
};

// ---------------------------------------------------------------------------
// Execution Limits
// ---------------------------------------------------------------------------
const MAX_EXECUTION_TIME = 10_000;  // 10 seconds
const MAX_OUTPUT_SIZE    = 50_000;  // 50 KB

function trimOutput(text) {
  if (!text) return '';
  if (text.length > MAX_OUTPUT_SIZE) {
    return text.slice(0, MAX_OUTPUT_SIZE) + '\n\n[output truncated]';
  }
  return text;
}

function stripAnsi(text) {
  if (!text) return '';
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// ---------------------------------------------------------------------------
// Provider 1: Piston API (primary — free, no key needed)
// ---------------------------------------------------------------------------
const PISTON_URL = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';

async function executeWithPiston(language, code, stdin) {
  const langConfig = LANGUAGES[language];
  if (!langConfig) throw new Error(`Unsupported language: ${language}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_EXECUTION_TIME);

  try {
    const response = await fetch(`${PISTON_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: langConfig.piston,
        version: langConfig.pistonVersion,
        files: [{ content: code }],
        stdin: stdin || '',
        run_timeout: MAX_EXECUTION_TIME,
        compile_timeout: MAX_EXECUTION_TIME,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Piston error ${response.status}: ${text}`);
    }

    const result = await response.json();
    return {
      language,
      version: result.version || langConfig.pistonVersion,
      run: {
        stdout: trimOutput(stripAnsi(result.run?.stdout || '')),
        stderr: trimOutput(stripAnsi(result.run?.stderr || '')),
        code: result.run?.code ?? 0,
        signal: result.run?.signal || null,
        output: trimOutput(stripAnsi(result.run?.output || '')),
      },
      compile: result.compile ? {
        stdout: trimOutput(stripAnsi(result.compile.stdout || '')),
        stderr: trimOutput(stripAnsi(result.compile.stderr || '')),
        code: result.compile.code ?? 0,
        signal: result.compile.signal || null,
        output: trimOutput(stripAnsi(result.compile.output || '')),
      } : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Provider 2: Judge0 API (fallback)
// ---------------------------------------------------------------------------
const JUDGE0_URL = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_KEY = process.env.JUDGE0_API_KEY || '';

async function executeWithJudge0(language, code, stdin) {
  const langConfig = LANGUAGES[language];
  if (!langConfig) throw new Error(`Unsupported language: ${language}`);
  if (!JUDGE0_KEY) throw new Error('Judge0 API key not configured');

  const headers = {
    'Content-Type': 'application/json',
    'X-RapidAPI-Key': JUDGE0_KEY,
    'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
  };

  const submitResponse = await fetch(
    `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        language_id: langConfig.judge0Id,
        source_code: Buffer.from(code).toString('base64'),
        stdin: stdin ? Buffer.from(stdin).toString('base64') : '',
        cpu_time_limit: MAX_EXECUTION_TIME / 1000,
      }),
    }
  );

  if (!submitResponse.ok) {
    const text = await submitResponse.text();
    throw new Error(`Judge0 error ${submitResponse.status}: ${text}`);
  }

  const result = await submitResponse.json();
  const decode = (b64) => b64 ? Buffer.from(b64, 'base64').toString('utf-8') : '';

  const stdout = trimOutput(stripAnsi(decode(result.stdout)));
  const stderr = trimOutput(stripAnsi(decode(result.stderr)));
  const compileOutput = trimOutput(stripAnsi(decode(result.compile_output)));

  return {
    language,
    version: langConfig.pistonVersion,
    run: {
      stdout,
      stderr,
      code: result.status?.id === 3 ? 0 : 1,
      signal: null,
      output: stdout,
    },
    compile: compileOutput ? {
      stdout: '',
      stderr: compileOutput,
      code: 1,
      signal: null,
      output: compileOutput,
    } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Execution Router — tries providers in order
// ---------------------------------------------------------------------------
async function executeCode(language, code, stdin) {
  const errors = [];

  // 1. Piston (primary)
  try {
    console.log(`[Piston] Executing ${language}...`);
    return await executeWithPiston(language, code, stdin);
  } catch (err) {
    console.warn(`[Piston] Failed: ${err.message}`);
    errors.push(`Piston: ${err.message}`);
  }

  // 2. Judge0 (fallback)
  if (JUDGE0_KEY) {
    try {
      console.log(`[Judge0] Executing ${language}...`);
      return await executeWithJudge0(language, code, stdin);
    } catch (err) {
      console.warn(`[Judge0] Failed: ${err.message}`);
      errors.push(`Judge0: ${err.message}`);
    }
  }

  throw new Error(
    'All execution providers failed.\n' +
    errors.map(e => `  - ${e}`).join('\n')
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post('/api/execute', async (req, res) => {
  try {
    const { language, code, stdin = '' } = req.body;

    if (!language || !code) {
      return res.status(400).json({ success: false, error: 'Language and code are required' });
    }

    if (!LANGUAGES[language]) {
      return res.status(400).json({
        success: false,
        error: `Language '${language}' not supported. Supported: ${Object.keys(LANGUAGES).join(', ')}`,
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

    // Rate limiting
    if (req.user) {
      const limit = checkUserRateLimit(req.user.id);
      res.setHeader('X-RateLimit-Remaining', limit.remaining);
      if (!limit.allowed) {
        return res.status(429).json({
          success: false,
          error: `Daily execution limit (${MAX_EXECUTIONS_PER_DAY}) reached. Try again tomorrow.`,
        });
      }
    } else {
      // Anonymous / dev — IP-based limit
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

    // Return with execution metadata
    return res.json({
      success: true,
      data: result,
      meta: {
        durationMs,
        userId: req.user?.id || null,
      },
    });
  } catch (error) {
    console.error('Code execution error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Code execution failed',
    });
  }
});

// Auth check endpoint — playground frontend can verify auth status
app.get('/api/auth/status', (req, res) => {
  if (req.user) {
    return res.json({ authenticated: true, user: req.user });
  }
  return res.json({ authenticated: false });
});

// ---------------------------------------------------------------------------
// In-memory Snippets Store
// ---------------------------------------------------------------------------
const snippets = new Map(); // id -> snippet object
let snippetCounter = 0;

function generateId() {
  return `snip_${Date.now().toString(36)}_${(++snippetCounter).toString(36)}`;
}

function generateShareToken() {
  return crypto.randomBytes(8).toString('base64url');
}

// POST /api/snippets — save a new snippet (auth required)
app.post('/api/snippets', requireAuth, (req, res) => {
  const { title, language, code, isPublic = false } = req.body;
  if (!title || !language || !code) {
    return res.status(400).json({ success: false, error: 'title, language, and code are required' });
  }
  const id = generateId();
  const snippet = {
    id,
    userId: req.user.id,
    userName: req.user.email,
    title: title.slice(0, 100),
    language,
    code,
    isPublic: Boolean(isPublic),
    shareToken: isPublic ? generateShareToken() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  snippets.set(id, snippet);
  return res.status(201).json({ success: true, data: snippet });
});

// GET /api/snippets — list current user's snippets
app.get('/api/snippets', requireAuth, (_req, res) => {
  const userSnippets = [...snippets.values()]
    .filter((s) => s.userId === _req.user.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return res.json({ success: true, data: userSnippets });
});

// GET /api/snippets/shared/:token — public shared snippet (no auth)
app.get('/api/snippets/shared/:token', (req, res) => {
  const snippet = [...snippets.values()].find(
    (s) => s.shareToken === req.params.token && s.isPublic
  );
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  return res.json({ success: true, data: snippet });
});

// GET /api/snippets/:id — get single snippet (must own)
app.get('/api/snippets/:id', requireAuth, (req, res) => {
  const snippet = snippets.get(req.params.id);
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (snippet.userId !== req.user.id) {
    return res.status(403).json({ success: false, error: 'Not your snippet' });
  }
  return res.json({ success: true, data: snippet });
});

// PUT /api/snippets/:id — update snippet (must own)
app.put('/api/snippets/:id', requireAuth, (req, res) => {
  const snippet = snippets.get(req.params.id);
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (snippet.userId !== req.user.id) {
    return res.status(403).json({ success: false, error: 'Not your snippet' });
  }
  const { title, language, code, isPublic } = req.body;
  if (title !== undefined) snippet.title = title.slice(0, 100);
  if (language !== undefined) snippet.language = language;
  if (code !== undefined) snippet.code = code;
  if (isPublic !== undefined) {
    snippet.isPublic = Boolean(isPublic);
    if (snippet.isPublic && !snippet.shareToken) {
      snippet.shareToken = generateShareToken();
    }
    if (!snippet.isPublic) snippet.shareToken = null;
  }
  snippet.updatedAt = new Date().toISOString();
  return res.json({ success: true, data: snippet });
});

// DELETE /api/snippets/:id — delete snippet (must own)
app.delete('/api/snippets/:id', requireAuth, (req, res) => {
  const snippet = snippets.get(req.params.id);
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (snippet.userId !== req.user.id) {
    return res.status(403).json({ success: false, error: 'Not your snippet' });
  }
  snippets.delete(req.params.id);
  return res.json({ success: true, message: 'Snippet deleted' });
});

// ---------------------------------------------------------------------------
// User Preferences (in-memory)
// ---------------------------------------------------------------------------
const userPrefs = new Map(); // userId -> prefs object

app.get('/api/prefs', requireAuth, (req, res) => {
  const prefs = userPrefs.get(req.user.id) || { theme: 'vs-dark', fontSize: 14, keybinding: 'default', lastLanguage: 'python' };
  return res.json({ success: true, data: prefs });
});

app.put('/api/prefs', requireAuth, (req, res) => {
  const { theme, fontSize, keybinding, lastLanguage } = req.body;
  const existing = userPrefs.get(req.user.id) || { theme: 'vs-dark', fontSize: 14, keybinding: 'default', lastLanguage: 'python' };
  if (theme !== undefined) existing.theme = theme;
  if (fontSize !== undefined) existing.fontSize = Math.min(Math.max(Number(fontSize), 10), 24);
  if (keybinding !== undefined) existing.keybinding = keybinding;
  if (lastLanguage !== undefined) existing.lastLanguage = lastLanguage;
  userPrefs.set(req.user.id, existing);
  return res.json({ success: true, data: existing });
});

// ---------------------------------------------------------------------------
// Health & Info
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'code-execution',
    providers: {
      piston: { url: PISTON_URL, status: 'active' },
      judge0: { url: JUDGE0_URL, status: JUDGE0_KEY ? 'active' : 'unconfigured' },
    },
    snippetsInMemory: snippets.size,
  });
});

app.get('/', (_req, res) => {
  res.json({
    service: 'Code Execution API',
    version: '2.0.0',
    providers: ['piston', 'judge0'],
    endpoints: {
      execute: 'POST /api/execute',
      snippets: 'GET|POST /api/snippets',
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
  console.log('Code Execution Server v2.0');
  console.log(`Listening:  http://localhost:${PORT}`);
  console.log(`Piston URL: ${PISTON_URL}`);
  console.log(`Judge0 URL: ${JUDGE0_URL} (${JUDGE0_KEY ? 'key set' : 'no key'})`);
});
