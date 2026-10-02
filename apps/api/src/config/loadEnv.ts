// Load environment variables BEFORE anything else imports the Prisma client.
//
// Prisma 7's node-postgres driver adapter captures `process.env.DATABASE_URL` at
// construction time (which runs at module import, in lib/prisma.ts). ESM executes
// imported module bodies in import order, so if env were loaded in index.ts's
// body (after the router imports), prisma.ts would already have been constructed
// with an UNDEFINED connection string — and node-postgres then silently defaults
// the database to the OS user, connecting to the wrong DB (P1003 locally).
//
// Importing this module first guarantees dotenv has populated process.env before
// any prisma import runs. Prod (Render) sets real env vars so it was unaffected;
// this fixes local/.env-based setups. dotenv.config() never overrides vars that
// are already set, so real env vars always win.
import dotenv from 'dotenv';

// Monorepo root .env first, then local .env (local overrides root). Paths are
// resolved against process.cwd() (apps/api in dev + prod start scripts).
dotenv.config({ path: '../../.env' });
dotenv.config();
