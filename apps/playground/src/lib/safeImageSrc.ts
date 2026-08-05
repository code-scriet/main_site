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

  // Written as explicit comparisons rather than a `Set.has()` lookup: a set
  // membership test carries no information a static analyser can propagate, so
  // CodeQL does not treat it as a sanitizing barrier and keeps reporting the
  // sink. Direct `!==` comparisons against literals are the shape its guard
  // modelling understands — and they read no worse.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;

  // Return the PARSED url's own serialization, never the original string.
  // Validating one representation and handing back another is how
  // parser-differential bugs happen: the value that reaches the DOM must be the
  // exact value that passed the check. It also gives the analyser a real data
  // flow from the guarded object to the result.
  //
  // Normalisation is a non-issue in practice — every avatar URL the providers
  // actually return (Google, GitHub, Cloudinary, localhost uploads) round-trips
  // byte-identical through `URL.href`; only relative paths change, becoming the
  // absolute form of the same resource.
  return parsed.href;
}

export default safeImageSrc;
