// scripts/prerender.js
// Build-time prerender for SEO-critical detail pages.
//
// After `vite build`, this script walks the public API and emits a real HTML
// file at apps/web/dist/<route>/<slug>/index.html for every team member,
// network profile, event, achievement, and announcement.
//
// Each output contains:
//   - Real <title> and <meta name="description">
//   - og:* / twitter:* tags using the entity image
//   - rel=canonical to the slug URL
//   - JSON-LD (Person / Event / NewsArticle / BlogPosting / BreadcrumbList)
//   - A visible prerender block inside #root (h1, image, bio) so non-JS
//     crawlers see the name. React's createRoot wipes it on hydration.
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

  // Pull lists in parallel. All endpoints are public.
  const overall = setTimeout(() => {
    console.error('[prerender] global timeout — exiting');
    process.exit(0);
  }, FETCH_TIMEOUT_MS * 10);

  const [team, network, events, achievements, announcements] = await Promise.all([
    safeList('team', `${API_URL}/team`),
    safeList('network', `${API_URL}/network`),
    safeList('events', `${API_URL}/events`),
    safeList('achievements', `${API_URL}/achievements`),
    safeList('announcements', `${API_URL}/announcements`),
  ]);

  clearTimeout(overall);

  const tasks = [];

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
    console.log('[prerender] no entities to prerender — exiting');
    return;
  }

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

  const ms = Date.now() - started;
  console.log(`[prerender] wrote ${written} pages (${failed} failed) in ${ms}ms`);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  // Non-fatal: SPA must still ship even if prerender fails.
  process.exit(0);
});
