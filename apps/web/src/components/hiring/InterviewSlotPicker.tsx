// Date-grouped interview slot picker with a sticky confirm bar.
// One primary action (Confirm slot); everything else is ghost/outline.

import { motion } from 'framer-motion';
import { CalendarDays, Check, Clock, MapPin } from 'lucide-react';
import { DSCard, EmptyState, Pill } from '@/components/dash';
import { Button } from '@/components/ui/button';
import type { CandidateSlot } from '@/lib/api';
import {
  formatSlotTimeRangeIST,
  groupSlotsByDate,
  spotsLeftLabel,
  spotsLeftTone,
} from '@/lib/interviewSlotsCandidate';
import { cn } from '@/lib/utils';

interface Props {
  slots: CandidateSlot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  confirming: boolean;
  onConfirm: () => void;
  hasExistingBooking: boolean;
}

export function InterviewSlotPicker({ slots, selectedId, onSelect, confirming, onConfirm, hasExistingBooking }: Props) {
  const groups = groupSlotsByDate(slots);
  const selected = slots.find((s) => s.id === selectedId) ?? null;

  if (groups.length === 0) {
    return (
      <DSCard padded>
        <EmptyState
          icon={<CalendarDays size={18} />}
          title="No open slots right now"
          body="The hiring team has not opened any slots for your track yet. Check back soon — your application stays active."
        />
      </DSCard>
    );
  }

  return (
    <div>
      {hasExistingBooking && (
        <p className="text-[12.5px] text-[var(--ds-text-3)] rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3.5 py-2.5 mb-4">
          You already hold a slot. Cancel your current booking before confirming a new one —
          confirming now will just show your existing booking.
        </p>
      )}

      <div className="flex flex-col gap-7">
        {groups.map((group, gi) => (
          <motion.section
            key={group.key}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: Math.min(gi * 0.05, 0.2) }}
            aria-label={group.label}
          >
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h3 className="text-[14.5px] font-semibold tracking-tight">{group.label}</h3>
              <span className="text-[12px] font-mono tabular-nums text-[var(--ds-text-3)]">
                {group.slots.length} {group.slots.length === 1 ? 'slot' : 'slots'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label={`Slots on ${group.label}`}>
              {group.slots.map((slot) => {
                const full = slot.spotsLeft <= 0 || !slot.isOpen;
                const active = selectedId === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={full}
                    onClick={() => onSelect(slot.id)}
                    className={cn(
                      'text-left rounded-[12px] border p-4 transition-all',
                      'bg-[var(--bg-raised)] border-[var(--border-subtle)]',
                      !full && 'hover:border-[var(--accent-ring)] hover:shadow-[var(--shadow-sm)] cursor-pointer',
                      active && 'border-transparent ring-2 ring-amber-500 dark:ring-amber-400 shadow-[var(--shadow-sm)]',
                      full && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          'grid place-items-center size-5 rounded-full border shrink-0 mt-0.5',
                          active
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 border-transparent text-white'
                            : 'border-[var(--border-default)] text-transparent',
                        )}
                        aria-hidden
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <Pill tone={spotsLeftTone(slot.spotsLeft)} size="xs" dot={slot.spotsLeft === 1}>
                        {slot.isOpen ? spotsLeftLabel(slot.spotsLeft) : 'Closed'}
                      </Pill>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 text-[14px] font-semibold font-mono tabular-nums">
                      <Clock size={13} className="text-[var(--ds-text-3)] shrink-0" />
                      {formatSlotTimeRangeIST(slot.startsAt, slot.endsAt) || '—'}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--ds-text-3)] min-w-0">
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{slot.venue?.trim() ? slot.venue : 'Venue to be announced'}</span>
                    </div>
                    {slot.applyingRole && (
                      <div className="mt-2">
                        <Pill tone="neutral" size="xs">{slot.applyingRole.replace(/_/g, ' ')}</Pill>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.section>
        ))}
      </div>

      {/* Sticky confirm bar — the single primary action on this view. */}
      <div className="sticky bottom-0 -mx-1 mt-6 pb-1 pt-3 bg-gradient-to-t from-[var(--bg-raised)] via-[var(--bg-raised)] to-transparent">
        <DSCard className="flex items-center gap-3 !p-3.5 shadow-[var(--shadow-md)]">
          <div className="flex-1 min-w-0">
            {selected ? (
              <>
                <div className="text-[13px] font-semibold truncate">
                  {formatSlotTimeRangeIST(selected.startsAt, selected.endsAt)}
                </div>
                <div className="text-[12px] text-[var(--ds-text-3)] truncate font-mono tabular-nums">
                  {selected.venue?.trim() ? selected.venue : 'Venue to be announced'}
                </div>
              </>
            ) : (
              <div className="text-[13px] text-[var(--ds-text-3)]">Select a slot above to continue</div>
            )}
          </div>
          <Button
            onClick={onConfirm}
            disabled={!selected || confirming}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25 shrink-0"
          >
            {confirming ? 'Confirming…' : 'Confirm slot'}
          </Button>
        </DSCard>
      </div>
    </div>
  );
}
