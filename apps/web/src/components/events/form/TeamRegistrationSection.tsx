// Dashboard v2 — dedicated Team Registration card.
// Mirrors screen-admin.jsx §team: Users icon + title, a single full-row toggle
// (label + description + switch all wired through one htmlFor), and size inputs
// shown when enabled. Dimmed + pointer-events-none when the toggle is off so
// users can't fight with disabled inputs.

import { Users } from 'lucide-react';
import { Field, DSCard } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  idPrefix: string;
  form: {
    teamRegistration: boolean;
    teamMinSize: number;
    teamMaxSize: number;
  };
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onTeamSizeChange: (patch: { teamMinSize?: number; teamMaxSize?: number }) => void;
  /** When true, the toggle is locked (registrations exist). */
  hasRegistrations?: boolean;
}

const TEAM_PRESETS = [
  { label: '2', min: 2, max: 2 },
  { label: '2–3', min: 2, max: 3 },
  { label: '2–4', min: 2, max: 4 },
  { label: '3–4', min: 3, max: 4 },
  { label: '3–5', min: 3, max: 5 },
  { label: '4–6', min: 4, max: 6 },
];

export function TeamRegistrationSection({
  idPrefix,
  form,
  onChange,
  onTeamSizeChange,
  hasRegistrations = false,
}: Props) {
  const toggleId = `${idPrefix}-teamRegistration`;
  const enabled = form.teamRegistration;
  const locked = hasRegistrations;

  return (
    <DSCard padded>
      <div className="flex items-center gap-2 mb-4">
        <Users size={15} className="text-[var(--ds-text-3)]" />
        <h3 className="text-[15px] font-semibold text-[var(--ds-text-1)]">Team registration</h3>
      </div>

      {/* Full-row clickable toggle — single <label> wraps text + switch so any click flips state. */}
      <label
        htmlFor={toggleId}
        className={cn(
          'flex items-start gap-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-soft)]/40 p-4 transition-colors',
          locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[var(--accent-ring)]',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium text-[var(--ds-text-1)]">Enable team registration</div>
          <p className="text-[12px] text-[var(--ds-text-3)] mt-0.5">
            Participants form teams with an invite code instead of registering solo.
          </p>
          {locked && (
            <p className="text-[11.5px] font-medium text-[var(--danger)] mt-1.5">
              Cannot change team mode after registrations have been collected.
            </p>
          )}
        </div>
        <span className="relative inline-flex shrink-0 select-none mt-0.5">
          <input
            type="checkbox"
            name="teamRegistration"
            id={toggleId}
            checked={enabled}
            onChange={onChange}
            disabled={locked}
            className="peer sr-only"
          />
          <span className="block h-6 w-11 rounded-full bg-[var(--border)] peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]/30 transition-colors" />
          <span className="absolute top-[2px] left-[2px] h-5 w-5 rounded-full bg-[var(--bg-raised)] shadow-sm transition-transform peer-checked:translate-x-5" />
        </span>
      </label>

      {/* Size controls — visible whenever enabled. Dimmed if locked. */}
      <div
        className={cn(
          'mt-4 transition-opacity',
          enabled ? 'opacity-100' : 'opacity-50 pointer-events-none',
        )}
        aria-hidden={!enabled}
      >
        <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-2">
          Team size
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TEAM_PRESETS.map(preset => {
            const active = form.teamMinSize === preset.min && form.teamMaxSize === preset.max;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onTeamSizeChange({ teamMinSize: preset.min, teamMaxSize: preset.max })}
                disabled={!enabled || locked}
                className={cn(
                  'px-3 h-7 text-[12px] rounded-full border transition-colors font-medium',
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                    : 'bg-[var(--bg-raised)] text-[var(--ds-text-2)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--ds-text-1)]',
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Min team size" hint="1–10 members">
            <Input
              type="number"
              id={`${idPrefix}-teamMinSize`}
              min={1}
              max={10}
              value={form.teamMinSize}
              disabled={!enabled || locked}
              onChange={(e) => {
                const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
                onTeamSizeChange({
                  teamMinSize: val,
                  teamMaxSize: Math.max(form.teamMaxSize, val),
                });
              }}
            />
          </Field>
          <Field label="Max team size" hint={`Min: ${form.teamMinSize}, Cap: 10`}>
            <Input
              type="number"
              id={`${idPrefix}-teamMaxSize`}
              min={form.teamMinSize}
              max={10}
              value={form.teamMaxSize}
              disabled={!enabled || locked}
              onChange={(e) => {
                const val = Math.max(form.teamMinSize, Math.min(10, parseInt(e.target.value, 10) || form.teamMinSize));
                onTeamSizeChange({ teamMaxSize: val });
              }}
            />
          </Field>
        </div>

        <p className="text-[11.5px] text-[var(--ds-text-3)] mt-3">
          Teams need {form.teamMinSize === form.teamMaxSize
            ? `exactly ${form.teamMinSize}`
            : `${form.teamMinSize}–${form.teamMaxSize}`} member{form.teamMinSize === 1 && form.teamMaxSize === 1 ? '' : 's'} to be complete.
        </p>
      </div>
    </DSCard>
  );
}
