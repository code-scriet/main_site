import express, { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const sitemapRouter = express.Router();

/**
 * Generate dynamic sitemap.xml with all events and achievements
 * GET /api/sitemap.xml
 */
sitemapRouter.get('.xml', async (req: Request, res: Response) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://codescriet.dev';

    // Fetch all events with slugs
    const events = await prisma.event.findMany({
      select: {
        slug: true,
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
        updatedAt: true,
        featured: true,
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
      { path: '/team', priority: '0.7', changefreq: 'monthly' },
      { path: '/announcements', priority: '0.7', changefreq: 'weekly' },
    ];

    // Generate XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add static pages
    for (const page of staticPages) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${page.path}</loc>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Add events
    for (const event of events) {
      if (!event.slug) continue; // Skip if no slug
      const priority = event.featured ? '0.85' : '0.7';
      const lastmod = event.updatedAt.toISOString().split('T')[0];
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/events/${event.slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Add achievements
    for (const achievement of achievements) {
      if (!achievement.slug) continue; // Skip if no slug
      const priority = achievement.featured ? '0.85' : '0.7';
      const lastmod = achievement.updatedAt.toISOString().split('T')[0];
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/achievements/${achievement.slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    // Return as XML
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sitemap',
    });
  }
});

/**
 * Generate robots.txt that points to dynamic sitemap
 * GET /api/robots.txt
 */
sitemapRouter.get('/robots.txt', (req: Request, res: Response) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://codescriet.dev';
  
  let robots = 'User-agent: *\n';
  robots += 'Allow: /\n';
  robots += 'Disallow: /admin\n';
  robots += 'Disallow: /api\n';
  robots += 'Disallow: /auth\n';
  robots += 'Disallow: /*.json\n';
  robots += '\n';
  robots += '# Sitemaps\n';
  robots += `Sitemap: ${baseUrl}/api/sitemap.xml\n`;
  robots += '\n';
  robots += '# Crawl delay\n';
  robots += 'Crawl-delay: 1\n';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
  res.send(robots);
});
