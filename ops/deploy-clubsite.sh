#!/bin/bash
# deploy-clubsite.sh — deploy code-scriet/main_site from git to the live VM paths.
#
# Invariant: the ONLY way code reaches the live site is through this script,
# from a clean `git reset --hard origin/main`. Hand-editing live code is
# structurally impossible to deploy around: every run starts by wiping the
# live source dirs and re-syncing them from git.
#
# Usage:
#   ./deploy-clubsite.sh --check    # safe: fetch + show what WOULD deploy
#   ./deploy-clubsite.sh            # full deploy (asks for confirmation)
#   ./deploy-clubsite.sh --yes       # full deploy without asking
#
# Layout:
#   CLONE : ~/clubsite-git   (pristine git checkout, never hand-edited)
#   LIVE  : ~/clubsite       (what systemd + Caddy actually serve)
#   api.env lives at ~/clubsite/api.env, OUTSIDE git, and is never touched.
set -euo pipefail

CLONE="$HOME/clubsite-git"
LIVE="$HOME/clubsite"
BRANCH="main"
BACKUPS="$HOME/deploy-backups"
SHA_FILE="$LIVE/.deployed-sha"
HEALTH_URL="http://localhost:5001/health"
MODE="deploy"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --yes)   ASSUME_YES=1 ;;
  esac
done
ASSUME_YES="${ASSUME_YES:-0}"

log()  { echo "[deploy] $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

# ---- Mutual exclusion: never run two deploys at once (cron vs manual) ----
DEPLOY_LOCKDIR="$HOME/.deploy-clubsite.lock"
_acquire_lock() {
  if mkdir "$DEPLOY_LOCKDIR" 2>/dev/null; then
    echo $$ > "$DEPLOY_LOCKDIR/pid"
    return 0
  fi
  _opid="$(cat "$DEPLOY_LOCKDIR/pid" 2>/dev/null || echo unknown)"
  if [ "$_opid" != unknown ] && kill -0 "$_opid" 2>/dev/null; then
    fail "another deploy (pid $_opid) is already running - refusing to overlap"
  fi
  log "stale deploy lock (pid $_opid not running) - taking over"
  rm -rf "$DEPLOY_LOCKDIR" && mkdir "$DEPLOY_LOCKDIR" && echo $$ > "$DEPLOY_LOCKDIR/pid"
}
_acquire_lock
trap 'rm -rf "$DEPLOY_LOCKDIR"' EXIT

[ -d "$CLONE/.git" ] || fail "clone missing at $CLONE"
[ -d "$LIVE/apps/api" ] || fail "live dir missing at $LIVE"

# ---- 1. Fetch + pin to origin/main ---------------------------------------
log "fetching origin..."
git -C "$CLONE" fetch origin --quiet
if [ -n "$(git -C "$CLONE" status --porcelain)" ]; then
  fail "clone is dirty (hand-edited?). Refusing — the clone must stay pristine."
fi
git -C "$CLONE" reset --hard "origin/$BRANCH" --quiet
NEW_SHA="$(git -C "$CLONE" rev-parse HEAD)"
OLD_SHA="$(cat "$SHA_FILE" 2>/dev/null || echo none)"
log "git: $OLD_SHA -> $NEW_SHA"

if [ "$OLD_SHA" = "$NEW_SHA" ]; then
  log "live is already at $NEW_SHA — nothing to do."
  exit 0
fi

if [ "$MODE" = "check" ]; then
  log "would deploy:"
  git -C "$CLONE" log --oneline "$OLD_SHA..$NEW_SHA" 2>/dev/null | head -20 || \
    git -C "$CLONE" log --oneline -5
  exit 0
fi

if [ "$ASSUME_YES" != "1" ]; then
  read -rp "[deploy] deploy $NEW_SHA to live? [y/N] " ans
  [ "$ans" = "y" ] || fail "aborted by user"
fi

# ---- 2. Back up current dists ---------------------------------------------
mkdir -p "$BACKUPS"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_TGZ="$BACKUPS/dist-${OLD_SHA}-${STAMP}.tgz"
log "backing up current dists -> $BACKUP_TGZ"
tar -czf "$BACKUP_TGZ" -C "$LIVE" apps/api/dist apps/web/dist 2>/dev/null || \
  fail "backup failed, aborting before touching anything"

rollback() {
  log "ROLLBACK: restoring $BACKUP_TGZ"
  tar -xzf "$BACKUP_TGZ" -C "$LIVE"
  sudo systemctl restart club-api.service || true
  sleep 3
  if curl -sf --max-time 10 "$HEALTH_URL" >/dev/null; then
    log "rollback healthy again"
  else
    log "WARNING: rollback restarted but health check still failing — investigate!"
  fi
}

# ---- 3. Sync source from git (wipes any hand-edits in live) ---------------
log "syncing source from git (hand-edits in live will be wiped)..."
rsync -a --delete \
  --exclude 'node_modules' --exclude 'dist' --exclude '.env*' \
  "$CLONE/apps/api/" "$LIVE/apps/api/"
rsync -a --delete \
  --exclude 'node_modules' --exclude 'dist' --exclude '.env*' \
  "$CLONE/apps/web/" "$LIVE/apps/web/"
if [ -d "$CLONE/prisma" ]; then
  rsync -a --delete "$CLONE/prisma/" "$LIVE/prisma/"
fi
# scripts/ holds build tooling (prerender, sitemap generators) invoked by
# the web app prebuild/postbuild hooks — it must stay in sync too.
if [ -d "$CLONE/scripts" ]; then
  rsync -a --delete "$CLONE/scripts/" "$LIVE/scripts/"
fi

# ---- 4. Install + build ----------------------------------------------------
needs_install() { # $1 = app dir; true if lockfile changed or node_modules missing
  local dir="$1"
  local locksum_file="$dir/.locksum"
  local sum="none"
  [ -f "$dir/package-lock.json" ] && sum="$(sha256sum "$dir/package-lock.json" | cut -d' ' -f1)"
  [ -d "$dir/node_modules" ] || return 0
  [ -f "$locksum_file" ] && [ "$(cat "$locksum_file")" = "$sum" ] && return 1 || return 0
}
remember_install() {
  sha256sum "$1/package-lock.json" 2>/dev/null | cut -d' ' -f1 > "$1/.locksum" || echo none > "$1/.locksum"
}

log "installing workspace dependencies..."
if needs_install "$LIVE"; then
  log "package-lock changed -> npm ci (workspace root)"
  ( cd "$LIVE" && npm ci --no-audit --no-fund ) || { rollback; fail "npm ci failed"; }
  remember_install "$LIVE"
fi
log "building api..."
if [ -f "$LIVE/prisma/schema.prisma" ]; then
  # Prisma 7 resolves prisma.config.ts from the cwd: run from the workspace
  # root so the datasource URL is picked up (migrate needs it; generate does not).
  ( cd "$LIVE" && npx prisma generate --schema prisma/schema.prisma ) \
    || { rollback; fail "prisma generate failed"; }
  log "applying pending prisma migrations (forward-only)..."
  ( cd "$LIVE" && set -a && . <(grep -E '^(DATABASE_URL|DIRECT_URL)=' "$LIVE/api.env") && set +a \
    && npx prisma migrate deploy --schema prisma/schema.prisma ) \
    || { rollback; fail "prisma migrate deploy failed"; }
fi
( cd "$LIVE/apps/api" && npm run build ) || { rollback; fail "api build failed"; }

log "building web..."
# dependencies are installed once at the workspace root above: npm workspaces
# hoist everything to $LIVE/node_modules, so no per-app install is needed.
[ -f "$LIVE/apps/web/.env.production" ] || log "WARNING: apps/web/.env.production missing — build uses vite defaults"
( cd "$LIVE/apps/web" && npm run build ) || { rollback; fail "web build failed"; }

# ---- 5. Restart + health check ----------------------------------------------
log "restarting club-api..."
sudo systemctl restart club-api.service || { rollback; fail "systemctl restart failed"; }

log "health-checking $HEALTH_URL ..."
for i in $(seq 1 15); do
  if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null; then
    echo "$NEW_SHA" > "$SHA_FILE"
    log "DEPLOYED $NEW_SHA (was $OLD_SHA). Backup: $BACKUP_TGZ"
    exit 0
  fi
  sleep 2
done
rollback
fail "health check failed after restart — rolled back to $OLD_SHA"
