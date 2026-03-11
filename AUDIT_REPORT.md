# codescriet.dev — Audit Report (Updated after Code Review)

**Audited URL:** https://codescriet.dev
**Audit Date:** 2026-03-12
**Tool:** squirrelscan v0.0.38 (audit ID: `8a9c9703`, re-audit after fixes)
**Current Score:** 65/100 (D)
**Pages Crawled:** 10
**Code reviewed:** `apps/web/src/`

---

## Code Review vs Scanner Findings

The scanner runs without JavaScript execution (static HTML only). Most of the scanner's warnings are **SPA false positives** — the React app correctly implements them in code but they only become visible after hydration. After reviewing the actual source files, this is the definitive list of what actually needs fixing.

---

## What Is Already Correctly Implemented (Do NOT touch)

These were flagged by the scanner but are already correctly implemented in the codebase:

| Scanner Issue | Reality |
|---|---|
| "No H1 tag" on all pages | H1 exists on all page components. HomePage uses a Hero component with heading. Scanner can't see JS-rendered content. |
| "Duplicate titles on all pages" | Unique per-route `<title>` is set via `apps/web/src/components/SEO.tsx`. Scanner reads only the static `index.html` shell before React hydrates. |
| "Duplicate meta descriptions on all pages" | Unique per-route descriptions set via `SEO.tsx`. Same SPA reason as above. |
| "No `<main>` landmark" | `<main id="main-content">` exists in `apps/web/src/components/layout/Layout.tsx` line 19. |
| "No skip link" | Skip link (`<a href="#main-content">`) exists in `Layout.tsx` lines 12–17, hidden with `sr-only`, visible on focus. |
| "Privacy policy not linked" | `/privacy-policy` link is in the footer's `quickLinks` array in `apps/web/src/components/layout/Footer.tsx` line 28. |
| "Invalid JSON-LD" | Fixed — Structured Data score is now 100/100. |
| "Thin content (0 words)" | SPA false positive — all content is JS-rendered. |
| "No internal links / orphan / dead-end pages" | SPA false positive — navigation is JS-rendered. |

---

## Issues That Actually Need to Be Fixed

---

### 1. OG Image Too Small — REAL ISSUE

**Rule:** `social/og-image-size`
**Severity:** Warning
**Affected:** All 10 pages

**Problem:**
The og:image is `logo.jpeg` at **500×500 pixels**. The recommended minimum for social sharing (Facebook, LinkedIn, Twitter/X) is **1200×630 pixels** (1.91:1 aspect ratio). Images smaller than this are scaled up, appear low quality, or are cropped on share previews.

Additionally there is a minor discrepancy: `index.html` declares `og:image:width="512"` and `og:image:height="512"` but the actual file is 500×500.

**File to fix:**
- `apps/web/public/index.html` — lines 34–37 (static og:image meta tags)
- `apps/web/src/components/SEO.tsx` — line 15 (`defaultImage`) and line 92 (`og:image` dynamic tag)
- `apps/web/public/logo.jpeg` — the actual image asset (needs replacing with 1200×630 version)

**What needs to happen:**
1. Create or export a 1200×630px social sharing image (can be a banner version of the logo/branding).
2. Place it at `apps/web/public/og-image.jpg` (or similar).
3. Update the `og:image` URL in both `index.html` and `SEO.tsx` to point to the new image.
4. Update `og:image:width` to `1200` and `og:image:height` to `630` in `index.html`.

---

### 2. Sitemap Scanner Probe Errors — MINOR / LOW PRIORITY

**Rule:** `crawl/sitemap-valid`
**Severity:** Error (in scanner) — but low real-world impact

**Problem:**
The scanner probes 7 common sitemap URL patterns looking for sitemaps. All 7 return "Unknown sitemap format" because they don't exist. The actual sitemap at `/sitemap.xml` is valid and correctly referenced in `robots.txt`.

The 7 paths being probed (all non-existent):
- `/sitemap_index.xml`
- `/sitemap-index.xml`
- `/sitemaps.xml`
- `/sitemap1.xml`
- `/post-sitemap.xml`
- `/page-sitemap.xml`
- `/news-sitemap.xml`

**Impact:** These are not crawled by Google (Google only follows the sitemap declared in `robots.txt`, which correctly points to `/sitemap.xml`). This is a scanner artefact, not a real SEO problem.

**Optional fix:** If you want to eliminate this from future audits, add a `<Not found>` fallback or let Render return a proper 404 for these paths (which it likely already does). No application code change needed.

---

### 3. Security Headers — INFRASTRUCTURE TASK

**Severity:** Warning (all headers below)
**Affected:** All pages

These require changes at the **Cloudflare or Render** level — not in application code.

| Header | Status | Fix |
|---|---|---|
| `Content-Security-Policy` | Missing | Add via Cloudflare Transform Rule or Render custom headers |
| `Strict-Transport-Security` | Missing | Enable in Cloudflare SSL/TLS → "Always Use HTTPS" + HSTS |
| `X-Frame-Options` | Missing | Add `X-Frame-Options: SAMEORIGIN` via Cloudflare header rule |
| HTTP → HTTPS redirect | 301 redirect exists but no edge enforcement | Enable Cloudflare "Always Use HTTPS" to upgrade at edge |

**Suggested Cloudflare Headers Transform Rule (add all at once):**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

For CSP, start with report-only to avoid breaking anything:
```
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.codescriet.dev https://res.cloudinary.com;
```

---

### 4. Slow TTFB on Several Pages — INFRASTRUCTURE TASK

**Rule:** `perf/ttfb`
**Severity:** Warning
**Affected:** `/events` (870ms), `/achievements` (744ms), `/announcements` (809ms), `/network` (779ms), `/team` (740ms), `/contact` + `/about` (~780ms)

**Problem:** Time to First Byte exceeds the 600ms "good" threshold. This is the static site served from Render — likely caused by Render CDN cold starts or lack of edge caching.

**Fix (infrastructure only — no code change):**
- Enable Cloudflare "Cache Everything" page rule for the static site origin, or
- Set `Cache-Control: public, max-age=3600` headers on Render for static assets.
- No application code changes needed or wanted.

---

## Score Targets

| Metric | Current | After OG image fix | After security headers |
|---|---|---|---|
| Overall | 65/100 (D) | ~68/100 | ~78/100 |
| Social Media | 83/100 | ~100/100 | — |
| Security | 77/100 | — | ~95/100 |

---

## Summary — Action Items

| Priority | Item | Where | Type |
|---|---|---|---|
| ✅ Done | Replace og:image with 1200×630px image | `apps/web/public/og-image.jpg` created, `SEO.tsx` + `index.html` updated | Code |
| 🟠 P2 | Add security headers (CSP, HSTS, X-Frame-Options) | Cloudflare / Render config | Infrastructure |
| 🟡 P3 | Enable HTTPS-only at edge (eliminate HTTP redirect) | Cloudflare "Always Use HTTPS" | Infrastructure |
| 🟡 P3 | Enable edge caching to reduce TTFB | Cloudflare Cache / Render headers | Infrastructure |
| ℹ️ Low | Sitemap probe errors (7 non-existent paths) | No action needed | Non-issue |

---

*Report last updated: 2026-03-12 after full codebase review of `apps/web/src/`.*
*squirrelscan audit IDs: `8a9c9703` (before fixes), re-audit after deploy (10 pages, score 65/100).*
