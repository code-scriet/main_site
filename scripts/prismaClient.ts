import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PrismaClient factory for standalone CLI scripts and the seed.
 *
 * Prisma 7 has no datasource `url` in the schema, so every client must be
 * constructed with a driver adapter, and `.env` is no longer auto-loaded for
 * these scripts (the app loads it itself; the CLI loads prisma.config.ts). This
 * loads dotenv and wires @prisma/adapter-pg against DATABASE_URL — exactly what
 * `apps/api/src/lib/prisma.ts` does for the server.
 */
export function makePrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}
