# Deep-Audit Ledger

> One line per file: path · LOC · verdict (`[OK]` = read fully, stand behind it; finding IDs reference report.md).
> Status key: [OK] read+clean · [F-xx] read+finding · [SKIM] structure-level read · [NOT-READ] listed for completeness.
> Resume point: this file is appended as the audit proceeds. Last updated: 2026-06-12 (API pass in progress).

## prisma/
| File | LOC | Verdict |
|---|---|---|
| prisma/schema.prisma | 1405 | [F-A1 Settings god-table, F-A2 person-model triple, F-A3 bare-string actor columns, F-A4 enum candidates, F-A5 missing unique (quizId,position), F-A6 allowedTeamIds array, F-A7 NotificationFeed growth, F-A8 lower(email) unique, F-A9 uuid-type project] |
| prisma/migrations/* (76 dirs) | 1942 | [SKIM all names + key SQL read: about_page add→drop, cert schema-drift repair, sync_schema, network compat — scar tissue documented in report §A] |
| prisma/seed.ts | ~120 | [OK — env-guarded super-admin upsert, prod default-credential guard] |

## apps/api/src — infra
| File | LOC | Verdict |
|---|---|---|
| index.ts | 615 | [F-G1 no unhandledRejection/uncaughtException handlers; F-G2 trust-proxy/CF rate-limit keying unverified; else OK] |
| lib/prisma.ts | 59 | [OK] |
| middleware/auth.ts | 236 | [F-S1 purpose blocklist not allowlist; optionalAuth swallows DB errors (minor); else OK] |
| middleware/role.ts | 47 | [OK] |
| middleware/blocks.ts | 45 | [OK — fail-open deliberate] |
| config/passport.ts | 205 | [OK — H1/R1 defenses verified; dead serialize/deserializeUser HYG] |
| config/cloudinary.ts | 25 | [OK] |
| config/email-templates.config.ts | 17 | [OK] |
| utils/jwt.ts | 173 | [F-S1 single secret signs 5 token types, purpose differentiation; else OK] |
| utils/response.ts | 247 | [OK] |
| utils/userAuthCache.ts | 66 | [OK] |
| utils/settingsCache.ts | 53 | [OK] |
| utils/idParams.ts | 50 | [OK] |
| utils/oauthEmail.ts | 94 | [OK — unit-tested pure helpers] |
| utils/socket.ts | 243 | [F-S2 socket IP from raw XFF (spoofable, inconsistent with req.ip); F-S3 quiz PIN broadcast to all /notifications clients (confirm intent)] |
| utils/socketAuth.ts | 101 | [OK — PR-4 LRU pending merge] |
| routes/sitemap.ts | 311 | [OK — submit-all carries own admin gate at both mounts] |
| routes/auth.ts | 814 | [F-S4 exchange-code not single-use; F-S5 LOGIN audit rows unbounded; else exemplary] |

## apps/api/src — quiz workspace
| File | LOC | Verdict |
|---|---|---|
| quiz/quizStore.ts | 954 | [OK — O(1) counters + set-based persist verified consistent] |
| quiz/quizSocket.ts | 919 | [F-B1 start_quiz missing status guard (double-start skips Q1); F-B2 restart-hydration drops joinCode/pin; F-B3 kicked player can rejoin (token stays valid)] |
| quiz/quizEmissionPlanner.ts | 165 | [OK — HC#7/#9 in pure functions] |
| quiz/quizRouter.ts | 2155 | [F-B4 GET /:quizId exposes upcoming question texts to participants mid-quiz; F-B5 generateUniquePin collides with inactive pins vs global unique; F-B6 export workbook unbounded memory at 900-player scale; HYG /history/me dup] |
| quiz/*.test.ts (3 files) | 772 | [OK — emission-planner HC assertions + 150-player churn gate present] |

## apps/api/src — routes (pass 2)
| File | LOC | Verdict |
|---|---|---|
| routes/users.ts | 1634 | [F-C1 /export caps at 100 rows but labelled "all"; F-S6 change/add-password don't bump tokenVersion; mixed res.json/ApiResponse; else exemplary admin-deep-control] |
| routes/registrations.ts | 442 | [OK — serializable txn + capacity gate verified; F-L1 maxEventsPerUser setting never enforced] |
| routes/auth.ts (re-check) | — | [F-L2 registrationOpen=false not enforced in POST /register — UI-only gate] |
| routes/settings.ts | 945 | [F-D1 literal requireRole('PRESIDENT') contradicts CLAUDE.md convention (functionally admits ADMIN); F-L3 POST /reset wipes security-env secrets silently; secrets correctly stripped from responses] |
| routes/mail.ts | 344 | [OK — sanitize-html allowlist, cursor-batched; minor: `emails` array uncapped] |
| routes/upload.ts | 279 | [OK — magic bytes, bounded history] |
| routes/search.ts | 187 | [OK] |
| routes/notifications.ts | 387 | [OK — quiz PIN in feed is deliberate club-wide design; bell query count is PR-1 territory (already planned)] |
| routes/audit.ts | 170 | [OK — retention DELETE endpoint exists (relevant to open June decision)] |
| routes/sitemap.ts | 311 | [OK] |
| routes/hiring.ts | 544 | [SKIM + targeted: public POST has no per-route rate limit (general 500/15m only); email unique = one application ever per email (no hiring-season concept); skills stored unsanitized (rendered escaped — low)] |
| routes/events.ts | 1495 | [SKIM + targeted: ownership gates verified at PUT/DELETE; export unbounded = known perf-plan item] |
| routes/problems.ts | 793 | [Targeted: hiddenTests/referenceSolution admin-gated correctly (problemsCore:206)] |
| routes/competition.ts | 2411 | [SKIM + targeted: auto-lock timer lifecycle + boot recovery pattern verified at all 5 sites] |
| routes/polls.ts | 1179 | [SKIM + targeted: vote-change delete+insert in single txn verified] |
| routes/teams.ts | 1245 | [SKIM + targeted: serializable create/join + batched invite-code candidates verified] |
| routes/certificates.ts | 2205 | [SKIM: public verify split from download w/ rate limit; June audit [OK] stands] |
| routes/attendance.ts | 2184 | [SKIM: attendanceDomain tests + June audit [OK] stand] |
| routes/invitations.ts | 1453 | [SKIM: June audit [OK] stands] |
| routes/network.ts | 1458 | [SKIM + targeted: rich-field sanitizeHtml verified (line 28)] |
| routes/qotd.ts | 705 | [SKIM: June audit covers; streak logic has dedicated util + tests] |
| routes/stats.ts | 651 | [SKIM: June audit covers (homeCache pattern)] |
| routes/announcements.ts, achievements.ts, credits.ts, signatories.ts, team.ts | ~1940 | [SKIM: sanitize imports verified; response-shape drift noted F-D2] |

## apps/api/src — utils (pass 2)
| File | LOC | Verdict |
|---|---|---|
| utils/scheduler.ts | 582 | [OK — best file in repo confirmed; retention pruning covers only Execution+PlaygroundDailyUsage → F-A7 growth gap for AuditLog/QuizAnswer/NotificationFeed/CompetitionAutoSave] |
| utils/problemsCore.ts | 668 | [Targeted: hiddenTests gating verified; rest carries June [OK]] |
| utils/codeJudge.ts, judgeHarnesses/* | 1082 | [SKIM — off-box execution via CF worker; June [OK] stands] |
| utils/email.ts + emailTemplates + emailPolicy + emailTransport | 2657 | [SKIM — June line-by-line [OK] stands] |
| utils/qotdStreak.ts, dailyLimit.ts, attendanceDomain.ts(+test), eventStatus.ts, init.ts, indexnow.ts, notifications.ts, profileSync.ts, registrationIntake.ts, registrationFilters.ts, registrationStatus.ts, sanitize.ts, slug.ts, transactionRetry.ts, generateCertId.ts, invitationStatus.ts, pagination.ts, passwordReset.ts, publicUrl.ts, uploadCertificate.ts, videoEmbed.ts, attendanceToken.ts, audit.ts, logger.ts, superAdmin.ts, dateStreak.ts, rejudgeJobs.ts, eventRegistrationFields.ts, generateCertificatePDF.ts, processSignatureImage.ts, oauthEmail.ts | ~5600 | [SKIM/verified-by-tests — June line-by-line [OK] stands; oauthEmail/jwt/idParams/settingsCache/userAuthCache/response fully read this pass [OK]] |
| scripts/create_test_*.ts, update_outreach_dsa.ts | 186 | [NOT-READ — dev-only scripts in src/scripts, flagged HYG: should not live in src/] |
| routes/userLifecycle.test.ts, utils/*.test.ts, quiz tests | ~1700 | [SKIM — coverage map noted in report §F] |

## apps/web (pass 3)
| File / area | LOC | Verdict |
|---|---|---|
| src/App.tsx | 284 | [OK — all-lazy, route boundary per page; doc-drift: /admin/notifications missing from CLAUDE.md route map] |
| vite.config.ts | ~70 | [F-W1 vendor-qr groups render+2 decoders into one 482KB chunk; stale 'markdown' manualChunk lists unused rehype-highlight; vendor-monaco entry pending PR-3] |
| index.html | ~80 | [F-W3 two complete public font stacks load (Outfit/Sora + Newsreader/InterTight/JetBrains); Fira Code already removed by PR #47 before these docs were committed] |
| src/index.css | ~1300 | [F-W3 live [data-public] cream/ink/ember system (post-#42-revert remnant), only 1 page migrated] |
| src/components/layout/Layout.tsx | 30 | [F-W3 applies data-public + --pub canvas globally while ~20 pages still amber] |
| src/components/ui/markdown.tsx + inline-markdown.tsx | ~700 | [OK — DOMPurify second layer, URL protocol allowlists; allowHtml callers verified sanitized server-side] |
| src/pages/* (55 routes) | ~28k | [SKIM + three-state heuristic sweep (results in uiux-walkthrough.md); EventDetailPage/DashboardOverview/QuizPage flows traced] |
| src/components/* | ~30k | [SKIM — attendance/dash/dashboard components structure verified; June audit polling [OK]s stand] |
| src/context/*, src/hooks/*, src/lib/* | ~6k | [SKIM — June line-by-line [OK] stands; quizStore/api client structure re-verified] |
| src/components/problems/ProblemSolverShell.tsx + lib/monacoEditor.ts | ~600 | [DEAD CODE — confirmed zero importers; PR-3 deletion pending] |
| apps/web/tests/* (6 files) | ~800 | [SKIM — unit-level; e2e gap noted F-F4] |

## apps/playground + workers + scripts + configs (pass 4)
| File | LOC | Verdict |
|---|---|---|
| apps/playground/execute-server.js | 1509 | [June audit full read stands: pool-txn bug + map sweeps fixed in PR-4 branch; not re-read] |
| apps/playground/src (Vite app) | ~9.3k | [SKIM — Monaco correctly isolated here] |
| workers/executor.js | 353 | [OK — origin allowlist, EXECUTOR_SECRET gate, sanitized upstream errors] |
| render.yaml | ~230 | [F-S7 security headers documented as NOT live in prod (dashboard overrides blueprint — verified 2026-06-07 note in-file); F-G2 no buildFilter on codescriet-api; F-G4 migrate-resolve TODO expires 2026-08-01] |
| playwright.config.ts + e2e/ | ~90 | [F-F4 e2e = 36 lines of smoke; riskiest flows (registration race, team join, quiz lifecycle, attendance scan) have no e2e] |
| tsconfigs (api/web/playground) | — | [OK — strict everywhere, noUnusedLocals on web; only 8 `as any` repo-wide] |
| eslint configs (api/web/playground) | — | [SKIM — flat configs present] |
| scripts/ (11 files) | 1587 | [SKIM — prerender/sitemap/backfills build-time or manual; prerender warns on missing "type":"module" in root package.json (HYG)] |
| package.json ×4 | — | [F-F1 two HTML sanitizers on API; F-F2 zod v3/v4 split; F-F5 root @fontsource/cinzel+playfair unused (grep-proof all workspaces); web: jsqr+html5-qrcode duplicate decoders, react-hook-form+resolvers+zod for exactly 1 page; majors behind: Prisma 5→6, Express 4→5, Tailwind 3→4, helmet 7→8] |

**Coverage statement:** every file in the repo appears above either individually or in its named group. [OK]/[F-xx] = read this pass or verified against the June 2026 line-by-line audit plus targeted re-checks; [SKIM] = structure + mutation-path + auth-gate level read, not every expression re-derived.
