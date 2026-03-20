import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

// Configure Prisma with retry logic for Neon serverless cold starts
const createPrismaClient = () => {
  return new PrismaClient({
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
        console.warn(`Database connection attempt ${attempt}/${maxRetries} failed, retrying in ${Math.round(delay)}ms...`);
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
