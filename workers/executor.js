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

const UPSTREAM_URL = 'https://wandbox.org/api/compile.json';

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
    .replace(/wandbox/gi, 'execution service')
    .replace(/wandbox\.org/gi, 'execution service')
    .replace(/https?:\/\/wandbox\.org[^\s]*/gi, '[upstream]')
    .replace(/compile\.json/gi, 'compiler')
    .replace(/judge0|ce\.judge0\.com/gi, 'execution service')
    .replace(/prog\.\w+/g, 'source file');
}

// ---------------------------------------------------------------------------
// Fallback provider (Judge0 CE) — keeps execution alive during an UPSTREAM
// outage. The primary (Wandbox) periodically fails host-side with
// "OCI runtime error: crun: clone: Resource temporarily unavailable" (a
// clone/fork EAGAIN) for EVERY language, even on trivial programs. When we
// detect that signature we transparently re-run the same program on Judge0 CE
// and map its response back onto the primary's field names, so neither the
// judge nor the playground needs to change how it parses results.
// NOTE: Piston's public API went whitelist-only (401) on 2026-02-15, so it is
// no longer a usable fallback — Judge0 CE is public and key-free.
// ---------------------------------------------------------------------------
const FALLBACK_URL = 'https://ce.judge0.com';
const INFRA_FAILURE_RE = /OCI runtime|\bcrun\b|\brunc\b|Resource temporarily unavailable|Cannot allocate memory|cannot fork|pthread_create|No space left on device|\bEAGAIN\b/i;

// Map a Wandbox compiler id -> Judge0 CE language_id (+ optional raw compiler
// options). Versions chosen to match our pins as closely as Judge0 CE offers.
function judge0Language(compiler) {
  const c = String(compiler || '');
  if (c.startsWith('cpython') || c.startsWith('python')) return { id: 100 };          // Python 3.12.5
  if (c.startsWith('nodejs') || c.startsWith('node')) return { id: 97 };              // Node 20.17.0
  if (c.startsWith('gcc') || c.startsWith('clang') || c.includes('++')) return { id: 105, options: '-std=c++17 -DONLINE_JUDGE' }; // C++ GCC 14
  if (c.startsWith('openjdk') || c.startsWith('java')) return { id: 62 };             // OpenJDK 13
  return null;
}

// UTF-8 safe base64 (Workers `btoa`/`atob` are latin1-only).
function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str || '');
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function b64decodeUtf8(b64) {
  if (!b64) return '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function isUpstreamInfraFailure(result) {
  if (!result) return false;
  if (String(result.status) === '126') return true;
  const blob = `${result.compiler_error || ''}\n${result.program_error || ''}\n${result.compiler_message || ''}`;
  return INFRA_FAILURE_RE.test(blob);
}

// Run the same program on Judge0 CE and return it shaped like a Wandbox
// response, or null if the fallback is unavailable / errored (caller then keeps
// the original upstream result and degrades gracefully).
async function runViaFallback(body) {
  const lang = judge0Language(body.compiler);
  if (!lang) return null;

  const payload = {
    language_id: lang.id,
    source_code: b64encodeUtf8(body.code || ''),
    stdin: b64encodeUtf8(body.stdin || ''),
    cpu_time_limit: 10,
    wall_time_limit: 15,
    memory_limit: 256000,
  };
  if (lang.options) payload.compiler_options = lang.options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(`${FALLBACK_URL}/submissions?base64_encoded=true&wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const stdout = b64decodeUtf8(j.stdout);
    const stderr = b64decodeUtf8(j.stderr);
    const compileOutput = b64decodeUtf8(j.compile_output);
    const exitCode = typeof j.exit_code === 'number'
      ? j.exit_code
      : (j.status && j.status.id === 3 ? 0 : 1);
    // Shape exactly like Wandbox. IMPORTANT: leave `signal` EMPTY — the judge
    // treats any non-empty signal as a global TLE, which would misclassify
    // every compiled-language run. Per-test status lives in the harness frames.
    return {
      status: String(exitCode),
      signal: '',
      compiler_output: '',
      compiler_error: compileOutput,
      compiler_message: compileOutput,
      program_output: stdout,
      program_error: stderr,
      program_message: stdout,
      permlink: '',
      url: '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

      // Forward to upstream — Cloudflare's IP pool handles the request
      const upstreamResponse = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compiler: body.compiler,
          code: body.code,
          stdin: body.stdin || '',
          options: body.options || '',
          save: false,
          // Pass through optional raw flags
          ...(body['compiler-option-raw'] ? { 'compiler-option-raw': body['compiler-option-raw'] } : {}),
          ...(body['runtime-option-raw'] ? { 'runtime-option-raw': body['runtime-option-raw'] } : {}),
        }),
      });

      if (!upstreamResponse.ok) {
        const errText = await upstreamResponse.text().catch(() => '');
        return new Response(
          JSON.stringify({
            error: sanitizeError(`Compilation service returned HTTP ${upstreamResponse.status}`),
            status: upstreamResponse.status,
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

      let result = await upstreamResponse.json();

      // Upstream host-capacity failure (crun/clone EAGAIN, status 126) — not the
      // user's code. Transparently re-run on the fallback provider so execution
      // survives the outage. If the fallback is unavailable we keep the original
      // result and degrade gracefully to the prior behaviour.
      if (isUpstreamInfraFailure(result)) {
        const fallback = await runViaFallback(body);
        if (fallback) result = fallback;
      }

      // Sanitize any error messages in the response
      if (result.compiler_error) {
        result.compiler_error = result.compiler_error
          .replace(/prog\.(java|c|cpp|py|js|ts)/g, (_, ext) => `main.${ext}`);
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
