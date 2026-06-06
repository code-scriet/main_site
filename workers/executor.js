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
    .replace(/prog\.\w+/g, 'source file');
}

// M1: constant-time string compare so the shared secret can't be recovered by
// timing the response.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// M1: best-effort per-isolate IP throttle. Cloudflare runs many isolates, so
// this is NOT a global limit — the real control is the shared secret, which
// makes our execute-server the only legitimate caller (and that server already
// enforces per-user save/submit quotas). This just blunts a burst that lands on
// a single isolate. The map is bounded so a flood of unique IPs can't grow it.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const ipHits = new Map();

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    if (ipHits.size > 5000) ipHits.clear();
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

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

    // M1: best-effort burst protection keyed on the real client IP.
    if (rateLimited(request.headers.get('CF-Connecting-IP') || '')) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please slow down.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
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

      const result = await upstreamResponse.json();

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
