# SEO Optimization Guide for CodeScriet

## Overview
This guide explains how to optimize your events, achievements, and pages for search engines to rank higher on Google. Following these practices will significantly improve organic visibility.

---

## 1. Quick Wins (Implement First)

### 1.1 Update Your Sitemap
The site now generates a dynamic XML sitemap automatically:
- **Location**: `https://api.codescriet.dev/sitemap.xml` (served from API server)
- **What it does**: Tells Google about all your events, achievements, AND announcements
- **Refresh rate**: Updated every hour automatically
- **Action required**: None! It's automatic.

Verify it's working:
```bash
# Visit in your browser
https://api.codescriet.dev/sitemap.xml
```

### 1.2 Check Robots.txt
- **Location**: `https://codescriet.dev/robots.txt` (static file on frontend)
- **What it does**: Tells search engines what to index and what to skip
- **Current rules**:
  - ✅ Index all public pages
  - ✅ Skip admin and API endpoints
  - ✅ Points to dynamic sitemap on API server

### 1.3 Submit to Google
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add your site domain (`codescriet.dev`)
3. Upload sitemap URL: `https://api.codescriet.dev/sitemap.xml`
4. Request indexing for key pages

---

## 2. Featured Flag Strategy

### Why It Matters
Content marked as **featured** gets higher priority in Google rankings. Use this strategically!

### How to Use Featured
- **Events Page**: Mark 3-5 most important events as featured
- **Achievements Page**: Mark your best/most recent achievements as featured
- **Ranking boost**: Featured content gets 0.85 priority vs 0.70 for others

### Best Practices
- ✅ Update featured content monthly
- ✅ Feature events as soon as announced
- ✅ Feature major achievement milestones
- ❌ Don't feature everything (dilutes effect)
- ❌ Don't leave same content featured for >3 months

---

## 3. Content Optimization

### 3.1 Event Descriptions
Write descriptions for Google AND humans:

**Title Format** (40-60 characters)
```
✅ Good: "Annual CodeFest 2026 - Competitive Programming"
❌ Bad: "Event" or "CodeFest"
```

**Short Description** (130-160 characters)
```
✅ Good: "Join our flagship competitive programming event. 
Solve DSA problems, compete with peers, win prizes. 
Perfect for improving coding skills."

❌ Bad: "Fun event. Come participate." or too generic
```

**Full Description** (use Markdown)
```markdown
- Use clear heading hierarchy (# ## ###)
- Add **bold** for important keywords
- Include dates, times, prerequisites
- Link to registration page
- Add relevant hashtags
- Include speaker/organizer names
```

**Keywords to Include**
```
- Event name, type (workshop, hackathon, etc)
- Skills: DSA, Web Dev, Mobile, AI/ML, etc
- Target audience: "for beginners", "intermediate level"
- Location: "Online", "SCRIET Campus"
- Benefits: "prizes", "networking", "certificate"
```

### 3.2 Achievement Descriptions

**Title Format** (40-60 characters)
```
✅ Good: "Won Best Backend Team at CodeFest 2026"
❌ Bad: "Achievement" or "Winner"
```

**Short Description** (130-160 characters)
```
✅ Good: "Recognition for outstanding backend architecture 
and team coordination at CodeFest 2026. 
Demonstrates expertise in system design."

❌ Bad: "We won" or just the team name
```

**Full Content** (Markdown supported)
```markdown
## About This Achievement
- Team member names and roles
- Technologies used
- Key accomplishments
- Impact or learning gained
- Event/timeline context

## Technical Highlights
- Frameworks, languages, platforms
- Unique solutions implemented
- Scalability or performance metrics

## Gallery Images
- Add 3-5 high-quality images
- Include event photos, certificates, team shots
```

### 3.3 Image Optimization

**For All Images:**
- Use descriptive alt text (not "image1" or "screenshot")
- Add relevant keywords in alt text
- Compress before uploading (use TinyPNG)
- Optimal size: 1200x630px for og:image

**Alt Text Examples:**
```
✅ "CodeFest 2026 winner team celebrating with trophy"
✅ "Backend architecture diagram using Node.js and PostgreSQL"
❌ "pic.jpg" or "image"
```

---

## 4. URL & Slug Strategy

### Current Structure
- Events: `codescriet.dev/events/{slug}`
- Achievements: `codescriet.dev/achievements/{slug}`

### Slug Best Practices
```
✅ Good: "codefest-2026-competitive-programming"
✅ Good: "won-best-team-codechef-contest"
✅ Good: "dsa-workshop-january-2026"

❌ Bad: "event1" or "achievement-123"
❌ Bad: "codefest2026" (no hyphens)
❌ Bad: "Amazing Event Name" (spaces, capitals)
```

**Slug Rules:**
- Use lowercase only
- Separate words with hyphens (-)
- Include main keyword first
- Keep under 75 characters
- Be descriptive but concise

---

## 5. Technical SEO Checklist

### Meta Tags ✅ (Already Set Up)
- Page titles (40-60 characters)
- Meta descriptions (130-160 characters)
- Open Graph tags (OG image, OG type)
- Twitter card tags
- Canonical URLs

### Structured Data ✅ (Implemented)
- **Organization schema**: Helps Google understand your org
- **Event schema**: Shows events in Google search results
- **Article/Achievement schema**: Better ranking for achievements
- **Breadcrumb schema**: Shows site structure in search results
- **FAQ schema**: If your events have FAQs (shows Q&As in results)

### Speed Optimization
- Images: Cloudinary CDN (automatically optimized)
- Caching: 1 hour for dynamic sitemaps
- Minification: Vite builds optimized bundles
- Check: [PageSpeed Insights](https://pagespeed.web.dev/)

---

## 6. Content Calendar Strategy

### Monthly Content Plan
```
Week 1: Announce upcoming event (mark as featured)
Week 2: Announce speakers/details
Week 3: Post updates or achievements from other events
Week 4: Post complete coverage of completed event

Result: 2-4 new indexed pieces per month
```

### Growth Target
- **Month 1**: 5-10 events indexed
- **Month 2**: 15-20 events + achievements
- **Month 3**: 30+ pages indexed
- **Month 6**: Strong presence in local coding searches

---

## 7. Keyword Research

### High-Value Keywords
Use these when writing titles and descriptions:

**Competitive Programming**
- "competitive programming", "DSA practice"
- "coding contest", "programming competition"
- "algorithm problems", "data structures"

**Web Development**
- "web development workshop", "MERN stack"
- "full-stack development", "frontend development"

**Location-Based**
- "SCRIET coding", "SCRIET tech club"
- "Delhi coding community", "college tech club"

**Skill Level**
- "beginner programming", "coding for beginners"
- "advanced DSA", "system design"

---

## 8. Link Building

### Internal Linking
```markdown
# In Event Description:
- "Learn more about [CodeScriet](#team)"
- "See previous winners in [Achievements](/achievements)"

# In Achievement:
- "This was won at [CodeFest 2025](/events/codefest-2025)"
- "Related [DSA Workshop](/events/dsa-workshop)"
```

### External Links
- Get your events featured on:
  - College event portals
  - Coding community sites
  - Tech blogs and newsletters

---

## 9. Analytics Setup

### What to Track
1. **Search Impressions**: How often your site shows in search results
2. **Click-through Rate**: % of people who click from search results
3. **Keyword Rankings**: Which keywords you rank for
4. **Traffic Sources**: Where visitors come from

### Tools
- [Google Search Console](https://search.google.com/search-console) - Keywords, impressions, clicks
- [Google Analytics 4](https://analytics.google.com/) - User behavior, traffic flow
- [Ahrefs](https://ahrefs.com/) or [SEMrush](https://www.semrush.com/) - Competitor analysis (paid)

### Key Metrics
- Target: 50+ keywords ranking in top 3 pages
- Target: 10%+ click-through rate from search
- Target: 100+ monthly organic visits in 3 months

---

## 10. Admin Checklist

### Before Publishing Any Event/Achievement
- [ ] Slug format correct (lowercase, hyphens)
- [ ] Title: 40-60 characters, keyword-rich
- [ ] Short description: 130-160 characters, compelling
- [ ] Full description: Markdown formatted, includes details
- [ ] Images: High quality, compressed, alt text added
- [ ] Tags: Relevant (max 5)
- [ ] Featured flag: Marked if it's important
- [ ] Links: Internal links to related events/achievements

### Monthly Maintenance
- [ ] Review featured content (update if needed)
- [ ] Check Google Search Console for new keywords
- [ ] Verify sitemap is generating correctly
- [ ] Post at least 1-2 new events/achievements
- [ ] Update social media links in settings
- [ ] Check page speed with PageSpeed Insights

### Quarterly Review
- [ ] Analyze top-performing events/achievements
- [ ] Update content that ranks well
- [ ] Fix any broken internal links
- [ ] Refresh old achievement images/content
- [ ] Expand content for high-traffic pages

---

## 11. Common Mistakes to Avoid

❌ **Duplicate Content**
- Don't copy-paste descriptions
- Each event/achievement should have unique content

❌ **Keyword Stuffing**
- Don't repeat keywords unnaturally
- Keyword should appear 1-2 times naturally in description

❌ **Thin Content**
- Don't publish without descriptions
- Minimum 200 characters for short description, 500 for content

❌ **Broken Links**
- Check internal links regularly
- Remove dead links to past events

❌ **Bad Metadata**
- Don't use generic titles ("Event", "Achievement")
- Don't forget descriptions (they show in search results)

---

## 12. Success Indicators

### Week 1-2
- ✅ Sitemap submitted to Google Search Console
- ✅ First pages start appearing in Google Index

### Week 2-4
- ✅ 5-10 pages indexed
- ✅ First clicks from organic search
- ✅ Start ranking for brand keywords

### Month 2-3
- ✅ 20+ pages indexed
- ✅ Ranking for 10+ keywords
- ✅ 50+ monthly organic visits
- ✅ Featured events drive registrations

### Month 6+
- ✅ 50+ pages indexed
- ✅ Ranking for high-value keywords
- ✅ 500+ monthly organic visits
- ✅ Become go-to resource for coding events

---

## 13. Resources

### Tools
- **Google Search Console**: https://search.google.com/search-console
- **Google Analytics**: https://analytics.google.com/
- **Keyword Research**: https://www.ubersuggest.com/ (free tier)
- **Page Speed**: https://pagespeed.web.dev/
- **Markup Validator**: https://search.google.com/test/rich-results

### Learning
- [Google SEO Starter Guide](https://developers.google.com/search/docs/beginner/seo-starter-guide)
- [Moz SEO Guide](https://moz.com/beginners-guide-to-seo)
- [Schema.org Documentation](https://schema.org/)

---

## Questions?

For technical questions about the SEO implementation:
- Check [github.com/codescriet/main_site](https://github.com/codescriet/main_site)
- Sitemap code: `apps/api/src/routes/sitemap.ts`
- Schema components: `apps/web/src/components/ui/schema.tsx`

For SEO strategy questions, consult SEO resources above or a digital marketing professional.

**Remember**: Good SEO is about providing value to users first, then making sure Google understands your great content! 🚀
