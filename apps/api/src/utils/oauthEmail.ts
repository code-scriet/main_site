// Pure helpers for the security-critical parts of OAuth sign-in. Kept free of
// Express/Passport/Prisma so they can be unit-tested in isolation (see
// oauthEmail.test.ts). See H1/M6 in the security audit.

export interface RawProviderEmail {
  value?: string | null;
  verified?: boolean | null;
  primary?: boolean | null;
}

/**
 * Choose the email to authenticate a GitHub OAuth login on.
 *
 * SECURITY (H1): returns ONLY a GitHub-verified address and never falls back to
 * an unverified one. Falling back would let an attacker add a victim's email to
 * their own GitHub account (which leaves it unverified, since they don't control
 * it) and then sign in as the victim — full account takeover. Requires the
 * strategy to be configured with `allRawEmails: true` so the `verified`/`primary`
 * flags are actually populated; otherwise passport-github2 returns only the
 * primary email and drops the flags, silently disabling this check.
 *
 * Prefers the primary verified email, then any verified email. Returns null when
 * no verified email is available (caller must reject the login).
 */
export function selectVerifiedGithubEmail(emails: unknown): string | null {
  if (!Array.isArray(emails)) return null;

  const candidates = emails
    .map((entry: RawProviderEmail) => ({
      value: typeof entry?.value === 'string' ? entry.value.trim().toLowerCase() : '',
      verified: Boolean(entry?.verified),
      primary: Boolean(entry?.primary),
    }))
    .filter((entry) => entry.value.length > 0);

  const primaryVerified = candidates.find((entry) => entry.verified && entry.primary);
  if (primaryVerified) return primaryVerified.value;

  const anyVerified = candidates.find((entry) => entry.verified);
  return anyVerified ? anyVerified.value : null;
}

/**
 * Whether a Google OAuth email is acceptable.
 *
 * SECURITY (H1): Google's OpenID profile carries `email_verified`. Google-managed
 * accounts are always verified, so we only reject when verification is
 * EXPLICITLY false (the rare Workspace unverified-alias case). Missing/undefined
 * is treated as acceptable to avoid breaking the common path.
 */
export function isGoogleEmailVerified(email: { verified?: unknown } | null | undefined): boolean {
  return email?.verified !== false;
}

/**
 * Validate the OAuth `state` echoed back by the provider against the value we
 * stored in a cookie when the flow started (M6, login-CSRF protection). Both
 * must be present and equal. The nonce is single-use and high-entropy
 * (randomUUID), so a plain comparison is sufficient.
 */
export function oauthStateMatches(
  expected: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  return Boolean(expected) && Boolean(actual) && expected === actual;
}
