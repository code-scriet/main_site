import express, { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const sitemapRouter = express.Router();

/**
 * Generate dynamic sitemap.xml with all events, achievements, and announcements
 * GET /sitemap.xml (served at root level for Google)
 */
sitemapRouter.get('/', async (req: Request, res: Response) => {
  // CORS headers for Google and other bots
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://codescriet.dev';

    // Fetch all events with slugs
    const events = await prisma.event.findMany({
      select: {
        slug: true,
        title: true,
        updatedAt: true,
        featured: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Fetch all achievements with slugs
    const achievements = await prisma.achievement.findMany({
      select: {
        slug: true,
        title: true,
        updatedAt: true,
        featured: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Fetch all announcements with slugs
    const announcements = await prisma.announcement.findMany({
      select: {
        slug: true,
        title: true,
        updatedAt: true,
        priority: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Build static pages with priority
    const staticPages = [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/events', priority: '0.9', changefreq: 'daily' },
      { path: '/achievements', priority: '0.9', changefreq: 'daily' },
      { path: '/announcements', priority: '0.8', changefreq: 'daily' },
      { path: '/team', priority: '0.7', changefreq: 'monthly' },
      { path: '/about', priority: '0.7', changefreq: 'monthly' },
      { path: '/join-us', priority: '0.8', changefreq: 'weekly' },
    ];

    const today = new Date().toISOString().split('T')[0];

    // Generate XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add static pages
    for (const page of staticPages) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${page.path}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Add events - each event gets indexed
    for (const event of events) {
      if (!event.slug) continue;
      const priority = event.featured ? '0.85' : '0.7';
      const lastmod = event.updatedAt.toISOString().split('T')[0];
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/events/${event.slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Add achievements - each achievement gets indexed
    for (const achievement of achievements) {
      if (!achievement.slug) continue;
      const priority = achievement.featured ? '0.85' : '0.7';
      const lastmod = achievement.updatedAt.toISOString().split('T')[0];
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/achievements/${achievement.slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Add announcements - each announcement gets indexed
    for (const announcement of announcements) {
      if (!announcement.slug) continue;
      const priority = announcement.priority === 'HIGH' ? '0.8' : '0.65';
      const lastmod = announcement.updatedAt.toISOString().split('T')[0];
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/announcements/${announcement.slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    // Return as XML with proper headers
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.setHeader('X-Robots-Tag', 'noindex'); // Don't index the sitemap itself
    res.send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // Return fallback sitemap with static pages only
    const fallback = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://codescriet.dev</loc><priority>1.0</priority></url>\n<url><loc>https://codescriet.dev/events</loc><priority>0.9</priority></url>\n<url><loc>https://codescriet.dev/achievements</loc><priority>0.9</priority></url>\n<url><loc>https://codescriet.dev/announcements</loc><priority>0.8</priority></url>\n</urlset>';
    res.send(fallback);
  }
});

/**
 * Generate robots.txt
 * GET /robots.txt
 */
sitemapRouter.get('/robots', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const baseUrl = process.env.FRONTEND_URL || 'https://codescriet.dev';
  const apiUrl = process.env.API_URL || 'https://api.codescriet.dev';
  
  let robots = '# robots.txt for codescriet.dev\n';
  robots += '# Updated: ' + new Date().toISOString().split('T')[0] + '\n\n';
  robots += 'User-agent: *\n';
  robots += 'Allow: /\n';
  robots += 'Allow: /events/\n';
  robots += 'Allow: /achievements/\n';
  robots += 'Allow: /announcements/\n';
  robots += 'Allow: /team\n';
  robots += 'Allow: /about\n';
  robots += '\n';
  robots += '# Disallow admin and auth areas\n';
  robots += 'Disallow: /admin\n';
  robots += 'Disallow: /dashboard\n';
  robots += 'Disallow: /auth\n';
  robots += 'Disallow: /profile\n';
  robots += 'Disallow: /signin\n';
  robots += 'Disallow: /signup\n';
  robots += '\n';
  robots += '# Sitemap\n';
  robots += `Sitemap: ${apiUrl}/sitemap.xml\n`;
  robots += '\n';
  robots += '# Crawl-delay for polite crawling\n';
  robots += 'Crawl-delay: 1\n';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(robots);
});
