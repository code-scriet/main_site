# codescriet.dev — Full Website Audit Report

**Audited URL:** https://codescriet.dev
**Audit Date:** 2026-03-12
**Tool:** squirrelscan v0.0.38
**Pages Crawled:** 8
**Coverage Mode:** surface

---

## ⚠️ Agent Instructions — Read Before Making Any Changes

- **DO NOT** touch any business logic, API endpoints, authentication flows, quiz systems, certificate generation, or database queries.
- **DO NOT** touch performance optimizations, build config, bundler settings, or deployment config.
- **DO NOT** refactor components. Only make the minimal targeted change described per issue.
- All fixes are **surface-level only**: HTML structure, meta tags, JSON-LD schema, accessibility attributes, and static content.
- The site is a **React SPA (Single Page Application)**. Many crawler-detected issues (thin content, no internal links, dead-end pages) are **false positives** caused by the crawler not executing JavaScript. Do not attempt to add SSR or static content to fix these — they are noted only for awareness.
- **Security headers** (CSP, HSTS, X-Frame-Options) must be set at the **Cloudflare / Render** infrastructure level — not in application code.

---

## Overall Health Score

| Category | Score | Grade |
|---|---|---|
| **Overall** | **57 / 100** | **F** |
| Crawlability | 95 / 100 | A |
| Performance | 94 / 100 | A |
| Accessibility | 93 / 100 | A |
| Links | 85 / 100 | B |
| Social Media | 83 / 100 | B |
| Security | 77 / 100 | C |
| E-E-A-T | 73 / 100 | C |
| Core SEO | 74 / 100 | C |
| Content | 71 / 100 | C |
| Structured Data | 52 / 100 | F |
| Legal Compliance | 44 / 100 | F |
| Internationalization | 100 / 100 | A+ |
| Images | 100 / 100 | A+ |
| Local SEO | 100 / 100 | A+ |
| Mobile | 100 / 100 | A+ |
| URL Structure | 100 / 100 | A+ |

**Summary:** 596 checks passed · 89 warnings · 17 failures

---

## Pages Audited

| Path | URL |
|---|---|
| `/` | https://codescriet.dev/ |
| `/events` | https://codescriet.dev/events |
| `/achievements` | https://codescriet.dev/achievements |
| `/network` | https://codescriet.dev/network |
| `/announcements` | https://codescriet.dev/announcements |
| `/team` | https://codescriet.dev/team |
| `/join-us` | https://codescriet.dev/join-us |
| `/about` | https://codescriet.dev/about |

---

## Issues by Category

---

### 1. Core SEO — Score: 74/100

#### 1.1 Missing H1 Tag — ERRORS on all 8 pages

**Rule:** `core/h1`
**Severity:** Error
**Docs:** https://docs.squirrelscan.com/rules/core/h1

**Problem:**
No `<h1>` tag was found on any of the 8 crawled pages. Every page must have exactly one `<h1>` that describes the page's primary topic. The H1 is a primary signal for search engines and screen readers.

**Affected Pages:** ALL 8 — `/`, `/events`, `/achievements`, `/network`, `/announcements`, `/team`, `/join-us`, `/about`

**Fix Required:**
Add a unique, descriptive `<h1>` to each page's component. The H1 should be semantically present in the rendered HTML (not just visually styled as a heading). It does not need to be visible to users — it can be visually hidden with a CSS utility class if design doesn't allow a visible heading.

**Suggested H1 values per page:**

| Route | Suggested H1 |
|---|---|
| `/` | `code.scriet — CCSU's Official Coding Club` |
| `/events` | `Events — code.scriet` |
| `/achievements` | `Achievements — code.scriet` |
| `/network` | `Professional & Alumni Network — code.scriet` |
| `/announcements` | `Announcements — code.scriet` |
| `/team` | `Our Team — code.scriet` |
| `/join-us` | `Join code.scriet` |
| `/about` | `About code.scriet` |

---

#### 1.2 Meta Description Too Long — WARNINGS on all 8 pages

**Rule:** `core/meta-description`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/core/meta-description

**Problem:**
All 8 pages share the **same** meta description which is **189 characters long** — exceeding the recommended maximum of 120–160 characters. Search engines truncate descriptions beyond ~160 chars, which wastes the snippet space and harms CTR.

**Current description (shared across all pages):**
> "The official coding club of SCRIET, CCS University..." *(189 characters)*

**Fix Required:**
1. Shorten the default/fallback description to under 160 characters.
2. Set **unique** meta descriptions per route. See section 1.3 for uniqueness requirements.

**File to edit:** `apps/web/src/App.tsx` or wherever the `<Helmet>` / `<head>` meta tags are set per route.

---

#### 1.3 Duplicate Page Titles — WARNING on all 8 pages

**Rule:** `core/title-unique`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/core/title-unique

**Problem:**
All 8 pages share the exact same `<title>`:
> `"codescriet - official coding club of scriet | code.scriet"`

Every page must have a unique title. Duplicate titles confuse search engines about which page to rank for which query.

**Fix Required:**
Set unique `<title>` per route. Recommended pattern: `[Page Name] | code.scriet`

**Suggested titles per page:**

| Route | Suggested Title |
|---|---|
| `/` | `code.scriet — Official Coding Club of CCSU` |
| `/events` | `Events | code.scriet` |
| `/achievements` | `Achievements | code.scriet` |
| `/network` | `Network | code.scriet` |
| `/announcements` | `Announcements | code.scriet` |
| `/team` | `Our Team | code.scriet` |
| `/join-us` | `Join Us | code.scriet` |
| `/about` | `About | code.scriet` |

**File to edit:** `apps/web/src/App.tsx` or the per-page SEO component (likely using `react-helmet` or `react-helmet-async`).

---

### 2. Structured Data — Score: 52/100

#### 2.1 Invalid JSON-LD — ERROR on all 8 pages

**Rule:** `schema/json-ld-valid`
**Severity:** Error
**Docs:** https://docs.squirrelscan.com/rules/schema/json-ld-valid

**Problem:**
The JSON-LD `Organization` schema block present on all pages has an invalid `logo` field. The `Organization.logo` property must be a **string** (a URL) or an **array of strings**, but it is currently set as an object (likely an `ImageObject`).

**Exact validation error:**
```
Validation: Organization.logo must be a string or array of strings
Organization missing logo
```

**Current (broken) pattern (inferred):**
```json
{
  "@type": "Organization",
  "logo": {
    "@type": "ImageObject",
    "url": "https://..."
  }
}
```

**Fix Required:**
Change the `logo` value to a plain string URL:
```json
{
  "@type": "Organization",
  "logo": "https://codescriet.dev/logo.png"
}
```

> **Note:** If richer image metadata is needed, the correct schema.org approach is to use a top-level `ImageObject` with an `@id`, then reference that `@id` as the logo. But the simplest valid fix is a plain string URL.

**File to edit:** Search for `@type.*Organization` or `json-ld` or `structured.*data` in `apps/web/src/`. Likely in a shared SEO component or `index.html`.

---

### 3. Crawlability — Score: 95/100

#### 3.1 Sitemap Format Errors — ERROR

**Rule:** `crawl/sitemap-valid`
**Severity:** Error
**Docs:** https://docs.squirrelscan.com/rules/crawl/sitemap-valid

**Problem:**
7 sitemap URLs were detected (likely from `robots.txt` or common paths being probed), and all 7 return "Unknown sitemap format" — meaning they either return 404, non-XML content, or malformed XML.

**Affected sitemap URLs:**
- `/sitemap_index.xml`
- `/sitemap-index.xml`
- `/sitemaps.xml`
- `/sitemap1.xml`
- `/post-sitemap.xml`
- `/page-sitemap.xml`
- `/news-sitemap.xml`

**Fix Required:**
Audit which sitemap URL actually exists and is valid. The site should have **exactly one** valid sitemap URL referenced in `robots.txt`. The sitemap must:
- Return HTTP 200
- Contain valid XML with proper `<urlset>` or `<sitemapindex>` root element
- Use UTF-8 encoding

If the site already has a valid sitemap at a different path (e.g., `/sitemap.xml`), ensure `robots.txt` only references that path and no others.

**File to check:** `apps/web/public/robots.txt` and `apps/web/public/sitemap.xml` (or wherever sitemaps are generated/served).

---

### 4. Security — Score: 77/100

> **Note for agents:** All security header issues below require changes at the **infrastructure level** (Cloudflare headers rules or Render custom headers config). These cannot and should not be set in application code. Document these as infrastructure tasks.

#### 4.1 Missing Content-Security-Policy Header — WARNING

**Rule:** `security/csp`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/security/csp

**Problem:**
No `Content-Security-Policy` HTTP response header is set. CSP prevents XSS attacks by declaring which resource origins are allowed to load.

**Fix Required (infrastructure):**
Add a `Content-Security-Policy` header via Cloudflare Transform Rules or Render custom headers. Start with a report-only policy to avoid breaking things:
```
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.codescriet.dev;
```

---

#### 4.2 Missing HSTS Header — WARNING

**Rule:** `security/hsts`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/security/hsts

**Problem:**
No `Strict-Transport-Security` header is set. HSTS forces browsers to always use HTTPS, preventing SSL-stripping downgrade attacks.

**Fix Required (infrastructure):**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
Set this via Cloudflare (enabled by default if on Cloudflare proxy) or Render custom response headers.

---

#### 4.3 Missing X-Frame-Options Header — WARNING

**Rule:** `security/x-frame-options`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/security/x-frame-options

**Problem:**
No `X-Frame-Options` or CSP `frame-ancestors` directive present. This leaves the site vulnerable to clickjacking attacks where the site is embedded inside a malicious iframe.

**Fix Required (infrastructure):**
```
X-Frame-Options: SAMEORIGIN
```

---

#### 4.4 HTTP URLs Redirect to HTTPS — WARNING on all 8 pages

**Rule:** `security/http-to-https`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/security/http-to-https

**Problem:**
HTTP versions of all 8 pages redirect to HTTPS with a 301, which is correct behaviour. However, this rule flags the existence of accessible HTTP URLs at all — meaning the site doesn't enforce HTTPS at the edge before a redirect occurs.

**Redirects found:**
| HTTP URL | Redirects To | Status |
|---|---|---|
| http://codescriet.dev/ | https://codescriet.dev/ | 301 |
| http://codescriet.dev/events | https://codescriet.dev/events | 301 |
| http://codescriet.dev/achievements | https://codescriet.dev/achievements | 301 |
| http://codescriet.dev/network | https://codescriet.dev/network | 301 |
| http://codescriet.dev/announcements | https://codescriet.dev/announcements | 301 |
| http://codescriet.dev/team | https://codescriet.dev/team | 301 |
| http://codescriet.dev/join-us | https://codescriet.dev/join-us | 301 |
| http://codescriet.dev/about | https://codescriet.dev/about | 301 |

**Fix Required (infrastructure):**
Ensure Cloudflare "Always Use HTTPS" is enabled so HTTP requests are upgraded at the CDN edge without a redirect. This eliminates the one-hop redirect latency and prevents any plain-HTTP exposure.

---

### 5. Links — Score: 85/100

> **Note for agents:** The three link issues below (orphan pages, no internal links, dead-end pages) are **SPA false positives**. The React app has a full navigation bar linking to all routes, but the crawler does not execute JavaScript, so it cannot see the nav links. **Do not attempt to fix these by duplicating navigation in static HTML or adding hidden links.**

#### 5.1 Orphan Pages — WARNING (7 pages)

**Rule:** `links/orphan-pages`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/links/orphan-pages

**Problem (SPA false positive):**
The crawler detected 7 pages with fewer than 2 incoming links:
`/events`, `/achievements`, `/network`, `/announcements`, `/team`, `/join-us`, `/about`

**Root cause:** The navbar is JavaScript-rendered. The crawler sees no `<a href>` links in the static HTML shell.

**Action:** No code change needed. If this becomes a real concern for SEO crawlability, consider adding a static `<noscript>` navigation fallback or evaluating SSR/SSG for key routes in the future (out of scope for current fixes).

---

#### 5.2 Too Few Internal Links — WARNING (all 8 pages)

**Rule:** `links/internal-links`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/links/internal-links

**Problem (SPA false positive):**
All 8 pages show 0 internal links because JavaScript navigation is not crawlable.

**Action:** Same as 5.1 — no code change needed at this time.

---

#### 5.3 Dead-End Pages — WARNING (all 8 pages)

**Rule:** `links/dead-end-pages`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/links/dead-end-pages

**Problem (SPA false positive):**
All 8 pages appear to have no outgoing internal links.

**Action:** Same as 5.1 — no code change needed at this time.

---

### 6. Content — Score: 71/100

> **Note for agents:** The content issues (duplicate title, duplicate description, thin content) are partly real and partly SPA false positives.

#### 6.1 Duplicate Titles Across All Pages — WARNING

**Rule:** `content/duplicate-title`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/content/duplicate-title

**Problem (REAL):**
All 8 pages share the identical `<title>` tag. This is a real issue — the `<title>` is in the `<head>` and is visible to crawlers regardless of JS execution.

**Duplicate title:** `"codescriet - official coding club of scriet | code.scriet"` — used on all 8 pages.

**Fix:** See section 1.3 — set unique titles per route.

---

#### 6.2 Duplicate Meta Descriptions Across All Pages — WARNING

**Rule:** `content/duplicate-description`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/content/duplicate-description

**Problem (REAL):**
All 8 pages share an identical meta description. This is a real issue visible to crawlers in `<head>`.

**Duplicate description:** `"the official coding club of scriet, ccs university meerut..."` — used on all 8 pages.

**Fix:** See section 1.2 — set unique, page-specific meta descriptions.

---

#### 6.3 Thin Content (0 words) — WARNING on all 8 pages

**Rule:** `content/word-count`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/content/word-count

**Problem (SPA false positive):**
The crawler detected 0 words on all pages because all visible content is JavaScript-rendered and the crawler sees only the empty HTML shell.

**Action:** No code change needed. This is expected behaviour for a React SPA without SSR.

---

### 7. Performance — Score: 94/100

> **Note for agents:** Performance issues are informational only. Do NOT attempt to optimise the bundle, change Vite config, implement code splitting, or modify CSS loading strategies. These are noted for awareness.

#### 7.1 Slow TTFB (Time to First Byte) — WARNING on 6 pages

**Rule:** `perf/ttfb`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/perf/ttfb

**Problem:**
6 of 8 pages have TTFB in the 720–916ms range, above the 600ms "good" threshold. This is likely caused by Render cold starts on the CDN edge (static sites served from Render have occasional cold-start latency).

**Affected pages and measured TTFB:**
| Page | TTFB |
|---|---|
| `/events` | 720ms |
| `/achievements` | 760ms |
| `/announcements` | 783ms |
| `/about` | 777ms |
| `/team` | 907ms |
| `/join-us` | 916ms |

**Action (infrastructure, not code):**
- Enable Cloudflare caching for static assets and HTML pages.
- Consider enabling Cloudflare "Cache Everything" page rule for the static site.
- Upgrading the Render plan may reduce cold-start latency.

---

#### 7.2 Critical Request Chains — WARNING on all 8 pages

**Rule:** `perf/critical-request-chains`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/perf/critical-request-chains

**Problem:**
2 render-blocking CSS resources are loaded in `<head>`, creating a critical request chain that delays first paint:

1. Google Fonts CSS:
   `https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Sora:wght@400;500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap`
2. Main bundle CSS: `/assets/index-BmgDCfGF.css`

**Action:** Noted for awareness. No change to be made as per instructions (no performance optimisation).

---

### 8. Social Media — Score: 83/100

#### 8.1 OG Image May Be Too Small — WARNING on all 8 pages

**Rule:** `social/og-image-size`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/social/og-image-size

**Problem:**
The `og:image` set on all pages may be below the recommended minimum of **1200×630 pixels**. Images smaller than this appear low-quality or cropped when shared on Facebook, LinkedIn, and other social platforms.

**Fix Required:**
1. Check the current `og:image` URL and verify its actual dimensions.
2. If it is smaller than 1200×630, replace it with a properly sized image.
3. The `og:image` should have a 1.91:1 aspect ratio and be under 8MB.
4. Set the image via the same SEO component that sets titles and descriptions.

**File to edit:** The component or file where `<meta property="og:image">` is set (likely the same SEO component used for titles/descriptions).

---

### 9. Accessibility — Score: 93/100

#### 9.1 No `<main>` Landmark — WARNING on all 8 pages

**Rule:** `a11y/landmark-one-main`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/a11y/landmark-one-main

**Problem:**
No page has a `<main>` element or `role="main"` attribute. Screen readers use landmark elements to help users jump directly to primary content. Without `<main>`, screen reader users must tab through the entire navigation on every page load.

**Affected Pages:** All 8

**Fix Required:**
Wrap the primary page content in each route's component with a `<main>` element.

Example — change:
```jsx
<div className="page-content">
  ...
</div>
```
To:
```jsx
<main className="page-content">
  ...
</main>
```

Or add `role="main"` to an existing wrapper `<div>` if changing the tag would affect CSS:
```jsx
<div role="main" className="page-content">
  ...
</div>
```

**Files to edit:** The layout wrapper component or each individual page component. Look for the top-level content wrapper in `apps/web/src/` — likely a shared `Layout.tsx` or `App.tsx`.

---

#### 9.2 No Skip Link / Bypass Mechanism — WARNING on all 8 pages

**Rule:** `a11y/skip-link`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/a11y/skip-link

**Problem:**
There is no skip navigation link. Keyboard-only users and screen reader users must tab through the entire navigation bar on every page to reach the main content.

**Affected Pages:** All 8

**Fix Required:**
Add a visually hidden skip link as the **very first element** in the `<body>`, which becomes visible on keyboard focus:

```jsx
// In Layout.tsx or App.tsx, before the <nav>:
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded"
>
  Skip to main content
</a>
```

Also add `id="main-content"` to the `<main>` element (from fix 9.1):
```jsx
<main id="main-content" className="page-content">
  ...
</main>
```

**Files to edit:** `apps/web/src/components/Layout.tsx` or equivalent root layout component.

---

#### 9.3 No Landmark Regions (`<main>` missing) — INFO on all 8 pages

**Rule:** `a11y/landmark-regions`
**Severity:** Info
**Docs:** https://docs.squirrelscan.com/rules/a11y/landmark-regions

**Problem:**
Same root cause as 9.1 — no `<main>` element found on any page.

**Fix:** Covered by fix 9.1.

---

### 10. E-E-A-T — Score: 73/100

#### 10.1 No Contact Page — WARNING

**Rule:** `eeat/contact-page`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/eeat/contact-page

**Problem:**
No dedicated contact page was found. Google's E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) guidelines consider the presence of a contact page as a trust signal.

**Fix Required:**
Create a `/contact` route that includes at minimum:
- An email address or contact form
- Links to social media profiles

If a contact section already exists on `/about`, ensure it is clearly labelled "Contact" and consider also having a standalone `/contact` page or adding `contact` to the site's navigation.

---

#### 10.2 No Privacy Policy Page — WARNING

**Rule:** `eeat/privacy-policy`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/eeat/privacy-policy

**Problem:**
No privacy policy page was found linked from the site. A privacy policy is a trust signal for both search engines and users, and is a legal requirement under GDPR, CCPA, and India's DPDP Act for any site that collects user data (registrations, emails, OAuth logins).

**Fix Required:**
1. Create a `/privacy-policy` route with appropriate privacy policy content.
2. Link to it from the site footer on every page.

---

### 11. Legal Compliance — Score: 44/100

#### 11.1 No Privacy Policy Link Found — WARNING

**Rule:** `legal/privacy-policy`
**Severity:** Warning
**Docs:** https://docs.squirrelscan.com/rules/legal/privacy-policy

**Problem:**
No link to a privacy policy was found anywhere across the 8 crawled pages. This is a legal compliance issue — the site collects user accounts, email addresses, and OAuth login data.

**Fix Required:**
Same as 10.2 — create a `/privacy-policy` page and link to it in the footer.

---

## Prioritised Fix Plan for Agents

Issues are ranked by **SEO/legal impact** and **ease of fix**. Only items marked ✅ Fixable in code should be touched. Items marked 🏗 Infrastructure require Cloudflare or Render config changes and must not be touched in application code.

| Priority | Issue | Affected | Fix Location | Status |
|---|---|---|---|---|
| 🔴 P1 | Unique `<title>` per route | All 8 pages | `apps/web/src/` SEO component | ✅ Fixable in code |
| 🔴 P1 | Unique `<meta description>` per route (also shorten to <160 chars) | All 8 pages | `apps/web/src/` SEO component | ✅ Fixable in code |
| 🔴 P1 | Add `<h1>` to every page | All 8 pages | Per-page components | ✅ Fixable in code |
| 🔴 P1 | Fix JSON-LD `Organization.logo` — must be a string URL | All 8 pages | Shared SEO / JSON-LD component | ✅ Fixable in code |
| 🟠 P2 | Add `<main>` landmark to each page | All 8 pages | Layout component | ✅ Fixable in code |
| 🟠 P2 | Add skip navigation link | All 8 pages | Layout component | ✅ Fixable in code |
| 🟠 P2 | Fix `og:image` size to 1200×630px | All 8 pages | SEO component + image asset | ✅ Fixable in code |
| 🟠 P2 | Fix sitemap format errors | `/sitemap.xml` | `apps/web/public/` | ✅ Fixable in code |
| 🟡 P3 | Create `/privacy-policy` page + link in footer | New page | `apps/web/src/` | ✅ Fixable in code |
| 🟡 P3 | Create `/contact` page or contact section | New page | `apps/web/src/` | ✅ Fixable in code |
| 🏗 Infra | Add CSP header | All pages | Cloudflare / Render | 🏗 Infrastructure |
| 🏗 Infra | Add HSTS header | All pages | Cloudflare / Render | 🏗 Infrastructure |
| 🏗 Infra | Add X-Frame-Options header | All pages | Cloudflare / Render | 🏗 Infrastructure |
| 🏗 Infra | Enable HTTPS-only at edge (eliminate HTTP redirect) | All pages | Cloudflare | 🏗 Infrastructure |
| ℹ️ SPA | Thin content (0 words) | All 8 pages | N/A — SPA false positive | ⏭ Skip |
| ℹ️ SPA | Too few internal links | All 8 pages | N/A — SPA false positive | ⏭ Skip |
| ℹ️ SPA | Dead-end / orphan pages | All 8 pages | N/A — SPA false positive | ⏭ Skip |
| ℹ️ Perf | Slow TTFB (720–916ms) | 6 pages | Cloudflare caching / Render plan | ⏭ Skip (no code change) |
| ℹ️ Perf | Critical request chains (Google Fonts, main CSS) | All 8 pages | N/A — no optimisation per instructions | ⏭ Skip |

---

## Key Files for Code Fixes

Based on the project structure, the most relevant files for the code-level fixes above are:

| Fix | Likely File(s) |
|---|---|
| Page titles, meta descriptions, og:image | `apps/web/src/App.tsx` or a shared `SEO.tsx` / `Helmet` wrapper |
| JSON-LD structured data | `apps/web/src/` — search for `@type` or `application/ld+json` |
| H1 tags | Per-page components under `apps/web/src/pages/` or `apps/web/src/components/` |
| `<main>` landmark + skip link | Layout component, likely `apps/web/src/components/Layout.tsx` or `App.tsx` |
| Sitemap | `apps/web/public/sitemap.xml` and `apps/web/public/robots.txt` |
| Privacy policy page | New route in `apps/web/src/App.tsx` + new page component |
| Footer privacy link | Footer component in `apps/web/src/components/` |

---

*Report generated from squirrelscan audit ID `8a9c9703` on 2026-03-12.*
*Tool: squirrelscan v0.0.38 | Site: https://codescriet.dev | Pages crawled: 8*
