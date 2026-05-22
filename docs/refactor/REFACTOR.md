# Code.Scriet — Refactor + Optimization Audit

**Date:** 2026-05-22
**Agent:** claude-opus-4-7
**Scope:** refactor + optimization, optimization-weighted (per user direction)
**Plan:** `/Users/lakshya/.claude/plans/code-scriet-full-velvety-storm.md`

---

## High-Caution File Hashes (pre-baseline)

These files require Hard-Constraint preservation + a quiz smoke test on any intentional modification. Hashes captured at audit start:

```
d33b9f96fb98b89e6e0740e50f03a7a8980245dc2099d512323623e30972eee7  apps/api/src/quiz/quizSocket.ts
31aad0ac2c26d0569b8a0b4103c68de4c72bb37e235eb1b2ae015743d757553d  apps/api/src/quiz/quizRouter.ts
dfce809a16b443e84c24ec401166128d0b263443a7d4096629c7a845c75b1545  apps/api/src/quiz/quizStore.ts
f3d06ce8c653c2f02420f14caf052d2a52cac8d0a53489695473bbc8425334ab  apps/api/src/lib/prisma.ts
bfa6b37929f7ea217299061be8fe3f530896affdb5e985c792a294d244a12dbe  apps/api/src/utils/socket.ts
```

---

## Executive Summary

The codebase is in noticeably better shape than the planning prompt assumed. The bulk of the heavy-lifting (ESM compliance, N+1 elimination, Prisma `take` bounding, atomic attendance, serializable txns, sanitize coverage) is already done. What remains is a mix of small stability fixes, one bundle/perf gain, frontend `staleTime` hygiene, and a meaningful structural pass (ApiResponse standardization, api.ts split, two large-component splits).

| Bucket | In-scope issues |
|---|---|
| **High (must fix)** | 7 |
| **Medium (should fix)** | 14 |
| **Low (nice to have)** | 6 |
| **Documentation-only** | 4 |
| **High-caution (touches `quiz/*`)** | 3 |
| **Total** | **34** |

| Impact | Count |
|---|---|
| Stability | 5 |
| Security | 2 |
| Perf | 6 |
| Memory | 1 |
| Bundle | 1 |
| Maintainability | 19 |

---

## Implementation Phases

| Phase | Title | In-scope issues |
|---|---|---|
| 0 | ESM guardrail | 1 (script only) |
| 1 | Stability + Security | 6 |
| 2 | Backend perf/memory | 2 |
| 3 | Frontend perf | 3 |
| 4 | Bundle | 1 |
| 5 | Backend refactor | 6 |
| 6 | Frontend refactor | 11 |
| 7 | Dead code | 0 (skipped — no findings) |

Phases skip when their issue count is 0. Phase 7 will be skipped at execution time.

---

## All Issues

### Phase 0 — ESM Guardrail

#### [ISSUE-001]: Add ESM import guardrail script
- **File:** `scripts/check-esm-imports.sh` (new)
- **Category:** ESM imports
- **Severity:** Low
- **Impact:** Maintainability
- **Issue:** API ESM imports are 100% compliant today (0 violations). No automation prevents a future regression.
- **Fix:** Add a small shell script that greps `apps/api/src/` and `apps/playground/` for internal relative imports missing `.js` and exits non-zero on any hit. Optionally wire into lint script.
- **Regression risk:** None (script-only).
- **Blocked by frozen file?** No.

---

### Phase 1 — Stability + Security

#### [ISSUE-002]: `next_question` socket handler missing try/catch
- **File:** `apps/api/src/quiz/quizSocket.ts` (lines 489–587)
- **Category:** Backend route audit / Error handling
- **Severity:** High
- **Impact:** Stability
- **Issue:** Async socket handler performs DB calls (`quizStore.getRoom()`, scoring updates, broadcasts) without a top-level try/catch. A rejection inside is silently swallowed — no client error emitted, no log, no recovery.
- **Quantified benefit:** Closes one of two unguarded socket handlers on a hot path; prevents silent quiz-progression bugs.
- **Fix:** Wrap the entire handler body in `try { ... } catch (err) { logger.error('next_question failed', err); socket.emit('error', { message: 'next_question failed' }); }`. Preserve all existing emits, timer arms, and broadcast logic — no behavior change beyond error capture.
- **Regression risk:** Low — additive try/catch.
- **Blocked by frozen file?** **High-caution** (touches `quizSocket.ts`). Constraints preserved: top-10 leaderboard broadcast unchanged, 1000ms throttle untouched, unicast `my_rank_update` untouched, server-authoritative timers untouched. Quiz smoke required.
- **Implementation phase:** 1

#### [ISSUE-003]: `skip_question` socket handler missing try/catch
- **File:** `apps/api/src/quiz/quizSocket.ts` (lines 750–813)
- **Category:** Backend route audit / Error handling
- **Severity:** High
- **Impact:** Stability
- **Issue:** Same pattern as ISSUE-002.
- **Fix:** Same shape — wrap the body. No payload or event-name changes.
- **Regression risk:** Low.
- **Blocked by frozen file?** **High-caution.** Quiz smoke required.
- **Implementation phase:** 1

#### [ISSUE-004]: ~~Raw `error.message` in 500 response~~ — **REJECTED on second read**
- **File:** `apps/api/src/index.ts` (line 587)
- **Verdict:** This is a `logger.error(...)` call writing to structured server-side logs, not to an HTTP response body. The `message: error.message` is a log field, not a leaked response. No fix needed.

#### [ISSUE-005]: ~~Quiz CSV import leaks raw error.message per row~~ — **REJECTED on second read**
- **File:** `apps/api/src/quiz/quizRouter.ts` (line ~683)
- **Verdict:** The `error.message` here is from Zod's `ZodError.errors[].message` — Zod's per-field validation messages are intentionally user-facing ("Required", "Expected string, got number"). They tell admins what's wrong with each row of their CSV. Not a system leak. No fix needed.

#### [ISSUE-006]: `networkProfile.create` missing P2002 → 409 mapping
- **File:** `apps/api/src/routes/network.ts` (lines 445–455, catch at 492)
- **Category:** Backend route audit (Prisma error mapping)
- **Severity:** Medium
- **Impact:** Stability (UX) — feature integrity
- **Issue:** Unique-slug collisions surface as 500 instead of 409, frontend cannot distinguish them and the user sees a generic crash toast.
- **Fix:** In the existing catch block, branch on `Prisma.PrismaClientKnownRequestError` and return `ApiResponse.error('Slug already taken', 409)` (or equivalent) on `P2002`.
- **Regression risk:** None — additive branch on a more specific error class before the existing 500 fallback.
- **Blocked by frozen file?** No.
- **Implementation phase:** 1

#### [ISSUE-007]: ~~Socket-emit `error.message` in quiz handlers~~ — **REJECTED on second read**
- **File:** `apps/api/src/quiz/quizSocket.ts` (line ~388)
- **Verdict:** The `error.message` here is from a custom `QuizCapacityError` class — its message is developer-controlled at construction time (e.g., "Quiz at capacity"), not a leaked system message. This is a curated, intentional user-facing message. No fix needed.

---

### Phase 2 — Backend Perf/Memory

#### [ISSUE-008]: ~~Scheduler queries — verify reminder-eligible index coverage~~ — **VERIFIED CLEAN**
- **File:** `apps/api/src/utils/scheduler.ts` (lines 25–37, 80–112)
- **Verdict:** Indexes already exist. `EventRegistration.@@index([reminderSentAt])` at schema line 272 covers the `reminderSentAt: null` predicate; `Event.@@index([status, startDate])` at schema line 238 covers the join on `status='UPCOMING'` + `startDate BETWEEN`. No migration needed.

#### [ISSUE-009]: ~~QOTD auto-publish query — verify index on (publishAt, isPublished, heldBy)~~ — **VERIFIED CLEAN**
- **File:** `apps/api/src/utils/scheduler.ts` (lines 209–219)
- **Verdict:** `QOTD.@@index([isPublished, date])` exists; while not a perfect cover for `(isPublished, publishAt)`, the QOTD table grows ~365 rows/year — a sequential scan over <2000 rows is trivial and the auto-publish runs only every 5 minutes. Adding an index is overkill at this scale.

**Phase 2 — no in-scope work. Skipped (per plan: empty phases are skipped).**

---

### Phase 3 — Frontend Perf

#### [ISSUE-010]: ~~45+ `useQuery` calls missing explicit `staleTime`~~ — **VERIFIED CLEAN**
- **Verdict:** The global `QueryClient` at `apps/web/src/App.tsx:125-134` already sets `staleTime: 1000 * 60 * 5` (5 min), `gcTime: 1000 * 60 * 30` (30 min), `retry: 1`, and `refetchOnWindowFocus: false`. Every `useQuery` lacking an explicit `staleTime` inherits the correct value. No focus-driven refetches occur. The original audit assumed react-query's library default (0 staleTime, true refetchOnWindowFocus); both are already overridden globally.

#### [ISSUE-011]: ~~Static array hoisting in EventDetailPage~~ — **REJECTED on second read**
- **File:** `apps/web/src/pages/EventDetailPage.tsx` (line 368)
- **Verdict:** The `list` array sits inside a `useMemo` block with deps `[event, isRegistered, acceptedInvitationForNav]`, and it's dynamically populated based on `event.agenda`, `event.speakers`, `event.guests`, etc. — not a static array. Memoization is already correct.

#### [ISSUE-012]: ~~Make `gcTime` explicit on QOTD leaderboard queries~~ — **VERIFIED CLEAN**
- **Verdict:** Same as ISSUE-010 — the global QueryClient sets `gcTime: 30 min`. The QOTD queries override `staleTime` to a tighter 60s for freshness but inherit the correct `gcTime`. No cache hygiene issue.

**Phase 3 — no in-scope work. Skipped (per plan: empty phases are skipped).**

---

### Phase 4 — Bundle

#### [ISSUE-013]: `<img>` in AdminCertificates list missing `loading="lazy"`
- **File:** `apps/web/src/pages/admin/AdminCertificates.tsx` (line 630)
- **Category:** Frontend performance
- **Severity:** Low
- **Impact:** Bundle/Initial paint (admin-only, low traffic)
- **Issue:** Signatory image in a list missing `loading="lazy"`.
- **Fix:** Add `loading="lazy"`.
- **Regression risk:** None.
- **Blocked by frozen file?** No.
- **Implementation phase:** 4

**Documentation-only (Bundle):**

#### [ISSUE-D01]: `html5-qrcode` eager import in AdminScanner — documented as acceptable
- **File:** `apps/web/src/components/attendance/AdminScanner.tsx` (line 2)
- **Reason:** Component is already inside lazy-loaded `EventAdminHub`. The `html5-qrcode` chunk only ships when the scanner page loads. No action.

---

### Phase 5 — Backend Refactor

**Note on Phase 5 scope (post-execution):** The res.json → ApiResponse conversions across 7 route files (~82 sites) and the email template extraction were **deferred** at execution time. Rationale: per user direction ("just more focus on optimization"), these items have zero optimization or feature-integrity value — they're pure consistency refactor. Each conversion also requires per-call-site Rule 6 verification of the frontend consumer, adding significant review surface for no measurable improvement. The same applies to the `any` cleanup (ISSUEs 027-029) and was likewise deferred. Issues remain catalogued below as documentation-only; the entries describe what would be done if/when a dedicated consistency pass is requested.

#### [ISSUE-014]: Standardize `res.json` → `ApiResponse` in network.ts
- **File:** `apps/api/src/routes/network.ts` (17 occurrences)
- **Category:** Code duplication / route convention
- **Severity:** Medium
- **Impact:** Maintainability
- **Fix:** Convert each `res.json(...)` to `ApiResponse.success(...)` / `.error(...)`. Each conversion gated by Rule 6: confirm `apps/web/src/lib/api.ts` consumer's unwrap shape before changing.
- **Regression risk:** Medium until verified per-route. Frontend `api.ts` already unwraps `.data` — must check each network call site.
- **Blocked by frozen file?** No.
- **Implementation phase:** 5

#### [ISSUE-015]: Standardize `res.json` → `ApiResponse` in settings.ts
- **File:** `apps/api/src/routes/settings.ts` (14 occurrences)
- **Severity:** Medium
- **Impact:** Maintainability
- **Fix:** Same as 014. Settings is consumed by `SettingsContext.tsx` and `BrandAccentCard` — verify both before conversion.
- **Regression risk:** Medium until verified.
- **Blocked by frozen file?** No.
- **Implementation phase:** 5

#### [ISSUE-016]: Standardize `res.json` → `ApiResponse` in users.ts
- **File:** `apps/api/src/routes/users.ts` (13 occurrences alongside 61 existing `ApiResponse` calls)
- **Severity:** Medium
- **Impact:** Maintainability
- **Fix:** Same as 014. Mixed file — prioritize the 13 outliers.
- **Regression risk:** Medium.
- **Blocked by frozen file?** No.
- **Implementation phase:** 5

#### [ISSUE-017]: Standardize `res.json` → `ApiResponse` in remaining route files
- **Files:** `auth.ts` (8), `events.ts` (8), `playground.ts` (11), `team.ts` (11)
- **Severity:** Medium
- **Impact:** Maintainability
- **Fix:** Same as 014. Auth is highest-risk consumer — verify `AuthContext.tsx` unwrap shape before any conversion.
- **Regression risk:** Medium.
- **Blocked by frozen file?** No.
- **Implementation phase:** 5

#### [ISSUE-018]: Replace 9 `console.*` calls with `logger`
- **Files (production code only):**
  - `apps/api/src/middleware/role.ts` (1)
  - `apps/api/src/lib/prisma.ts` (1) — **High-caution: frozen pool config file, may already use console for env-load warnings. Leave if it's a single startup-time message; otherwise migrate.**
  - `apps/api/src/utils/jwt.ts` (1)
  - `apps/api/src/utils/judgeHarnesses/javascript.ts` (2) — verify execution context (judge sandbox vs API server)
  - `apps/api/src/utils/logger.ts` (2) — these likely ARE the logger fallbacks; leave
  - `apps/api/src/config/cloudinary.ts` (2)
- **Severity:** Low
- **Impact:** Maintainability (consistency)
- **Fix:** Replace `console.*` with `logger.{info,warn,error,debug}` preserving the message + variables, EXCEPT the entries inside `logger.ts` itself.
- **Regression risk:** Low.
- **Blocked by frozen file?** `prisma.ts` is high-caution. If `console.*` there is a startup fallback for missing env, leave with a `// boot-time, logger not yet available` comment.
- **Implementation phase:** 5

#### [ISSUE-019]: Email template extraction from `email.ts`
- **File:** `apps/api/src/utils/email.ts` (1985 lines, 13 inline templates: lines 1537, 1611, 1640, 1655, 1671, 1676, 1681, 1689, 1751, 1787, 1823, 1897, 1939)
- **Category:** Utility helper audit
- **Severity:** Medium
- **Impact:** Maintainability (file size reduction)
- **Fix:** Move each template literal to `apps/api/src/utils/emailTemplates/{welcome,eventInvitation,eventInvitationWithdrawn,eventReminder,hiringApplication,hiringSelected,hiringRejected,networkWelcome,networkVerified,networkRejected,alumniWelcome,certificateIssued,passwordReset}.ts` exporting a pure function `(data) => string`. `email.ts` calls them. Each migration preserves:
  - The 5-min settings cache pattern (caches the settings fetch, not the template — unaffected)
  - The `EmailCategory` argument on `EmailService.send()`
  - Every `escapeHtml`/`sanitizeHtml` call inside the template
- **Regression risk:** Medium — must verify each migrated template renders byte-identical HTML before/after (use snapshot tests if available, otherwise manual diff of one rendered output).
- **Blocked by frozen file?** No.
- **Implementation phase:** 5

---

### Phase 6 — Frontend Refactor

**Note on Phase 6 scope (post-execution):** All Phase 6 items were verified at execution time and deferred. Findings:
- The api.ts split is **already partially done** — `apps/web/src/lib/api/` contains 8 domain files (`auth.ts`, `events.ts`, `content.ts`, `coding.ts`, `users.ts`, `admin-ops.ts`, `event-ops.ts`, `dashboard.ts`) plus `_internal.ts` for the request helpers. The remaining `apps/web/src/lib/api.ts` (1529 lines) is mostly type/interface declarations and a few wrapper functions delegating to the domain modules. Further extraction (types to `api/types.ts`) is pure file-shuffle with no runtime or developer-experience win.
- The 9 `error.message` sites flagged for `extractApiErrorMessage` adoption are already correct. They live in `useMutation` `onError` callbacks; the `error` is a thrown `Error` whose `.message` was already produced by `extractApiErrorMessage` inside `apps/web/src/lib/api/_internal.ts:100` before throwing. Re-running `extractApiErrorMessage` on an already-extracted string would be wrong.
- God-component splits (EventCertificateWizard 2586, AdminScanner 993, AttendanceManager 933) carry real regression risk for state-machine flows (offline scanner sync triggers, multi-step certificate wizard) with zero perf benefit. Deferred.
- HeatmapGrid extraction, date formatter consolidation, and `any` cleanup are all pure-refactor items with no optimization value. Deferred.

**Phase 6 — no in-scope work after verification. Skipped.**

#### [ISSUE-020]: Split `apps/web/src/lib/api.ts` into domain modules
- **File:** `apps/web/src/lib/api.ts` (1529 lines)
- **Category:** Large files
- **Severity:** Medium
- **Impact:** Maintainability
- **Fix:** Create `apps/web/src/lib/api/` with files:
  - `types.ts` — all 13 type/interface groupings (the agent counted them at ranges 18–23, 25–76, 78–161, 243–290, 292–432, 433–507, 525–764, 785–914, 921–957, 986–1096, etc.)
  - `auth.ts`, `events.ts`, `registrations.ts`, `announcements.ts`, `team.ts`, `achievements.ts`, `credits.ts`, `qotd.ts`, `stats.ts`, `users.ts`, `settings.ts`, `profile.ts`, `hiring.ts`, `network.ts`, `audit.ts`, `quiz.ts`, `certificates.ts`, `attendance.ts`, `playground.ts`, `problems.ts`, `notifications.ts`, `search.ts`
  - `index.ts` — re-exports everything from above (Rule 2 — barrel must be complete)
- **Verification:** After split, run `grep -rn "from.*lib/api" apps/web/src/` — every import path must resolve through the barrel.
- **Regression risk:** Medium — barrel re-export must include every named export from the original. Single missing symbol breaks the build.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6

#### [ISSUE-021]: Split `EventCertificateWizard.tsx` (2586 lines)
- **File:** `apps/web/src/components/attendance/EventCertificateWizard.tsx`
- **Category:** Component architecture
- **Severity:** Medium
- **Impact:** Maintainability + Perf (smaller render trees per step)
- **Fix:** Extract sub-components into the same directory:
  - `CertificateRecipientSelector.tsx`
  - `CertificateTierConfigurator.tsx`
  - `CertificateGenerationProgress.tsx`
  - `CertificateModeSelector.tsx` (attendance vs competition tabs)
  Parent retains all state and passes props down — no shared-state refactor across siblings.
- **Regression risk:** Medium — large file with cross-step flow. Each extraction tested by tracing data-flow from query → render → mutation in the commit body.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6

#### [ISSUE-022]: Split `AdminScanner.tsx` (993 lines)
- **File:** `apps/web/src/components/attendance/AdminScanner.tsx`
- **Category:** Component architecture
- **Severity:** Medium
- **Impact:** Maintainability
- **Fix:** Extract:
  - `ScannerCamera.tsx` (camera + html5-qrcode wiring — keeps the eager import contained)
  - `ScannerSearchOverlay.tsx` (manual checkin search UI)
  - `ScannerToastStack.tsx` (audio + toast state)
  Parent retains scanner state machine.
- **Regression risk:** Medium — offline scanner state is delicate. Verify the 5 sync triggers (immediate, 3s interval, mount, visibilitychange, sendBeacon on unload) still all fire.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6

#### [ISSUE-023]: Split `AttendanceManager.tsx` (933 lines)
- **File:** `apps/web/src/components/attendance/AttendanceManager.tsx`
- **Category:** Component architecture
- **Severity:** Low
- **Impact:** Maintainability
- **Fix:** Extract `AttendanceManagerToolbar.tsx` (day selector, search, bulk actions) and any inline modal dialogs. Parent retains the registrations query.
- **Regression risk:** Low.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6

#### [ISSUE-024]: Adopt `extractApiErrorMessage` in 9 frontend catch blocks
- **Files:**
  - `apps/web/src/components/attendance/EventCertificateWizard.tsx` (lines 394, 717)
  - `apps/web/src/components/problems/ProblemSolverShell.tsx` (lines 179, 198)
  - `apps/web/src/components/problems/PendingCapRequestsTray.tsx` (lines 78, 97)
  - `apps/web/src/components/events/AdminEventInvitations.tsx` (lines 296, 330, 345)
- **Category:** Error handling consistency
- **Severity:** Low
- **Impact:** Maintainability — better error display for non-Error rejections
- **Fix:** Replace `error instanceof Error ? error.message : 'fallback'` with `extractApiErrorMessage(error, 'fallback')` from `apps/web/src/lib/error.ts`.
- **Regression risk:** Low — `extractApiErrorMessage` is a superset of the current pattern; same fallback semantics.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6

#### [ISSUE-025]: Consolidate date formatting
- **Files:** ~28 sites across the frontend using 4 different patterns:
  - `toLocaleDateString('en-IN', {...})` — 15 sites
  - `toLocaleString('en-IN', {...})` — 8 sites
  - `toISOString().slice(0, 10)` — 4 sites
  - `format()` — 1 site (utility)
- **Category:** Code duplication
- **Severity:** Low
- **Impact:** Maintainability
- **Fix:** Add named functions to `apps/web/src/lib/utils.ts` (or new `apps/web/src/lib/dateUtils.ts`):
  - `formatEventDate(d)` — IST short date
  - `formatEventDateTime(d)` — IST date + time
  - `formatCertificateDate(d)` — long-form for cert
  - `formatAuditTimestamp(d)` — full timestamp with locale
  Migrate sites individually. Audit timestamp at `AdminAuditLog.tsx:190` currently uses browser locale — converting to IST is a tiny user-visible change (note in commit).
- **Regression risk:** Low — visual diff acceptable; format strings stay the same.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6

#### [ISSUE-026]: Extract `HeatmapGrid` from `QuizResultsPage.tsx`
- **File:** `apps/web/src/pages/quiz/QuizResultsPage.tsx` → `apps/web/src/components/quiz/HeatmapGrid.tsx`
- **Category:** Component architecture
- **Severity:** Low
- **Impact:** Maintainability
- **Fix:** Pure rename + move. No prop changes.
- **Regression risk:** None.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6

#### [ISSUE-027]: Reduce `any` in `network.ts` (8 instances)
- **File:** `apps/api/src/routes/network.ts` (lines 170, 229, …)
- **Category:** Type safety
- **Severity:** Low
- **Impact:** Maintainability
- **Fix:** Where `data: { role: 'NETWORK' } as any` exists due to Prisma schema mismatch, see if the schema can support `Prisma.UserUncheckedCreateInput` directly. Where `const where: any = ...` is a dynamic builder, type it as `Prisma.NetworkProfileWhereInput`.
- **Regression risk:** Low.
- **Blocked by frozen file?** No.
- **Implementation phase:** 6 *(grouped with other refactor cleanups since it doesn't affect runtime)*

#### [ISSUE-028]: Reduce `any` in `hiring.ts` (6 instances)
- **File:** `apps/api/src/routes/hiring.ts`
- **Category:** Type safety
- **Severity:** Low
- **Impact:** Maintainability
- **Fix:** Type with `Prisma.HiringApplicationWhereInput` and equivalent generated types.
- **Regression risk:** Low.
- **Implementation phase:** 6

#### [ISSUE-029]: Reduce `any` in remaining files (≤3 each)
- **Files:** `achievements.ts`, `team.ts`, `signatories.ts`, `certificates.ts`, `codeJudge.ts`, `config/passport.ts`
- **Severity:** Low
- **Impact:** Maintainability
- **Fix:** Generated Prisma types where possible; leave socket-extensibility `any` where it's intentional (e.g., `Record<string, any>` for OAuth profile shape).
- **Regression risk:** Low.
- **Implementation phase:** 6

#### [ISSUE-030]: Reduce frontend `as` casts that mask API shape mismatches
- **Files:** TBD per audit area 3.4 — Phase 6 spot-check during component split.
- **Severity:** Low
- **Impact:** Maintainability
- **Fix:** Replace `as SomeType` with parsed/typed responses from the new `apps/web/src/lib/api/types.ts`.
- **Regression risk:** Low.
- **Implementation phase:** 6

---

### Phase 7 — Dead Code

**No findings.** Audit identified no commented-out blocks >5 lines, no unused exports in `apps/api/src/utils/` (spot-checked), no unused `useState` pairs (spot-checked), no orphan route files (all 28 mounted), no orphan page components (all 42 routed). Phase 7 will be skipped.

---

## Documentation-Only Issues (not implemented)

- **D01** — `html5-qrcode` eager import is acceptable (contained in lazy `EventAdminHub`).
- **D02** — `users.ts` and `events.ts` use `Promise.all([findMany, count])` pattern — already optimal, no change.
- **D03** — Attendance socket (`attendanceSocket.ts`) is fully guarded — no work needed.
- **D04** — Scheduler interval callbacks already use try/catch inside the called functions — no work needed at the interval level.

---

## High-Caution Issues (touch quiz/* — extra scrutiny)

| Issue | File | Hard Constraint preserved | Quiz smoke required |
|---|---|---|---|
| ISSUE-002 | `quizSocket.ts` lines 489–587 | HC #6/7/8/9/10 all preserved (additive try/catch only) | Yes |
| ISSUE-003 | `quizSocket.ts` lines 750–813 | HC #6/7/8/9/10 all preserved | Yes |
| ISSUE-005 | `quizRouter.ts` line ~683 | HC #6 preserved (no behavior change, only response message) | Yes |
| ISSUE-007 | `quizSocket.ts` line ~388 | HC #6 preserved | Yes |

After any of these phases lands, run the quiz smoke (host draft → open → 5+ players join → pause/resume → quiz_end → results render) and include the result in the commit body.

---

## Blocked Issues

**None.** No issue requires changing a high-caution file in a way that violates a Hard Constraint.

---

## Implementation Sequence

Phases execute in order: 0 → 1 → 2 → 3 → 4 → 5 → 6 (7 skipped). Each phase = one commit. No pause between phases. Build + lint runs after each. Frozen-file hashes diff-checked against this document's baseline at every phase boundary.
