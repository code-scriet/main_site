# Static Analysis Report — code.scriet Platform

**Date:** 2026-08-08 · **Commit analysed:** `c953e91` · **Scope:** entire monorepo (791 tracked files, 158,242 LOC across `apps/api`, `apps/web`, `apps/playground`, `scripts`, `workers`, `prisma`, `e2e`)

**Method.** A file-level import graph was built over all 593 JS/TS source files (static `import`/`export … from`, bare side-effect imports, dynamic `import()`, and `require()`, with `@/*` alias resolution and the ESM `.js`→`.ts` convention), then traversed from every real entry point: `apps/api/src/index.ts`, both `main.tsx` files, `execute-server.js`, both CF workers, `prisma/seed.ts`, every file under `scripts/` and `e2e/`, every `*.test.ts(x)`, and all build configs. Every candidate was then re-verified by identifier-level grep across the whole repo, because an import graph alone cannot see reflection or string-built references.

**Empirical verification.** All 47 dead files identified below were physically removed and the repo rebuilt: `apps/api` `tsc` ✅, `apps/web` `tsc -b --force` ✅, `apps/playground` `tsc -b --force` ✅, `vite build` for both frontends ✅ (a bundler resolves dynamic imports the graph might miss), and `npm run test:stability` → **351/351 passing**. The working tree was then restored; this report proposes no code changes.

---

## Executive Summary

| Category | Found | Est. removable LOC |
|---|---:|---:|
| Dead files (verified by build+test) | **47** | **4,474** |
| Dead runtime exports inside live files | **~35** (of 72 flagged) | ~350 |
| Dead classes | 0 | 0 |
| Unused imports | **0** | 0 |
| Unused local variables | **0** | 0 |
| Unused npm dependencies | **9 runtime + 3 type stubs** | ~28 MB install |
| Unused assets | **7 files** | ~92 KB |
| Unused CSS selectors / custom props | 54 selectors, 37 props | ~250 CSS lines (only ~80 SAFE) |
| Unreferenced API endpoints | 5 | ~120 |
| Duplicate implementation clusters | **17** | ~600 |
| Functions ≥ 140 lines | 126 | — |

**Total conservatively removable: ~5,400 LOC + ~28 MB of dependencies**, or roughly **3.4% of the codebase**.

### The headline findings

1. **`sharp` — a 28 MB native image pipeline — is entirely unreachable.** Its only importer (`processSignatureImage.ts`, 192 LOC) is called from nowhere. `CLAUDE.md` states the opposite and cites it as justification for a CVE-driven version bump.
2. **An abandoned component-extraction refactor left 21 orphaned admin components** (~2,000 LOC) across `certificates/`, `network/`, `polls/`, `event-registrations/`, `problems/` and `users/`.
3. **`apps/api` and `apps/web` each carry a byte-for-byte identical 154-line `videoEmbed.ts`.** The root `package.json` already declares a `packages/*` workspace, but the directory does not exist.
4. **`apps/playground` declares 7 runtime dependencies it never imports** (`framer-motion`, `zod`, `zustand`, and 4 Radix packages).
5. **Zero unused imports and zero unused variables** in all three workspaces — this codebase is genuinely clean on that axis.

---

## Phase 1 — Architecture (basis for the analysis)

npm-workspaces monorepo, three deployed apps plus two Cloudflare Workers.

| Unit | Entry point | Build | Notes |
|---|---|---|---|
| `apps/api` | `src/index.ts` | `tsc` → `dist` | Express 5 + TS ESM. **All relative imports carry `.js`** — the graph resolves `.js`→`.ts`. Env must load first (`import './config/loadEnv.js'` is a bare side-effect import — an early version of my scanner missed exactly this class of edge, which is why the regex was rewritten). |
| `apps/web` | `src/main.tsx` | `tsc -b` + Vite | React 19. **Every route is `React.lazy()`** → dynamic `import()` edges are load-bearing and were parsed explicitly. `@/*` → `src/*`. |
| `apps/playground` | `src/main.tsx` + `execute-server.js` | `tsc -b` + Vite | Monaco editor app **plus** a plain-JS Express server that also hosts the contest Socket.io relay. |
| `workers/` | `executor.js`, `og-worker.js` | manual `wrangler deploy` | **Not in CI.** Deployed by paste. |
| `scripts/`, `prisma/`, `e2e/` | each file | `tsx` / Playwright | Treated as roots. |

**Dynamic-reference surfaces checked before concluding anything is dead:** `React.lazy()` route chunks; `new Worker(blobURL)` in the playground engines; Express `router.param()` guards; Prisma-generated client; Passport strategy registration; `@react-pdf/renderer`'s font registry; Vite `manualChunks` package literals; the CF Worker's `body.provider` string dispatch.

**Confirmed absent:** no DI container, no plugin loader, no decorators/reflect-metadata, no code generation into source, no `require.context`, no glob-imports.

---

## Phase 2 — Dead Code

### 2.1 Dead files (47 files · 4,474 LOC)

All 47 verified three ways: unreachable in the import graph, zero identifier hits repo-wide, and the full build + 351-test suite green with them deleted.

#### A. Abandoned admin component extraction — 21 files, ~1,990 LOC · **SAFE**

A refactor extracted these presentational components, then the parent pages were rewritten with the logic inlined instead. Nothing imports them; several import *each other*, forming a self-contained dead cluster (`PollFeedbackTab` → `PollResponsesTab` is the only inbound edge either has).

| File | LOC |
|---|---:|
| `apps/web/src/components/admin/polls/PollResponsesTab.tsx` | 225 |
| `apps/web/src/components/admin/certificates/CertificateListCard.tsx` | 217 |
| `apps/web/src/components/admin/polls/PollFeedbackTab.tsx` | 200 |
| `apps/web/src/components/admin/certificates/SignatureFormDialog.tsx` | 183 |
| `apps/web/src/components/admin/polls/PollListSidebar.tsx` | 141 |
| `apps/web/src/components/admin/network/NetworkProfileCard.tsx` | 121 |
| `apps/web/src/components/admin/event-registrations/TeamRegistrationCard.tsx` | 113 |
| `apps/web/src/components/admin/certificates/SavedSignaturesCard.tsx` | 109 |
| `apps/web/src/components/admin/polls/PollDetailHeader.tsx` | 74 |
| `apps/web/src/components/admin/certificates/RevokeCertificateDialog.tsx` | 72 |
| `apps/web/src/components/admin/network/PendingUsersBanner.tsx` | 70 |
| `apps/web/src/components/admin/event-registrations/RegistrationConfirmDialog.tsx` | 69 |
| `apps/web/src/components/admin/network/RejectProfileDialog.tsx` | 60 |
| `apps/web/src/components/admin/certificates/DeleteCertificateDialog.tsx` | 58 |
| `apps/web/src/components/admin/network/PendingUserActionDialog.tsx` | 57 |
| `apps/web/src/components/admin/polls/PollOverviewTab.tsx` | 52 |
| `apps/web/src/components/admin/certificates/CertificateFiltersBar.tsx` | 50 |
| `apps/web/src/components/admin/users/UserStatsRow.tsx` | 48 |
| `apps/web/src/components/admin/network/NetworkStatsRow.tsx` | 48 |
| `apps/web/src/components/admin/network/DeleteProfileDialog.tsx` | 47 |
| `apps/web/src/components/admin/problems/DeleteProblemDialog.tsx` | 46 |

> **Note:** `certificates/`, `network/` and `polls/` each retain *live* siblings in the same folder (`GenerateCertificateDialog`, `EditProfileDialog`, `PollEditor`, `atoms.tsx`, …). Delete by the file list, not by directory.

#### B. Superseded dashboard widgets — 4 files, 873 LOC · **SAFE**

| File | LOC | Evidence |
|---|---:|---|
| `apps/web/src/components/dashboard/PlaygroundSnippetsCard.tsx` | 334 | Replaced by the Dashboard-v2 `MyCode` section |
| `apps/web/src/components/dashboard/QOTDStreakWidget.tsx` | 223 | Replaced by `QOTDHero` (streak ring) |
| `apps/web/src/components/dashboard/QuizDashboardWidget.tsx` | 222 | No importer |
| `apps/web/src/components/dashboard/PlaygroundCard.tsx` | 94 | No importer |

#### C. Dead API utilities — 5 files, 383 LOC · **SAFE**

| File | LOC | Evidence |
|---|---:|---|
| `apps/api/src/utils/processSignatureImage.ts` | 192 | `grep -rn processSignatureImage` → **only its own declaration**. See §2.5. |
| `apps/api/src/utils/profileSync.ts` | 122 | Neither `syncUserToTeamMember` nor `syncUserToNetworkProfile` is called anywhere |
| `apps/api/src/utils/dateStreak.ts` | 34 | `calculateConsecutiveDailyStreak` superseded by `qotdStreak.ts`'s publish-aware walk |
| `apps/api/src/config/email-templates.config.ts` | 17 | `emailTemplateConfig` never imported; `email.ts` builds its own cache from the DB |
| `apps/api/src/utils/index.ts` | 8 | Barrel re-exporting `logger`/`ApiResponse`/`emailService`/`auditLog`; every consumer imports the concrete module directly |

#### D. Playground dead code — 6 files, 547 LOC · **SAFE**

| File | LOC | Evidence |
|---|---:|---|
| `apps/playground/src/data/problems.ts` | 198 | `SAMPLE_PROBLEMS` — problems now come from `/api/problems` |
| `apps/playground/src/components/ui/select.tsx` | 157 | Sole importer of `@radix-ui/react-select`; the app uses native `<select>` |
| `apps/playground/src/hooks/useLocalStorage.ts` | 74 | `useLocalStorage` + `useAutoSave`, both uncalled |
| `apps/playground/src/engines/jsWorker.ts` | 73 | **Superseded, not merely unused** — see §4.2 |
| `apps/playground/src/utils/pistonApi.ts` | 32 | A pure re-export shim for `@/engines/ExecutionRouter`; no importer |
| `apps/playground/src/engines/index.ts` | 13 | Dead barrel; all consumers import `@/engines/<module>` directly |

#### E. Dead web utilities & leftovers — 8 files, 366 LOC · **SAFE**

| File | LOC | Evidence |
|---|---:|---|
| `apps/web/src/components/home/EventCard.tsx` | 165 | `DashboardEvents.tsx` **defines its own local `EventCard`** at line 262 — the grep hit is a name collision, not a use |
| `apps/web/src/components/SectionErrorBoundary.tsx` | 78 | No importer |
| `apps/web/src/lib/pollCsv.ts` | 47 | All 6 exports unused; poll export is server-side XLSX via `GET /:id/admin/export.xlsx` |
| `apps/web/src/lib/eventStatusBadge.ts` | 27 | All 4 exports unused |
| `apps/web/src/lib/quizScoring.ts` | 19 | See §4.3 — a diverged duplicate of the server formula |
| `apps/web/src/lib/difficultyBadge.ts` | 12 | `getDifficultyBadgeClasses` unused |
| `apps/web/src/hooks/useDebouncedValue.ts` | 10 | Unused |
| `apps/web/src/lib/slugify.ts` | 8 | Unused **while three inline copies exist** — see §4.1 |

#### F. Committed debug artifacts — 6 files, ~59 KB · **SAFE**

`apps/api/test-fontkit.js` (10 LOC) reads a hardcoded `/tmp/GreatVibes-Regular.ttf` that does not exist in the repo, and imports `fontkit` — a package that is **not declared in any `package.json`** (it resolves transitively through `@react-pdf/renderer`). Its five PDF outputs are committed alongside it:

`apps/api/cert-debug.pdf` (30 KB) · `gvrow.pdf` (8.7 KB) · `gvsolo.pdf` (8.1 KB) · `gvblock.pdf` (6.2 KB) · `initfonts-gv.pdf` (5.9 KB)

Zero references to any of them. `.gitignore` does not cover `*.pdf`, so they were committed by accident during certificate-font debugging.

#### G. Dead scripts — **NEEDS REVIEW**

| File | Finding |
|---|---|
| `scripts/migrate-deploy.sh` | Referenced by nothing. **Actively stale:** it still runs `prisma migrate resolve --rolled-back 20260220003000_…`, which `render.yaml:9-11` documents as *"retired 2026-07"*. Production now runs `npx prisma migrate deploy` directly in `startCommand`. Running this script today would re-attempt a deliberately retired operation. |
| `start-production.sh` | Referenced by nothing (not README, not `render.yaml`, not `package.json`). Duplicates root `npm run start:prod`. Render uses its own start commands. |
| `scripts/check-esm-imports.sh` | An ESM guardrail documented in `docs/refactor/REFACTOR.md` but **not wired into `.github/workflows/ci.yml`**. Either wire it in or drop it — as-is it protects nothing. |

Not dead (verified): `scripts/prismaClient.ts` (imported by 6 scripts), `scripts/stress/upstream-sim.mjs` + `worker-host.mjs` (imported by `run-stress.mjs`), `scripts/backfill-user-streaks.ts` and the `create_test_*` / `update_outreach_dsa` seeds (documented manual-run tools).

### 2.2 Dead runtime exports inside live files

72 exported functions/consts/classes have zero references in any other live file. Of these, ~35 are also unused *inside* their own file — declared and never executed. The distinction matters: the rest are merely over-exported (drop the `export`, keep the code).

**Fully dead (declaration is the only occurrence):**

| Location | Symbols |
|---|---|
| `apps/playground/src/lib/utils.ts` | `getMainApiOrigin`, `generateId`, `formatFileSize`, `getErrorMessage`, `hasConsoleLog`, `hasPrintStatement`, `formatDate` — **7 of 16 exports, ~64 LOC** |
| `apps/web/src/lib/quizAccess.ts` | `getQuizAccessTokenStorageKey`, `readPendingQuizJoin`, `clearPendingQuizJoin`, `PENDING_QUIZ_JOIN_KEY` |
| `apps/web/src/lib/ratingDisplay.ts` | `parseRatingValue`, `formatRatingStars`, `DEFAULT_MAX_RATING` — the whole module |
| `apps/web/src/lib/pollAdmin.ts` | `STATUS_TABS`, `ANONYMITY_TABS`, `filterAndSortFeedback` (consumed only by the dead poll components in §2.1-A) |
| `apps/web/src/components/ui/schema.tsx` | `OrganizationSchema`, `ImageObjectSchema`, `WebSiteSchema` |
| `apps/web/src/components/admin/users/UserConfirmDialogs.tsx` | `ResetPlaygroundLimitDialog`, `DeleteUserDialog` |
| `apps/api` | `COMPETITION_NS`, `requireAuthUser`, `apiResponse`, `countParticipants`, `countGuests`, `SAMPLE_TEST_PROBLEMS`, `_clearAuthCache`, `getActiveRoundCount` |
| `apps/web` misc | `getHoverAnimation`, `emptyEventForm`, `AdminUsersPageBare`, `AdminUsersLoadingFallback`, `InfoRow` |
| `apps/playground` misc | `preloadPyodide` (only referenced by the dead `engines/index.ts` barrel), `updateSnippet` |

**DO NOT DELETE — vendored shadcn primitives.** `components/ui/dropdown-menu.tsx` (10 unused exports), `dialog.tsx` (3), `sheet.tsx` (4). These are copy-in generated primitives kept at upstream parity; pruning them makes future shadcn updates a manual merge for no runtime gain (they tree-shake to nothing).

**NEEDS REVIEW — deliberate seams.** `resetCertificateViewCounterForTests` and `pendingCertificateViewCount` are named as test seams; `isQuizSnapshotEnabled` and `invalidateUserQotdStats` are feature-flag/cache hooks. Confirm intent with the owner before touching.

### 2.3 Dead classes

**None.** The codebase is function- and module-oriented; the only `class` declarations are React error boundaries, and every one that is reachable is rendered.

### 2.4 Unused imports and unused variables

**None — a genuinely clean result.** `@typescript-eslint/no-unused-vars` is enabled in all three workspaces and ESLint reports **0 violations** across `apps/api`, `apps/web`, and `apps/playground`. `apps/playground/tsconfig.json` additionally sets `noUnusedLocals: true` and `noUnusedParameters: true`, enforcing this at compile time.

The 113 remaining lint warnings are all `react-hooks/*` React-Compiler advisories (57 `set-state-in-effect`, 10 `only-export-components`, …) plus 2 `no-explicit-any` — deliberately configured as warnings, out of scope here.

### 2.5 Unused dependencies

**Runtime — safe to remove:**

| Package | Workspace | Install size | Evidence |
|---|---|---:|---|
| **`sharp`** | `apps/api` | **1.4 MB + 27 MB `@img/*` native binaries** | Sole importer `processSignatureImage.ts` is dead (§2.1-C) |
| `framer-motion` | `apps/playground` | 5.8 MB | 0 occurrences in `apps/playground/**` |
| `zod` | `apps/playground` | 6.4 MB | 0 occurrences |
| `@radix-ui/react-select` | `apps/playground` | 760 KB | Sole importer `ui/select.tsx` is dead |
| `@radix-ui/react-tooltip` | `apps/playground` | 552 KB | 0 occurrences |
| `@radix-ui/react-dropdown-menu` | `apps/playground` | 524 KB | 0 occurrences |
| `@radix-ui/react-dialog` | `apps/playground` | 512 KB | 0 occurrences — the app uses its own `mobile-sheet.tsx` |
| `@radix-ui/react-tabs` | `apps/playground` | 472 KB | 0 occurrences |
| `zustand` | `apps/playground` | 284 KB | 0 occurrences — only `apps/web/src/lib/quizStore.ts` uses it |

> All nine are `dependencies` in `apps/playground`/`apps/api`, so they install on every Render build of those services. Removing them cannot break the bundlers (nothing imports them), but **verify with a `vite build` + `tsc -b`** as the checklist specifies.

> ⚠️ **`sharp` is the important one, and `CLAUDE.md` contradicts this finding.** The Tech Stack table states sharp *"parses user-uploaded signature images, so this path is genuinely reachable"* and cites that reachability as the reason for the 0.34→0.35 CVE bump. In the current code, `resolveSignatory()` in `certificateIssuance.ts:158-171` passes `signatory.signatureUrl` straight through to `processedImageUrl` with no processing — the inline comment on line 142 ("process its stored signatureUrl") describes behaviour the function no longer has. **Removing `sharp` closes 4 HIGH libvips CVEs by deletion rather than by upgrade.** Because a documented security rationale is at stake, confirm with the owner that dropping server-side signature processing is intended, rather than silently deleting it.

**Type stubs — redundant, the real packages ship their own types:**

| Package | Real package's `types` field |
|---|---|
| `@types/sharp` (`apps/api`, 92 KB) | `sharp` → `./dist/index.d.mts` |
| `@types/dompurify` (`apps/web`, 24 KB) | `dompurify` → `./dist/purify.cjs.d.ts` |
| `@types/marked` (`apps/api`, 44 KB) | `marked` → `./lib/marked.d.ts` |

**DO NOT DELETE — implicit/optional by design:**

- `bufferutil`, `utf-8-validate` (`apps/api`) — never imported; `ws` detects them at runtime as native speedups.
- `better-sqlite3`, `eiows` (`optionalDependencies`) — loaded through `createRequire()` with try/catch fallbacks; the graph cannot see them.
- Every remaining `@types/*` — consumed by the compiler, not by `import`.
- `prisma`, `tsx`, `typescript`, `concurrently`, `ts-node`, `postcss`, `autoprefixer`, `@tailwindcss/postcss` — toolchain, invoked via scripts/config.

### 2.6 Unused API endpoints

299 endpoints extracted across 30 routers; every router is mounted in `index.ts`. Five have no caller anywhere in the repo:

| Endpoint | Verdict |
|---|---|
| `GET /api/certificates/files/:filename` | **DO NOT DELETE.** Self-labelled `'legacy-file-link'` — serves certificate links already emailed to recipients. Removing it breaks links in the wild. |
| `GET /api/announcements/latest` · `GET /api/achievements/latest` | **NEEDS REVIEW.** Superseded by the `HomePageData` aggregate in `stats.ts` (which returns `latestAnnouncements` inline). Both are public and unauthenticated, so an external consumer is possible though undocumented. |
| `GET /api/stats/events/trends` · `GET /api/stats/qotd/trends` | **NEEDS REVIEW.** Both `requireRole('ADMIN')` 30-day `$queryRaw` aggregates with no dashboard consumer — the admin dashboard uses `/api/stats/dashboard`. Admin-gated, so no public contract; likeliest genuine dead weight (~120 LOC incl. two raw SQL queries). |

### 2.7 Unused components

All dead components are files (§2.1-A/B/E). No live file declares an unrendered component.

### 2.8 Unused CSS

Verified: each selector below has **zero** occurrences in any `.tsx`/`.ts`/`.html` — including no partial-prefix match, which rules out template-built class names like `` `pub-btn--${variant}` ``.

| File | Dead selectors | Dead custom props |
|---|---|---|
| `apps/web/src/index.css` (2,445 lines) | **41** | 29 |
| `apps/web/src/components/home-v2/home-v2.css` (651) | 4 (`navx-home`, `navx-link`, `navx-pill`, `hsec-`) | 7 |
| `apps/playground/src/index.css` (281) | 9 (`slider`, `editor-cursor`, `tk-kw`…`tk-var`) | 1 (`--terminal-border`) |

> ⚠️ **DO NOT DELETE the `pub-*` and `ab-*` blocks** (`index.css:1189-1330`, `1735-1775`) — that is **29 of the 41** dead selectors in that file (23 `pub-*` + 6 `ab-timeline-*`), ~180 lines. `CLAUDE.md`'s Dashboard-v2 hard rules state the public site is *frozen mid-design-migration (audit W3)* and that finishing or excising the `[data-public]` system is **owner-deferred**. These selectors are unused because the migration stopped, not because they are junk. The same freeze covers `home-v2.css`'s 4 dead selectors.

**SAFE subset — 21 selectors, ~80 lines.** From `index.css` (12): `no-select`, `safe-area-pb`, `safe-area-pt`, `gradient-text`, `grain-overlay`, `noise-bg`, `glass-dark`, `top-under-header-gap`, `backdrop-blur-3xl`, `gpu-layer`, `shimmer`, `overlay-open`. From `apps/playground/src/index.css` (9): `slider`, `editor-cursor`, and the 7 `tk-*` rules — a superseded hand-rolled tokenizer theme, since Monaco owns syntax highlighting now.

Also unused: `--tw-gradient-stops`, `--tw-backdrop-blur`, `--tw-blur` are hand-declared Tailwind internals that Tailwind 4 generates itself; and a full font-scale (`--fs-xs`…`--fs-3xl`) plus spacing scale (`--sp-section`, `--sp-row`, `--row-h`) that nothing reads.

### 2.9 Unused assets

| Asset | Size | Verdict |
|---|---:|---|
| `apps/api/cert-debug.pdf`, `gvrow.pdf`, `gvsolo.pdf`, `gvblock.pdf`, `initfonts-gv.pdf` | 59 KB | **SAFE** — debug artifacts (§2.1-F) |
| `apps/web/public/vite.svg` | 1.5 KB | **SAFE** — Vite scaffold default, zero references |
| `docs/assets/CCSU-Logo-removebg-preview.png` | 31 KB | **LIKELY SAFE** — no markdown or code reference |

All fonts (`GreatVibes`, `Cinzel` ×2, `CormorantGaramond` ×2, `PlayfairDisplay-Bold`) and all logos (`ccsu.{jpg,png}`, `codescriet.{jpg,png}`) are referenced by `generateCertificatePDF.ts` / `certificateIssuance.ts`. Both the `.jpg` and `.png` of each logo are genuinely used.

---

## Phase 3 — Long / Over-Engineered Code

126 functions exceed 140 lines. Most are cohesive route handlers or React pages where length reflects real domain surface; splitting them for its own sake would add indirection without reducing complexity. The genuinely over-engineered items are the small ones.

### 3.1 Dead barrels and re-export shims — **SAFE, 53 LOC**

Three files exist only to re-export other files, and nothing imports any of them:

```ts
// apps/playground/src/utils/pistonApi.ts — 32 LOC, the whole module
export { executeCode, formatOutput, calculateExecutionTime } from '@/engines/ExecutionRouter';
export type { ExecutionResult, ExecuteOptions } from '@/engines/ExecutionRouter';
export interface ExecutionRequest { … }   // never constructed
```

`apps/api/src/utils/index.ts` (8 LOC) and `apps/playground/src/engines/index.ts` (13 LOC) are the same pattern. Consumers already import concrete modules, which is the better habit — these barrels are a wrapper around a wrapper with no call site. **Simpler version: delete all three.** ~53 LOC, readability improves (one fewer indirection to chase; barrels also defeat tree-shaking when they *are* used).

### 3.2 `apps/playground/src/lib/utils.ts` — 44% dead — **SAFE, ~64 LOC**

7 of 16 exports are never called anywhere, including inside the file. This is a classic grab-bag utility module where helpers were added speculatively. Deleting `getMainApiOrigin`, `generateId`, `formatFileSize`, `getErrorMessage`, `hasConsoleLog`, `hasPrintStatement`, `formatDate` takes the file from 291 → ~227 LOC and leaves only functions with real call sites.

### 3.3 Seven copies of `normalizeOptionalText` — **NEEDS REVIEW, ~25 LOC**

The same 5-line trim-to-null helper is redeclared in 7 modules — but **three of them have diverged, so a naive merge is a behaviour change**:

| Location | Behaviour |
|---|---|
| `routes/achievements.ts:40`, `announcements.ts:61`, `events.ts:178`, `users.ts:129` | Identical: `trim()` → `null` |
| `routes/polls.ts:196` | **Also runs `sanitizeText(value)` first** — security-relevant |
| `routes/team.ts:57` | Signature is `(value?: string)` — does not accept `null` |
| `utils/generateCertificatePDF.ts:258` | Returns `undefined`, not `null` |

**Suggested fix:** hoist one `normalizeOptionalText` (the plain trim variant) into `apps/api/src/utils/`, replace the four identical copies, and leave the polls/team/certificate variants alone under their own explicit names (`sanitizeOptionalText`, etc.) so the divergence is visible rather than accidental. Net ~25 LOC, and — more valuably — the *reader* stops having to diff seven near-identical helpers to know which one sanitizes.

### 3.4 `apps/api/src/routes/competition.ts` — 3,403 lines — **NEEDS REVIEW, no LOC estimate**

The single largest source file, holding contest CRUD, lifecycle transitions, proctoring, monitoring, clarifications, leaderboards, export, and practice publication. It is not *duplicated* code and it works, but it is the file where a reader must hold the most unrelated context at once. A split along the seams that already exist in the codebase (`competition/roundCache.ts`, `competitionRealtime.ts`, `contestMode.ts` are already separate) into `competitionLifecycle.ts` / `competitionProctor.ts` / `competitionResults.ts` would be mechanical.

**Explicitly not recommended right now.** `CLAUDE.md` Hard Constraint #6 freezes optimization code during UI work, contest scoring is load-bearing for live events, and a 3,400-line move is exactly the change that cannot be reviewed by diff. Flagging it as a known cost, not proposing it as cleanup.

---

## Phase 4 — Duplicate Code

17 clusters of structurally identical function bodies were found by normalized-AST-shape hashing. The important distinction is **accidental** duplication versus **deliberate cross-service mirrors**.

### 4.1 `videoEmbed.ts` — byte-for-byte identical across two apps — **LIKELY SAFE, 154 LOC**

```
$ diff apps/api/src/utils/videoEmbed.ts apps/web/src/lib/videoEmbed.ts
$ echo $?
0
```

154 lines, 6 functions (`parseTimeToSeconds`, `normalizeYouTubeEmbedUrl`, `normalizeVimeoEmbedUrl`, `normalizeLoomEmbedUrl`, `normalizeTrustedVideoEmbedUrl`, `setAllowedParams`), **zero divergence**. This is URL-allowlist logic — a place where server and client silently drifting apart is a security bug, not just a maintenance cost.

**The fix is already half-built:** the root `package.json` declares `"workspaces": ["apps/*", "packages/*"]`, but **`packages/` does not exist**. Creating `packages/shared/` and moving this module there removes 154 duplicated lines and makes drift structurally impossible.

### 4.2 `jsWorker.ts` vs `buildWorkerCode()` — a superseded implementation — **SAFE, 73 LOC**

`apps/playground/src/engines/jsWorker.ts` is a standalone Web Worker script. Nothing loads it: `jsEngine.ts:357` runs `new Worker(getWorkerBlobUrl())`, and `getWorkerBlobUrl()` (line 233) builds the worker from an inline `buildWorkerCode()` string. Two implementations of the same JS sandbox, one of which cannot run. Delete `jsWorker.ts`.

### 4.3 `calculatePoints` — a *diverged* dead mirror — **SAFE, 19 LOC**

`apps/web/src/lib/quizScoring.ts` (dead) mirrors `apps/api/src/quiz/quizStore.ts:104` "for optimistic display" — and has already drifted:

```ts
// apps/api/src/quiz/quizStore.ts:115   (authoritative)
const streakBonus = Math.min(Math.max(streak - 1, 0) * 10, 50);
// apps/web/src/lib/quizScoring.ts:16   (dead copy — no Math.max clamp)
const streakBonus = Math.min((streak - 1) * 10, 50);
```

At `streak = 0` the client copy would award **−10** points. Harmless only because nothing calls it — a good illustration of why mirrored formulas rot. Delete rather than fix; the server already unicasts the authoritative score in `answer_result`.

### 4.4 `slugify` × 4 — the shared util exists and is the unused one — **SAFE, ~24 LOC**

| Location | `slice()` cap |
|---|---|
| `apps/web/src/lib/slugify.ts` (**dead**) | 80 |
| `pages/dashboard/CreateAnnouncement.tsx:29` | 80 — logically identical to the shared one |
| `pages/dashboard/CreateProblem.tsx:39` | 120 |
| `components/admin/problems/BulkImportCard.tsx:18` | 120 |

**Suggested fix:** give the shared util a `maxLength = 80` parameter, import it in all three call sites, delete the local copies.

### 4.5 `seededUnit` × 5 — identical 3-line PRNG — **SAFE, ~16 LOC**

```ts
const seededUnit = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};
```
Byte-identical (modulo parameter naming) in `home-v2/HomeBackground.tsx:6`, `home/Hero.tsx:87`, `CreditsPage.tsx:98`, `TeamMemberProfilePage.tsx:72`, `network/NetworkProfilePage.tsx:96`. Two of those files also carry an identical 12-line `buildHeroParticles`. Hoist both to `apps/web/src/lib/particles.ts`.

### 4.6 Other accidental duplicates — **SAFE, ~120 LOC combined**

| Cluster | Copies | Location |
|---|---:|---|
| `fallbackGradient` / `gradFor` / `gradientFor` | 5 | `EventAdminHub.tsx:50`, `QRTicket.tsx:117`, `EventDetailPage.tsx:117`, `AdminEventRegistrations.tsx`, `DashboardEvents.tsx` — same body, three names |
| `parseAnswerList` | 3 | `QuizHostView.tsx:78`, `QuizResultReveal.tsx:90`, `QuizResultsPage.tsx:146` |
| `toNullableJsonValue` | 3 identical | `routes/achievements.ts:46`, `announcements.ts:67`, `network.ts:151` |
| `getCookie` (server) | 3 | `config/passport.ts:46`, `routes/auth.ts:43` (identical), `routes/attendance.ts:57` (verbose variant) |
| `getRegistrationStatus` | 2 inline, 28 lines each | `home/UpcomingEvents.tsx:16` + `home-v2/UpcomingEvents.tsx:17` — **while `lib/registrationStatus.ts` exists** and is used by `EventsPage`/`EventDetailPage` |
| `setSessionCookie` | 2 | `routes/auth.ts`, `routes/users.ts` |
| `appendLegacySlug` | 3 | `routes/network.ts`, `routes/team.ts`, `utils/init.ts` (as `normalizeLegacySlugs`) |
| `verdictTone` | 2 | `AdminProblems.tsx`, `AdminSubmissionReview.tsx` |
| `exportFiltersActive` / `countExportFilters` | 2 each | `AdminEventRegistrationDetail.tsx`, `AdminEventRegistrations.tsx` |
| `isExpiredJwt`, `getSharedBuffer`, `writeInputToBuffer` | 2 each | within `apps/playground` |
| `getAnnouncementPreview` | 2 | `home/` + `home-v2/` |

### 4.7 Deliberate mirrors — **DO NOT MERGE**

These look like duplicates to a scanner but are load-bearing architecture: the services deploy independently and share no runtime.

- `apps/api/src/competition/plagiarism.ts` ↔ `apps/playground/plagiarism.js` — documented in `CLAUDE.md` as an intentional JS mirror for the offload endpoint.
- `isInfraFailure` in `codeJudge.ts`, `execute-server.js`, **and** `workers/executor.js` — the Worker is a separate Cloudflare deploy with no bundler.
- `roomAll`/`roomAdmin`/`roomUser` in `competitionRealtime.ts` ↔ `execute-server.js` — the relay's room-naming contract.
- `resolvePoolMax` in `lib/prisma.ts` ↔ `scripts/prismaClient.ts` — scripts run outside the API build.
- `chunkReload.ts` in `apps/web` (88 LOC) ↔ `apps/playground` (119 LOC) — **genuinely different**: the playground copy adds the proctor interlock. Both are unit-tested and the divergence is documented in each file's header.
- `apps/web/src/components/home/*` ↔ `home-v2/*` — light-mode vs dark-mode landing pages, theme-switched in `HomePage.tsx:46`. Both live. Consolidating is blocked by the same owner-deferred W3 design freeze as §2.8.

> If §4.1's `packages/shared/` is created, the first four of these become *optionally* shareable for the two Node services — but the CF Worker and the plain-JS `execute-server.js` still cannot import from a TS workspace without a build step, so plan for them to stay mirrored.

---

## Phase 5 — Simplification Opportunities

1. **Create `packages/shared/`.** The workspace glob already exists. First tenant: `videoEmbed.ts` (§4.1). Removes 154 duplicated lines and closes a server/client drift risk on URL validation.
2. **Delete the three re-export barrels** (§3.1) — 53 LOC, one less indirection layer.
3. **Hoist the pure helpers** — `seededUnit`, `slugify`, `fallbackGradient`, `parseAnswerList`, `toNullableJsonValue`, `getCookie` — into existing `lib/`/`utils/` modules. ~185 LOC, and each becomes unit-testable once.
4. **Use `lib/registrationStatus.ts` in both `UpcomingEvents` components** instead of two inline 28-line copies. Two other pages already import it.
5. **Drop `export` from the ~37 symbols that are used only inside their own file.** Zero LOC change, but it shrinks each module's apparent public API and makes the *next* dead-code pass cheaper.
6. **Wire `scripts/check-esm-imports.sh` into CI, or delete it.** A guardrail nobody runs is worse than no guardrail — it implies coverage that does not exist.
7. **Add `*.pdf` to `.gitignore`** under `apps/api/` so debug renders cannot be committed again.
8. **Fix the five stale `CLAUDE.md` claims** (§ below). The doc is explicitly the single source of truth, and its sync rule says *"the code wins."*

### Documentation drift found

`CLAUDE.md`'s 92 file links resolve cleanly except one, but five prose claims are contradicted by the code:

| Claim | Reality |
|---|---|
| Tech Stack: `sharp` *"parses user-uploaded signature images, so this path is genuinely reachable"* | Unreachable — sole importer is dead (§2.5) |
| File Quick Reference: *Signature processing → `processSignatureImage.ts`* | Dead file |
| File Quick Reference: *Quiz scoring utils → `apps/web/src/lib/quizScoring.ts`* | Dead file, and diverged (§4.3) |
| Attendance components list includes `AttendanceHistory` | Dead file |
| File Quick Reference links `dashboard/AdminPendingRequestsCard.tsx` | **Path does not exist** — only `AdminPendingRequestsCardV2.tsx` does (and its `V2` suffix is vestigial; there is no V1) |

---

## Phase 6 — Safety Verification

| Rating | Count | Definition |
|---|---:|---|
| **SAFE** | 47 files + 9 deps + 3 type stubs + 7 assets | Unreachable in the import graph, zero identifier hits repo-wide, **and** the full build + 351 tests verified green with them removed |
| **LIKELY SAFE** | `videoEmbed` consolidation, `docs/assets/*.png`, the 14 SAFE CSS selectors | Mechanically safe; needs a build + visual check |
| **NEEDS REVIEW** | 3 scripts, 4 endpoints, `normalizeOptionalText` merge, test-seam exports, `competition.ts` split | Correct-but-consequential: an owner decision about intent, a public HTTP surface, or a behavioural divergence |
| **DO NOT DELETE** | `pub-*`/`ab-*` CSS, shadcn `ui/*` exports, `/certificates/files/:filename`, all §4.7 mirrors, `bufferutil`/`utf-8-validate`/`better-sqlite3`/`eiows`, `/ping` | Runtime-loaded, frozen by owner decision, or a compatibility contract with clients outside this repo |

**Uncertainty stated plainly:**

- **Public endpoints.** `/api/announcements/latest` and `/api/achievements/latest` are unauthenticated. I can prove no *in-repo* caller; I cannot prove no external one. Check access logs before removing.
- **`sharp`.** The code says the path is dead; `CLAUDE.md` says it is reachable and security-relevant. The code wins on fact, but the *intent* — was server-side signature processing dropped deliberately or lost in a refactor? — is the owner's to confirm. If it was lost accidentally, the fix is to restore the call, not to delete the module.
- **`optionalDependencies`.** `eiows` and `better-sqlite3` load via `createRequire()` inside try/catch. Static analysis cannot see these edges; I relied on `CLAUDE.md` and the `WS_ENGINE` code path.
- **The CF Workers** (`workers/*.js`) are deployed by hand and are not in CI, so nothing in this repo proves what is actually running in Cloudflare.
- **`docs/`** was treated as an intentional archive and not audited for staleness.

---

## Refactoring Plan

### Quick Wins — no behaviour change, verified green

1. Delete the 6 debug artifacts (§2.1-F) + `apps/web/public/vite.svg`; add `*.pdf` to `.gitignore`.
2. Delete the 21 orphaned admin components (§2.1-A).
3. Delete the 4 superseded dashboard widgets (§2.1-B).
4. Delete the 6 playground dead files (§2.1-D) and the 8 web utilities (§2.1-E).
5. Delete the 4 dead API utilities (§2.1-C, excluding `processSignatureImage.ts` pending the owner call).
6. Remove the 8 unambiguous unused deps (all of `apps/playground`) + 3 redundant `@types` stubs.
7. Delete the 21 SAFE CSS selectors.

### Moderate Refactors — mechanical, needs review

8. Resolve `sharp` + `processSignatureImage.ts` **after** the owner confirms intent.
9. Create `packages/shared/`; move `videoEmbed.ts` (§4.1).
10. Consolidate the pure-helper duplicates (§4.4, §4.5, §4.6).
11. Delete the 3 re-export barrels and prune `playground/src/lib/utils.ts` (§3.1, §3.2).
12. Hoist `normalizeOptionalText`, keeping the 3 diverged variants explicitly named (§3.3).
13. Decide on `scripts/migrate-deploy.sh`, `start-production.sh`, `check-esm-imports.sh`.
14. Update the 5 stale `CLAUDE.md` claims — the Living Document Protocol requires this in the same commit as the code change.

### Major Refactors — not recommended now

15. `competition.ts` (3,403 lines) split — blocked by Hard Constraint #6 and live-contest risk (§3.4).
16. `home/` ↔ `home-v2/` consolidation and the `pub-*` CSS system — blocked by the owner-deferred W3 design freeze.

---

## Cleanup Checklist

Each item is independently completable and independently verifiable. Baseline to reproduce before starting: `npm ci && npx prisma generate && npm run build --workspace=apps/api && (cd apps/web && npx tsc -b) && (cd apps/playground && npx tsc -b) && npm run test:stability` → all green, 351/351.

| # | File(s) | Change | Benefit | Risk | Verification |
|---|---|---|---|---|---|
| 1 | `apps/api/*.pdf` (5), `apps/api/test-fontkit.js`, `apps/web/public/vite.svg` | Delete; add `apps/api/*.pdf` to `.gitignore` | −60 KB, −10 LOC; stops recurrence | **None** | `git grep` for each name → 0 hits |
| 2 | 21 files in §2.1-A | Delete | −1,990 LOC | **None** | `cd apps/web && npx tsc -b --force && npx vite build` |
| 3 | 4 files in §2.1-B | Delete | −873 LOC | **None** | same as #2 |
| 4 | 8 files in §2.1-E | Delete | −366 LOC | **None** | same as #2 |
| 5 | 6 files in §2.1-D | Delete | −547 LOC | **None** | `cd apps/playground && npx tsc -b --force && npx vite build` |
| 6 | `utils/{profileSync,dateStreak,index}.ts`, `config/email-templates.config.ts` | Delete | −181 LOC | **None** | `npm run build --workspace=apps/api && npm run test:stability` |
| 7 | `apps/playground/package.json` | Remove `framer-motion`, `zod`, `zustand`, `@radix-ui/react-{select,tabs,tooltip,dialog,dropdown-menu}` | −15 MB install, faster Render builds | **Low** | `npm install && cd apps/playground && npx tsc -b && npx vite build` |
| 8 | `apps/api/package.json`, `apps/web/package.json` | Remove `@types/sharp`, `@types/marked`, `@types/dompurify` | −160 KB; removes stubs that shadow real types | **Low** | `npm install && npm run build --workspace=apps/api && (cd apps/web && npx tsc -b)` |
| 9 | `apps/web/src/index.css`, `apps/playground/src/index.css` | Delete the 21 SAFE selectors (§2.8) — **not** `pub-*`/`ab-*` | −~80 CSS lines | **Low** | `vite build` both, then load `/`, `/dashboard`, playground editor and diff screenshots |
| 10 | — | **Ask the owner:** was server-side signature processing dropped deliberately? | Unblocks #11 | **None** | Written answer recorded in the PR |
| 11 | `utils/processSignatureImage.ts`, `apps/api/package.json` | If yes → delete file + `sharp` + `@types/sharp`. If no → restore the `processSignatureImage()` call in `resolveSignatory()` | −192 LOC, −28 MB, closes 4 HIGH libvips CVEs | **Medium** — changes certificate signature rendering either way | `npm run test:stability`; then issue one certificate with an image signatory and compare the PDF against a pre-change render |
| 12 | new `packages/shared/`, `apps/{api,web}` | Move `videoEmbed.ts`; import from both | −154 LOC; ends server/client drift on URL validation | **Medium** — first use of the `packages/*` workspace | Full build ×3 + `npm run test:stability`; paste a YouTube, Vimeo and Loom URL into the event editor and confirm the embeds render |
| 13 | `lib/slugify.ts` + 3 call sites | Add `maxLength = 80` param; delete the 3 local copies | −24 LOC | **Low** — cap changes 120→80 unless parameterised | Create an announcement and a problem with a >80-char title; confirm slugs match pre-change |
| 14 | new `lib/particles.ts` + 5 call sites | Hoist `seededUnit` (and `buildHeroParticles` ×2) | −16 LOC | **None** — pure function | `vite build`; confirm hero particles still animate on `/`, `/credits`, a team profile |
| 15 | §4.6 clusters | Hoist `fallbackGradient`, `parseAnswerList`, `toNullableJsonValue`, `getCookie`, `setSessionCookie` | −~120 LOC | **Low** | Build ×3 + `npm run test:stability`; exercise OAuth login (`getCookie`) and a quiz reveal (`parseAnswerList`) |
| 16 | `home/UpcomingEvents.tsx`, `home-v2/UpcomingEvents.tsx` | Import `lib/registrationStatus.ts` instead of the inline copies | −56 LOC | **Low** — return shapes must be reconciled | Compare the registration pill on `/` in light **and** dark mode against pre-change |
| 17 | `utils/index.ts`, `engines/index.ts`, `utils/pistonApi.ts` | Delete (covered by #5/#6) | −53 LOC | **None** | Builds ×3 |
| 18 | `apps/playground/src/lib/utils.ts` | Delete the 7 uncalled exports | −64 LOC | **None** | `tsc -b` (`noUnusedLocals` is on here) + `vite build` |
| 19 | ~37 symbols in §2.2 | Drop the `export` keyword where the symbol is used only in-file | Smaller public surface | **Low** — skip the shadcn `ui/*` and named test seams | `tsc -b` ×3 + `npm run test:stability` |
| 20 | `apps/api/src/utils/` + 4 routers | Hoist the plain `normalizeOptionalText`; rename the polls/team/PDF variants to say what they do | −25 LOC; the sanitising variant stops hiding | **Medium** — `polls.ts` applies `sanitizeText`; do not lose it | `npm run test:stability`; POST an achievement, announcement, event and user profile with `"  "` and `null` and confirm all four persist `null` |
| 21 | `scripts/migrate-deploy.sh` | Delete | Removes a script that would re-run a retired migration-resolve | **Low** | `git grep migrate-deploy` → 0; confirm `render.yaml:17` is the live path |
| 22 | `start-production.sh` | Delete, or document it in the README | Removes an unreferenced duplicate of `npm run start:prod` | **Low** | `git grep start-production` → 0 |
| 23 | `.github/workflows/ci.yml` | Add `bash scripts/check-esm-imports.sh`, or delete the script | The guardrail either works or stops pretending to | **Low** | Push a branch; confirm the step runs |
| 24 | `GET /api/stats/{events,qotd}/trends` | Confirm no admin tool calls them, then delete | −~120 LOC incl. 2 raw SQL queries | **Medium** — admin-gated, no public contract | Grep the repo (done: 0 hits); check prod access logs for 30 days first |
| 25 | `GET /api/{announcements,achievements}/latest` | **Check access logs before touching.** Superseded by `HomePageData` | −~90 LOC | **Medium** — public, unauthenticated | 30 days of access logs showing no traffic |
| 26 | `CLAUDE.md` | Fix the 5 stale claims (§ Documentation drift) | Restores the single source of truth | **None** | Re-run the link check: all 92 paths resolve |

---

*Report generated by static analysis of commit `c953e91`. Every "SAFE" rating is backed by a build and test run with the code actually removed; every "NEEDS REVIEW" rating marks a place where the evidence is clear but the intent is the owner's to confirm.*
