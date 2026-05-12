import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport';
import { createServer } from 'http';
import { Prisma } from '@prisma/client';

import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { registrationsRouter } from './routes/registrations.js';
import { announcementsRouter } from './routes/announcements.js';
import { pollsRouter } from './routes/polls.js';
import { teamRouter } from './routes/team.js';
import { achievementsRouter } from './routes/achievements.js';
import { qotdRouter } from './routes/qotd.js';
import { usersRouter } from './routes/users.js';
import { statsRouter } from './routes/stats.js';
import { settingsRouter } from './routes/settings.js';
import { hiringRouter } from './routes/hiring.js';
import { certificatesRouter } from './routes/certificates.js';
import { signatoriesRouter } from './routes/signatories.js';
import { uploadRouter } from './routes/upload.js';
import { sitemapRouter, robotsRouter, indexNowRouter } from './routes/sitemap.js';
import { networkRouter } from './routes/network.js';
import { invitationsRouter } from './routes/invitations.js';
import { auditRouter } from './routes/audit.js';
import { mailRouter } from './routes/mail.js';
import { quizRouter } from './quiz/quizRouter.js';
import { initQuizSocket } from './quiz/quizSocket.js';
import { quizStore } from './quiz/quizStore.js';
import { playgroundRouter } from './routes/playground.js';
import { creditsRouter } from './routes/credits.js';
import { attendanceRouter } from './routes/attendance.js';
import { teamsRouter } from './routes/teams.js';
import competitionRouter, { recoverActiveRounds } from './routes/competition.js';
import { problemsRouter } from './routes/problems.js';
import { initializeAttendanceSocket } from './attendance/attendanceSocket.js';
import { setupPassport } from './config/passport.js';
import { requestLogger, logger } from './utils/logger.js';
import { ApiResponse, ErrorCodes } from './utils/response.js';
import { initializeDatabase, populateAnnouncementSlugs, populateProfileSlugs } from './utils/init.js';
import { initializeSocket } from './utils/socket.js';
import { authMiddleware, getAuthUser } from './middleware/auth.js';
import { requireRole } from './middleware/role.js';
import { emailService } from './utils/email.js';
import { prisma } from './lib/prisma.js';
import { startReminderScheduler, stopReminderScheduler, startQotdAutoPublishScheduler, stopQotdAutoPublishScheduler } from './utils/scheduler.js';
import { getJwtSecret } from './utils/jwt.js';
import { setRuntimeAttendanceJwtSecret } from './utils/attendanceToken.js';
import { updateEventStatuses } from './utils/eventStatus.js';

// Load monorepo root .env first, then local .env (local overrides root).
// In production (Render) neither file exists — env vars come from the dashboard.
dotenv.config({ path: '../../.env' });
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV === 'development' ? 'development' : 'production';
const ALLOWED_CODESCRIET_ORIGINS = [
  'https://codescriet.dev',
  'https://www.codescriet.dev',
  'https://api.codescriet.dev',
  'https://code.codescriet.dev',
  'https://app.codescriet.dev',
];
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isAllowedBrowserOrigin = (origin: string): boolean => {
  if (
    NODE_ENV === 'development' &&
    (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(origin)
    )
  ) {
    return true;
  }

  if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
    return true;
  }

  return ALLOWED_CODESCRIET_ORIGINS.includes(origin);
};

const hasSessionCookie = (cookieHeader?: string): boolean => {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((cookie) => cookie.trim().startsWith('scriet_session='));
};

const parseRefererOrigin = (referer?: string): string | null => {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

// Fail fast if primary auth secret is insecure/missing
getJwtSecret();

// Warn about missing optional-but-important config
if (!process.env.BREVO_API_KEY) {
  logger.warn('BREVO_API_KEY not set — all email functionality disabled (certificates, reminders, announcements)');
}
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  logger.warn('Cloudinary not fully configured — certificate PDF upload and image upload will fail');
}

const hydrateRuntimeSecurityEnvFromSettings = async () => {
  try {
    const securityColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'settings'
        AND column_name IN ('attendance_jwt_secret', 'indexnow_key')
    `;

    const availableColumns = new Set(securityColumns.map((row) => row.column_name));
    if (!availableColumns.has('attendance_jwt_secret') || !availableColumns.has('indexnow_key')) {
      logger.info('Security env columns are not present in this database yet; skipping runtime hydrate.', {
        hasAttendanceSecretColumn: availableColumns.has('attendance_jwt_secret'),
        hasIndexNowKeyColumn: availableColumns.has('indexnow_key'),
      });
      return;
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        attendanceJwtSecret: true,
        indexNowKey: true,
      },
    });

    if (!settings) {
      return;
    }

    const storedAttendanceSecret = settings.attendanceJwtSecret?.trim();
    const storedIndexNowKey = settings.indexNowKey?.trim();

    if (storedAttendanceSecret) {
      setRuntimeAttendanceJwtSecret(storedAttendanceSecret);
      logger.info('Loaded attendance JWT secret from settings for runtime usage', {
        source: 'settings',
      });
    }

    if (storedIndexNowKey) {
      process.env.INDEXNOW_KEY = storedIndexNowKey;
      logger.info('Loaded IndexNow key from settings for runtime usage', {
        source: 'settings',
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
      const missingColumn = String((error.meta as { column?: unknown } | undefined)?.column || '');
      if (missingColumn.includes('attendance_jwt_secret') || missingColumn.includes('indexnow_key')) {
        logger.info('Security env columns are not present in this database yet; skipping runtime hydrate.', {
          missingColumn,
        });
        return;
      }
    }

    logger.warn('Failed to hydrate runtime security env values from settings', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

let eventStatusInterval: NodeJS.Timeout | null = null;
const MAX_LISTEN_RETRIES = 5;
const LISTEN_RETRY_DELAY_MS = 1500;
const EVENT_STATUS_INTERVAL_MS = Number(process.env.EVENT_STATUS_INTERVAL_MS || 30 * 60 * 1000);
const ENABLE_BACKGROUND_SCHEDULERS = process.env.ENABLE_BACKGROUND_SCHEDULERS === 'true';

let eventStatusRunning = false;
const runEventStatusTick = async () => {
  // Skip if a previous tick is still running. On a slow DB (Neon cold-start
  // beyond the 30-min interval) we'd otherwise double-fire and race writes to
  // the same Event.status rows.
  if (eventStatusRunning) return;
  eventStatusRunning = true;
  try {
    await updateEventStatuses();
  } catch (err) {
    logger.error('Event status tick failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    eventStatusRunning = false;
  }
};

const startEventStatusScheduler = () => {
  // Run once on startup and then periodically.
  void runEventStatusTick();
  eventStatusInterval = setInterval(() => {
    void runEventStatusTick();
  }, EVENT_STATUS_INTERVAL_MS);
};

const stopEventStatusScheduler = () => {
  if (eventStatusInterval) {
    clearInterval(eventStatusInterval);
    eventStatusInterval = null;
  }
};

// Initialize Socket.io
const io = initializeSocket(httpServer);

// Initialize Quiz Socket namespace
initQuizSocket(io);

// Initialize Attendance Socket namespace
initializeAttendanceSocket(io);

// Neon keep-alive: prevent cold connection starts
let keepAliveFailureCount = 0;
const ENABLE_DB_KEEPALIVE = process.env.ENABLE_DB_KEEPALIVE === 'true';
const DB_KEEPALIVE_INTERVAL_MS = Number(process.env.DB_KEEPALIVE_INTERVAL_MS || 4 * 60 * 1000);

if (ENABLE_DB_KEEPALIVE) {
  setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      keepAliveFailureCount = 0;
    } catch (error) {
      keepAliveFailureCount += 1;
      if (keepAliveFailureCount >= 3) {
        logger.warn('Database keep-alive failing repeatedly', {
          consecutiveFailures: keepAliveFailureCount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, DB_KEEPALIVE_INTERVAL_MS);
} else {
  logger.info('Database keep-alive disabled (set ENABLE_DB_KEEPALIVE=true to enable).');
}

// Middleware

// Trust proxy - required for rate limiting behind reverse proxies (Render, etc.)
// This tells Express to trust the X-Forwarded-For header
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (isAllowedBrowserOrigin(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// CSRF protection for cookie-authenticated writes:
// mutating requests must come from an allowed browser origin unless they use Bearer auth.
app.use('/api', (req, res, next) => {
  if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  if (!hasSessionCookie(req.headers.cookie)) {
    return next();
  }

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  const refererOrigin = origin ? null : parseRefererOrigin(typeof req.headers.referer === 'string' ? req.headers.referer : undefined);
  const requestOrigin = origin || refererOrigin;

  if (requestOrigin && isAllowedBrowserOrigin(requestOrigin)) {
    return next();
  }

  return ApiResponse.error(res, {
    code: ErrorCodes.FORBIDDEN,
    message: 'Cross-site cookie-authenticated requests are not allowed',
    status: 403,
  });
});

// Request logging (only in development or if explicitly enabled)
if (NODE_ENV === 'development' || process.env.ENABLE_REQUEST_LOGGING === 'true') {
  app.use(requestLogger);
}

// Rate limiting - General API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// More lenient rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 auth attempts per 15 minutes
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Passport setup
setupPassport(passport);
app.use(passport.initialize());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CodeScriet API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      docs: 'https://github.com/codescriet/club-platform',
    },
  });
});

// Lightweight health check (no DB query) to reduce background DB compute burn.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'unknown',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Deep health check with explicit DB ping (use only when needed).
app.get('/health/db', async (_req, res) => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('db_ping_timeout')), 2000)),
    ]);

    res.json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
    });
  } catch (error) {
    logger.warn('Deep health check database ping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(503).json({
      status: 'degraded',
      database: 'down',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
    });
  }
});

// Simple ping endpoint for uptime bots (lightweight, no JSON parsing)
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Sitemap and SEO routes at ROOT level (no rate limiting, for Google bots)
// These are served at api.codescriet.dev/sitemap.xml and api.codescriet.dev/robots.txt
app.use('/sitemap.xml', sitemapRouter);
app.use('/robots.txt', robotsRouter);
app.use('/', indexNowRouter); // Serves key file at /<key>.txt

// API Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/polls', pollsRouter);
app.use('/api/team', teamRouter);
app.use('/api/achievements', achievementsRouter);
app.use('/api/qotd', qotdRouter);
app.use('/api/users', usersRouter);
app.use('/api/stats', statsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/hiring', hiringRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/signatories', signatoriesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/network', networkRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/mail', mailRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/playground', playgroundRouter);
app.use('/api/problems', problemsRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/competition', competitionRouter);
app.use('/api/indexnow', authMiddleware, requireRole('ADMIN'), indexNowRouter);

// Test email endpoint for debugging
app.post('/api/test-email', authMiddleware, requireRole('ADMIN'), async (req: express.Request, res: express.Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return ApiResponse.error(res, { code: ErrorCodes.VALIDATION_ERROR, message: 'Email address required' });
    }

    const user = getAuthUser(req);
    const settings = await prisma.settings.findFirst({
      select: { clubName: true },
    });
    const success = await emailService.sendWelcome(
      email,
      user?.name || 'Test User',
      settings?.clubName || 'code.scriet'
    );

    if (success) {
      return ApiResponse.success(res, { 
        message: 'Test email sent successfully', 
        recipient: email,
        tip: 'Check your inbox (and spam folder!)'
      });
    } else {
      return ApiResponse.error(res, { 
        code: ErrorCodes.INTERNAL_ERROR, 
        message: 'Failed to send test email - check server logs' 
      });
    }
  } catch (error) {
    logger.error('Test email failed:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { 
      code: ErrorCodes.INTERNAL_ERROR, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 404 handler
app.use((req, res) => {
  ApiResponse.error(res, {
    code: ErrorCodes.NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
    status: 404,
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const bodyError = err as Error & { type?: string; status?: number; statusCode?: number };
  if (bodyError.type === 'entity.too.large' || bodyError.status === 413 || bodyError.statusCode === 413) {
    return ApiResponse.error(res, {
      code: ErrorCodes.BAD_REQUEST,
      message: 'Request payload is too large',
      status: 413,
    });
  }

  if (bodyError instanceof SyntaxError && bodyError.message.toLowerCase().includes('json')) {
    return ApiResponse.badRequest(res, 'Invalid JSON payload');
  }

  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  
  // Don't leak error details in production
  const message = NODE_ENV === 'production' 
    ? 'An unexpected error occurred' 
    : err.message;
    
  ApiResponse.error(res, {
    code: ErrorCodes.INTERNAL_ERROR,
    message,
    status: 500,
  });
});

// Graceful shutdown
let shuttingDown = false;
let shutdownTimer: NodeJS.Timeout | null = null;

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info('Shutting down gracefully...');
  stopEventStatusScheduler();
  stopReminderScheduler();
  stopQotdAutoPublishScheduler();

  // Close Socket.io server first — disconnects all clients (quiz + attendance)
  io.close();

  // Persist all active quiz sessions before exit
  const activeIds = quizStore.getAllActiveQuizIds();
  if (activeIds.length > 0) {
    logger.info(`Persisting ${activeIds.length} active quiz sessions...`);
    await Promise.allSettled(
      activeIds.map(quizId => quizStore.persistResultsAndCleanup(quizId, 'ABANDONED'))
    );
  }

  // Force exit after 28 seconds if clean close doesn't happen (Render sends SIGKILL at 30s)
  shutdownTimer = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 28000);
  shutdownTimer.unref();

  // Close HTTP server and then disconnect Prisma.
  httpServer.close(async () => {
    try {
      await prisma.$disconnect();
      logger.info('Clean exit');
      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
      }
      process.exit(0);
    } catch (error) {
      logger.error('Error during Prisma disconnect', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const startHttpServerWithRetry = (attempt = 1) => {
  const onError = (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && attempt < MAX_LISTEN_RETRIES) {
      logger.warn('Port is busy, retrying server start', {
        port: PORT,
        attempt,
        maxRetries: MAX_LISTEN_RETRIES,
      });
      setTimeout(() => startHttpServerWithRetry(attempt + 1), LISTEN_RETRY_DELAY_MS);
      return;
    }

    logger.error('Failed to start HTTP server', {
      port: PORT,
      code: error.code,
      message: error.message,
    });
    process.exit(1);
  };

  httpServer.once('error', onError);
  httpServer.listen(PORT, () => {
    httpServer.removeListener('error', onError);
    logger.info(`🚀 Server running on http://localhost:${PORT}`, { environment: NODE_ENV });
    void recoverActiveRounds();
  });
};

// Initialize database (create admin and settings if needed)
initializeDatabase()
  .then(() => hydrateRuntimeSecurityEnvFromSettings())
  .then(() => populateAnnouncementSlugs())
  .then(() => populateProfileSlugs())
  .then(() => {
    // Keep DB asleep when idle by default. Enable only if explicitly configured.
    if (ENABLE_BACKGROUND_SCHEDULERS) {
      startEventStatusScheduler();
      startReminderScheduler();
      startQotdAutoPublishScheduler();
    } else {
      logger.info('Background schedulers disabled (set ENABLE_BACKGROUND_SCHEDULERS=true to enable).');
    }

    startHttpServerWithRetry();
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

export default app;
