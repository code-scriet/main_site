# Ops Checklist — config actions that are not PRs

> Companion to [report.md](report.md) / [roadmap.md Wave 0](roadmap.md). These are dashboard/monitoring actions only the owner can perform — no code change ships them. Check items off here (with date + verdict) as they land.

## S7 — Ship the security headers (HIGH, ~10 minutes)

**Status:** ☐ not done · **Owner action**

Prod serves without CSP/HSTS/X-Frame-Options — the hardened header block in [render.yaml:137-175](../../render.yaml) is written and reviewed but **not applied**, because the live `codescriet-web` service is configured through the Render dashboard, which overrides the blueprint (verified 2026-06-07: `curl -I https://codescriet.dev` on a cache MISS shows only `x-content-type-options`).

1. Paste the `headers:` values from render.yaml into Render dashboard (`codescriet-web` → Settings → Headers), **or** — better, survives Render config drift — create a Cloudflare Transform Rule (Response Header Modification) with the same values.
2. Deploy the CSP as `Content-Security-Policy-Report-Only` first. Leave it one week.
3. Zero unexpected reports after a week → flip to enforcing `Content-Security-Policy`.
4. Keep render.yaml + `apps/web/public/static.json` byte-for-byte in sync as the canonical copy.

**Verify:** `curl -sI https://codescriet.dev | grep -iE 'content-security|strict-transport|frame'` on a cache MISS shows CSP(-RO)/HSTS/XFO.

## G3 — $0 observability (3 items)

**Status:** ☐ not done · **Owner action**

1. **UptimeRobot keyword monitor on `https://api.codescriet.dev/health/db`** alerting when the body contains `"database":"down"`. Today only `/ping` liveness is watched — a DB outage is invisible until users report it.
2. **Render log alerts** (codescriet-api → Logs → Alerts) on the two messages that mean real data loss:
   - `Failed to persist quiz`
   - `persistence retry limit reached`
3. **Sentry free tier (5k events/mo) on the web app** — currently a prod ErrorBoundary render is observable by no one. (This one is a small code PR when picked up; listed here so the decision isn't lost.)

**Verify:** trigger `/health/db` 503 against a dev instance → alert fires.

## G4 — Delete the render.yaml migrate-resolve workaround (dated)

**Status:** ☐ not done · **Do after 2026-08-01**

[render.yaml:9-12](../../render.yaml) start command carries `npx prisma migrate resolve --rolled-back 20260220003000_harden_email_and_network_query_indexes … || true` to keep one historical failed deploy from blocking `migrate deploy`. Once every environment has deployed cleanly past that migration (give it until **2026-08-01**), remove the `migrate resolve` clause so a *future* genuinely-failed migration isn't silently marked rolled-back.

## S2-readback — IP-resolution diagnostics (24 h prod experiment)

**Status:** ☐ blocked on PR-8 deploy · **Owner action after PR-8 (`fix/server-hardening-batch`) is live**

PR-8 ships a shared `getClientIp()` plus an env-gated diagnostic log line. To settle the trust-proxy hop count, the rate-limit bucket question, and the socket-IP question in one experiment (also closes the open June-2026 "Cloudflare proxy-hop" item):

1. Set `LOG_IP_DIAGNOSTICS=true` on codescriet-api in the Render dashboard.
2. Leave it on for 24 h of normal traffic.
3. Pull the logs; compare `req.ip` vs `cf-connecting-ip` vs `x-forwarded-for` per request.
4. **Record the verdict here** (do the three agree? is `trust proxy 1` the right hop count behind Cloudflare?) and unset the env var.
5. If they disagree → follow-up PR adjusting `trust proxy` / `getClientIp()` precedence.

**Verdict (fill in):** _not yet run_

## A-idx — Prod index-usage snapshot

**Status:** ☐ not done · **Owner action (read-only SQL against prod)**

The dev DB is empty, so index decisions need prod numbers. Same protocol PR #48 documented:

1. Snapshot: `SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan;` on prod Neon.
2. Re-check after 7 days of normal traffic.
3. Evaluate the partial-index candidates from [schema-redesign.md §4](schema-redesign.md) **only if** the corresponding full indexes show cold (`idx_scan` ≈ 0):
   - `event_invitations (invitee_user_id) WHERE status='PENDING'`
   - `notification_feed (created_at) WHERE audience='CUSTOM'`

**Snapshot results (fill in):** _not yet run_
