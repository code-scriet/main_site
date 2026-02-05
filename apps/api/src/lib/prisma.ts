import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

// Configure Prisma with connection pool settings for Neon serverless
export const prisma = global.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Enable connection pooling for serverless environments
// Neon uses connection pooling by default, but we need to handle timeouts gracefully
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Graceful shutdown handler
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
