import { PassportStatic } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { selectVerifiedGithubEmail, isGoogleEmailVerified } from '../utils/oauthEmail.js';

const getCookie = (req: Request, name: string): string | undefined => {
  const cookies = req.headers.cookie;
  if (!cookies) return undefined;
  const match = cookies.split(';').find((cookie) => cookie.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=').trim()) : undefined;
};

const isNetworkIntentRequest = (req: Request): boolean => getCookie(req, 'oauth_intent') === 'network';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';

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
