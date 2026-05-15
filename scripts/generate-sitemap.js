// scripts/generate-sitemap.js
// Runs during frontend build to create a complete sitemap.xml
// Tries to fetch the dynamic sitemap from the API (includes event/announcement slugs).
// Falls back to a static-pages-only sitemap if the API is unavailable.

const SITE_URL = 'https://codescriet.dev';

// Trailing slashes are intentional. Render's static service does NOT
// auto-resolve clean URLs (/about → /about/index.html) and the catch-all
// rewrite is configured in Render's UI (not render.yaml), so /about
// without a slash returns the homepage shell. /about/ does resolve to
// the prerendered file. Until Render's dashboard rewrite is fixed,
// listing routes use trailing-slash form so crawlers see unique content.
const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/events/', priority: '0.9', changefreq: 'daily' },
  { path: '/achievements/', priority: '0.9', changefreq: 'daily' },
  { path: '/announcements/', priority: '0.8', changefreq: 'daily' },
  { path: '/network/', priority: '0.8', changefreq: 'daily' },
  { path: '/team/', priority: '0.7', changefreq: 'monthly' },
  { path: '/about/', priority: '0.7', changefreq: 'monthly' },
  { path: '/credits/', priority: '0.5', changefreq: 'monthly' },
  { path: '/contact/', priority: '0.5', changefreq: 'monthly' },
  { path: '/join-us/', priority: '0.8', changefreq: 'weekly' },
  { path: '/privacy-policy/', priority: '0.3', changefreq: 'yearly' },
];

function buildStaticSitemap() {
  const today = new Date().toISOString().split('T')[0];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const page of STATIC_PAGES) {
    xml += '  <url>\n';
    xml += `    <loc>${SITE_URL}${page.path}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += '  </url>\n';
  }
  xml += '</urlset>';
  return xml;
}

async function main() {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  // Resolve output path relative to this script's location, NOT the CWD.
  // Lets the script be invoked from anywhere — including npm's prebuild
  // hook that runs in apps/web/ rather than the repo root.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const SITEMAP_PATH = path.resolve(__dirname, '..', 'apps/web/public/sitemap.xml');

  const apiUrl = process.env.VITE_API_URL || process.env.BACKEND_URL || 'https://api.codescriet.dev';

  // Try to fetch the full dynamic sitemap from the API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${apiUrl}/sitemap.xml`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const xml = await res.text();
      if (xml.includes('<urlset')) {
        fs.writeFileSync(SITEMAP_PATH, xml);
        console.log(`✅ Sitemap generated from API — dynamic URLs included`);
        return;
      }
    }
    console.log(`⚠️  API returned status ${res.status}, using static fallback`);
  } catch (e) {
    console.log(`⚠️  Could not reach API (${e.name}), using static fallback`);
  }

  // Fallback: write a sitemap with static pages only
  fs.writeFileSync(SITEMAP_PATH, buildStaticSitemap());
  console.log('✅ Static-only sitemap generated');
}

main();
