// ---------------------------------------------------------------------------
// Cloudflare Worker — Code Execution Proxy
// ---------------------------------------------------------------------------
// Deployed at: https://codescriet-executor.developer-aary.workers.dev
// Route:       POST /execute
//
// This worker sits between the frontend and the upstream compiler service.
// - Frontend DevTools only ever sees requests to codescriet-executor.developer-aary.workers.dev
// - The upstream provider is never exposed to the user
// - Cloudflare's rotating IP pool prevents rate-limit bans on our server IP
// - Free tier: 100,000 requests/day
//
// Deployment:
//   1. Go to dash.cloudflare.com → Workers & Pages → Create
//   2. Paste this code
//   3. Deploy
//   4. Set EXECUTOR_URL=https://codescriet-executor.developer-aary.workers.dev/execute
//      in the execute-server environment
//   5. SECURITY (M1): generate a random EXECUTOR_SECRET and set the SAME value
//      as a Worker environment variable (Settings → Variables) AND in the
//      execute-server environment. Once set, the Worker rejects any request
//      without the matching X-Executor-Secret header — closing the open relay.
// ---------------------------------------------------------------------------

const WANDBOX_URL = 'https://wandbox.org/api/compile.json';
const GODBOLT_BASE = 'https://godbolt.org/api/compiler';

// Only allow requests from our own origins. Keep this aligned with the
// ALLOWED_CODESCRIET_ORIGINS list in apps/api/src/index.ts.
const ALLOWED_ORIGINS = [
  'https://code.codescriet.dev',
  'https://codescriet.dev',
  'https://www.codescriet.dev',
  'https://api.codescriet.dev',
  'https://playground-api.codescriet.dev',
];

// In development, also allow localhost
const DEV_ORIGINS = [
  'http://localhost:5002',
  'http://localhost:5174',
  'http://localhost:5173',
];

function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (DEV_ORIGINS.includes(origin)) return origin;
  return null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// Sanitize error messages — strip any upstream provider references
function sanitizeError(message) {
  if (!message) return 'Code execution failed';
  return message
    .replace(/https?:\/\/wandbox\.org[^\s]*/gi, '[upstream]')
    .replace(/https?:\/\/godbolt\.org[^\s]*/gi, '[upstream]')
    .replace(/wandbox\.org/gi, 'execution service')
    .replace(/godbolt\.org/gi, 'execution service')
    .replace(/wandbox/gi, 'execution service')
    .replace(/godbolt|compiler-explorer/gi, 'execution service')
    .replace(/compile\.json/gi, 'compiler')
    .replace(/prog\.\w+/g, 'source file');
}

// ---------------------------------------------------------------------------
// Execution providers — Wandbox and godbolt (Compiler Explorer). The admin picks
// the primary via Settings.code_execution_provider; both callers (apps/api
// codeJudge.ts + apps/playground execute-server.js) forward it to us as
// `body.provider`. We try that provider first and transparently fall back to the
// other on an UPSTREAM infra failure — Wandbox periodically fails host-side with
// "OCI runtime error: crun: clone: Resource temporarily unavailable" (clone/fork
// EAGAIN) for EVERY language, even trivial programs. Each provider's response is
// shaped to Wandbox field names so neither the judge nor the playground needs to
// change how it parses results.
//
// IMPORTANT: godbolt cannot EXECUTE Node.js / TypeScript (it's a compiler tool,
// no JS runtime). For those languages godbolt is skipped — so JS/Node runs on
// Wandbox only and has no fallback. Python / C / C++ / Java get the full
// Wandbox <-> godbolt chain.
// ---------------------------------------------------------------------------
const INFRA_FAILURE_RE = /OCI runtime|\bcrun\b|\brunc\b|Resource temporarily unavailable|Cannot allocate memory|cannot fork|pthread_create|No space left on device|\bEAGAIN\b/i;

const VALID_PROVIDERS = ['wandbox', 'godbolt'];

function normalizeProvider(p) {
  return VALID_PROVIDERS.includes(p) ? p : 'wandbox';
}

// Strip ANSI color escapes — godbolt forces `-fdiagnostics-color=always`, so its
// compiler diagnostics arrive wrapped in escape codes; Wandbox returns plain text.
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return (text || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// Map a Wandbox compiler id -> godbolt compiler id (+ lang key + extra flags).
// Versions chosen to match our Wandbox pins. Returns null for languages godbolt
// can't EXECUTE (Node.js, TypeScript) so the chain skips it for those.
function godboltCompiler(compiler) {
  const c = String(compiler || '');
  if (c.startsWith('cpython') || c.startsWith('python')) return { id: 'python312', lang: 'python', args: '' };
  // Check the C compiler (`gcc-13.2.0-c`) before the C++ gcc match below.
  if (c.endsWith('-c')) return { id: 'cg132', lang: 'c', args: '-DONLINE_JUDGE' };
  if (c.startsWith('gcc') || c.startsWith('clang') || c.includes('++')) return { id: 'g132', lang: 'c++', args: '-std=c++17 -DONLINE_JUDGE' };
  if (c.startsWith('openjdk') || c.startsWith('java')) return { id: 'java2202', lang: 'java', args: '' };
  return null; // nodejs / node / typescript -> godbolt has no runtime
}

function providerCanRun(provider, compiler) {
  if (provider === 'wandbox') return true;        // Wandbox runs every language we support
  if (provider === 'godbolt') return !!godboltCompiler(compiler);
  return false;
}

// Upstream stall guard (ms). A provider that connects but never responds must not
// hold the whole chain — bounding each attempt lets `runWithChain` fall over to the
// other provider, and aborting on the client's signal frees the subrequest the moment
// the caller (judge/playground) gives up. Normal runs finish in ~5-8s, so this only
// ever trips on a genuine stall, never a healthy (if slow) compile.
const UPSTREAM_TIMEOUT_MS = 12000;

// Single bounded fetch for every upstream: aborts on OUR timeout OR when the incoming
// request is aborted (client gave up). Previously only godbolt was bounded; a stalled
// Wandbox would hold the request until the caller's own abort and the fallback never ran.
async function fetchUpstream(url, init, clientSignal, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const onTimeout = setTimeout(() => controller.abort(), timeoutMs);
  const onClientAbort = () => controller.abort();
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener('abort', onClientAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(onTimeout);
    if (clientSignal) clientSignal.removeEventListener('abort', onClientAbort);
  }
}

// An infra failure means the provider's HOST couldn't run the program (not the
// user's code) — fall through to the other provider. Wandbox signals this with
// status 126 + a clone/fork EAGAIN message; the regex covers both. The 126
// heuristic is Wandbox-specific (a real program legitimately exiting 126 must
// NOT be treated as infra), so it's gated on the provider.
function isInfraFailure(result, provider) {
  if (!result) return true;
  if (provider === 'wandbox' && String(result.status) === '126') return true;
  const blob = `${result.compiler_error || ''}\n${result.program_error || ''}\n${result.compiler_message || ''}`;
  return INFRA_FAILURE_RE.test(blob);
}

// Run on Wandbox. Returns the parsed (already Wandbox-shaped) JSON, or null on a
// transport/HTTP error / timeout / abort so the chain can fall through.
async function runViaWandbox(body, clientSignal) {
  try {
    const resp = await fetchUpstream(WANDBOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler: body.compiler,
        code: body.code,
        stdin: body.stdin || '',
        options: body.options || '',
        save: false,
        ...(body['compiler-option-raw'] ? { 'compiler-option-raw': body['compiler-option-raw'] } : {}),
        ...(body['runtime-option-raw'] ? { 'runtime-option-raw': body['runtime-option-raw'] } : {}),
      }),
    }, clientSignal);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Run the same program on godbolt (Compiler Explorer) and shape the response to
// Wandbox field names. Returns null if godbolt can't run this language or errors.
async function runViaGodbolt(body, clientSignal) {
  const gc = godboltCompiler(body.compiler);
  if (!gc) return null;

  // Combine the language base flags with any caller-supplied raw flags, deduping
  // tokens (callers also pass -DONLINE_JUDGE, which gc.args already carries for C/C++).
  const userArguments = [...new Set(
    [gc.args, body['compiler-option-raw'] || ''].join(' ').split(/\s+/).filter(Boolean),
  )].join(' ');

  const payload = {
    source: body.code || '',
    options: {
      userArguments,
      executeParameters: { args: [], stdin: body.stdin || '' },
      compilerOptions: { executorRequest: true },
      filters: { execute: true },
    },
    lang: gc.lang,
  };

  try {
    const resp = await fetchUpstream(`${GODBOLT_BASE}/${gc.id}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }, clientSignal);
    if (!resp.ok) return null;
    const g = await resp.json();

    const joinText = (arr) => (Array.isArray(arr) ? arr.map((x) => (x && x.text) || '').join('\n') : '');
    const build = g.buildResult || {};
    const buildFailed = typeof build.code === 'number' && build.code !== 0;
    const compilerDiagnostics = stripAnsi(joinText(build.stderr));
    const programOutput = joinText(g.stdout);
    const programError = stripAnsi(joinText(g.stderr));
    const exitCode = buildFailed ? 1 : (typeof g.code === 'number' ? g.code : 0);

    // Shape exactly like Wandbox. `signal` stays EMPTY for a clean run (the judge
    // treats any non-empty signal as a global TLE); godbolt's 20s execution cap
    // (timedOut) IS a global TLE, so we surface that as a signal kill.
    return {
      status: String(exitCode),
      signal: g.timedOut ? 'SIGKILL' : '',
      compiler_output: '',
      compiler_error: compilerDiagnostics,
      compiler_message: compilerDiagnostics,
      program_output: programOutput,
      program_error: programError,
      program_message: programOutput,
      permlink: '',
      url: '',
    };
  } catch {
    return null;
  }
}

const PROVIDER_RUNNERS = { wandbox: runViaWandbox, godbolt: runViaGodbolt };

// Try the admin-chosen provider first, then the other, skipping any provider that
// can't run the language. Returns the first NON-infra result (a real compile or
// runtime error from the chosen provider is a valid answer — don't retry it on
// the other host). If every provider infra-fails, return the last result so the
// caller degrades gracefully (codeJudge surfaces a friendly "try again").
async function runWithChain(body, clientSignal) {
  const primary = normalizeProvider(body.provider);
  const order = primary === 'godbolt' ? ['godbolt', 'wandbox'] : ['wandbox', 'godbolt'];

  let lastResult = null;
  for (const provider of order) {
    if (!providerCanRun(provider, body.compiler)) continue;
    // If the caller already gave up, stop — there's no budget left for a fallback.
    if (clientSignal && clientSignal.aborted) break;
    const result = await PROVIDER_RUNNERS[provider](body, clientSignal);
    if (!result) continue;            // transport error / timeout / language unsupported
    lastResult = result;
    if (!isInfraFailure(result, provider)) return result;
  }
  return lastResult;
}

// M1: constant-time string compare so the shared secret can't be recovered by
// timing the response.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// NOTE: there is intentionally no per-IP rate limiter here. This worker is only
// ever called server-to-server by our execute-server, so CF-Connecting-IP is
// always that one egress IP — a per-IP cap would throttle the ENTIRE platform's
// code execution (e.g. during a contest) rather than any individual user.
// Abuse is controlled by (1) the shared secret below, which makes execute-server
// the only legitimate caller, and (2) execute-server's per-user save/submit and
// daily quotas, which is the only layer that knows the user identity.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only handle POST /execute
    if (url.pathname !== '/execute') {
      // Health check
      if (url.pathname === '/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ status: 'ok', service: 'codescriet-executor' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      const origin = getAllowedOrigin(request);
      if (!origin) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const origin = getAllowedOrigin(request);
    if (!origin) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // M1: require the shared secret when configured. Until EXECUTOR_SECRET is
    // set in the Worker environment, fall back to the legacy Origin-only check
    // so a staged rollout (deploy worker → set secret in both services) never
    // breaks execution. Origin alone is spoofable and was the only gate before.
    if (env && env.EXECUTOR_SECRET) {
      const provided = request.headers.get('X-Executor-Secret') || '';
      if (!safeEqual(provided, env.EXECUTOR_SECRET)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
    }

    try {
      const body = await request.json();

      // Validate required fields
      if (!body.compiler || !body.code) {
        return new Response(
          JSON.stringify({ error: 'compiler and code are required' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          }
        );
      }

      // Run through the provider chain (admin-selected primary first, then the
      // other on an infra failure). Cloudflare's rotating IP pool handles each
      // upstream request. `runWithChain` returns a Wandbox-shaped result, or null
      // only when every provider had a transport/HTTP error (total outage).
      const result = await runWithChain(body, request.signal);

      if (!result) {
        return new Response(
          JSON.stringify({
            error: sanitizeError('Compilation service is temporarily unavailable'),
            status: 503,
          }),
          {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          }
        );
      }

      // Normalize provider-specific source filenames so errors read consistently
      // regardless of which upstream ran (Wandbox uses prog.*, godbolt uses
      // example.* / <source>).
      if (result.compiler_error) {
        result.compiler_error = result.compiler_error
          .replace(/prog\.(java|c|cpp|py|js|ts)/g, (_, ext) => `main.${ext}`)
          .replace(/example\.(java|c|cpp|py|js|ts)/g, (_, ext) => `main.${ext}`)
          .replace(/<source>/g, 'main');
      }

      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(origin),
          // Cache nothing — every execution is unique
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: sanitizeError(err.message || 'Internal worker error') }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
          },
        }
      );
    }
  },
};
