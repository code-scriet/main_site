import { logger } from './logger.js';
import { prisma } from '../lib/prisma.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'codescriet.dev';
const BASE_URL = `https://${HOST}`;

function getIndexNowKey(): string {
  return process.env.INDEXNOW_KEY?.trim() || '';
}

function getIndexNowKeyLocation(key: string): string {
  return `https://${HOST}/${key}.txt`;
}

function isIndexNowConfigured(): boolean {
  return getIndexNowKey().length > 0;
}

/**
 * Submit a single URL to IndexNow (fire-and-forget).
 * Logs success/failure but never throws.
 */
export function submitUrl(path: string): void {
  if (!isIndexNowConfigured()) {
    logger.debug('[IndexNow] Skipping submitUrl because INDEXNOW_KEY is not configured');
    return;
  }

  const indexNowKey = getIndexNowKey();

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  fetch(`${INDEXNOW_ENDPOINT}?url=${encodeURIComponent(url)}&key=${indexNowKey}`, {
    method: 'GET',
  })
    .then((res) => {
      if (res.ok || res.status === 202) {
        logger.info('[IndexNow] URL submitted', { url, status: res.status });
      } else {
        logger.warn('[IndexNow] Submission rejected', { url, status: res.status });
      }
    })
    .catch((err) => {
      logger.warn('[IndexNow] Submission failed', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * Submit multiple URLs to IndexNow in a single batch (up to 10,000).
 * Returns { submitted, status } on success, or throws on network error.
 */
export async function submitUrls(paths: string[]): Promise<{ submitted: number; status: number }> {
  if (paths.length === 0) return { submitted: 0, status: 200 };
  if (!isIndexNowConfigured()) {
    logger.warn('[IndexNow] Skipping bulk submission because INDEXNOW_KEY is not configured');
    return { submitted: 0, status: 503 };
  }

  const indexNowKey = getIndexNowKey();

  const urlList = paths.map((p) => (p.startsWith('http') ? p : `${BASE_URL}${p}`));

  const body = {
    host: HOST,
    key: indexNowKey,
    keyLocation: getIndexNowKeyLocation(indexNowKey),
    urlList,
  };

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  if (res.ok || res.status === 202) {
    logger.info('[IndexNow] Bulk submission accepted', {
      count: urlList.length,
      status: res.status,
    });
  } else {
    const text = await res.text().catch(() => '');
    logger.warn('[IndexNow] Bulk submission rejected', {
      count: urlList.length,
      status: res.status,
      body: text.slice(0, 500),
    });
  }

  return { submitted: urlList.length, status: res.status };
}

/**
 * Collect all indexable URLs from the database and submit them to IndexNow.
 */
export async function submitAllUrls(): Promise<{ submitted: number; status: number; urls: string[] }> {
  // Static pages
  const staticPaths = [
    '/',
    '/events',
    '/achievements',
    '/announcements',
    '/network',
    '/team',
    '/about',
    '/join-us',
    '/join-our-network',
  ];

  // Dynamic pages from database
  const [events, achievements, announcements, teamMembers, networkProfiles] = await Promise.all([
    prisma.event.findMany({ select: { slug: true } }),
    prisma.achievement.findMany({ select: { slug: true } }),
    prisma.announcement.findMany({ select: { slug: true } }),
    prisma.teamMember.findMany({ where: { slug: { not: null } }, select: { slug: true } }),
    prisma.networkProfile.findMany({
      where: { status: 'VERIFIED', isPublic: true, slug: { not: null } },
      select: { slug: true },
    }),
  ]);

  const dynamicPaths = [
    ...events.filter((e) => e.slug).map((e) => `/events/${e.slug}`),
    ...achievements.filter((a) => a.slug).map((a) => `/achievements/${a.slug}`),
    ...announcements.filter((a) => a.slug).map((a) => `/announcements/${a.slug}`),
    ...teamMembers.filter((m) => m.slug).map((m) => `/team/${m.slug}`),
    ...networkProfiles.filter((p) => p.slug).map((p) => `/network/${p.slug}`),
  ];

  const allPaths = [...staticPaths, ...dynamicPaths];
  const allUrls = allPaths.map((p) => `${BASE_URL}${p}`);

  const result = await submitUrls(allPaths);

  return { ...result, urls: allUrls };
}
