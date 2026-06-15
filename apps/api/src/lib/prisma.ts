import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../utils/logger.js';

declare global {
  var prisma: PrismaClient | undefined;
}

// Preserve the frozen client connection cap (HC #1/#3). Prisma's native connector
// read `connection_limit` from DATABASE_URL to size its pool; the node-postgres
// driver adapter does NOT, so it would otherwise default to pg's `max: 10`.
// Derive the cap from the URL (prod uses ?connection_limit=5), falling back to 5
// to stay within the free-tier 512 MB box + Neon pooler limits.
const resolvePoolMax = (): number => {
  try {
    const raw = new URL(process.env.DATABASE_URL ?? '').searchParams.get('connection_limit');
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 5;
  } catch {
    return 5;
  }
};

// Configure Prisma with retry logic for Neon serverless cold starts.
// Prisma 7 connects through a driver adapter; PrismaPg uses node-postgres against
// the pooled DATABASE_URL (Neon pooler), matching the prior datasource `url`.
// Migrate/introspect use DIRECT_URL via prisma.config.ts.
const createPrismaClient = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: resolvePoolMax() });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
};

export const prisma = global.prisma || createPrismaClient();

// Cache client in development to prevent too many connections
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Retry wrapper for database operations (handles Neon cold starts)
// ISSUE-029: Exponential backoff with jitter to prevent thundering herd
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      
      // Only retry on connection timeout errors (P1002, P2024)
      if (code === 'P1002' || code === 'P2024' || message?.includes('timed out')) {
        // Exponential backoff: 500ms, 1000ms, 2000ms + random jitter
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * baseDelayMs;
        const delay = exponentialDelay + jitter;
        logger.warn('Database connection retry', { attempt, maxRetries, delayMs: Math.round(delay) });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  
  throw lastError;
}

// Graceful shutdown handler
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
