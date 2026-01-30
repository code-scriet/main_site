import { PassportStatic } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from '../lib/prisma.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';

export function setupPassport(passport: PassportStatic) {
  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email found'), undefined);
            }

            let user = await prisma.user.findUnique({ where: { email } });
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
                },
              });
            }

            // Send welcome email to new users
            if (isNewUser && email) {
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
          callbackURL: `${process.env.BACKEND_URL}/api/auth/github/callback`,
          scope: ['user:email'],
        },
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;

            let user = await prisma.user.findUnique({ where: { email } });
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
                },
              });
            }

            // Send welcome email to new users (skip github.local emails)
            if (isNewUser && email && !email.endsWith('@github.local')) {
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
