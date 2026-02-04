import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport';
import { createServer } from 'http';

import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { registrationsRouter } from './routes/registrations.js';
import { announcementsRouter } from './routes/announcements.js';
import { teamRouter } from './routes/team.js';
import { achievementsRouter } from './routes/achievements.js';
import { qotdRouter } from './routes/qotd.js';
import { usersRouter } from './routes/users.js';
import { statsRouter } from './routes/stats.js';
import { settingsRouter } from './routes/settings.js';
import { hiringRouter } from './routes/hiring.js';
import { uploadRouter } from './routes/upload.js';
import { sitemapRouter } from './routes/sitemap.js';
import { setupPassport } from './config/passport.js';
import { requestLogger, logger } from './utils/logger.js';
import { ApiResponse, ErrorCodes } from './utils/response.js';
import { initializeDatabase, populateAnnouncementSlugs } from './utils/init.js';
import { initializeSocket } from './utils/socket.js';
import { authMiddleware } from './middleware/auth.js';
import { requireRole } from './middleware/role.js';
import { emailService } from './utils/email.js';
import { prisma } from './lib/prisma.js';
import { startReminderScheduler, stopReminderScheduler } from './utils/scheduler.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Socket.io
initializeSocket(httpServer);

// Middleware

// Trust proxy - required for rate limiting behind reverse proxies (Render, etc.)
// This tells Express to trust the X-Forwarded-For header
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost on any port for development
    if (origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    
    // Allow production frontend URL
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    
    // Allow codescriet.dev domains
    if (origin.endsWith('.codescriet.dev') || origin === 'https://codescriet.dev') {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

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

// Health check with detailed status
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Simple ping endpoint for uptime bots (lightweight, no JSON parsing)
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Sitemap and SEO routes (no rate limiting, cached responses)
app.use('/api/sitemap.xml', sitemapRouter);
app.use('/api/robots.txt', sitemapRouter);

// API Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/team', teamRouter);
app.use('/api/achievements', achievementsRouter);
app.use('/api/qotd', qotdRouter);
app.use('/api/users', usersRouter);
app.use('/api/stats', statsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/hiring', hiringRouter);
app.use('/api/upload', uploadRouter);

// 404 handler
app.use((req, res) => {
  ApiResponse.error(res, {
    code: ErrorCodes.NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
    status: 404,
  });
});

// Test email endpoint for debugging
app.post('/api/test-email', authMiddleware, requireRole('ADMIN'), async (req: express.Request, res: express.Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return ApiResponse.error(res, { code: ErrorCodes.VALIDATION_ERROR, message: 'Email address required' });
    }

    const user = req.user as { id: string; name: string; email: string } | undefined;
    const settings = await prisma.settings.findFirst();
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

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
const shutdown = () => {
  logger.info('Shutting down gracefully...');
  stopReminderScheduler();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize database (create admin and settings if needed)
initializeDatabase()
  .then(() => populateAnnouncementSlugs())
  .then(() => {
    // Start the event reminder scheduler
    startReminderScheduler();
    
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`, { environment: NODE_ENV });
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

export default app;
