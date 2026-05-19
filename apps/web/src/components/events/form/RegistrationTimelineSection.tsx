// Dashboard v2 — Registration timeline card.
// Owns: registration open/close dates + "allow late registration" toggle.
// Team registration was extracted to TeamRegistrationSection so the
// CreateEvent left-rail anchor `evt-section-team` lands on the right card.

import { Clock } from 'lucide-react';
import { Field, DSCard } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface RegistrationTimelineValues {
  registrationStartDate: string;
  registrationEndDate: string;
  allowLateRegistration: boolean;
  // Team fields stay on the parent form shape for back-compat; this card just
  // ignores them. TeamRegistrationSection handles those controls.
  teamRegistration: boolean;
  teamMinSize: number;
  teamMaxSize: number;
}

interface RegistrationTimelineSectionProps {
  idPrefix: string;
  form: RegistrationTimelineValues;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  /** Kept for prop-shape compat with TeamRegistrationSection callers. Unused here. */
  onTeamSizeChange?: (patch: { teamMinSize?: number; teamMaxSize?: number }) => void;
  hasRegistrations?: boolean;
  description?: string;
}

export function RegistrationTimelineSection({
  idPrefix,
  form,
  onChange,
  description,
}: RegistrationTimelineSectionProps) {
  const lateId = `${idPrefix}-allowLateRegistration`;
  return (
    <DSCard padded>
      <div className="flex items-center gap-2 mb-1">
        <Clock size={15} className="text-[var(--ds-text-3)]" />
        <h3 className="text-[15px] font-semibold text-[var(--ds-text-1)]">Registration timeline</h3>
      </div>
      {description && (
        <p className="text-[12.5px] text-[var(--ds-text-3)] mb-4">{description}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <Field label="Registration opens" hint="When users can start registering">
          <Input
            id={`${idPrefix}-registration-start`}
            name="registrationStartDate"
            type="datetime-local"
            value={form.registrationStartDate}
            onChange={onChange}
          />
        </Field>
        <Field label="Registration closes" hint="Last date to register">
          <Input
            id={`${idPrefix}-registration-end`}
            name="registrationEndDate"
            type="datetime-local"
            value={form.registrationEndDate}
            onChange={onChange}
          />
        </Field>
      </div>

      {/* Full-row clickable toggle for "allow late registration" */}
      <label
        htmlFor={lateId}
        className={cn(
          'flex items-start gap-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-soft)]/40 p-4 cursor-pointer transition-colors hover:border-[var(--accent-ring)]',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium text-[var(--ds-text-1)]">Allow late registration</div>
          <p className="text-[12px] text-[var(--ds-text-3)] mt-0.5">
            Let users register even after the event has started.
          </p>
        </div>
        <span className="relative inline-flex shrink-0 select-none mt-0.5">
          <input
            type="checkbox"
            name="allowLateRegistration"
            id={lateId}
            checked={form.allowLateRegistration}
            onChange={onChange}
            className="peer sr-only"
          />
          <span className="block h-6 w-11 rounded-full bg-[var(--border)] peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]/30 transition-colors" />
          <span className="absolute top-[2px] left-[2px] h-5 w-5 rounded-full bg-[var(--bg-raised)] shadow-sm transition-transform peer-checked:translate-x-5" />
        </span>
      </label>
    </DSCard>
  );
}
