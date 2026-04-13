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
// ---------------------------------------------------------------------------

const UPSTREAM_URL = 'https://wandbox.org/api/compile.json';

// Only allow requests from our own origins
const ALLOWED_ORIGINS = [
  'https://code.codescriet.dev',
  'https://codescriet.dev',
  'https://api.codescriet.dev',
  'https://codescriet-api.onrender.com',
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
