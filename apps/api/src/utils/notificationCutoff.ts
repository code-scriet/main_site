// Notification read-cutoff rule, kept OUT of routes/notifications.ts on purpose.
//
// The bell's read state is a single timestamp (`User.notificationsReadAt`); every item is
// 'read' when `timestamp < cutoff`. That makes the clamp below a real correctness rule, so it
// is unit-tested — and importing the router to test it would evaluate the whole module,
// constructing the Prisma client (which reads DATABASE_URL at construction time) inside a
// suite advertised as DB-free. Same reasoning as utils/certificateIssuance.ts being extracted
// out of routes/certificates.ts: the route file is the HTTP adapter, the logic lives here.

/**
 * Resolve the notification read-cutoff, CLAMPED to now.
 *
 * `z.string().datetime()` validates SHAPE, not range. Without this clamp a client with a
 * skewed system clock (or any caller passing its own timestamp) could park the cutoff in the
 * future — and because read state is `timestamp < cutoff`, that permanently marks all FUTURE
 * notifications read as well, across invitations, certificates, quiz starts and admin
 * broadcasts, with no UI to undo it.
 *
 * An unparseable value also falls back to now rather than returning an Invalid Date, which
 * would throw on the Prisma write.
 */
export function resolveReadCutoff(at: string | undefined, now: Date = new Date()): Date {
  if (!at) return now;
  const requested = new Date(at);
  if (Number.isNaN(requested.getTime())) return now;
  return requested > now ? now : requested;
}
