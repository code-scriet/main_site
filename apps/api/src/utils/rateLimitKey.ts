// Rate-limit bucket keys that survive a campus NAT.
//
// The problem: every IP-keyed limiter treats a whole college hall as ONE
// client — 120-200 students on campus WiFi share one public IP, so a
// 500-req/15min IP bucket gives the entire room ~33 requests/min combined and
// a contest dies at the front door.
//
// The fix: requests carrying a VALID access token are keyed per-user
// (`u:<userId>`); everything else falls to the IP bucket. Signature
// verification is what makes this safe — an attacker rotating garbage tokens
// fails `verifyToken` and stays pinned to their IP bucket, so this cannot be
// used to mint fresh buckets. Getting a per-user bucket requires a real
// account, which is exactly the identity we want to meter.
//
// For the auth limiter (pre-auth endpoints like login), anonymous requests are
// additionally keyed by the credential email when present
// (`ip:<ip>:<email>`), so 200 students logging in from one NAT don't share one
// 15-min bucket — while brute-forcing a SINGLE account from that IP stays as
// tightly capped as before.

import type { Request } from 'express';
import { verifyToken } from './jwt.js';
import { getClientIp } from './clientIp.js';

const BEARER_PREFIX = 'Bearer ';
const SESSION_COOKIE_RE = /(?:^|;\s*)scriet_session=([^;]+)/;

/** Pull the access token the way authMiddleware would: Bearer header, then cookie. */
export function extractSessionToken(req: Pick<Request, 'headers'>): string | null {
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith(BEARER_PREFIX)) {
    const token = auth.slice(BEARER_PREFIX.length).trim();
    if (token) return token;
  }
  const cookieHeader = req.headers?.cookie;
  if (typeof cookieHeader === 'string') {
    const match = SESSION_COOKIE_RE.exec(cookieHeader);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return null;
}

interface KeyedRequest extends Request {
  __rateLimitKey?: string;
}

/**
 * General limiter key: `u:<userId>` for a verified session, else `ip:<ip>`.
 * Memoized on the request object — both `keyGenerator` and the per-key `max`
 * resolver call this, and the HMAC verify should run once per request.
 */
export function resolveRateLimitKey(req: Request): string {
  const keyed = req as KeyedRequest;
  if (keyed.__rateLimitKey) return keyed.__rateLimitKey;

  let key: string | null = null;
  const token = extractSessionToken(req);
  if (token) {
    try {
      key = `u:${verifyToken(token).userId}`;
    } catch {
      // Invalid/expired/special-purpose token → stays in the IP bucket.
    }
  }
  if (!key) key = `ip:${getClientIp(req)}`;
  keyed.__rateLimitKey = key;
  return key;
}

export function isUserRateLimitKey(key: string): boolean {
  return key.startsWith('u:');
}

/**
 * Auth limiter key: verified sessions per-user (covers `/auth/me` polling);
 * anonymous credential posts per (IP, email) so a NAT'd login storm works while
 * per-account brute force from one IP stays capped.
 */
export function resolveAuthRateLimitKey(req: Request): string {
  const base = resolveRateLimitKey(req);
  if (isUserRateLimitKey(base)) return base;
  const email = typeof (req.body as { email?: unknown } | undefined)?.email === 'string'
    ? (req.body as { email: string }).email.trim().toLowerCase().slice(0, 254)
    : '';
  return email ? `${base}:${email}` : base;
}
