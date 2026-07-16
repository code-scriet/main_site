// NAT-safe key for the Socket.io connection limiter (utils/socket.ts).
//
// The problem mirrors the HTTP limiters: a 200-250 student contest hall shares
// ONE campus NAT IP, so a 30-connection/60s IP bucket lets only 30
// dashboard/notification sockets connect per MINUTE campus-wide — the rest get
// RATE_LIMITED and socket.io retry-storms.
//
// The fix mirrors rateLimitKey.ts EXACTLY in spirit: a handshake carrying a
// VALID access token is keyed per-user (`u:<userId>`); everything else falls to
// the IP bucket (`ip:<ip>`). Signature verification (`verifyToken`, sync HMAC)
// is what makes this safe — an attacker rotating garbage/forged tokens fails
// verification and stays pinned to their IP bucket, so per-user buckets can't be
// minted by junk. `verifyToken` also rejects special-purpose (purpose-carrying)
// tokens, so those fall to the IP bucket too.
//
// Sockets have one token source HTTP doesn't — `handshake.auth.token` (how
// socket.io-client passes it) — so the extractor checks that first, then falls
// back to the same Authorization: Bearer / scriet_session cookie sources the
// HTTP limiter reads (extractSessionToken).

import type { IncomingHttpHeaders } from 'node:http';
import { verifyToken } from './jwt.js';
import { extractSessionToken } from './rateLimitKey.js';

export interface SocketConnectHandshakeLike {
  /**
   * Pre-resolved client IP (from getSocketClientIp) — the anonymous bucket key.
   * IP resolution (XFF/CF-spoofing safety) stays in clientIp.ts; this module
   * only decides user-vs-IP given the already-resolved address.
   */
  ip: string;
  /** socket.handshake.auth — the socket.io client's `auth: { token }` payload. */
  auth?: { token?: unknown } | null;
  /** socket.handshake.headers — Authorization/Cookie fallback token sources. */
  headers?: IncomingHttpHeaders;
}

/**
 * Pull the handshake token the way authenticateSocketConnection would: the
 * socket.io `auth.token` first, then Bearer header / scriet_session cookie
 * (shared with the HTTP limiter's extractSessionToken).
 */
export function extractSocketHandshakeToken(handshake: SocketConnectHandshakeLike): string | null {
  const authToken = handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }
  return extractSessionToken({ headers: handshake.headers ?? {} });
}

/**
 * Connection-limiter bucket key: `u:<userId>` for a verified session, else
 * `ip:<ip>`. Verification is the guard — invalid/expired/wrong-secret/
 * special-purpose tokens all fall to the IP bucket, exactly like rateLimitKey.ts,
 * so this cannot be used to mint fresh per-user buckets.
 */
export function resolveSocketConnectKey(handshake: SocketConnectHandshakeLike): string {
  const token = extractSocketHandshakeToken(handshake);
  if (token) {
    try {
      return `u:${verifyToken(token).userId}`;
    } catch {
      // Invalid/expired/forged/special-purpose token → anonymous IP bucket.
    }
  }
  return `ip:${handshake.ip}`;
}

export function isUserSocketConnectKey(key: string): boolean {
  return key.startsWith('u:');
}
