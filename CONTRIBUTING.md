# Contributing to code.scriet

Thanks for your interest in contributing! This guide covers how to set up the
project, our conventions, and the pull-request process.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Licensing of contributions

This project is licensed under [Apache-2.0](./LICENSE). By submitting a pull
request you agree that your contribution is licensed under Apache-2.0 (per
§5 of the license) — no separate CLA is required.

## Getting started

```bash
git clone https://github.com/code-scriet/main_site.git
cd main_site
npm install
cp .env.example .env       # fill in the required values
npx prisma migrate dev     # set up the database
npm run dev                # API :5001 · Web :5173 · Playground :5174/:5002
```

See [README.md](./README.md) for more detail and [CLAUDE.md](./CLAUDE.md) for the
architecture reference (single source of truth for routes, schema, and system design).

## Branching & commits

- **Never push to `main` directly.** Branch from `main`:
  `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`, `chore/<short-name>`.
- Use clear, conventional commit messages: `feat: …`, `fix: …`, `docs: …`,
  `refactor: …`, `test: …`, `chore: …`.
- Keep PRs focused — one feature or fix per PR.

## Before you open a PR

Run the same checks CI runs, locally:

```bash
npm run lint --workspace=apps/api
npm run lint --workspace=apps/web
npm run build --workspace=apps/api
npm run build --workspace=apps/web
npm run test:stability
```

All four must pass. If you change a route, Prisma model, socket event, env var,
or a documented system behavior, **update [CLAUDE.md](./CLAUDE.md) in the same
PR** (the repo's living-document protocol — docs and code must not drift).

## Project constraints to respect

This platform runs on free-tier infrastructure. Please keep these in mind:

- No data structures that grow unbounded with user/player count.
- Real-time is WebSocket-only (Socket.io); no HTTP polling/SSE.
- Don't change the Prisma connection pool or migration flow without discussion.
- Prefer `npx prisma migrate dev --create-only`, review the SQL, then deploy.

## Reporting bugs & requesting features

Use the issue templates under **New issue**. For **security vulnerabilities**, do
**not** open a public issue — follow [SECURITY.md](./SECURITY.md) instead.

## Review

A maintainer will review your PR. CI (lint, build, tests, security audit, CodeQL)
must be green before merge. Thanks for contributing! 💛
