// Inline "issue this with a past date" control — rendered ONLY for PRESIDENT /
// super admin, collapsed by default.
//
// Shared by the event certificate wizard and the standalone AdminCertificates form so
// the two can't drift on copy, validation or payload shape. The server re-checks
// authority and the date bounds on every request; hiding this for other admins is
// presentation, not security.
//
// Collapsed-by-default matters: backdating is the exception, and an always-visible
// date field invites someone to fiddle with it on an ordinary issuance.

import { useState } from 'react';
import { CalendarClock, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/dash';
import { cn } from '@/lib/utils';

export interface CertificateBackdateValue {
  /** datetime-local wall-clock text, or '' when not backdating. */
  issuedAtLocal: string;
  reason: string;
}

export const EMPTY_BACKDATE: CertificateBackdateValue = { issuedAtLocal: '', reason: '' };

/**
 * Convert the control's value into the API payload fragment. Returns an empty object
 * when nothing was entered, so callers can spread it unconditionally and a normal
 * issuance sends no backdate keys at all.
 */
export function toBackdatePayload(value: CertificateBackdateValue): { issuedAt?: string; backdateReason?: string } {
  const trimmed = value.issuedAtLocal.trim();
  if (!trimmed) return {};
  // datetime-local is zone-less text; `new Date` reads it in the admin's own zone,
  // which is the wall-clock time they meant. Send a real instant so the server's
  // bounds check is unambiguous.
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return {};
  return {
    issuedAt: parsed.toISOString(),
    ...(value.reason.trim() ? { backdateReason: value.reason.trim() } : {}),
  };
}

interface Props {
  value: CertificateBackdateValue;
  onChange: (next: CertificateBackdateValue) => void;
  /** The linked event's start date (ISO) — the earliest date the server will accept. */
  eventStartDate?: string | null;
  className?: string;
}

export function CertificateBackdateControl({ value, onChange, eventStartDate, className }: Props) {
  const { user } = useAuth();
  const canBackdate = Boolean(user?.isSuperAdmin) || user?.role === 'PRESIDENT';
  const [open, setOpen] = useState(Boolean(value.issuedAtLocal));

  if (!canBackdate) return null;

  const active = Boolean(value.issuedAtLocal.trim());
  const earliest = eventStartDate
    ? new Date(eventStartDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className={cn('rounded-xl border border-[var(--border)] overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--bg-sunken)] transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-[var(--ds-text-3)]" /> : <ChevronRight size={14} className="text-[var(--ds-text-3)]" />}
        <CalendarClock size={14} className={active ? 'text-[var(--accent)]' : 'text-[var(--ds-text-3)]'} />
        <span className="text-[13px] font-medium">Issue with a past date</span>
        {active && (
          <span className="ml-auto text-[11.5px] font-mono tabular-nums text-[var(--accent)]">
            {new Date(value.issuedAtLocal).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[var(--border)]">
          <p className="text-[12px] text-[var(--ds-text-3)] leading-relaxed">
            Leave blank to issue with today's date. When set, this becomes the certificate's date
            everywhere it appears — the public verification page, the recipient's dashboard, the
            issue date in their email, and the LinkedIn "Licences &amp; Certifications" entry.
            {earliest && <> It cannot be earlier than the event's start ({earliest}).</>}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Issue date">
              <Input
                type="datetime-local"
                value={value.issuedAtLocal}
                onChange={(e) => onChange({ ...value, issuedAtLocal: e.target.value })}
                className="h-9 text-[13px]"
              />
            </Field>
            <Field label="Reason (kept in the audit log)">
              <Input
                value={value.reason}
                onChange={(e) => onChange({ ...value, reason: e.target.value })}
                placeholder="e.g. Certificate for a 2024 guest talk"
                className="h-9 text-[13px]"
              />
            </Field>
          </div>

          {active && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_BACKDATE)}
              className="text-[12px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] underline underline-offset-2"
            >
              Clear — issue with today's date instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}
