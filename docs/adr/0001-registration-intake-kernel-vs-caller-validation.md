# ADR 0001 — Registration intake: shared kernel, caller-owned validation

- **Status:** Accepted
- **Date:** 2026-06-19
- **Area:** Event registration (`apps/api/src/utils/registrationIntake.ts`, `routes/registrations.ts`, `routes/teams.ts`, `routes/invitations.ts`)

## Context

Three flows create an `EventRegistration`: solo registration, team create + join, and
guest-invitation accept. Each runs inside its own serializable transaction (HC: serializable
+ 3 retries on P2034) and each must honour the same invariants:

- **HC#11** — capacity counts filter `registrationType = PARTICIPANT`; GUEST invitations never
  consume seats.
- **L2** — `Settings.maxEventsPerUser` is enforced server-side, inside the transaction.
- The registration row, its attendance JWT, and its per-day `DayAttendance` rows must commit
  atomically (a row without a token has no QR; a row without day-rows breaks per-day marking).

A recurring architecture-review suggestion is to pull *all* of this — including the capacity /
event-open checks — behind a single `intakeParticipant(...)` interface so the invariants live in
one place.

The codebase has already gone partway: `createEventRegistrationInTx` owns the atomic
row + token + day-rows **kernel** (extracted precisely because the team flows had drifted —
they skipped day-row seeding and minted the token outside the transaction), the
`participantsOnly` where-clause is a shared constant so the HC#11 count filter is *not*
duplicated, and `assertWithinActiveEventLimitInTx` owns the L2 check. What remains per-caller is
the transaction skeleton and the **full/closed decision**, which genuinely diverges:

- solo uses `getRegistrationStatus() → 'closed' | 'full' | 'open'` and throws a
  `RegistrationHttpError` class;
- team uses `validateEventForRegistration() → { valid, status, message }` and throws plain
  `{ status, message }` objects;
- each fetches a *different event shape* (different `include`s) for its own response needs.

## Decision

Keep the split as it is:

- `createEventRegistrationInTx` owns the atomic **kernel** (row + attendance token + DayAttendance).
- `assertWithinActiveEventLimitInTx` owns the **L2 limit** and is called from every PARTICIPANT
  intake (and deliberately *not* from guest-accept).
- The **PARTICIPANT count filter** stays a single shared `participantsOnly` where-clause.
- **Capacity check, event-open validation, dedup, and HTTP error mapping stay caller-owned.**

Do **not** centralise capacity / event-open validation behind the intake module.

## Rationale

The correctness-critical, drift-prone parts (atomic kernel, the PARTICIPANT filter, the limit
check) are *already* single seams. The residual duplication is the transaction skeleton, whose
divergent halves — different event shapes and two different error-throwing conventions — are not
incidental copy-paste but a real difference in what each caller needs. Forcing them behind one
interface would either leak both error conventions into the shared module or flatten them into a
lossy generic error, trading a genuine seam for a worse one. The deletion test agrees: deleting
the *kernel* re-scatters real invariants; deleting a hypothetical unified-capacity wrapper would
just re-expose two validators that were always going to differ.

## Consequences

- A future change to the capacity *rule* (not the count filter) must touch both
  `getRegistrationStatus` and `validateEventForRegistration`. This is the accepted cost. The only
  improvement worth considering is unifying just the "is it full" predicate while leaving each
  caller's error mapping intact — explicitly out of scope here, not a regression to fix.
- Architecture reviews should not re-propose moving capacity / event-open validation into
  `registrationIntake`. This ADR records why.
