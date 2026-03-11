# Manual SEO & Brand Tasks — codescriet.dev

> These are tasks that **cannot be done through code** and require manual action by you. They are critical for improving search rankings and brand recognition.

---

## PRIORITY 1 — Brand Authority (Do These First)

### 1. Get a Backlink from SCRIET's Official College Website
**Impact: Extremely High | Effort: Medium**

Ask the SCRIET college administration or IT team to add a link to `https://codescriet.dev` on the college's official website, ideally with anchor text:
- "codescriet coding club" or
- "official coding club — codescriet"

An `.ac.in` or `.edu.in` backlink is the single most powerful signal for brand authority. Even one such link will dramatically improve Google's recognition of "codescriet" as a real entity.

**Who to contact:** HOD, Dean, or the webmaster who manages the college website.

---

### 2. Verify Site in Google Search Console
**Impact: Very High | Effort: Low**

1. Go to [https://search.google.com/search-console](https://search.google.com/search-console)
2. Add `https://codescriet.dev` as a property
3. Verify ownership via DNS TXT record or the HTML tag method
4. Submit the sitemap URL: `https://codescriet.dev/sitemap.xml`
5. Use the **URL Inspection** tool to request indexing of:
   - `https://codescriet.dev/`
   - `https://codescriet.dev/about`
   - `https://codescriet.dev/events`
   - `https://codescriet.dev/team`
   - `https://codescriet.dev/network`
6. Check **Search appearance → Sitelinks** — if wrong sitelinks appear, demote them

---

### 3. Verify Site in Bing Webmaster Tools
**Impact: Medium | Effort: Low**

1. Go to [https://www.bing.com/webmasters](https://www.bing.com/webmasters)
2. Add and verify `https://codescriet.dev`
3. Submit the sitemap
4. This helps with Bing rankings AND feeds into IndexNow discovery

---

### 4. Use IndexNow After Every Content Update
**Impact: High | Effort: Very Low**

After every deployment with new content (events, announcements, achievements), trigger the IndexNow submission:

```
POST https://api.codescriet.dev/api/indexnow/submit-all
```

This pushes all URLs directly to Bing and speeds up Google discovery. The endpoint is already implemented in your codebase.

---

## PRIORITY 2 — Social Media Brand Consistency

### 5. Update Instagram Bio
**Impact: Medium | Effort: Very Low**

Make sure the Instagram bio says exactly:
> **codescriet** | Official Coding Club of SCRIET

Include the website URL: `https://codescriet.dev`

The exact spelling "codescriet" (not "code.scriet" or "Code Scriet") must be the primary name shown.

---

### 6. Update LinkedIn Company Page
**Impact: Medium | Effort: Very Low**

1. Ensure the LinkedIn page name is exactly **codescriet**
2. In the "About" section, include: "codescriet (also known as code.scriet) is the official coding club of SCRIET, CCS University Meerut."
3. Add the website URL: `https://codescriet.dev`

---

### 7. Verify Twitter/X Handle
**Impact: Low–Medium | Effort: Very Low**

If the X/Twitter handle is different from `@codescriet`, update the `twitter:site` and `twitter:creator` meta tags in `apps/web/index.html` to match your actual handle.

---

## PRIORITY 3 — OG Image & Favicons

### 8. Create a proper 1200×630 OG Banner Image
**Impact: High | Effort: Low**

The current OG image is a 512×512 logo. For optimal social sharing cards:

1. Design a 1200×630 banner in Figma/Canva with:
   - The codescriet logo
   - Club name "codescriet"
   - Tagline: "Official Coding Club of SCRIET"
   - Brand colors (amber/orange gradient)
2. Export as `og-image.jpg` and save to `apps/web/public/og-image.jpg`
3. Then update `apps/web/index.html`:
   ```html
   <meta property="og:image" content="https://codescriet.dev/og-image.jpg" />
   <meta property="og:image:width" content="1200" />
   <meta property="og:image:height" content="630" />
   <meta name="twitter:card" content="summary_large_image" />
   <meta name="twitter:image" content="https://codescriet.dev/og-image.jpg" />
   ```

---

### 9. Create Multi-Size Favicon PNGs
**Impact: Low | Effort: Low**

Export the logo as transparent PNG in these sizes:
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png` (180×180)
- `favicon-192x192.png`
- `favicon-512x512.png`

Save them to `apps/web/public/` and update the favicon links in `index.html`:
```html
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

Also update `apps/web/public/site.webmanifest` to reference the PNG icons.

---

## PRIORITY 4 — Deploy the OG Worker

### 10. Deploy the Cloudflare OG Worker
**Impact: Very High | Effort: Medium**

A Cloudflare Worker has been created at `workers/og-worker.js`. It intercepts social media bot requests and returns correct OG meta tags for each page (events, announcements, etc.).

**Steps to deploy:**
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create
2. Name it `codescriet-og` (or similar)
3. Paste the contents of `workers/og-worker.js`
4. Deploy
5. Go to **Triggers** → Add Route: `codescriet.dev/*` → `codescriet-og` worker
6. Test by checking a shared link with [https://cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator) or [https://www.opengraph.xyz/](https://www.opengraph.xyz/)

**Without this worker**, sharing any URL on Twitter/LinkedIn/Slack shows the generic homepage title because social crawlers don't execute JavaScript.

---

## PRIORITY 5 — Knowledge Graph & Wikipedia

### 11. Create a Wikidata Entry for "codescriet"
**Impact: Very High (long-term) | Effort: Medium**

Wikipedia/Wikidata is the strongest brand disambiguation signal Google uses. Even a stub entry helps.

1. Go to [https://www.wikidata.org](https://www.wikidata.org)
2. Create a new item for "codescriet"
3. Set type: Student organization / Coding club
4. Add: official website = `https://codescriet.dev`
5. Add: parent = CCS University Meerut
6. Add: social media links (Instagram, LinkedIn)

This tells Google's Knowledge Graph that "codescriet" is a real entity, distinct from "codescript."

---

### 12. Ask Others to Search for "codescriet" on Google
**Impact: Medium | Effort: Low**

Google's spell-correction loosens when it sees real search volume for a term. Ask club members and students to:
1. Search for **"codescriet"** on Google
2. Click on the result if it appears
3. Do NOT search for "codescript" — always use the correct spelling

Over time this trains Google that "codescriet" is an intentional search.

---

## PRIORITY 6 — Backlinks & Citations

### 13. Get Backlinks from Student & Tech Communities
**Impact: High | Effort: Medium-High**

Pursue links from:
- Other college clubs' websites
- Tech community blogs (dev.to, hashnode, medium — write articles mentioning "codescriet")
- Event listing platforms (if you host public events, list them on platforms like Meetup, Devfolio, etc.)
- Student organization directories

Each backlink with the anchor text "codescriet" reinforces brand authority.

---

### 14. Publish Articles on Dev Platforms
**Impact: Medium | Effort: Medium**

Write 2–3 articles on dev.to or Hashnode about events, learnings, or technical topics. Include:
- Author line: "By the codescriet team"
- Link back to `https://codescriet.dev`
- Mention "codescriet" and "SCRIET" naturally in the text

---

## Timeline Expectations

| Action | Expected Impact Timeframe |
|--------|--------------------------|
| College `.ac.in` backlink | 2–4 weeks after link goes live |
| Google Search Console verification + sitemap | 1–2 weeks for full indexing |
| Brand confusion fix (Issue 1 code changes) | 4–8 weeks after Google recrawls |
| OG Worker deployment | Immediate for social sharing |
| Wikidata entry | 4–12 weeks for Knowledge Graph pickup |
| Ranking for "codescriet" | Top result within 4–8 weeks with college backlink |
| Ranking for "scriet" | Harder — 2–3 months of consistent signals |

---

## Checklist

- [ ] Get SCRIET college backlink
- [ ] Verify in Google Search Console
- [ ] Submit sitemap in GSC
- [ ] Verify in Bing Webmaster Tools
- [ ] Trigger IndexNow submission
- [ ] Update Instagram bio spelling
- [ ] Update LinkedIn page name & about
- [ ] Confirm Twitter/X handle matches meta tags
- [ ] Create 1200×630 OG banner image
- [ ] Create multi-size favicon PNGs
- [ ] Deploy OG Cloudflare Worker
- [ ] Create Wikidata entry
- [ ] Write 2–3 articles on dev.to/Hashnode
- [ ] Get 3–5 backlinks from tech communities
