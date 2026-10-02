// UX#2 — open-redirect guard for post-login `?next=` return paths.
//
// A `next` value flows from a query param (or sessionStorage across the OAuth
// round-trip) into a navigation, so it MUST be validated or it becomes an
// open-redirect: `?next=https://evil.example/phish` would bounce a freshly
// authenticated user off-site. We resolve `next` against the current origin
// and only accept it when the resolved origin is one we control (this origin
// plus the known codescriet subdomains, so the playground cross-subdomain
// handoff still works). Anything else → null (caller falls back to /dashboard).
// Safe in both Vite (import.meta.env injected) and node --test (no env shim).
const IS_DEV = typeof import.meta !== 'undefined'
  && Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

export function getSafeNextUrl(
  rawNext: string | null | undefined,
  origin: string = window.location.origin,
): string | null {
  if (!rawNext) return null;
  try {
    const parsed = new URL(rawNext, origin);
    const allowedOrigins = new Set([
      origin,
      'https://codescriet.dev',
      'https://www.codescriet.dev',
      'https://code.codescriet.dev',
      ...(IS_DEV
        ? ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']
        : []),
    ]);
    return allowedOrigins.has(parsed.origin) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Strict same-origin **relative** path check (`/^\/(?!\/)/` — a single leading
 * slash, not `//`). Used where only an in-app SPA path is acceptable (no
 * cross-subdomain handoff), e.g. the OAuth-callback post-exchange redirect.
 * Returns the path as-is when safe, else null.
 */
export function getSafeRelativePath(rawNext: string | null | undefined): string | null {
  if (!rawNext) return null;
  // Reject protocol-relative (`//host`), absolute URLs, and anything not
  // starting with exactly one slash.
  if (!/^\/(?!\/)/.test(rawNext)) return null;
  // Defense-in-depth: a backslash can be normalized to `/` by some browsers,
  // turning `/\evil.com` into `//evil.com`. Reject control chars + backslashes
  // (detecting control chars is the intent, hence the rule disable).
  // eslint-disable-next-line no-control-regex
  if (/[\\\x00-\x1f]/.test(rawNext)) return null;
  return rawNext;
}
