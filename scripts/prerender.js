// scripts/prerender.js
// Build-time prerender for SEO-critical pages.
//
// After `vite build`, this script walks the public API and emits a real HTML
// file at:
//   - apps/web/dist/<route>/<slug>/index.html for every team member,
//     network profile, event, achievement, and announcement (detail pages)
//   - apps/web/dist/<route>/index.html for every listing/static route
//     (/, /about, /events, /team, /achievements, /announcements, /network,
//      /contact, /join-us, /privacy-policy, /credits)
//
// Each output contains:
//   - Real <title> and <meta name="description">
//   - og:* / twitter:* tags using the entity image
//   - rel=canonical to the URL
//   - JSON-LD (Person / Event / NewsArticle / BlogPosting / CollectionPage /
//     WebPage / ContactPage / BreadcrumbList)
//   - A visible prerender block inside #root (h1, intro, list, footer-stub)
//     so non-JS crawlers see real content + internal nav links. React's
//     createRoot wipes it on hydration.
//
// Render's static hosting serves a real file before applying the SPA rewrite,
// so dist/team/<slug>/index.html takes precedence over /* -> /index.html.
//
// Failures are non-fatal: if the API is unreachable, we log and exit 0 so
// the SPA still ships.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(REPO_ROOT, 'apps/web/dist');

const SITE_URL = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/$/, '');
const API_URL = (process.env.VITE_API_URL || process.env.BACKEND_URL || 'https://api.codescriet.dev').replace(/\/$/, '');
const FETCH_TIMEOUT_MS = 20000;
const PER_REQUEST_TIMEOUT_MS = 10000;
const ORG_NAME = 'codescriet';
const CCSU_NAME = 'Chaudhary Charan Singh University';

// ───── tiny helpers ────────────────────────────────────────────────────────

const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const escHtml = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
}[c]));

const stripHtml = (s) => String(s ?? '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const trimChars = (s, max) => {
  const str = String(s ?? '').trim();
  if (str.length <= max) return str;
  return str.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
};

const fetchJson = async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.json();
    return body && typeof body === 'object' && 'data' in body ? body.data : body;
  } finally {
    clearTimeout(t);
  }
};

const ensureDir = (p) => fs.mkdir(p, { recursive: true });

const writeIfChanged = async (filePath, content) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
};

// ───── HTML templating ─────────────────────────────────────────────────────

/**
 * Apply SEO replacements to the built index.html template.
 * - Replaces <title>, primary meta tags, og:*, twitter:*, canonical link.
 * - Appends extra JSON-LD blocks before </head>.
 * - Replaces <div id="root"></div> with a hydration-safe content block.
 *
 * Any tags missing from the template are appended before </head>.
 */
function buildHtml(template, opts) {
  const {
    title,
    description,
    canonical,
    image,
    imageAlt,
    ogType = 'website',
    jsonLd = [],
    bodyContent = '',
  } = opts;

  let html = template;

  // <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escHtml(title)}</title>`);

  const metaPatch = (attr, name, value) => {
    const re = new RegExp(`<meta\\s+${attr}="${name}"[^>]*>`, 'i');
    const tag = `<meta ${attr}="${name}" content="${escAttr(value)}" />`;
    if (re.test(html)) html = html.replace(re, tag);
    else html = html.replace('</head>', `    ${tag}\n  </head>`);
  };

  metaPatch('name', 'title', title);
  metaPatch('name', 'description', description);
  metaPatch('property', 'og:type', ogType);
  metaPatch('property', 'og:url', canonical);
  metaPatch('property', 'og:title', title);
  metaPatch('property', 'og:description', description);
  if (image) metaPatch('property', 'og:image', image);
  if (imageAlt) metaPatch('property', 'og:image:alt', imageAlt);
  metaPatch('name', 'twitter:url', canonical);
  metaPatch('name', 'twitter:title', title);
  metaPatch('name', 'twitter:description', description);
  if (image) metaPatch('name', 'twitter:image', image);
  if (imageAlt) metaPatch('name', 'twitter:image:alt', imageAlt);

  // canonical
  const canonRe = /<link\s+rel="canonical"[^>]*>/i;
  const canonTag = `<link rel="canonical" href="${escAttr(canonical)}" />`;
  if (canonRe.test(html)) html = html.replace(canonRe, canonTag);
  else html = html.replace('</head>', `    ${canonTag}\n  </head>`);

  // JSON-LD blocks (append before </head>)
  if (jsonLd.length) {
    const blocks = jsonLd
      .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
      .join('\n    ');
    html = html.replace('</head>', `    ${blocks}\n  </head>`);
  }

  // Inject prerender content into #root. createRoot().render() replaces
  // children, so this is hydration-safe (we are NOT calling hydrateRoot).
  if (bodyContent) {
    html = html.replace(
      /<div\s+id="root"[^>]*>\s*<\/div>/i,
      `<div id="root"><div id="prerender-content" style="opacity:0;position:absolute;left:-99999px;top:0;pointer-events:none" aria-hidden="true">${bodyContent}</div></div>`,
    );
  }

  return html;
}

// ───── shared schema fragments ─────────────────────────────────────────────

const orgRef = { '@type': 'Organization', name: ORG_NAME, url: SITE_URL };

const breadcrumb = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: it.url,
  })),
});

// ───── per-entity templates ────────────────────────────────────────────────

const sameAsTeam = (m) => {
  const out = [];
  const norm = (v, prefix) => v && (v.startsWith('http') ? v : `${prefix}${v.replace(/^@/, '')}`);
  const gh = norm(m.github, 'https://github.com/');
  const li = norm(m.linkedin, 'https://linkedin.com/in/');
  const tw = norm(m.twitter, 'https://twitter.com/');
  const ig = norm(m.instagram, 'https://instagram.com/');
  if (gh) out.push(gh);
  if (li) out.push(li);
  if (tw) out.push(tw);
  if (ig) out.push(ig);
  if (m.website) out.push(m.website);
  return out;
};

const sameAsNetwork = (n) => {
  const out = [];
  if (n.linkedinUsername) out.push(`https://linkedin.com/in/${n.linkedinUsername.replace(/^@/, '')}`);
  if (n.twitterUsername) out.push(`https://twitter.com/${n.twitterUsername.replace(/^@/, '')}`);
  if (n.githubUsername) out.push(`https://github.com/${n.githubUsername.replace(/^@/, '')}`);
  if (n.personalWebsite) out.push(n.personalWebsite);
  return out;
};

const splitKeywords = (s) => stripHtml(s)
  .split(/[,;\n]/)
  .map((x) => x.trim())
  .filter((x) => x && x.length < 60)
  .slice(0, 12);

function teamMemberPage(m) {
  const slug = m.slug || m.id;
  const url = `${SITE_URL}/team/${slug}`;
  const title = `${m.name} — ${m.role}, ${ORG_NAME} | ${m.team || 'Team'}`;
  const bioText = stripHtml(m.bio || m.story || '');
  const description = trimChars(
    bioText || `${m.name} is a ${m.role} on the ${m.team || 'core'} team at codescriet, the official coding club of SCRIET, CCS University Meerut.`,
    300,
  );
  const image = m.imageUrl || `${SITE_URL}/og-image.jpg`;
  const sameAs = sameAsTeam(m);
  const knows = splitKeywords(m.expertise || '');

  const person = {
    '@type': 'Person',
    name: m.name,
    url,
    description,
    image,
    jobTitle: m.role,
    affiliation: orgRef,
    worksFor: orgRef,
    ...(sameAs.length ? { sameAs } : {}),
    ...(knows.length ? { knowsAbout: knows } : {}),
  };

  const profilePage = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    name: `${m.name} | ${ORG_NAME}`,
    mainEntity: person,
  };

  const bc = breadcrumb([
    { name: 'Home', url: SITE_URL },
    { name: 'Team', url: `${SITE_URL}/team` },
    { name: m.name, url },
  ]);

  const visible = `
    <h1>${escHtml(m.name)} — ${escHtml(m.role || '')}</h1>
    <p><strong>${escHtml(m.team || '')}</strong> at codescriet (code.scriet), SCRIET, CCS University Meerut.</p>
    ${m.imageUrl ? `<img src="${escAttr(m.imageUrl)}" alt="${escAttr(`${m.name} — ${m.role || ''} at codescriet`)}" />` : ''}
    ${bioText ? `<p>${escHtml(trimChars(bioText, 600))}</p>` : ''}
    ${sameAs.length ? `<ul>${sameAs.map((u) => `<li><a href="${escAttr(u)}" rel="noopener">${escHtml(u)}</a></li>`).join('')}</ul>` : ''}
    ${footerStub()}
  `;

  return {
    outPath: path.join(DIST_DIR, 'team', slug, 'index.html'),
    title,
    description,
    canonical: url,
    image,
    imageAlt: `${m.name} — ${m.role || ''} at codescriet`,
    ogType: 'profile',
    jsonLd: [profilePage, bc],
    bodyContent: visible,
  };
}

function networkProfilePage(n) {
  const slug = n.slug;
  if (!slug) return null;
  const url = `${SITE_URL}/network/${slug}`;
  const isAlumni = n.connectionType === 'ALUMNI' || !!n.passoutYear;
  const title = `${n.fullName} — ${n.designation}${n.company ? ` at ${n.company}` : ''} | ${ORG_NAME} Network`;
  const bioText = stripHtml(n.bio || n.story || '');
  const description = trimChars(
    bioText || `${n.fullName} — ${n.designation}${n.company ? ` at ${n.company}` : ''}, part of the codescriet ${isAlumni ? 'alumni' : 'professional'} network.`,
    300,
  );
  const image = n.profilePhoto || `${SITE_URL}/og-image.jpg`;
  const sameAs = sameAsNetwork(n);
  const knows = splitKeywords(n.expertise || '');

  const person = {
    '@type': 'Person',
    name: n.fullName,
    url,
    description,
    image,
    jobTitle: n.designation,
    affiliation: orgRef,
    ...(n.company ? { worksFor: { '@type': 'Organization', name: n.company } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(knows.length ? { knowsAbout: knows } : {}),
    ...(isAlumni ? { alumniOf: { '@type': 'CollegeOrUniversity', name: CCSU_NAME } } : {}),
  };

  const profilePage = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    name: `${n.fullName} | ${ORG_NAME} Network`,
    mainEntity: person,
  };

  const bc = breadcrumb([
    { name: 'Home', url: SITE_URL },
    { name: 'Network', url: `${SITE_URL}/network` },
    { name: n.fullName, url },
  ]);

  const visible = `
    <h1>${escHtml(n.fullName)} — ${escHtml(n.designation || '')}</h1>
    ${n.company ? `<p>${escHtml(n.designation || '')} at <strong>${escHtml(n.company)}</strong></p>` : ''}
    <p>Part of the codescriet ${isAlumni ? 'alumni' : 'professional'} network — SCRIET, CCS University Meerut.</p>
    ${n.profilePhoto ? `<img src="${escAttr(n.profilePhoto)}" alt="${escAttr(`${n.fullName} — ${n.designation || ''}`)}" />` : ''}
    ${bioText ? `<p>${escHtml(trimChars(bioText, 600))}</p>` : ''}
    ${sameAs.length ? `<ul>${sameAs.map((u) => `<li><a href="${escAttr(u)}" rel="noopener">${escHtml(u)}</a></li>`).join('')}</ul>` : ''}
    ${footerStub()}
  `;

  return {
    outPath: path.join(DIST_DIR, 'network', slug, 'index.html'),
    title,
    description,
    canonical: url,
    image,
    imageAlt: `${n.fullName} — ${n.designation || ''}`,
    ogType: 'profile',
    jsonLd: [profilePage, bc],
    bodyContent: visible,
  };
}

function eventPage(e) {
  const slug = e.slug;
  if (!slug) return null;
  const url = `${SITE_URL}/events/${slug}`;
  const dateLabel = e.startDate
    ? new Date(e.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const venue = e.venue || e.location || '';
  const titleSuffix = [dateLabel, venue].filter(Boolean).join(', ');
  const title = `${e.title}${titleSuffix ? ` — ${titleSuffix}` : ''} | ${ORG_NAME} Events`;
  const descText = stripHtml(e.shortDescription || e.description || '');
  const description = trimChars(descText || `${e.title} at codescriet, SCRIET, CCS University Meerut.`, 300);
  const image = e.imageUrl || `${SITE_URL}/og-image.jpg`;

  const start = e.startDate || new Date().toISOString();
  const end = e.endDate || new Date(new Date(start).getTime() + 2 * 60 * 60 * 1000).toISOString();

  const event = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    description,
    url,
    image,
    startDate: start,
    endDate: end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    organizer: orgRef,
    location: {
      '@type': 'Place',
      name: venue || 'SCRIET Campus, Meerut',
      address: { '@type': 'PostalAddress', addressLocality: 'Meerut', addressRegion: 'Uttar Pradesh', addressCountry: 'IN' },
    },
  };

  const bc = breadcrumb([
    { name: 'Home', url: SITE_URL },
    { name: 'Events', url: `${SITE_URL}/events` },
    { name: e.title, url },
  ]);

  const visible = `
    <h1>${escHtml(e.title)}</h1>
    ${dateLabel ? `<p><time datetime="${escAttr(start)}">${escHtml(dateLabel)}</time>${venue ? ` · ${escHtml(venue)}` : ''}</p>` : ''}
    ${e.imageUrl ? `<img src="${escAttr(e.imageUrl)}" alt="${escAttr(`${e.title} — codescriet event`)}" />` : ''}
    ${descText ? `<p>${escHtml(trimChars(descText, 800))}</p>` : ''}
    ${footerStub()}
  `;

  return {
    outPath: path.join(DIST_DIR, 'events', slug, 'index.html'),
    title,
    description,
    canonical: url,
    image,
    imageAlt: `${e.title} — codescriet event`,
    ogType: 'article',
    jsonLd: [event, bc],
    bodyContent: visible,
  };
}

function achievementPage(a) {
  const slug = a.slug;
  if (!slug) return null;
  const url = `${SITE_URL}/achievements/${slug}`;
  const who = a.achievedBy ? ` — ${a.achievedBy}` : '';
  const title = `${a.title}${who} | ${ORG_NAME}`;
  const descText = stripHtml(a.shortDescription || a.description || '');
  const description = trimChars(descText || `${a.title} at codescriet.`, 300);
  const image = a.imageUrl || `${SITE_URL}/og-image.jpg`;
  const datePub = a.date || a.createdAt || new Date().toISOString();
  const dateMod = a.updatedAt || datePub;

  const article = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description,
    image,
    datePublished: datePub,
    dateModified: dateMod,
    author: orgRef,
    publisher: { '@type': 'Organization', name: ORG_NAME, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  const bc = breadcrumb([
    { name: 'Home', url: SITE_URL },
    { name: 'Achievements', url: `${SITE_URL}/achievements` },
    { name: a.title, url },
  ]);

  const visible = `
    <h1>${escHtml(a.title)}</h1>
    ${a.achievedBy ? `<p><strong>${escHtml(a.achievedBy)}</strong></p>` : ''}
    ${a.imageUrl ? `<img src="${escAttr(a.imageUrl)}" alt="${escAttr(`${a.title} — codescriet achievement`)}" />` : ''}
    ${descText ? `<p>${escHtml(trimChars(descText, 800))}</p>` : ''}
    ${footerStub()}
  `;

  return {
    outPath: path.join(DIST_DIR, 'achievements', slug, 'index.html'),
    title,
    description,
    canonical: url,
    image,
    imageAlt: `${a.title} — codescriet achievement`,
    ogType: 'article',
    jsonLd: [article, bc],
    bodyContent: visible,
  };
}

function announcementPage(an) {
  const slug = an.slug;
  if (!slug) return null;
  const url = `${SITE_URL}/announcements/${slug}`;
  const title = `${an.title} | ${ORG_NAME} Announcements`;
  const descText = stripHtml(an.shortDescription || an.body || '');
  const description = trimChars(descText || an.title, 300);
  const image = an.imageUrl || `${SITE_URL}/og-image.jpg`;
  const datePub = an.createdAt || new Date().toISOString();
  const dateMod = an.updatedAt || datePub;

  const article = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: an.title,
    description,
    image,
    datePublished: datePub,
    dateModified: dateMod,
    author: orgRef,
    publisher: { '@type': 'Organization', name: ORG_NAME, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  const bc = breadcrumb([
    { name: 'Home', url: SITE_URL },
    { name: 'Announcements', url: `${SITE_URL}/announcements` },
    { name: an.title, url },
  ]);

  const visible = `
    <h1>${escHtml(an.title)}</h1>
    ${an.imageUrl ? `<img src="${escAttr(an.imageUrl)}" alt="${escAttr(`${an.title} — codescriet announcement`)}" />` : ''}
    ${descText ? `<p>${escHtml(trimChars(descText, 800))}</p>` : ''}
    ${footerStub()}
  `;

  return {
    outPath: path.join(DIST_DIR, 'announcements', slug, 'index.html'),
    title,
    description,
    canonical: url,
    image,
    imageAlt: `${an.title} — codescriet announcement`,
    ogType: 'article',
    jsonLd: [article, bc],
    bodyContent: visible,
  };
}

// ───── listing & static route templates ────────────────────────────────────

// Footer-stub: site-wide internal nav embedded in every prerendered page so
// non-JS crawlers see internal links and the privacy-policy reference,
// closing links/internal-links, links/dead-end-pages, eeat/privacy-policy
// and legal/privacy-policy.
const FOOTER_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/events', label: 'Events' },
  { href: '/team', label: 'Team' },
  { href: '/achievements', label: 'Achievements' },
  { href: '/announcements', label: 'Announcements' },
  { href: '/network', label: 'Network' },
  { href: '/credits', label: 'Credits' },
  { href: '/contact', label: 'Contact' },
  { href: '/join-us', label: 'Join Us' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
];

function footerStub() {
  const items = FOOTER_LINKS
    .map((l) => `<li><a href="${escAttr(l.href)}">${escHtml(l.label)}</a></li>`)
    .join('');
  return `<nav aria-label="Footer"><ul>${items}</ul></nav>`;
}

function safeDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function listingTask({ route, title, description, intro, jsonLdType, listHtml }) {
  const canonical = `${SITE_URL}${route === '/' ? '' : route}`;
  const bcTrail = [{ name: 'Home', url: SITE_URL }];
  if (route !== '/') {
    const segs = route.replace(/^\//, '').split('/');
    let acc = '';
    segs.forEach((seg) => {
      acc += `/${seg}`;
      bcTrail.push({
        name: seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        url: `${SITE_URL}${acc}`,
      });
    });
  }
  const bc = breadcrumb(bcTrail);

  const pageJsonLd = {
    '@context': 'https://schema.org',
    '@type': jsonLdType,
    url: canonical,
    name: title,
    description,
    isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website` },
    publisher: orgRef,
  };

  const visible = `
    <h1>${escHtml(title.replace(/\s\|\s.*$/, ''))}</h1>
    <p>${escHtml(intro)}</p>
    ${listHtml || ''}
    ${footerStub()}
  `;

  const outDir = route === '/' ? DIST_DIR : path.join(DIST_DIR, route.replace(/^\//, ''));

  return {
    outPath: path.join(outDir, 'index.html'),
    title,
    description,
    canonical,
    image: `${SITE_URL}/og-image.jpg`,
    imageAlt: 'codescriet — Official Coding Club of SCRIET',
    ogType: 'website',
    jsonLd: [pageJsonLd, bc],
    bodyContent: visible,
  };
}

function listOfEvents(events) {
  if (!events?.length) return '';
  const items = events.slice(0, 8).map((e) => {
    if (!e?.slug) return '';
    const date = safeDate(e.startDate);
    const venue = e.venue || e.location || '';
    const meta = [date, venue].filter(Boolean).join(' · ');
    return `<li><a href="/events/${escAttr(e.slug)}">${escHtml(e.title)}</a>${meta ? ` — <span>${escHtml(meta)}</span>` : ''}</li>`;
  }).filter(Boolean).join('');
  return items ? `<section aria-label="Recent events"><h2>Recent Events</h2><ul>${items}</ul></section>` : '';
}

function listOfTeam(team) {
  if (!team?.length) return '';
  const items = team.slice(0, 12).map((m) => {
    const slug = m.slug || m.id;
    if (!slug) return '';
    return `<li><a href="/team/${escAttr(slug)}">${escHtml(m.name)}</a>${m.role ? ` — <span>${escHtml(m.role)}</span>` : ''}</li>`;
  }).filter(Boolean).join('');
  return items ? `<section aria-label="Team"><h2>Team Members</h2><ul>${items}</ul></section>` : '';
}

function listOfAchievements(achievements) {
  if (!achievements?.length) return '';
  const items = achievements.slice(0, 8).map((a) => {
    if (!a?.slug) return '';
    const date = safeDate(a.date);
    return `<li><a href="/achievements/${escAttr(a.slug)}">${escHtml(a.title)}</a>${a.achievedBy ? ` — <span>${escHtml(a.achievedBy)}</span>` : ''}${date ? ` <time>${escHtml(date)}</time>` : ''}</li>`;
  }).filter(Boolean).join('');
  return items ? `<section aria-label="Achievements"><h2>Recent Achievements</h2><ul>${items}</ul></section>` : '';
}

function listOfAnnouncements(announcements) {
  if (!announcements?.length) return '';
  const items = announcements.slice(0, 8).map((a) => {
    if (!a?.slug) return '';
    const date = safeDate(a.createdAt);
    return `<li><a href="/announcements/${escAttr(a.slug)}">${escHtml(a.title)}</a>${date ? ` <time>${escHtml(date)}</time>` : ''}</li>`;
  }).filter(Boolean).join('');
  return items ? `<section aria-label="Announcements"><h2>Latest Announcements</h2><ul>${items}</ul></section>` : '';
}

function listOfNetwork(network) {
  if (!network?.length) return '';
  const items = network
    .filter((n) => n?.slug && (n.status === 'VERIFIED' || !n.status) && n.isPublic !== false)
    .slice(0, 12)
    .map((n) => `<li><a href="/network/${escAttr(n.slug)}">${escHtml(n.fullName)}</a>${n.designation ? ` — <span>${escHtml(n.designation)}${n.company ? ` at ${escHtml(n.company)}` : ''}</span>` : ''}</li>`)
    .join('');
  return items ? `<section aria-label="Network"><h2>Alumni & Professionals</h2><ul>${items}</ul></section>` : '';
}

function listOfCredits(credits) {
  if (!credits?.length) return '';
  const byCategory = new Map();
  for (const c of credits) {
    if (!c?.title) continue;
    const key = c.category || 'Other';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(c);
  }
  const sections = Array.from(byCategory.entries()).map(([cat, items]) => {
    const lis = items
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .slice(0, 20)
      .map((c) => {
        const who = c.teamMember?.slug
          ? ` — <a href="/team/${escAttr(c.teamMember.slug)}">${escHtml(c.teamMember.name)}</a>`
          : c.teamMember?.name
            ? ` — <span>${escHtml(c.teamMember.name)}</span>`
            : '';
        return `<li><strong>${escHtml(c.title)}</strong>${who}</li>`;
      })
      .join('');
    return `<section aria-label="${escAttr(cat)}"><h2>${escHtml(cat)}</h2><ul>${lis}</ul></section>`;
  }).join('');
  return sections;
}

function buildListingTasks({ team, network, events, achievements, announcements, credits }) {
  const upcoming = (events || []).filter((e) => {
    const start = e?.startDate ? new Date(e.startDate).getTime() : 0;
    return start && start >= Date.now() - 24 * 60 * 60 * 1000;
  });

  return [
    listingTask({
      route: '/',
      title: 'codescriet — Official Coding Club of SCRIET, CCSU Meerut',
      description: 'codescriet (code.scriet) is the official coding club of SCRIET, CCS University Meerut. DSA, competitive programming, hackathons, web development, and a community of student engineers.',
      intro: 'codescriet is the official coding club of SCRIET (Sir Chhotu Ram Institute of Engineering and Technology), CCS University Meerut. We run regular workshops, hackathons, and competitive programming sessions, and maintain an active alumni and professional network. Explore upcoming events, meet the team, and read the latest announcements.',
      jsonLdType: 'WebPage',
      listHtml: [
        listOfEvents(upcoming.length ? upcoming : events),
        listOfAnnouncements(announcements),
        listOfTeam(team),
      ].filter(Boolean).join(''),
    }),
    listingTask({
      route: '/about',
      title: 'About codescriet — SCRIET’s Official Coding Club',
      description: 'About codescriet — the official coding club of SCRIET, CCS University Meerut. Our mission, focus areas, and what we do for students of CCSU.',
      intro: 'codescriet is the student-run coding club at SCRIET, Chaudhary Charan Singh University, Meerut. We focus on four areas: data structures and algorithms, competitive programming, hackathons and project work, and full-stack web development. The club is open to every CCSU student who codes — beginners welcome.',
      jsonLdType: 'AboutPage',
      listHtml: '',
    }),
    listingTask({
      route: '/events',
      title: 'Events — Workshops, Hackathons & Sessions | codescriet',
      description: 'Upcoming and past events at codescriet — workshops, hackathons, contests, and learning sessions hosted by the SCRIET coding club at CCS University Meerut.',
      intro: 'Join codescriet for workshops, hackathons, coding contests, and learning sessions. Our events range from intro-to-DSA sessions for first-years to competitive programming rounds, hackathons, and guest sessions from alumni and industry mentors.',
      jsonLdType: 'CollectionPage',
      listHtml: listOfEvents(events),
    }),
    listingTask({
      route: '/team',
      title: 'Our Team — codescriet Coding Club',
      description: 'Meet the team behind codescriet — core members, faculty, and student leaders running the official coding club at SCRIET, CCS University Meerut.',
      intro: 'codescriet is run by a team of student leaders, core members, and faculty advisors at SCRIET, CCSU Meerut. The team plans events, mentors juniors, and maintains the club’s platform and projects.',
      jsonLdType: 'CollectionPage',
      listHtml: listOfTeam(team),
    }),
    listingTask({
      route: '/achievements',
      title: 'Achievements — codescriet',
      description: 'Achievements at codescriet — projects, hackathon wins, contest results, and milestones from members of the SCRIET coding club.',
      intro: 'These aren’t just milestones — they’re proof. Every workshop taught, every project shipped, every problem solved represents the collective growth of codescriet members. Browse our recent achievements from across departments and years.',
      jsonLdType: 'CollectionPage',
      listHtml: listOfAchievements(achievements),
    }),
    listingTask({
      route: '/announcements',
      title: 'Announcements — codescriet',
      description: 'Latest announcements from codescriet — news, updates, recruitment notices, and important information from the SCRIET coding club.',
      intro: 'Stay updated with the latest news, recruitment notices, event reminders, and important information from codescriet. Announcements are prioritised so urgent updates always stay at the top.',
      jsonLdType: 'CollectionPage',
      listHtml: listOfAnnouncements(announcements),
    }),
    listingTask({
      route: '/network',
      title: 'Alumni & Professional Network — codescriet',
      description: 'Connect with codescriet alumni and industry professionals who actively mentor SCRIET students through guidance, sessions, and real opportunities.',
      intro: 'The codescriet network connects current students with alumni and industry professionals. Members provide mentorship, run guest sessions, and open doors to real opportunities. Browse verified profiles below or apply to join the network yourself.',
      jsonLdType: 'CollectionPage',
      listHtml: listOfNetwork(network),
    }),
    listingTask({
      route: '/contact',
      title: 'Contact codescriet — SCRIET Coding Club',
      description: 'Contact codescriet — get in touch with the official coding club of SCRIET, CCS University Meerut, via email or social channels.',
      intro: 'Get in touch with codescriet. Reach us by email, drop by SCRIET campus in Meerut, or connect with us on Instagram, LinkedIn, or GitHub. We respond to collaboration, sponsorship, and student queries within a few working days.',
      jsonLdType: 'ContactPage',
      listHtml: '',
    }),
    listingTask({
      route: '/join-us',
      title: 'Join codescriet — Recruitment & Onboarding',
      description: 'Join the codescriet team. We recruit core members across technical, DSA, design, social media, and management roles from SCRIET, CCSU Meerut.',
      intro: 'codescriet recruits passionate students from SCRIET, CCSU Meerut each cycle. We run intakes for technical contributors, DSA champions, designers, social media leads, and management roles. Applications open during announced windows — check the announcements page or follow our socials.',
      jsonLdType: 'WebPage',
      listHtml: '',
    }),
    listingTask({
      route: '/privacy-policy',
      title: 'Privacy Policy — codescriet',
      description: 'Privacy policy for codescriet.dev — how we collect, use, and protect your data when you use our platform, register for events, or join the network.',
      intro: 'This privacy policy explains how codescriet collects, uses, stores, and protects your personal information when you use codescriet.dev, register for events, take part in the QOTD or quiz platform, join the alumni network, or contact us. By using the platform you agree to the terms described here.',
      jsonLdType: 'WebPage',
      listHtml: '',
    }),
    listingTask({
      route: '/credits',
      title: 'Credits — codescriet',
      description: 'Credits and acknowledgements for codescriet — the people and tools that built and maintain the SCRIET coding club platform.',
      intro: 'codescriet is the work of many people. This page credits the founders, builders, designers, content creators, and special-thanks contributors who made the club and this platform possible.',
      jsonLdType: 'CollectionPage',
      listHtml: listOfCredits(credits),
    }),
  ];
}

// ───── orchestration ───────────────────────────────────────────────────────

async function safeList(name, url) {
  try {
    const data = await fetchJson(url);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      // Common response shapes: { items }, { results }, { profiles }, { members },
      // { events }, { achievements }, { announcements }
      for (const key of ['items', 'results', 'profiles', 'members', 'events', 'achievements', 'announcements', 'team']) {
        if (Array.isArray(data[key])) return data[key];
      }
    }
    console.log(`[prerender] ${name}: response not an array, skipping`);
    return [];
  } catch (err) {
    console.log(`[prerender] ${name}: failed (${err.message}), skipping`);
    return [];
  }
}

async function writeTasks(tasks, template) {
  let written = 0;
  let failed = 0;
  for (const t of tasks) {
    try {
      const html = buildHtml(template, t);
      await writeIfChanged(t.outPath, html);
      written += 1;
    } catch (err) {
      failed += 1;
      console.error(`[prerender] failed ${t.outPath}: ${err.message}`);
    }
  }
  return { written, failed };
}

async function fetchAllWithTimeout(timeoutMs) {
  // Race the API fetches against a hard timeout. If Render's build container
  // can't reach api.codescriet.dev within timeoutMs, return empty arrays so
  // listing pages still land — never let the API decide whether prerender
  // output exists in dist.
  const empty = { team: [], network: [], events: [], achievements: [], announcements: [], credits: [] };
  const fetched = (async () => {
    const [team, network, events, achievements, announcements, credits] = await Promise.all([
      safeList('team', `${API_URL}/team`),
      safeList('network', `${API_URL}/network`),
      safeList('events', `${API_URL}/events`),
      safeList('achievements', `${API_URL}/achievements`),
      safeList('announcements', `${API_URL}/announcements`),
      safeList('credits', `${API_URL}/credits`),
    ]);
    return { team, network, events, achievements, announcements, credits };
  })();
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.log(`[prerender] API fetch exceeded ${timeoutMs}ms — proceeding with empty data`);
      resolve(empty);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetched, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const started = Date.now();
  let template;
  try {
    template = await fs.readFile(path.join(DIST_DIR, 'index.html'), 'utf8');
  } catch (err) {
    console.error(`[prerender] could not read dist/index.html — did vite build run? ${err.message}`);
    process.exit(0); // non-fatal
  }

  console.log(`[prerender] API: ${API_URL}`);
  console.log(`[prerender] site: ${SITE_URL}`);

  // PHASE 1 — write listing/static pages immediately with empty lists.
  // Guarantees dist/<route>/index.html exists even if the API is unreachable
  // from the build container.
  const phase1 = buildListingTasks({});
  const phase1Result = await writeTasks(phase1, template);
  console.log(`[prerender] phase 1 (empty listing pages): wrote ${phase1Result.written}, failed ${phase1Result.failed}`);

  // PHASE 2 — fetch API with a hard 30s ceiling; if it succeeds, overwrite
  // listing pages with richer content and write detail pages too.
  const { team, network, events, achievements, announcements, credits } = await fetchAllWithTimeout(30000);

  const tasks = [];
  tasks.push(...buildListingTasks({ team, network, events, achievements, announcements, credits }));

  for (const m of team) {
    if (!m || (!m.slug && !m.id)) continue;
    tasks.push(teamMemberPage(m));
  }
  for (const n of network) {
    if (!n || !n.slug) continue;
    if (n.status && n.status !== 'VERIFIED') continue;
    if (n.isPublic === false) continue;
    const t = networkProfilePage(n);
    if (t) tasks.push(t);
  }
  for (const e of events) {
    if (!e || !e.slug) continue;
    const t = eventPage(e);
    if (t) tasks.push(t);
  }
  for (const a of achievements) {
    if (!a || !a.slug) continue;
    const t = achievementPage(a);
    if (t) tasks.push(t);
  }
  for (const an of announcements) {
    if (!an || !an.slug) continue;
    if (an.expiresAt && new Date(an.expiresAt) < new Date()) continue;
    const t = announcementPage(an);
    if (t) tasks.push(t);
  }

  if (!tasks.length) {
    console.log('[prerender] phase 2: no entities to prerender — phase 1 listing pages remain in dist');
    const ms = Date.now() - started;
    console.log(`[prerender] done in ${ms}ms (only phase 1 pages written)`);
    return;
  }

  const { written, failed } = await writeTasks(tasks, template);

  const ms = Date.now() - started;
  console.log(`[prerender] wrote ${written} pages (${failed} failed) in ${ms}ms`);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  // Non-fatal: SPA must still ship even if prerender fails.
  process.exit(0);
});
