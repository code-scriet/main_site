import express, { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { submitAllUrls } from '../utils/indexnow.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

const INDEXNOW_KEY = process.env.INDEXNOW_KEY?.trim() || '';
export const sitemapRouter = express.Router();
export const robotsRouter = express.Router();

/**
 * Generate dynamic sitemap.xml with all events, achievements, and announcements
 * GET /sitemap.xml (served at root level for Google)
 */
sitemapRouter.get('/', async (_req: Request, res: Response) => {
  // CORS headers for Google and other bots
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://codescriet.dev';

    const [events, achievements, announcements, teamMembers, networkProfiles] = await Promise.all([
      prisma.event.findMany({
        select: {
          slug: true,
          updatedAt: true,
          featured: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.achievement.findMany({
        select: {
          slug: true,
          updatedAt: true,
          featured: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.announcement.findMany({
        select: {
          slug: true,
          updatedAt: true,
          priority: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.teamMember.findMany({
        select: { id: true, slug: true, createdAt: true },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.networkProfile.findMany({
        where: { status: 'VERIFIED', isPublic: true, slug: { not: null } },
        select: { slug: true, updatedAt: true, isFeatured: true },
        orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    // Build static pages with priority
    const staticPages = [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/events', priority: '0.9', changefreq: 'daily' },
      { path: '/achievements', priority: '0.9', changefreq: 'daily' },
      { path: '/announcements', priority: '0.8', changefreq: 'daily' },
      { path: '/network', priority: '0.8', changefreq: 'daily' },
      { path: '/team', priority: '0.7', changefreq: 'monthly' },
      { path: '/about', priority: '0.7', changefreq: 'monthly' },
      { path: '/join-us', priority: '0.8', changefreq: 'weekly' },
      { path: '/join-our-network', priority: '0.7', changefreq: 'weekly' },
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

    for (const member of teamMembers) {
      const profileSlugOrId = member.slug || member.id;
      if (!profileSlugOrId) continue;
      const lastmod = member.createdAt.toISOString().split('T')[0];
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/team/${profileSlugOrId}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += '    <changefreq>monthly</changefreq>\n';
      xml += '    <priority>0.65</priority>\n';
      xml += '  </url>\n';
    }

    for (const profile of networkProfiles) {
      if (!profile.slug) continue;
      const lastmod = profile.updatedAt.toISOString().split('T')[0];
      const priority = profile.isFeatured ? '0.75' : '0.6';
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/network/${profile.slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += '    <changefreq>monthly</changefreq>\n';
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
    logger.error('Sitemap generation error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // Return fallback sitemap with static pages only
    const fallback = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://codescriet.dev</loc><priority>1.0</priority></url>\n<url><loc>https://codescriet.dev/events</loc><priority>0.9</priority></url>\n<url><loc>https://codescriet.dev/achievements</loc><priority>0.9</priority></url>\n<url><loc>https://codescriet.dev/announcements</loc><priority>0.8</priority></url>\n<url><loc>https://codescriet.dev/team</loc><priority>0.7</priority></url>\n<url><loc>https://codescriet.dev/network</loc><priority>0.8</priority></url>\n</urlset>';
    res.send(fallback);
  }
});

/**
 * Generate robots.txt
 * GET /robots.txt (mounted at root)
 */
robotsRouter.get('/', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const frontendUrl = process.env.FRONTEND_URL || 'https://codescriet.dev';
  
  let robots = '# robots.txt for codescriet.dev\n';
  robots += '# Updated: ' + new Date().toISOString().split('T')[0] + '\n\n';
  robots += 'User-agent: *\n';
  robots += 'Allow: /\n';
  robots += 'Allow: /events/\n';
  robots += 'Allow: /achievements/\n';
  robots += 'Allow: /announcements/\n';
  robots += 'Allow: /team\n';
  robots += 'Allow: /network\n';
  robots += 'Allow: /about\n';
  robots += 'Allow: /join-us\n';
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
  robots += `Sitemap: ${frontendUrl}/sitemap.xml\n`;
  robots += '\n';
  robots += '# Crawl-delay for polite crawling\n';
  robots += 'Crawl-delay: 1\n';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(robots);
});

// ============================================
// IndexNow Router
// ============================================
export const indexNowRouter = express.Router();

/**
 * Serve the IndexNow key verification file
 * GET /<INDEXNOW_KEY>.txt
 */
if (INDEXNOW_KEY) {
  indexNowRouter.get(`/${INDEXNOW_KEY}.txt`, (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(INDEXNOW_KEY);
  });
} else {
  logger.warn('[IndexNow] INDEXNOW_KEY is not configured; key verification endpoint is disabled.');
}

/**
 * Submit all indexable URLs to IndexNow (admin-only)
 * POST /api/indexnow/submit-all
 */
indexNowRouter.post('/submit-all', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const result = await submitAllUrls();

    logger.info('[IndexNow] Admin triggered bulk submission', {
      submitted: result.submitted,
      status: result.status,
    });

    res.json({
      success: true,
      data: {
        submitted: result.submitted,
        status: result.status,
        urls: result.urls,
      },
      message: `${result.submitted} URLs submitted to IndexNow`,
    });
  } catch (error) {
    logger.error('[IndexNow] Bulk submission failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { message: 'Failed to submit URLs to IndexNow' },
    });
  }
});
