import { PassportStatic } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/audit.js';
import { invalidateCachedAuthUser } from '../utils/userAuthCache.js';
import { isSuperAdmin } from '../utils/superAdmin.js';
import { selectVerifiedGithubEmail, isGoogleEmailVerified, oauthLinkRequiresPasswordReset } from '../utils/oauthEmail.js';
import { getCachedSettings } from '../utils/settingsCache.js';

/**
 * L1: the admin's registrationOpen toggle gates ALL new-account creation —
 * the email/password endpoint enforces it directly, and OAuth first sign-ins
 * (which create accounts implicitly) must respect it too. Existing accounts
 * keep signing in. Fails open on a settings read error: an outage must not
 * lock out OAuth logins.
 */
const isRegistrationClosed = async (): Promise<boolean> => {
  try {
    const settings = await getCachedSettings();
    return settings?.registrationOpen === false;
  } catch {
    return false;
  }
};

const getCookie = (req: Request, name: string): string | undefined => {
  const cookies = req.headers.cookie;
  if (!cookies) return undefined;
  const match = cookies.split(';').find((cookie) => cookie.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=').trim()) : undefined;
};

const isNetworkIntentRequest = (req: Request): boolean => getCookie(req, 'oauth_intent') === 'network';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';

/**
 * SECURITY (R1 — pre-account-hijacking defense). Registration does not verify
 * email ownership, so an attacker could pre-register `victim@email` with a known
 * password. When the real owner later signs in via OAuth (which DOES prove email
 * ownership), they must not inherit an account whose password the attacker still
 * controls. A verified OAuth login is therefore treated as authoritative: if it
 * resolves to a PRE-EXISTING account that still carries a password, we clear that
 * unverified credential and bump `tokenVersion` to evict any attacker sessions.
 * The legitimate owner keeps full access via OAuth (their freshly issued session
 * carries the bumped version) and can re-establish a password via reset.
 *
 * Exemptions (handled in oauthLinkRequiresPasswordReset): freshly created
 * accounts, pure-OAuth accounts, and the super admin (env-managed password).
 * OAuth sign-in itself is unaffected — this only runs as a side effect on link.
 */
async function securePreExistingAccountOnOAuthLink(
  user: { id: string; email?: string | null; role?: string | null; password?: string | null },
  isNewUser: boolean,
  provider: 'google' | 'github',
): Promise<void> {
  if (!oauthLinkRequiresPasswordReset(user, isNewUser, isSuperAdmin(user))) {
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { password: null, tokenVersion: { increment: 1 } },
  });
  invalidateCachedAuthUser(user.id);
  await auditLog(user.id, 'OAUTH_LINK_PASSWORD_CLEARED', 'auth', user.id, { provider });
  logger.warn('Cleared unverified password on OAuth link (R1 pre-hijack defense)', {
    userId: user.id,
    provider,
  });
}

export function setupPassport(passport: PassportStatic) {
  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${backendUrl}/api/auth/google/callback`,
          passReqToCallback: true,
        },
        async (req: Request, accessToken, refreshToken, profile, done) => {
          try {
            // SECURITY (H1): only authenticate on a provider-verified email.
            const primaryEmail = profile.emails?.[0];
            const email = primaryEmail?.value?.trim().toLowerCase();
            if (!email) {
              return done(new Error('No email found'), undefined);
            }
            if (!isGoogleEmailVerified(primaryEmail)) {
              return done(new Error('A verified Google email is required to sign in.'), undefined);
            }

            // Check if this is a network signup intent from cookies
            const isNetworkIntent = isNetworkIntentRequest(req);

            let user = await prisma.user.findFirst({
              where: { email: { equals: email, mode: 'insensitive' } },
            });
            let isNewUser = false;

            if (!user) {
              // L1: no implicit account creation while registration is closed.
              if (await isRegistrationClosed()) {
                return done(new Error('Registration is currently closed. New account creation is disabled right now.'), undefined);
              }
              isNewUser = true;
              user = await prisma.user.create({
                data: {
                  name: profile.displayName || 'User',
                  email,
                  avatar: profile.photos?.[0]?.value,
                  oauthProvider: 'google',
                  oauthId: profile.id,
                  // Role upgrades to NETWORK are handled centrally in /auth/*/callback.
                  role: 'USER',
                },
              });
            }

            // SECURITY (R1): neutralize an attacker-set password on a pre-existing account.
            await securePreExistingAccountOnOAuthLink(user, isNewUser, 'google');

            // Send welcome email only to new regular users (not NETWORK signups)
            if (isNewUser && email && !isNetworkIntent) {
              emailService.sendWelcome(email, user.name).catch(err => {
                logger.error('Failed to send welcome email', { error: err instanceof Error ? err.message : 'Unknown' });
              });
            }

            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        }
      )
    );
  }

  // GitHub OAuth Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${backendUrl}/api/auth/github/callback`,
          scope: ['user:email'],
          // SECURITY (H1): request the full /user/emails list so every address
          // carries its real `verified`/`primary` flags. Without this,
          // passport-github2 returns only the primary email and drops the
          // verified flag, making any verification check silently dead code.
          allRawEmails: true,
          passReqToCallback: true,
        },
        async (req: Request, accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            // SECURITY (H1): authenticate ONLY on a GitHub-verified email — never
            // fall back to an unverified one (account-takeover guard). Selection
            // logic + rationale live in selectVerifiedGithubEmail (unit-tested).
            // `allRawEmails: true` (strategy option) is what populates the flags.
            const email = selectVerifiedGithubEmail(profile.emails);

            if (!email) {
              return done(new Error('A verified GitHub email is required to sign in. Verify your email on GitHub and try again.'), undefined);
            }

            // Check if this is a network signup intent from cookies
            const isNetworkIntent = isNetworkIntentRequest(req);

            let user = await prisma.user.findFirst({
              where: { email: { equals: email, mode: 'insensitive' } },
            });
            let isNewUser = false;

            if (!user) {
              // L1: no implicit account creation while registration is closed.
              if (await isRegistrationClosed()) {
                return done(new Error('Registration is currently closed. New account creation is disabled right now.'), undefined);
              }
              isNewUser = true;
              user = await prisma.user.create({
                data: {
                  name: profile.displayName || profile.username || 'User',
                  email,
                  avatar: profile.photos?.[0]?.value,
                  oauthProvider: 'github',
                  oauthId: profile.id,
                  // Role upgrades to NETWORK are handled centrally in /auth/*/callback.
                  role: 'USER',
                },
              });
            }

            // SECURITY (R1): neutralize an attacker-set password on a pre-existing account.
            await securePreExistingAccountOnOAuthLink(user, isNewUser, 'github');

            // Send welcome email only to new regular users (not NETWORK signups)
            if (isNewUser && email && !isNetworkIntent) {
              emailService.sendWelcome(email, user.name).catch(err => {
                logger.error('Failed to send welcome email', { error: err instanceof Error ? err.message : 'Unknown' });
              });
            }

            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        }
      )
    );
  }

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}
