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
// Preserve the frozen connection cap (HC #1/#3), mirroring apps/api/src/lib/prisma.ts.
// The node-postgres adapter ignores the URL's `connection_limit` (which the native
// connector used to honour), so derive `max` explicitly — otherwise these CLI scripts
// would default to pg's max:10 and exceed the cap the server holds at 5.
const resolvePoolMax = (): number => {
  try {
    const raw = new URL(process.env.DATABASE_URL ?? '').searchParams.get('connection_limit');
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 5;
  } catch {
    return 5;
  }
};

export function makePrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: resolvePoolMax() }),
  });
}
