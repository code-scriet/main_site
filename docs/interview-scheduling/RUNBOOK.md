# Interview Scheduling Runbook

Short operator guide for one hiring drive (cycle-scoped interview slots,
magic-link slot picking, booking, reminders, close-out).

> No-DB-touch note: everything below goes through the API / admin UI. The only
> time anyone touches the database directly is the FIRST rollout of the
> interview-scheduling migration, applied with `npm run db:migrate:deploy` (CI
> / Render runs `prisma migrate deploy` on deploy). Never `db push`, `psql`
> edits, or seed writes against interview tables.

## 1. Create slots

Admin hiring board, interview-slots tab, pick the cycle first:

1. Set date (IST), start time, slot length, series length (count or end time).
2. Wait for the live preview — conflict rows are skipped, never created.
3. Confirm. Bulk creates are capacity-1, any-role slots; per-slot capacity /
   role / venue needs single creates (More options) or the capacity stepper
   afterwards.

Guardrails: past slots rejected, overlapping OPEN slots 409, times immutable
after creation (close + recreate instead), capacity may only be raised while
bookings exist, slots with bookings cannot be deleted.

## 2. Schedule (invite candidates)

Select PENDING applications → Schedule interviews (default 7-day pick window).
Per item: status → INTERVIEW_SCHEDULED, fresh magic-link token minted, pick
email + in-app bell sent. Requires at least one open future slot in the
cycle, otherwise `no_open_slots` — create slots first.

## 3. Monitor

- **Awaiting pick**: INTERVIEW_SCHEDULED applications with no booking yet,
  oldest first. Nudge laggards before their token expires (7 days).
- **Reminders**: 48h / 24h pick-window reminders go out automatically with
  dedup logs; expired tokens with no booking stay INTERVIEW_SCHEDULED.
- **Counters**: slot `bookedCount` vs real booking rows — see Reconcile below.

## 4. Close

1. Close slots (toggle open off) once interviewing starts.
2. Move SLOT_BOOKED → INTERVIEWED after each interview, then → SELECTED /
   REJECTED. REJECT revokes the pick token and releases the seat.
3. SELECTED / REJECTED emails go out automatically.

## Reconcile procedure

`POST /api/hiring/slots/reconcile?cycle=<cycle>` (admin UI: "Reconcile
counters" button next to Refresh). Recounts InterviewSlotBooking rows per
slot and repairs drifted `bookedCount`s. Returns
`{ checked, fixed: [{ slotId, was, now }] }`.

- Drift-free runs are fully read-only: no slot writes, no audit row.
- Drifted runs write an `RECONCILE_SLOTS` audit row with the fix list.
- Run it after any manual seat release, REJECT-after-booking, or whenever the
  admin slot list looks off versus the bookings drawer.

## Resend procedure

- **Re-invite one candidate**: application row → resend (same-status PATCH
  with `?resend=true`). Mints a fresh token + re-sends the pick email; audited
  as `HIRING_STATUS_UPDATED` with `resent: true`.
- **Candidate lost link**: same resend path; the old token is replaced.
- **Booking cancelled by admin**: candidate is auto re-invited with a fresh
  token (audited `CANCEL_BOOKING`); candidate self-cancel inside 24h of the
  slot is rejected (`cancel_cutoff`).

## Rate limits (candidate endpoints)

- Book / cancel: 10 per 15 min per IP+application.
- Available-slots / my-booking polling: 60 per 15 min per IP+application
  (picker polls every 30s = 30 req/15min per tab, 2x headroom).
- 429s return the standard `{ success: false, error: { code: 'RATE_LIMITED',
  message } }` shape — the picker surfaces a retry.

## Audit trail

Every admin interview action writes an audit row: `CREATE_SLOT`,
`CREATE_BULK_SLOTS`, `UPDATE_SLOT`, `DELETE_SLOT`, per-item
`INTERVIEW_SCHEDULED`, `CANCEL_BOOKING`, `HIRING_STATUS_UPDATED` (incl.
resends), `RECONCILE_SLOTS` (only when fixes were made), `COHORT_NOTIFY`
(cohort announcement sends with notified/total/failed counts).
