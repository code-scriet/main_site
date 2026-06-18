// Pure gate for QOTD authoring. Non-admin authors (CORE_MEMBER) can only PROPOSE:
// the QOTD is forced to an unpublished, unscheduled draft regardless of any
// publishNow/publishTime they send, for an admin to review/schedule/publish. This
// mirrors the problems pattern (non-admins forced isPublished:false). Extracted
// as a pure function so the security invariant is unit-testable without a DB.
// Consumed by qotd.ts `POST /api/qotd`.

export interface QotdPublishIntent {
  /** Whether the author is ADMIN+ (PRESIDENT / super-admin included). */
  isAdmin: boolean;
  /** publishNow the route computed for an admin (explicit flag, or a past publishAt). */
  publishNow: boolean;
  /** Scheduled publish instant the route computed (may be future), or null. */
  publishAt: Date | null;
}

export interface QotdPublishState {
  isPublished: boolean;
  /** null = a bare proposal the auto-publish scheduler must NOT arm. */
  publishAt: Date | null;
}

export function resolveQotdPublishState(intent: QotdPublishIntent): QotdPublishState {
  // Fail closed: a non-admin proposal can NEVER be published or auto-scheduled.
  if (!intent.isAdmin) return { isPublished: false, publishAt: null };
  return { isPublished: intent.publishNow, publishAt: intent.publishAt };
}
