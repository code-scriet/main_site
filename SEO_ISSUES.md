# SEO Issues & Fix Guide — codescriet.dev
> **Audience:** Claude Opus 4.6 or any developer. Each issue has the exact file(s) to edit, the exact change to make, and the reason behind it.
> **Last audited:** 2026-03-12

---

## How to Use This File

Work through issues in order (P0 first). Each issue block tells you:
- **What is wrong** — plain description
- **Where to fix it** — exact file paths and line numbers (approximate)
- **How to fix it** — exact code to write or change
- **Why it matters** — so you understand the goal

---

## ISSUE 1 — Google Shows "Codescript" Instead of "Codescriet" (Brand Confusion)
**Priority: P0 | Type: Brand/Keyword Authority**

### What is wrong
When someone searches for "codescriet" on Google, it shows a "Did you mean: codescript?" correction and sometimes surfaces results for "codescript" instead of this site. When someone searches "scriet" or "code scriet" the site doesn't appear at all. Google doesn't recognise "codescriet" and "scriet" as real entities yet.

### Why this happens
Google's spell-correction system kicks in when it hasn't seen enough signals confirming "codescriet" is the intended spelling. To override this, the brand name needs to:
1. Appear consistently spelled across the web (backlinks, social profiles, citations)
2. Be reinforced in structured data with `alternateName` fields
3. Have enough search volume history for the exact term

### How to fix it

#### Step 1 — Strengthen structured data brand signals in `apps/web/index.html`

Find the Organization JSON-LD block (around line 52–90) and update the `alternateName` array to list every variation someone might type:

```json
"alternateName": [
  "code.scriet",
  "code scriet",
  "codescriet club",
  "codescriet coding club",
  "scriet coding club",
  "SCRIET coding club",
  "scriet club",
  "scriet",
  "code scriet meerut",
  "codescriet meerut",
  "codescriet ccs university",
  "coding club scriet",
  "coding club meerut"
]
```

Also add a `disambiguatingDescription` field to tell Google this is NOT codescript:

```json
"disambiguatingDescription": "codescriet (spelled c-o-d-e-s-c-r-i-e-t) is the official coding club of SCRIET college, CCS University Meerut. It is distinct from and unrelated to 'codescript'."
```

#### Step 2 — Add a dedicated `AboutPage` schema in `apps/web/index.html`

Add a fourth JSON-LD block that makes the brand name unmistakable:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": "https://codescriet.dev/about#webpage",
  "name": "About codescriet — Official Coding Club of SCRIET",
  "description": "codescriet is the official coding club of SCRIET (Swami Keshvanand Institute of Engineering Management and Gramothan), CCS University Meerut. The name codescriet combines 'code' and 'SCRIET'.",
  "url": "https://codescriet.dev/about",
  "isPartOf": { "@id": "https://codescriet.dev/#website" },
  "about": { "@id": "https://codescriet.dev/#organization" }
}
</script>
```

#### Step 3 — Rewrite the homepage H1 and first paragraph in `apps/web/src/pages/HomePage.tsx`

Find the main hero heading and make sure it says the full brand name clearly. Also add a visible sentence that spells out what "codescriet" means. Example (adapt to your existing design):

```tsx
<h1>codescriet — Official Coding Club of SCRIET</h1>
<p>
  codescriet (code + SCRIET) is the official coding club of SCRIET,
  Chaudhary Charan Singh University, Meerut. We are also known as
  code.scriet and code scriet.
</p>
```

This paragraph goes into the indexed text Google reads. It reinforces that "codescriet" and "scriet" are intentional spellings.

#### Step 4 — Update the About page content in `apps/web/src/pages/AboutPage.tsx`

Add an explicit paragraph that Google can read:

```tsx
<p>
  Our club name, codescriet, combines "code" and "SCRIET"
  (Swami Keshvanand Institute of Engineering Management and Gramothan).
  You may also find us as code.scriet or code scriet across social media.
  We are the official coding club of SCRIET, CCS University Meerut —
  not to be confused with any other organization.
</p>
```

#### Step 5 — Off-page actions (cannot be done in code — manual tasks)

These are equally important. Do all of them:

1. **Google Search Console → Search appearance → Sitelinks**: If the wrong sitelinks appear, demote them.
2. **Create a Wikipedia / Wikidata entry** for "codescriet" (even a stub). Wikipedia is the strongest brand disambiguation signal Google uses.
3. **Ensure your Instagram bio** says "codescriet | Official Coding Club of SCRIET" (exact spelling).
4. **Ensure your LinkedIn page name** is "codescriet" (not "code scriet" or any variation).
5. **Ask your college SCRIET to link to `https://codescriet.dev`** from their official website with anchor text "codescriet coding club". An `.edu`/`.ac.in` backlink is extremely powerful for brand authority.
6. **Submit to Google Search Console** and use the URL Inspection tool to request indexing of the homepage, `/about`, and `/team` pages.
7. **Use IndexNow** — the codebase already has this. Hit the admin endpoint `POST /api/indexnow/submit-all` after every content update to push URLs to Bing and Google instantly.

#### Step 6 — Add "scriet" as a keyword anchor in page titles

In `apps/web/src/pages/AboutPage.tsx`, ensure the SEO component title includes "SCRIET":

```tsx
<SEO
  title="About codescriet — SCRIET's Official Coding Club, CCS University Meerut"
  description="codescriet is the official coding club of SCRIET, CCS University Meerut. Known as code.scriet or code scriet, we run events in DSA, competitive programming, and web development."
/>
```

---

## ISSUE 2 — Broken Sitemap (Google Cannot Discover All URLs)
**Priority: P0 | Type: Crawlability**

### What is wrong
`codescriet.dev/sitemap.xml` is a sitemap *index* that points to `https://api.codescriet.dev/sitemap.xml`. That API URL fails with a connection error whenever the Render backend is in cold-start (sleeping). Google tries to fetch the sitemap, gets an error, and stops discovering dynamic URLs (event pages, announcements, network profiles).

### Files involved
- `apps/web/public/sitemap.xml` (the index file that exists in the frontend public folder, or wherever this is generated)
- `apps/api/src/routes/sitemap.ts` (the real sitemap generator)

### How to fix it

**Option A — Best: Move sitemap to frontend build step**

Create a script `scripts/generate-sitemap.js` that:
1. Queries the database (or calls the API) for all slugs
2. Writes a complete `sitemap.xml` to `apps/web/public/sitemap.xml`
3. Runs as part of `npm run build:web`

Then delete the sitemap index approach entirely.

**Option B — Quick fix: Add a frontend proxy route**

Instead of serving a sitemap index, make the frontend serve a sitemap that is fetched from the API with a fallback. In Vite config, add a dev proxy. In production (Render static site), use a redirect rule that points `/sitemap.xml` to `https://api.codescriet.dev/sitemap.xml` directly (bypassing the index). Add a Render redirect in `render.yaml`.

**Option C — Minimal: Keep-alive before sitemap**

In `apps/api/src/routes/sitemap.ts`, the sitemap already generates successfully when the API is warm. The problem is Render's free tier sleeps after inactivity. Make sure the `keep-alive` ping (the 4-minute SELECT 1 scheduler) is running reliably so the API is never cold when Google crawls.

Verify in `apps/api/src/utils/scheduler.ts` that the keep-alive job is active and not disabled.

### Verification
After fixing, visit `https://codescriet.dev/sitemap.xml` in your browser. It should return XML directly (not an index pointing elsewhere) and should work even if you just deployed fresh.

---

## ISSUE 3 — OG Image Dimensions Are Wrong (Broken Social Cards)
**Priority: P1 | Type: Social Sharing**

### What is wrong
`apps/web/index.html` declares the OG image as 1200×630 but the actual `/logo.jpeg` is 512×512. When someone shares a link on Twitter, LinkedIn, or Slack, the card may be cropped, distorted, or rejected because the declared dimensions don't match reality.

### File to edit
`apps/web/index.html` — around lines 37–38

### How to fix it

**Option A — Update declared dimensions to match reality (fastest fix)**

Change lines 37–38:
```html
<!-- BEFORE -->
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<!-- AFTER -->
<meta property="og:image:width" content="512" />
<meta property="og:image:height" content="512" />
```

Also change the `twitter:card` to `summary` instead of `summary_large_image` since the image is square:
```html
<meta name="twitter:card" content="summary" />
```

**Option B — Create a proper 1200×630 OG image (recommended)**

1. Design a 1200×630 banner image (Figma, Canva, etc.) with the logo, club name, and a tagline
2. Save it as `apps/web/public/og-image.jpg`
3. Update `index.html` to reference it:
```html
<meta property="og:image" content="https://codescriet.dev/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="twitter:image" content="https://codescriet.dev/og-image.jpg" />
```
4. Update `SEO.tsx` — change `DEFAULT_IMAGE` to `${BASE_URL}/og-image.jpg`

---

## ISSUE 4 — Meta Description Too Long and Has Keyword Stuffing
**Priority: P1 | Type: On-Page SEO**

### What is wrong
The homepage meta description is ~220 characters (max is 160). Google truncates it in search results, cutting off important information. The word "codescriet" appears 4 times in a single sentence, which looks like keyword stuffing.

### File to edit
`apps/web/index.html` — line 20

### How to fix it

```html
<!-- BEFORE -->
<meta name="description" content="codescriet (code.scriet, code scriet) - The Official Coding Club of SCRIET, CCS University Meerut. Join codescriet for DSA, competitive programming, hackathons, web development workshops, and tech events. codescriet is Meerut's most active coding community." />

<!-- AFTER -->
<meta name="description" content="The official coding club of SCRIET, CCS University Meerut. Join code.scriet for DSA, competitive programming, hackathons, and tech events. Meerut's most active coding community — est. 2022." />
```

This is 156 characters — within the 160 limit, reads naturally, still contains key terms.

Also update `DEFAULT_DESCRIPTION` in `apps/web/src/components/SEO.tsx` — line 15 — to the same value.

---

## ISSUE 5 — Remove `<meta name="keywords">` Tag
**Priority: P2 | Type: On-Page SEO**

### What is wrong
Google has ignored the `keywords` meta tag since 2009. Bing treats a long keywords list as a potential spam signal. This tag has no upside and a small downside.

### Files to edit
- `apps/web/index.html` — line 21 (remove the entire `<meta name="keywords" ...>` line)
- `apps/web/src/components/SEO.tsx` — remove the `keywords` prop and the `updateMetaTag('meta[name="keywords"]', ...)` call (around lines 4, 17, 84)

### How to fix it

In `index.html`, delete this line entirely:
```html
<meta name="keywords" content="codescriet, code scriet, ..." />
```

In `SEO.tsx`, remove the `keywords` prop from the interface, remove the default constant, and remove this call in `useEffect`:
```ts
// DELETE this line:
updateMetaTag('meta[name="keywords"]', 'content', keywords);
```

---

## ISSUE 6 — No Event Schema on Event Detail Pages
**Priority: P2 | Type: Rich Results / Structured Data**

### What is wrong
Individual event pages (`/events/some-event-slug`) don't include `schema.org/Event` structured data. Google can show **event rich results** (date, location, ticket link) in search results for pages that have this. This is a missed opportunity for higher click-through rates.

### File to edit
`apps/web/src/pages/EventDetailPage.tsx`

### How to fix it

After the event data is loaded (after the `if (loading || !event)` guard), add a `useEffect` that injects a JSON-LD script tag. Add this inside the component, below the existing `SEO` component usage:

```tsx
useEffect(() => {
  if (!event) return;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": event.title,
    "description": event.shortDescription || event.description.slice(0, 300),
    "url": `https://codescriet.dev/events/${event.slug}`,
    "image": event.bannerImage || "https://codescriet.dev/logo.jpeg",
    "startDate": event.startDate,
    "endDate": event.endDate || event.startDate,
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": {
      "@type": "Place",
      "name": event.venue || "SCRIET, CCS University Meerut",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Meerut",
        "addressRegion": "Uttar Pradesh",
        "addressCountry": "IN"
      }
    },
    "organizer": {
      "@type": "Organization",
      "name": "codescriet",
      "url": "https://codescriet.dev"
    }
  };

  const scriptId = 'event-schema';
  let el = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = scriptId;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);

  return () => {
    document.getElementById(scriptId)?.remove();
  };
}, [event]);
```

Check your `event` object fields (slug, title, startDate, venue, etc.) and adjust property names to match what the API returns.

---

## ISSUE 7 — No Article Schema on Announcement Detail Pages
**Priority: P2 | Type: Rich Results / Structured Data**

### What is wrong
Announcement pages (`/announcements/some-slug`) don't have `Article` structured data. This can improve how Google displays these pages in search results.

### File to edit
`apps/web/src/pages/AnnouncementDetailPage.tsx`

### How to fix it

Add this `useEffect` inside the component after the data loads (adapt field names to match your actual API response):

```tsx
useEffect(() => {
  if (!announcement) return;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": announcement.title,
    "description": announcement.shortDescription || announcement.body.slice(0, 200),
    "url": `https://codescriet.dev/announcements/${announcement.slug}`,
    "datePublished": announcement.createdAt,
    "dateModified": announcement.updatedAt,
    "publisher": {
      "@type": "Organization",
      "name": "codescriet",
      "logo": {
        "@type": "ImageObject",
        "url": "https://codescriet.dev/logo.jpeg"
      }
    },
    "author": {
      "@type": "Organization",
      "name": "codescriet"
    }
  };

  const scriptId = 'article-schema';
  let el = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = scriptId;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);

  return () => {
    document.getElementById(scriptId)?.remove();
  };
}, [announcement]);
```

---

## ISSUE 8 — Static Breadcrumb Schema Doesn't Match Current Page
**Priority: P3 | Type: Structured Data**

### What is wrong
The BreadcrumbList in `apps/web/index.html` always shows `Home → Events → Team → Network` regardless of which page is open. On an event detail page, it should show `Home → Events → [Event Name]`. Google sees the wrong breadcrumb on every page.

### How to fix it

Remove the BreadcrumbList from `index.html` entirely (the `<script type="application/ld+json">` block for BreadcrumbList around lines 117–149).

Then add breadcrumb injection per-page. Create a reusable helper in `apps/web/src/components/SEO.tsx`. Add an optional `breadcrumbs` prop:

```tsx
interface BreadcrumbItem {
  name: string;
  url: string;
}

interface SEOProps {
  // ... existing props ...
  breadcrumbs?: BreadcrumbItem[];
}
```

Inside the `useEffect`, add:

```tsx
if (breadcrumbs && breadcrumbs.length > 0) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}`
    }))
  };
  const scriptId = 'breadcrumb-schema';
  let el = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = scriptId;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(schema);
}
```

Then in `EventDetailPage.tsx`:
```tsx
<SEO
  title={event.title}
  description={...}
  breadcrumbs={[
    { name: 'Home', url: '/' },
    { name: 'Events', url: '/events' },
    { name: event.title, url: `/events/${event.slug}` }
  ]}
/>
```

---

## ISSUE 9 — `no-cache, no-store` Meta Tags on HTML Shell
**Priority: P3 | Type: Performance / Caching**

### What is wrong
`apps/web/index.html` contains:
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

These prevent the browser from caching the HTML shell. Every visit re-downloads the full HTML even for repeat visitors, increasing load time and TTFB (Time to First Byte). This hurts Core Web Vitals scores.

### File to edit
`apps/web/index.html` — lines 5–7

### How to fix it

Delete all three lines:
```html
<!-- DELETE THESE 3 LINES -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

Instead, configure proper cache headers at the Render static site level. In `render.yaml`, Render supports custom headers. Add:

```yaml
headers:
  - path: /index.html
    name: Cache-Control
    value: public, max-age=0, must-revalidate
  - path: /assets/*
    name: Cache-Control
    value: public, max-age=31536000, immutable
```

The `/assets/*` pattern covers Vite's hashed JS/CSS bundles — these can be cached for a year because their filenames change on every build. The `index.html` itself should revalidate on every visit but can be served from cache if unchanged.

---

## ISSUE 10 — Missing `twitter:site` Handle
**Priority: P4 | Type: Social Metadata**

### What is wrong
The Twitter/X card meta is missing a `twitter:site` attribute. This is the Twitter handle of the website owner. It improves attribution on X.

### File to edit
`apps/web/index.html` — after line 48

### How to fix it

Add after the existing Twitter meta tags:
```html
<meta name="twitter:site" content="@codescriet" />
<meta name="twitter:creator" content="@codescriet" />
```

Replace `@codescriet` with your actual X/Twitter handle if it's different.

---

## ISSUE 11 — Favicon Only in One Format/Size
**Priority: P4 | Type: Branding / UX**

### What is wrong
Only one favicon is defined (a JPEG). Browsers and operating systems expect multiple sizes (16px, 32px, 180px for Apple, 192px for Android). JPEG doesn't support transparency so the favicon looks bad on dark backgrounds.

### Files to create / edit
- Create `apps/web/public/favicon-16x16.png`
- Create `apps/web/public/favicon-32x32.png`
- Create `apps/web/public/apple-touch-icon.png` (180×180)
- Create `apps/web/public/favicon-192x192.png`
- Create `apps/web/public/site.webmanifest`
- Edit `apps/web/index.html` lines 8–9

### How to fix it

1. Export the logo as PNG in 16×16, 32×32, 180×180, and 192×192 sizes.
2. Replace the favicon links in `index.html`:

```html
<!-- REPLACE lines 8–9 with: -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
```

3. Create `apps/web/public/site.webmanifest`:

```json
{
  "name": "codescriet",
  "short_name": "codescriet",
  "description": "Official Coding Club of SCRIET, CCS University Meerut",
  "icons": [
    { "src": "/favicon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "start_url": "/",
  "display": "browser",
  "theme_color": "#f97316",
  "background_color": "#ffffff"
}
```

---

## ISSUE 12 — No Prerendering for Social Crawlers (Fundamental Limitation)
**Priority: Long-term | Type: Architecture**

### What is wrong
The entire site is a client-side React SPA. All meta tags are set via JavaScript `useEffect` after the page loads. Social media crawlers (Twitter, LinkedIn, Slack, WhatsApp, iMessage, Facebook) **do not run JavaScript**. They only read the static HTML. This means:

- Sharing any URL on LinkedIn/Slack/Twitter shows the generic homepage title and description — not the specific event or announcement title.
- The correct meta tags are only visible to Google (which renders JS) and to actual users in a browser.

### Evidence
The `SEO.tsx` component uses `useEffect` which is a client-side-only React hook. Any bot that doesn't render JS sees whatever is in `index.html` at build time.

### How to fix it (in order of effort)

**Option A — Minimal: Edge-side OG tag injection (recommended for this stack)**

Add a Cloudflare Worker (you already use CF for the code executor) that intercepts requests from social crawlers and injects correct meta tags.

The worker checks `User-Agent` for known bots (`Twitterbot`, `LinkedInBot`, `Slackbot`, etc.), fetches the event/announcement data from the API, and returns a minimal HTML page with only the correct meta tags. Non-bot requests pass through to the static site normally.

In `workers/` directory, create `og-worker.js`:
```js
const BOT_AGENTS = ['Twitterbot', 'LinkedInBot', 'Slackbot', 'facebookexternalhit', 'WhatsApp', 'Discordbot'];

export default {
  async fetch(request, env) {
    const ua = request.headers.get('User-Agent') || '';
    const isBot = BOT_AGENTS.some(bot => ua.includes(bot));

    if (!isBot) {
      return fetch(request); // Pass through to static site
    }

    const url = new URL(request.url);
    // Parse path to determine content type
    const parts = url.pathname.split('/').filter(Boolean);

    let title = 'codescriet — Official Coding Club of SCRIET';
    let description = 'The official coding club of SCRIET, CCS University Meerut.';
    let image = 'https://codescriet.dev/og-image.jpg';

    if (parts[0] === 'events' && parts[1]) {
      const apiRes = await fetch(`https://api.codescriet.dev/api/events/${parts[1]}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        const event = data.data || data;
        title = `${event.title} | codescriet`;
        description = event.shortDescription || event.description?.slice(0, 160) || description;
        if (event.bannerImage) image = event.bannerImage;
      }
    }

    // Return minimal HTML with correct OG tags for the bot
    return new Response(`<!DOCTYPE html><html><head>
      <title>${title}</title>
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:image" content="${image}" />
      <meta property="og:url" content="${url.href}" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title}" />
      <meta name="twitter:description" content="${description}" />
      <meta name="twitter:image" content="${image}" />
    </head><body></body></html>`, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
```

**Option B — Full SSR with Vike (vite-plugin-ssr)**

This is a larger refactor. See https://vike.dev for docs. It adds server-side rendering to your existing Vite+React setup.

**Option C — Static prerendering with `vite-ssg`**

For pages that don't need auth, pre-generate HTML at build time. Works well for `/events`, `/about`, `/team`, `/network` public pages.

---

## Summary Table

| # | Issue | File(s) | Effort | Impact |
|---|-------|---------|--------|--------|
| 1 | Google shows "codescript" / brand confusion | `index.html`, `HomePage.tsx`, `AboutPage.tsx` | Medium | Critical |
| 2 | Broken sitemap (API cold-start) | `apps/api/src/routes/sitemap.ts`, `render.yaml` | Medium | Critical |
| 3 | OG image dimensions wrong (512px declared as 1200×630) | `index.html`, `SEO.tsx` | Low | High |
| 4 | Meta description too long + keyword stuffing | `index.html`, `SEO.tsx` | Low | High |
| 5 | `<meta name="keywords">` tag (Google ignores, Bing flags spam) | `index.html`, `SEO.tsx` | Low | Medium |
| 6 | No Event schema on event detail pages | `EventDetailPage.tsx` | Medium | High |
| 7 | No Article schema on announcement pages | `AnnouncementDetailPage.tsx` | Medium | Medium |
| 8 | Breadcrumb schema is static / wrong on all pages | `index.html`, `SEO.tsx`, detail pages | Medium | Medium |
| 9 | `no-cache, no-store` meta on HTML shell hurts performance | `index.html`, `render.yaml` | Low | Medium |
| 10 | Missing `twitter:site` handle | `index.html` | Low | Low |
| 11 | Favicon only one size, JPEG format | `index.html`, `public/` | Low | Low |
| 12 | No prerendering — social crawlers see wrong meta | New CF worker or SSR setup | High | Very High |

---

## Ranking Strategy for "codescriet", "scriet", "code scriet"

These three searches are your primary brand keywords. Here is what drives them:

### Signal 1 — Content Mentions (On-Page)
Every public page should mention "codescriet", "SCRIET", and "code scriet" at least once in visible text (not just meta tags). Google reads visible text, not hidden attributes.

### Signal 2 — Structured Data Consistency
The `alternateName` field in the Organization schema (Issue 1, Step 1) tells Google's Knowledge Graph that these are all the same entity.

### Signal 3 — Inbound Links with Correct Anchor Text
Ask your college departments, professors, and student clubs to link to `https://codescriet.dev` with the anchor text "codescriet" or "SCRIET coding club". Even 5–10 such links from the college's own domain (`.ac.in`) will dramatically improve brand recognition.

### Signal 4 — Google Search Console — Verified Ownership
Make sure the site is verified in Google Search Console. Go to https://search.google.com/search-console and verify ownership. Then submit your sitemap once Issue 2 is fixed. Use the URL Inspection tool to request indexing of key pages.

### Signal 5 — Page Experience Signals
Google ranks pages higher when users don't immediately bounce. If someone searches "codescriet", lands on the homepage, and immediately leaves — that's a negative signal. Make the homepage immediately answer "this is codescriet, the coding club of SCRIET" within the first screen so visitors stay.

### Signal 6 — IndexNow (Already Implemented)
The codebase has IndexNow. Use the admin endpoint `POST /api/indexnow/submit-all` every time major content is added. This pushes URLs to Microsoft/Bing immediately and speeds up Google discovery too.

### Timeline Expectation
- Brand confusion fix (Issue 1): Visible improvement in 4–8 weeks after Google recrawls
- Sitemap fix (Issue 2): Indexing of all pages within 1–2 weeks after fix
- Ranking for "codescriet": Should appear as top result within 4–8 weeks once brand signals are strengthened and college backlink is obtained
- Ranking for "scriet": Harder — more competitive. Requires college backlink + 2–3 months of consistent content
