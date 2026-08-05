/**
 * Protocol allowlist for URLs that reach a DOM URL sink (`<img src>`).
 *
 * Why this exists: a playground user object can be built CLIENT-SIDE from an
 * unverified JWT payload handed over in the URL hash — `buildOptimisticUser()`
 * in AuthContext decodes `#token=...` and reads `payload.avatar` straight out
 * of it, before the server has confirmed anything. That makes `user.avatar` an
 * attacker-influenceable value flowing into `<img src>` (CodeQL flags it as
 * both client-side XSS and an unvalidated URL redirect).
 *
 * `javascript:` in an `img src` does not execute in current browsers, so the
 * practical severity is low — but "never put an unvalidated remote URL into a
 * DOM URL sink" is the rule the rest of this codebase already follows (see the
 * strict protocol whitelist from the March 2026 audit, and `safeNext.ts` on the
 * main site), and a one-line guard is cheaper than reasoning about which
 * browsers still honour which scheme.
 *
 * Allowed: absolute `http:`/`https:` URLs, and relative paths (resolved against
 * the current document, so they can only ever be same-origin). Everything else
 * — `javascript:`, `data:`, `blob:`, `vbscript:`, `file:`, unparseable input —
 * is rejected. Callers render their initials fallback on `undefined`.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Base used to resolve relative URLs when there is no document (tests/SSR). */
const FALLBACK_BASE = 'https://codescriet.dev';

export function safeImageSrc(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const base =
    typeof window !== 'undefined' && window.location?.href ? window.location.href : FALLBACK_BASE;

  let parsed: URL;
  try {
    // Resolving against a base also normalises the tab/newline/control
    // characters that `java\nscript:` style bypasses rely on — the URL parser
    // strips them before the scheme is determined.
    parsed = new URL(trimmed, base);
  } catch {
    return undefined;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return undefined;

  // Return the caller's original string rather than `parsed.href`: it is now
  // known-safe, and rewriting it would silently normalise URLs (percent
  // encoding, default ports) that image CDNs can be picky about.
  return trimmed;
}

export default safeImageSrc;
