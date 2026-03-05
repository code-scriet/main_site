# Playground Production Deployment Guide

**Last Updated:** March 5, 2026

Complete instructions for deploying the Code.Scriet Playground to production across all services.

---

## Architecture Overview

```
┌─────────────────────┐        ┌─────────────────────────┐
│   Main Site (Web)   │        │   Playground (Frontend)  │
│  codescriet.dev     │  ────► │  code.codescriet.dev     │
│  Render Static Site │        │  Render Static Site      │
└─────────────────────┘        └────────┬────────────────┘
                                        │ API calls
┌─────────────────────┐        ┌────────▼────────────────┐
│   Main API          │        │  Playground API (Backend)│
│  codescriet-api.    │        │  playground-api.         │
│    onrender.com     │        │    codescriet.dev        │
│  Render Web Service │        │    codescriet.dev        │
│  (Express + Prisma) │        │  Render Web Service      │
└─────────────────────┘        └────────┬────────────────┘
                                        │ POST /execute
                               ┌────────▼────────────────┐
                               │  Cloudflare Worker       │
                               │  codescriet-executor.    │
                               │   developer-aary.        │
                               │   workers.dev            │
                               └────────┬────────────────┘
                                        │ (hidden from user)
                               ┌────────▼────────────────┐
                               │  Upstream Compiler       │
                               │  (never exposed)         │
                               └─────────────────────────┘
```

### Domain Map
| Service | Domain | Host | Plan |
|---------|--------|------|------|
| Main Site Frontend | `codescriet.dev` | Render Static | Free |
| Main Site API | `codescriet-api.onrender.com` | Render Web Service | Free |
| Playground Frontend | `code.codescriet.dev` | Render Static | Free |
| Playground API | `playground-api.codescriet.dev` | Render Web Service | Free |
| Execution Proxy | `codescriet-executor.developer-aary.workers.dev` | Cloudflare Workers | Free (100K req/day) |

---

## 1. Cloudflare Worker Deployment

The CF Worker proxies code execution requests and hides the upstream compiler service.

### Steps

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. Name: `codescriet-executor`
3. Click **Edit Code** and paste the contents of `workers/executor.js`
4. Click **Deploy**
5. Verify: `curl https://codescriet-executor.developer-aary.workers.dev/health`

Expected response:
```json
{"status":"ok","service":"codescriet-executor"}
```

### Worker Config
No environment variables needed — everything is hardcoded in the worker code.

**Allowed Origins** (configured in `workers/executor.js`):
- `https://code.codescriet.dev`
- `https://codescriet.dev`
- `https://codescriet-api.onrender.com`
- `https://playground-api.codescriet.dev`
- Server-to-server (no Origin header) — allowed by default

**Limits (Free Tier):**
- 100,000 requests/day
- 10ms CPU time per request
- No persistent storage needed

---

## 2. Playground API (execute-server)

The Express server that handles code execution, snippets, and user prefs.

### Render Setup

1. **Service Type:** Web Service
2. **Name:** `codescriet-playground-api` (or `playground-api`)
3. **Runtime:** Node
4. **Root Directory:** `apps/playground`
5. **Build Command:** `npm install`
6. **Start Command:** `node execute-server.js`
7. **Health Check Path:** `/health`

### Environment Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `10000` | Render assigns this automatically |
| `NODE_ENV` | `production` | **Required** |
| `JWT_SECRET` | `<same as main API>` | **MUST match** the main API's JWT_SECRET for shared auth |
| `ALLOWED_ORIGIN` | `https://code.codescriet.dev,https://codescriet.dev` | Comma-separated origins for CORS |
| `EXECUTOR_URL` | `https://codescriet-executor.developer-aary.workers.dev/execute` | Cloudflare Worker endpoint |

### Custom Domain
- Add `playground-api.codescriet.dev` in Render dashboard
- Configure DNS: `CNAME playground-api → <render-service>.onrender.com`

---

## 3. Playground Frontend (Static Site)

The React (Vite) SPA that runs in the browser.

### Render Setup

1. **Service Type:** Static Site
2. **Name:** `codescriet-playground-web` (or `playground-frontend`)
3. **Root Directory:** `apps/playground`
4. **Build Command:** `npm install && npm run build`
5. **Publish Directory:** `dist`
6. **Rewrite Rule:** `/*` → `/index.html` (SPA fallback)

### Environment Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://playground-api.codescriet.dev` | Playground backend URL |
| `VITE_MAIN_SITE_URL` | `https://codescriet.dev` | Main site URL (used in Navbar links, auth redirects) |
| `VITE_MAIN_API_URL` | `https://codescriet-api.onrender.com` | Main API URL (used for auth verification) |

> **Important:** All `VITE_` variables are baked into the JS bundle at build time. After changing them, you **must rebuild** the static site.

### Custom Domain
- Add `code.codescriet.dev` in Render dashboard
- Configure DNS: `CNAME code → <render-service>.onrender.com`

### Cache Headers (configured in render.yaml)
```
/index.html  → Cache-Control: no-cache, no-store, must-revalidate
/assets/*    → Cache-Control: public, max-age=31536000, immutable
```

---

## 4. Main Site Frontend (codescriet.dev)

The main site needs a single env var to link to the playground.

### Environment Variables to Add/Verify

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_PLAYGROUND_URL` | `https://code.codescriet.dev` | Used in Header links and PlaygroundCard |
| `VITE_API_URL` | `https://codescriet-api.onrender.com/api` | Already set |

After adding/updating, rebuild the static site.

---

## 5. Main Site API (codescriet-api.onrender.com)

### Environment Variables to Verify

The following should already be set. Verify they are correct:

| Variable | Value | Notes |
|----------|-------|-------|
| `JWT_SECRET` | `<your-secret>` | **MUST be identical** on the Playground API |
| `FRONTEND_URL` | `https://codescriet.dev` | For CORS and OAuth callbacks |

### CORS Configuration

Add `https://code.codescriet.dev` to the `ALLOWED_ORIGINS` if the playground frontend makes direct calls to the main API (for auth verification). This is already handled if `FRONTEND_URL` or `ALLOWED_ORIGINS` includes it.

---

## 6. Auth Flow (Cross-Origin)

The playground authenticates users via the main site's JWT tokens:

1. User clicks **Playground** from the main site header or dashboard
2. The link includes `#token=<jwt>` as a URL hash fragment
3. The playground's `AuthContext` reads the hash, stores the JWT in localStorage
4. All subsequent API calls include `Authorization: Bearer <token>`
5. The execute-server verifies the JWT using the **same secret** as the main API

### Checklist
- [ ] `JWT_SECRET` on Playground API === `JWT_SECRET` on Main API
- [ ] Main site's Header.tsx and PlaygroundCard pass `#token=<jwt>` in playground URL
- [ ] Playground's AuthContext reads hash token on mount

---

## 7. DNS Configuration

Add these records at your DNS provider (likely Cloudflare if you're using their nameservers):

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `code` | `<playground-frontend>.onrender.com` | Off (DNS only) |
| CNAME | `playground-api` | `<playground-api>.onrender.com` | Off (DNS only) |
| CNAME | `@` or `www` | `<main-web>.onrender.com` | Off (DNS only) |

If you are using the default Render URL for the main API (`codescriet-api.onrender.com`), you do **not** need an `api` CNAME record.

> Use "DNS Only" (gray cloud) for Render services — Render handles SSL.

---

## 8. Execution Tier System

| Tier | Languages | Where | Latency |
|------|-----------|-------|---------|
| **Tier 1 (Client)** | JavaScript, TypeScript, Python, HTML/CSS | Browser (Web Worker / Pyodide WASM / iframe) | ~0ms network |
| **Tier 2 (Cloud)** | C, C++, Java, Go, Rust + JS/TS/Python fallback | Playground API → CF Worker → Upstream | ~1-3s |

- Tier 1 runs entirely in the user's browser — zero server calls
- Tier 2 routes through the execute-server for compiled languages
- The upstream compiler service is **never** exposed to the frontend

### Supported Cloud Languages & Compilers
| Language | Compiler ID | Version Label |
|----------|------------|---------------|
| JavaScript | `nodejs-20.17.0` | Node.js 20.17 |
| Python | `cpython-3.12.7` | Python 3.12 |
| C++ | `gcc-13.2.0` | GCC 13.2 |
| C | `gcc-13.2.0-c` | GCC 13.2 |
| Java | `openjdk-jdk-22+36` | JDK 22 |
| TypeScript | `typescript-5.6.2` | TypeScript 5.6 |

---

## 9. Rate Limits

### Execute-server Limits (per day)
| User Type | Limit |
|-----------|-------|
| Authenticated user | 200 executions/day |
| Anonymous (IP-based) | 30 executions/day |

### Cloudflare Worker
- 100,000 requests/day (free tier)
- If you exceed this consistently, upgrade to Workers Paid ($5/mo for 10M req/mo)

---

## 10. Security Measures

1. **CORS** — Only allowed origins can call the execute-server and CF Worker
2. **JWT Auth** — Shared secret between main API and playground API
3. **Code Scanning** — Blocked patterns prevent os/subprocess/filesystem access
4. **Rate Limiting** — Per-user and per-IP daily limits
5. **Error Sanitization** — `sanitizeError()` on both CF Worker and execute-server strips any upstream references from error messages
6. **Security Headers** — Helmet-equivalent headers (CSP, X-Frame-Options, etc.)
7. **Execution Timeout** — 15-second hard limit per execution
8. **Output Truncation** — Max 50KB output per execution

---

## 11. Post-Deployment Verification

### Smoke Tests

```bash
# 1. CF Worker health
curl https://codescriet-executor.developer-aary.workers.dev/health

# 2. Playground API health
curl https://playground-api.codescriet.dev/health

# 3. Execute code (requires running server)
curl -X POST https://playground-api.codescriet.dev/api/execute \
  -H 'Content-Type: application/json' \
  -d '{"language":"python","code":"print(\"Hello from prod!\")"}'

# 4. Playground frontend loads
curl -s https://code.codescriet.dev | head -5
# Should return HTML with <div id="root">

# 5. Main site playground link
# Visit https://codescriet.dev, log in, click "Playground" in header
# Should auto-authenticate without showing login screen
```

### Things to Manually Test
- [ ] Open `code.codescriet.dev` — playground loads
- [ ] Click "Sign in" — redirects to main site login
- [ ] From main site header, click "Playground" — auto-authenticates
- [ ] Run JavaScript code (Tier 1 / local) — runs instantly
- [ ] Run Python code (Tier 1 / Pyodide) — runs locally
- [ ] Run C++ code (Tier 2 / cloud) — runs via CF Worker
- [ ] Run Java code — no "public class Main" error
- [ ] Toggle light/dark mode — output panel matches theme
- [ ] Save a snippet — saves and appears in snippet list
- [ ] Browser DevTools Network tab — NO wandbox.org or third-party execution URLs visible

---

## 12. Troubleshooting

### "Authentication required" when already logged in
- Verify `JWT_SECRET` is identical on both main API and playground API
- Verify the main site passes `#token=<jwt>` in the playground URL (Header.tsx, PlaygroundCard)

### CORS errors
- Check `ALLOWED_ORIGIN` env var on the execute-server includes the playground frontend domain
- Check the CF Worker's `ALLOWED_ORIGINS` array includes the calling domain
- Server-to-server calls (execute-server → CF Worker) have no Origin header — this is allowed

### Execution timeouts
- Default timeout is 15 seconds
- Java and C++ compile + run can take 3-8 seconds — this is normal
- If CF Worker times out (>10ms CPU or >30s wall clock), the upstream may be slow

### "Unsupported language" errors
- Cloud execution supports: javascript, python, cpp, c, java, typescript
- Other languages (HTML/CSS) run client-side only and never hit the server

### Snippets lost on restart
- Snippets are stored in-memory — they reset when the execute-server restarts
- This is expected for the free tier. For persistence, migrate to a database.

---

## 13. Environment Variable Quick Reference

### All Services at a Glance

#### Cloudflare Worker (`codescriet-executor`)
No env vars needed — all config is in the code.

#### Render: Playground API (`playground-api.codescriet.dev`)
```env
PORT=10000
NODE_ENV=production
JWT_SECRET=<must-match-main-api>
ALLOWED_ORIGIN=https://code.codescriet.dev,https://codescriet.dev
EXECUTOR_URL=https://codescriet-executor.developer-aary.workers.dev/execute
```

#### Render: Playground Frontend (`code.codescriet.dev`)
```env
VITE_API_URL=https://playground-api.codescriet.dev
VITE_MAIN_SITE_URL=https://codescriet.dev
VITE_MAIN_API_URL=https://codescriet-api.onrender.com
```

#### Render: Main Site Frontend (`codescriet.dev`)
```env
VITE_API_URL=https://codescriet-api.onrender.com/api
VITE_PLAYGROUND_URL=https://code.codescriet.dev
```

#### Render: Main API (`codescriet-api.onrender.com`)
```env
JWT_SECRET=<must-match-playground-api>
FRONTEND_URL=https://codescriet.dev
# ... (all other existing env vars)
```

---

## 14. Upgrade Path

### When you outgrow free tier:
1. **Render:** Upgrade playground API to Starter ($7/mo) for always-on (no cold starts)
2. **Cloudflare Workers:** Upgrade to Paid ($5/mo) for 10M requests/month
3. **Snippets:** Add PostgreSQL for persistent snippet storage
4. **Execution:** Add Judge0 as fallback provider for higher limits

### Performance improvements:
- Monaco Editor chunk is ~670KB — already code-split via manualChunks
- Pyodide WASM is ~10MB on first load but cached afterward
- Consider adding a loading skeleton for the editor
