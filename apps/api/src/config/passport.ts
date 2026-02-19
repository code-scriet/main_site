import { PassportStatic } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';

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
            const email = profile.emails?.[0]?.value?.trim().toLowerCase();
            if (!email) {
              return done(new Error('No email found'), undefined);
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
          passReqToCallback: true,
        },
        async (req: Request, accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            const emailCandidates = Array.isArray(profile.emails)
              ? profile.emails
                  .map((entry: { value?: string; verified?: boolean | null }) => ({
                    value: entry.value?.trim().toLowerCase(),
                    verified: Boolean(entry.verified),
                  }))
                  .filter((entry: { value?: string }) => Boolean(entry.value))
              : [];

            const verifiedEmail = emailCandidates.find(
              (entry: { value?: string; verified: boolean }) => entry.verified
            );
            const fallbackEmail = emailCandidates[0];
            const email = (verifiedEmail?.value || fallbackEmail?.value || '').trim();

            if (!email) {
              return done(new Error('GitHub account email is required. Please make a public or verified email available on GitHub and try again.'), undefined);
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
