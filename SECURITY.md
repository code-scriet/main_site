# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately through either channel:

1. **GitHub Private Vulnerability Reporting** (preferred) — go to the
   **Security** tab → **Report a vulnerability**. This keeps the report private
   and lets us collaborate on a fix.
2. **Email** — `contact@codescriet.dev` with the subject line
   `SECURITY: <short summary>`.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept, affected endpoint/route, payload).
- Affected component (web, API, playground, worker) and environment if known.

## What to expect

- We aim to acknowledge a report within **3 business days**.
- We will keep you updated as we triage, fix, and deploy.
- Please give us a reasonable window to remediate before any public disclosure.
  We are happy to credit reporters who request it.

## Scope

In scope: the application code in this repository (API, web, playground,
Cloudflare worker) and its configuration. Out of scope: third-party services we
depend on (Render, Neon, Cloudflare, Cloudinary, Brevo) — report those to the
respective vendor — and findings that require a pre-compromised admin account.

## Supported versions

This is a single continuously deployed application; only the latest `main` is
supported. Fixes land on `main` and deploy from there.

## Good to know (handled by design)

- Secrets are configured via environment variables (never committed). See
  `.env.example` for the required keys.
- Authentication uses JWT (HS256) with a DB-side `tokenVersion` for force-logout
  and soft-delete enforcement on every request.
- User-supplied HTML is sanitized server-side (DOMPurify allowlist) before
  storage and rendered through escaped/markdown-safe paths.
