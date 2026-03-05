import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

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
// Rate Limiting
// ---------------------------------------------------------------------------
const MAX_EXECUTIONS_PER_DAY = 200;
const userExecCounts = new Map();
const MAX_IP_EXECUTIONS = 30;
const ipExecCounts = new Map();

function checkUserRateLimit(userId) {
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
  if (!message) return 'Code execution failed';
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

    // Parse response (same shape as upstream provider)
    const exitCode = parseInt(result.status, 10) || 0;
    const stdout = clean(result.program_output);
    const stderr = clean(result.program_error);
    const compilerErr = clean(result.compiler_error);
    const compilerOut = clean(result.compiler_output);
    const signal = result.signal || null;

    return {
      language,
      version: config.version,
      provider: 'codescriet',
      run: {
        stdout,
        stderr: sanitizeError(stderr),
        code: exitCode,
        signal,
        output: stdout || stderr,
      },
      compile: (compilerErr || compilerOut) ? {
        stdout: compilerOut,
        stderr: sanitizeError(compilerErr),
        code: compilerErr ? 1 : 0,
        signal: null,
        output: sanitizeError(compilerErr || compilerOut),
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
    return res.status(500).json({ success: false, error: sanitizeError(message) });
  }
});

// Auth check endpoint
app.get('/api/auth/status', (req, res) => {
  if (req.user) return res.json({ authenticated: true, user: req.user });
  return res.json({ authenticated: false });
});

// ---------------------------------------------------------------------------
// In-memory Snippets Store
// ---------------------------------------------------------------------------
const snippets = new Map();
let snippetCounter = 0;

function generateId() {
  return `snip_${Date.now().toString(36)}_${(++snippetCounter).toString(36)}`;
}
function generateShareToken() {
  return crypto.randomBytes(8).toString('base64url');
}

app.post('/api/snippets', requireAuth, (req, res) => {
  const { title, language, code, isPublic = false } = req.body;
  if (!title || !language || !code) {
    return res.status(400).json({ success: false, error: 'title, language, and code are required' });
  }
  const id = generateId();
  const snippet = {
    id, userId: req.user.id, userName: req.user.email,
    title: title.slice(0, 100), language, code,
    isPublic: Boolean(isPublic),
    shareToken: isPublic ? generateShareToken() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  snippets.set(id, snippet);
  return res.status(201).json({ success: true, data: snippet });
});

app.get('/api/snippets', requireAuth, (req, res) => {
  const userSnippets = [...snippets.values()]
    .filter(s => s.userId === req.user.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return res.json({ success: true, data: userSnippets });
});

app.get('/api/snippets/shared/:token', (req, res) => {
  const snippet = [...snippets.values()].find(s => s.shareToken === req.params.token && s.isPublic);
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  return res.json({ success: true, data: snippet });
});

app.get('/api/snippets/:id', requireAuth, (req, res) => {
  const snippet = snippets.get(req.params.id);
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (snippet.userId !== req.user.id) return res.status(403).json({ success: false, error: 'Not your snippet' });
  return res.json({ success: true, data: snippet });
});

app.put('/api/snippets/:id', requireAuth, (req, res) => {
  const snippet = snippets.get(req.params.id);
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (snippet.userId !== req.user.id) return res.status(403).json({ success: false, error: 'Not your snippet' });
  const { title, language, code, isPublic } = req.body;
  if (title !== undefined) snippet.title = title.slice(0, 100);
  if (language !== undefined) snippet.language = language;
  if (code !== undefined) snippet.code = code;
  if (isPublic !== undefined) {
    snippet.isPublic = Boolean(isPublic);
    if (snippet.isPublic && !snippet.shareToken) snippet.shareToken = generateShareToken();
    if (!snippet.isPublic) snippet.shareToken = null;
  }
  snippet.updatedAt = new Date().toISOString();
  return res.json({ success: true, data: snippet });
});

app.delete('/api/snippets/:id', requireAuth, (req, res) => {
  const snippet = snippets.get(req.params.id);
  if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
  if (snippet.userId !== req.user.id) return res.status(403).json({ success: false, error: 'Not your snippet' });
  snippets.delete(req.params.id);
  return res.json({ success: true, message: 'Snippet deleted' });
});

// ---------------------------------------------------------------------------
// User Preferences (in-memory)
// ---------------------------------------------------------------------------
const userPrefs = new Map();

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
    provider: 'codescriet',
    executorUrl: EXECUTOR_URL,
    supportedLanguages: SUPPORTED_LANGUAGES,
    snippetsInMemory: snippets.size,
  });
});

app.get('/', (_req, res) => {
  res.json({
    service: 'Code Execution API',
    version: '4.0.0',
    provider: 'codescriet',
    architecture: 'Tier 1 (client-side) → Tier 2 (Cloudflare Worker proxy)',
    endpoints: {
      execute: 'POST /api/execute  — Tier 2 cloud execution',
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
  console.log('Code Execution Server v4.0 — Cloudflare Worker Proxy');
  console.log(`Listening:    http://localhost:${PORT}`);
  console.log(`Executor:     ${EXECUTOR_URL}`);
  console.log(`Languages:    ${SUPPORTED_LANGUAGES.join(', ')}`);
  console.log(`Timeout:      ${EXECUTION_TIMEOUT / 1000}s`);
});
