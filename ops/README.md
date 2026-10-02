# ops/

VM operations for the codescriet.dev production box (`ubuntu@80.225.225.170`).

## deploy-clubsite.sh

The deploy script. Versioned here; the runnable copy lives at
`/home/ubuntu/deploy-clubsite.sh` on the VM and is **synced from the commit
being deployed** by `auto-deploy.sh` before every run, so the script and the
code it deploys are always in lockstep.

What a run does:

1. Fetches `origin/main` into `~/clubsite-git` (a clean clone — note
   `~/clubsite/.git` is broken, so `~/clubsite` is treated as a dumb
   deploy target, never a working copy).
2. Backs up the current `apps/api/dist` + `apps/web/dist` to
   `~/deploy-backups/`.
3. Rsyncs the new tree (excluding `.git`, `.env*`, `node_modules`, `dist` —
   hand-edits in the live dir are wiped).
4. Runs `npm ci` once at the workspace root when `package-lock.json` changed
   (tracked via `.locksum`; this is an npm-workspaces monorepo with a single
   lockfile, so per-app installs are wrong).
5. Runs `prisma generate` and `prisma migrate deploy` (forward-only) **from
   the repo root** — Prisma 7 resolves `prisma.config.ts` from the cwd, so
   running from `apps/api` fails with "datasource.url is required".
6. Builds the API (`tsc`) and the web app (`vite build`).
7. Restarts `club-api` (systemd) and health-checks
   `http://localhost:5001/health`.
8. On any failure: restores the dist backup, restarts the API, exits non-zero.

A mkdir-based lock (`~/.deploy-clubsite.lock`) guarantees only one deploy
runs at a time — never edit this file while a deploy is in flight.

## auto-deploy.sh (VM-local, not versioned)

Cron wrapper at `/home/ubuntu/auto-deploy.sh`, run every 3 minutes via
`flock`. Polls `origin/main`; when it moves past
`~/clubsite/.deployed-sha`, syncs the deploy script from `ops/` at the new
commit and runs it. Logs to `~/auto-deploy.log`; failure state in
`~/.autodeploy/` (3 failures per SHA, then it waits for the next push).
