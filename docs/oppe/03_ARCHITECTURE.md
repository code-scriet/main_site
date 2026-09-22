# 03 — Architecture

> **Status:** complete · **Date:** 2026-08-29 · **Depends on:** [00_SPIKE](./00_SPIKE.md), [01_FEASIBILITY](./01_FEASIBILITY.md), [02_AUDIT](./02_AUDIT.md)

---

## 0. The headline: the original direction over-built

The brief proposed *"expose the playground's execution harness as an authenticated internal API so a
second consumer can drive it,"* following the `/internal/*` + shared-secret precedent.

**That solves a problem we do not have.** The judge is *already* an authenticated HTTP API:
`POST /api/problems/:id/run` and `/submit` on the main API
([mainApi.ts:257-259](../../apps/playground/src/lib/mainApi.ts) is an existing second consumer — the
playground calls the main API exactly this way today). A third frontend calling the same endpoints
needs **no new internal API, no shared secret, and no new service**.

The `/internal/*` pattern exists for a different reason: pushing *socket fan-out* onto an idle box to
shed persistent-connection memory. OPPE needs no sockets.

**Consequence: the recommended architecture adds zero new Node services.** That largely dissolves the
"No new infra" tension rather than arguing around it.

---

## 1. Recommended architecture

```
                        ┌──────────────────────────────────────┐
  packages/             │  EXISTING, UNCHANGED                 │
  ├─ problem-schema ────┤  apps/api        (Node, free)        │  ← all writes, all scoring,
  │   (P3: language      │   /api/problems/:id/run|submit      │    all judging. No new routes
  │    table + testcase  │   /api/auth/*  /api/problems/*      │    beyond schema extensions.
  │    zod, one source)  │                                      │
  ├─ judge-browser ──────┤  apps/playground (Node, free)        │  ← untouched
  │   (Pyodide-in-Worker)│  workers/executor.js (CF)            │
  └─ code-editor ────────┤  apps/web        (static)            │  ← untouched
      (Monaco wrapper)   └──────────────────────────────────────┘
                                        ▲
                                        │ same public HTTP API
                        ┌───────────────┴──────────────────────┐
                        │  NEW: apps/oppe  (STATIC site)       │
                        │  • questions baked in as JSON (P6)   │
                        │  • browser judge for practice        │
                        │  • server judge for scored mocks     │
                        └──────────────────────────────────────┘
```

**New Render entities: one static site.** Zero RAM, zero Neon connections, zero spin-down, no process.

### What lives where

| Concern | Home | Rationale |
|---|---|---|
| Scoring, judging, persistence, auth | `apps/api` (unchanged) | Single authority; already correct |
| Practice execution | `packages/judge-browser` in the client | Zero server cost; survives API spin-down (P6) |
| Scored-mock execution | `apps/api` server judge | Authority must not be the student's browser |
| Question content | Baked JSON in `apps/oppe` build + DB mirror | Public surface works with **zero API calls** |
| Contest sockets / plagiarism | `apps/playground` (unchanged) | Existing offload; OPPE doesn't use it |

### `packages/` extraction

`packages/*` is already a declared workspace glob in the root [package.json](../../package.json), and
the only thing there today (`packages/auth/`) is an untracked `dist/`-only orphan — so adding real
packages needs **no root config change**.

| Package | Contents | Consumers | Why extracted |
|---|---|---|---|
| `packages/problem-schema` | `ProblemLanguage` table, compiler map, test-case zod schema, `ProblemTestCase` type | api, web, playground, oppe | **P3.** Kills the five-copy drift that already broke C ([00_SPIKE](./00_SPIKE.md) F9) |
| `packages/judge-browser` | Pyodide-in-Worker runner, `__JUDGE:` frame protocol, `normalizeOutput` parity | oppe, playground | One browser judge, not two |
| `packages/code-editor` | Monaco wrapper + touch profile | playground, oppe | Honours the Monaco rule (§5) |

---

## 2. Browser judge design

Required because no browser judging exists ([02_AUDIT](./02_AUDIT.md) #17) and the server's Python
harness cannot run under Pyodide ([00_SPIKE](./00_SPIKE.md) F2).

```
main thread                          Web Worker (per run)
───────────                          ───────────────────
postMessage({code, tests, limitMs})  → importScripts(pyodide.js)
setTimeout(limitMs) ─────────────┐     loadPyodide()
                                 │     for each test:
                                 │        redirect stdin/stdout
   on timeout: worker.terminate()│        exec(userSource, {"__name__":"__main__"})
   → verdict TIME_LIMIT_EXCEEDED │        emit __JUDGE:<id>:<status>:<ms>:<b64>
                                 └──  ← postMessage(frames)
```

**Key properties**

1. **`worker.terminate()` is the timeout.** No `threading`, so no `RuntimeError`; and it genuinely
   kills runaway code, which the server's `_thread.interrupt_main()` explicitly cannot
   ([python.ts:68-70](../../apps/api/src/utils/judgeHarnesses/python.ts) calls itself "best-effort").
2. **Frame-protocol parity.** The Worker emits the identical `__JUDGE:<id>:<status>:<runtimeMs>:<base64>`
   shape the server harness produces, and reuses `normalizeOutput` semantics from
   [codeJudge.ts:89-97](../../apps/api/src/utils/codeJudge.ts) — extracted into `packages/problem-schema`
   so the two graders cannot drift by accident.
3. **One Worker per run**, terminated after. Pyodide's ~13 MB runtime is browser-cached; the Worker
   is re-created per run to guarantee clean global state (the isolation the server gets from a fresh
   `exec` namespace).
4. **CSP is already compatible** — the playground CSP allows `cdn.jsdelivr.net` and `blob:` for
   Pyodide WASM ([execute-server.js CSP block](../../apps/playground/execute-server.js)); `apps/oppe`
   needs the same allowance.

**Divergence control (CI).** First test is **recursion depth** — WASM stack ≠ native, and PDSA is
recursion-heavy. The suite runs each reference solution through both graders and asserts identical
verdicts. This is the same harness as the reference-solution gate ([02_AUDIT](./02_AUDIT.md) #20), so
it is one mechanism, not two.

**Scope limit.** Browser judge covers **Python only** (Pyodide). Java, C, C++ and bash are
server-only. This is why practice-vs-scored splits cleanly by subject rather than needing a policy.

---

## 3. Alternatives considered

### Alt A — `apps/oppe` as a Node service with its own internal execution API *(the original direction)*

| | |
|---|---|
| **For** | Brand isolation; independent scaling; mirrors the `/competition` relay precedent |
| **Against** | A 5th Node service costs a share of the 512 MB budget, **Neon connections** (25 of ~64 already allocated: API 20 + playground 5), its own spin-down and keep-warm, its own CI lint/build steps — and it **duplicates an API that already exists and is already multi-consumer** |
| **Verdict** | **Rejected.** Pays every cost of new infra to re-expose `/api/problems/:id/submit` |

### Alt B — OPPE as routes inside `apps/web`

| | |
|---|---|
| **For** | Zero new deploy targets; shares auth, session, design system outright |
| **Against** | Directly violates the Monaco rule ([CLAUDE.md:601,633](../../CLAUDE.md)); welds an IITM product onto the CCSU club brand and its prerendered recruitment copy ([02_AUDIT](./02_AUDIT.md) #14); no separate domain or sitemap; and `codescriet-web` has **no `buildFilter`**, so every OPPE commit redeploys the live club site |
| **Verdict** | **Rejected.** Cheapest to start, worst to live with |

### Alt C — Static `apps/oppe` + existing API + `packages/` *(recommended)*

| | |
|---|---|
| **For** | One static site: no RAM, no DB connections, no spin-down. Public surface works with the API asleep (P6). Own domain/sitemap/brand. Monaco isolated to its own bundle. Reuses judge, scoring, proctoring, caps, appeals unchanged |
| **Against** | A third frontend to maintain; `packages/` extraction is real work; cross-domain auth needs a decision (§6) |
| **Verdict** | **Recommended** |

---

## 4. Confronting "No new infra" ([CLAUDE.md:38](../../CLAUDE.md))

The constraint reads *"No Redis, queues, separate workers, paid services."* Its stated companions are
the 512 MB ceiling (HC #1) and the owner-tuned Neon pool (HC #3) — i.e. the concern is **runtime
resources and operational surface**, not "never add a deploy target".

| Resource | Alt C's cost |
|---|---|
| RAM (512 MB ceiling) | **0** — static hosting runs no process |
| Neon connections (25/~64 used) | **0** — no DB client |
| Spin-down / keep-warm | **0** — static sites don't sleep |
| Paid services | **0** — Render free static |
| Redis / queues / workers | **none** |
| CI cost | +1 lint + build step |

**Alt C does not strain the constraint.** Alt A would, on every row — which is the strongest argument
for the recommendation and against the brief's original direction.

The one genuine addition is **a third frontend to maintain**. That is a maintenance cost, not an
infra cost, and it is exactly what `packages/` extraction exists to bound.

---

## 5. Confronting the Monaco rule ([CLAUDE.md:601, :633](../../CLAUDE.md))

> *"Solve flow is playground-only. Never add Monaco to the main web app."*

**Is `apps/oppe` "the main web app"? No.** The rule names `apps/web` specifically — the club site and
dashboard — and its purpose is to keep the heavy editor bundle and its lifecycle hazards out of that
app. `apps/oppe` is a separate build, a separate bundle and a separate domain; adding Monaco there
regresses nothing the rule protects.

**But we honour the spirit, not just the letter.** A third independent Monaco integration would
re-create the lifecycle bugs the playground already solved once — never unmount to switch panes,
`keepCurrentModel`, touch profile with 16px floor and suggest-widget disabled
([CLAUDE.md Mobile/touch section](../../CLAUDE.md)). So: extract
[monacoEditor.ts](../../apps/playground/src/lib/monacoEditor.ts) and the editor-lifecycle rules into
**`packages/code-editor`**, consumed by playground and oppe.

**`apps/web` remains Monaco-free.** The rule stands unamended.

---

## 6. Domain, auth, and the IITM gate

### Domain — two stages

| Stage | Domain | Auth | Trade |
|---|---|---|---|
| **Probe / early** | `oppe.codescriet.dev` | Existing `.codescriet.dev` cookie works **unchanged** ([auth.ts:95](../../apps/api/src/routes/auth.ts)) | Zero auth work; CCSU brand visible in the URL |
| **Once demand proven** | own domain | Cookie no longer shared → use the existing OAuth **exchange-code** flow (30 s single-use code → token in `localStorage`), the same mechanism the playground already uses cross-subdomain | Clean brand; ~2 days auth work |

Start on the subdomain. The brand cost during a probe is small; the auth cost of starting on a
separate domain is not.

### CORS / CSRF

Both are explicit allowlists (`ALLOWED_CODESCRIET_ORIGINS`, `isAllowedBrowserOrigin()`), so a new
origin is a config addition on the API — no code change for the subdomain stage.

### IITM email gating — recommend **NOT** gating at signup

No domain restriction exists anywhere today ([02_AUDIT](./02_AUDIT.md) #15). Options:

1. **Hard gate** — only `@*.iitm.ac.in` may register. Maximises cohort fit and trust; **caps the
   funnel and kills SEO conversion**, since a searcher who can't sign up bounces.
2. **No gate** *(recommended)* — anyone may practise; the public surface needs no login at all (P6).
   Identity matters only for leaderboards and saved progress.
3. **Soft signal** — optional "IITM student" self-declaration for cohort analytics and leaderboard
   segmentation, no enforcement.

**Recommend 2 + 3.** The product's value is practice, and a gate at the top of a funnel you are
trying to prove is self-defeating. Revisit only if abuse appears.

---

## 7. SEO

`apps/oppe` needs its own pipeline, not an extension of the club's
([02_AUDIT](./02_AUDIT.md) #14): forked sitemap generator (its own `SITE_URL`), its own route list and
JSON-LD, its own `robots.txt` and IndexNow key, and **none** of the CCSU recruitment trailer that
[prerender.mjs:594](../../scripts/prerender.mjs) injects into every listing page today.

**P6 is an SEO requirement, not just a resilience one.** Questions baked into the static build as JSON
means a crawler — and a first-time visitor — gets full content with the API asleep. On Render free
Node hosting, an API cold start would otherwise sit in front of the crawl.

---

## 8. Capacity and free-tier impact

From [01_FEASIBILITY](./01_FEASIBILITY.md) A3:

| Configuration | Sustained concurrent active users |
|---|---|
| `wandbox` (today's default) | **~160** |
| `balanced` | **~320** |
| `balanced` + browser practice offload | **~320 submit-bound, with the testrun lane freed** |

Per-service delta under Alt C:

| Service | RAM delta | Neon conns | Notes |
|---|---|---|---|
| `apps/api` | **0 bytes** | 0 | No new routes; extra load is the same `/run`+`/submit` path |
| `apps/playground` | 0 | 0 | Untouched |
| `apps/web` | 0 | 0 | Untouched |
| **`apps/oppe` (static)** | **0** | **0** | No process |

**No O(n²) introduced.** The browser judge is O(tests) per submission on the *client*; server-side the
existing single-batch-per-submit property is preserved ([00_SPIKE](./00_SPIKE.md) F8). The only
superlinear code in range is contest plagiarism (O(N²)), already offloaded and not used by OPPE.

**Free-tier verdict: fits with room.** The dominant new cost is the *student's* browser (≈13 MB
Pyodide runtime, cached), which is precisely why MLP's 99 MB sklearn closure was cut
([00_SPIKE](./00_SPIKE.md) F6).

---

## 9. Decisions carried out of this document

| # | Decision |
|---|---|
| A1 | **No new Node service.** `apps/oppe` is static; it calls the existing public API |
| A2 | **No internal execution API.** The judge is already an authenticated multi-consumer HTTP API |
| A3 | Three packages: `problem-schema` (P3), `judge-browser`, `code-editor` |
| A4 | Browser judge = Pyodide-in-Worker + `terminate()` timeout, `__JUDGE:` frame parity, **Python only** |
| A5 | `apps/web` stays Monaco-free; the rule is honoured, not amended |
| A6 | Start on `oppe.codescriet.dev` (cookie works); own domain after demand is proven |
| A7 | **No IITM email gate**; optional self-declared cohort signal instead |
| A8 | Forked SEO pipeline; questions baked as static JSON (P6) |
| A9 | Set `codeExecutionProvider=balanced` before launch (doubles capacity, no deploy) |

## Open for `04_SCHEMA_AND_CONTENT`

`OPPE` context member · `course`/`week` fields · `check`/`prelude` · `BASH`/`C` enum · raise round
`duration` ceiling above 7200 s · the CI reference-solution + divergence gate.
