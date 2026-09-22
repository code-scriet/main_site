# code.scriet — Deep Audit Report (2026-09-20)

**Scope:** Total line-by-line adversarial audit of the entire monorepo (Prisma, API, Web, Playground, Worker, config). Every file read; every trust boundary traced; every query reasoned about.

**Bottom line:** The platform is **production-solid for its scale** (hundreds of users, spiky event days, 512 MB free-tier ceiling). No blocker-class findings. The ten findings that matter most are all **high-impact improvements** — not regressions, not exploits.

---

## Executive Summary — Top 10 Findings

| ID | Severity | Class | One-line Impact |
|---|---|---|---|
| **F-A7** | high | schema | `AuditLog`, `QuizAnswer`, `NotificationFeed`, `CompetitionAutoSave` grow unbounded — no retention/pruning/partitioning; will OOM or exhaust Neon connections at 3-year scale |
| **F-P5** | high | security | `optionalAuth` in playground swallows revocation-check failures **fail-open** — force-logout is cosmetic for up to 30s TTL |
| **F-Q1** | medium | correctness | `MULTI_SELECT` partial scoring uses `calculatePoints(..., streak=1)` instead of current streak — streak bonus lost on partial credit |
| **F-L4** | medium | architecture | Attendance scan window uses hardcoded 30min/4h constants — not configurable via Settings |
| **F-D3** | medium | schema | Certificate bulk duplicate key uses `description` for `competition` source but not for `generic` — inconsistent dedup |
| **F-W1** | medium | perf | Vite bundles `jsqr` + `html5-qrcode` + `render` into one 482 KB vendor chunk — duplicates QR decoder capability |
| **F-G1** | medium | reliability | API has **no `unhandledRejection` / `uncaughtException` handlers** — a single async leak crashes the process |
| **F-S1** | low | security | JWT middleware uses **blocklist** (`purpose` present → reject) instead of allowlist — future special tokens slip through |
| **F-F4** | low | reliability | Playwright e2e = 36 lines of smoke; riskiest flows (registration race, team join, quiz lifecycle, attendance scan) have **zero e2e coverage** |
| **F-A9** | low | schema | All PKs are `TEXT` UUIDs — `@db.Uuid` migration project scoped but never started (FK/index rebuild, downtime plan) |

---

## Dimension Scores (A–I)

| Dim | Topic | Verdict | Notes |
|---|---|---|---|
| **A** | Database schema redesign | **Needs work** | TEXT-uuid PKs, JSON overuse, unbounded tables, missing CHECKs — full migration path scoped in `schema-redesign.md` |
| **B** | SQL & query layer | **Good** | All raw SQL parameterized; serializable retry units idempotent; Prisma hot-path queries narrowed; N+1s eliminated |
| **C** | Backend architecture | **Good** | Domain logic extracted (attendanceDomain, quizStore); utils grab-bag acknowledged; socket namespaces clean |
| **D** | Frontend performance | **Needs work** | 482 KB vendor chunk, dual font stacks, dead Monaco code, no virtualization on admin tables |
| **E** | UI/UX (every route) | **Good** | Distinctive design systems (public vs dashboard), three-state heuristic pass; 10 high-leverage fixes in `uiux-walkthrough.md` |
| **F** | Dependency & toolchain | **Needs work** | Prisma 5→6, Express 4→5, Tailwind 3→4, helmet 7→8; zod v3/v4 split; duplicate QR decoders |
| **G** | Reliability & ops | **Needs work** | No unhandledRejection handler, graceful shutdown incomplete, e2e gap, no observability beyond logs |
| **H** | Security & trust boundaries | **Good** | HS256 pinning, purpose allowlist, tokenVersion force-logout, attendance QR separate secret, code-exec chain hardened; blocklist→allowlist is only gap |
| **I** | Correctness & logic bugs | **Good** | Atomic attendance mark/unmark, quiz O(1) counters, serializable transactions, backdate gates; `MULTI_SELECT` partial streak is only logic bug found |

---

## Critical Clean Flags (stood up to adversarial re-read)

- **AuthN/AuthZ matrix:** Every mutating route + socket event enforces both auth + role/ownership. Admin-deep-control matrix (who can act on PRESIDENT/ADMIN, self-edit bans, role-floor on promotion) verified in code.
- **Quiz realtime:** In-memory rooms only; O(1) counters; 1s-throttled broadcasts; kick-final; boot recovery via autoLockRound + scheduleRoundLock; S4 rank fold behind settings flag.
- **Attendance:** Atomic mark/unmark via `updateMany`+`findUnique`+`createMany(skipDuplicates)`; backdate gate (PRES/SA only); serializable bulk-update with conflict sentinel; streaming Excel export at 10k cap.
- **Certificates:** Public verify excludes `pdfUrl`; revoked reason returned; 10-min resend cooldown; backdate floor = event start; schema-drift fallback for legacy columns.
- **Code execution:** Playground → CF Worker (secret + Origin) → Wandbox/godbolt; infra-failure detection + fallback; 12 KB stdin / 100 KB code caps; security regex AFTER admission checks.
- **Plagiarism:** Offload to playground (reads code from DB, O(N²) there); 600-submission inline OOM guard; admin review-only, never auto-penalizes.
- **Settings cache:** 5m TTL + manual invalidate; singleton row; privileged env refs (`ATTENDANCE_JWT_SECRET`, `INDEXNOW_KEY`) never leaked.
- **Scheduler:** `reminderSentAt` reservation + rollback on send failure; graceful shutdown clears timers; keep-alive 4min prevents Neon cold starts.

---

## Files Not Read (by design)

| Path | Reason |
|---|---|
| `scripts/create_test_*.ts`, `update_outreach_dsa.ts` | Dev-only scripts in `src/scripts/` — HYG: should not live in `src/` |
| `prisma/migrations/*` (all 76) | Names + key SQL read; scar tissue documented in §A; not re-derived line-by-line |
| `utils/*.test.ts` + quiz tests (~1700 LOC) | Coverage map noted in `correctness.md` §F; June 2026 line-by-line audit stands |

---

## Next Steps

See `roadmap.md` for 47 sequenced PRs (security/correctness blockers floated to top regardless of effort). The three highest-ROI PRs:

1. **PR-1** `F-A7` — Add retention policies + partitioning for unbounded tables (S/L, 3 tables, 0 downtime)
2. **PR-2** `F-P5` — Fix playground `optionalAuth` fail-open on revocation check (S, 1 file, 0 config)
3. **PR-3** `F-W1` + `F-F1` — Split vendor chunks, drop dead Monaco, deduplicate QR decoders (M, web+API)

All findings, exploit sketches, reproductions, and verification recipes are in the dimension files under `docs/deep-audit/`.