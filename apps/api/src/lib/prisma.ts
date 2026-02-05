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
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      // Only retry on connection timeout errors (P1002, P2024)
      if (error?.code === 'P1002' || error?.code === 'P2024' || error?.message?.includes('timed out')) {
        console.log(`Database connection attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
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
