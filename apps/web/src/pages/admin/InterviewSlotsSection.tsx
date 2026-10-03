// Dashboard v2 — Admin · Interview slots (Phase 4).
// Slot creation card (date + start + preset/custom length + count-vs-end toggle
// + collapsed More options, debounced live preview, bulk confirm) above the
// date-grouped slot list with open toggles, capacity steppers, booking drawers
// and guarded deletes. All admin slot traffic goes through
// `@/lib/interviewSlotsAdmin` (typed fetch wrappers) — never `@/lib/api`.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { DSCard, EmptyState, Field, Pill, ProgressBar } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SlotAdminError,
  bulkCreateButtonLabel,
  bulkCreateSlots,
  cancelSlotBooking,
  computeDayGaps,
  createInterviewSlot,
  deleteInterviewSlot,
  describePreviewSlot,
  formatBulkResultMessage,
  formatIstClock,
  formatReconcileMessage,
  formatSlotRangeIst,
  groupSlotsByIstDate,
  istDateKeyOf,
  previewSlotSeries,
  reconcileSlotCounters,
  updateInterviewSlot,
  type AdminInterviewSlot,
  type HiringCycleInfo,
  type PreviewResult,
  type SeriesInput,
  type SlotApplyingRole,
} from '@/lib/interviewSlotsAdmin';

const ROLE_OPTIONS: Array<{ value: '' | SlotApplyingRole; label: string }> = [
  { value: '', label: 'Any role' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'DSA_CHAMPS', label: 'DSA Champs' },
  { value: 'DESIGNING', label: 'Designing' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'MANAGEMENT', label: 'Management' },
];

const ROLE_LABEL: Record<string, string> = {
  TECHNICAL: 'Technical',
  DSA_CHAMPS: 'DSA Champs',
  DESIGNING: 'Designing',
  SOCIAL_MEDIA: 'Social Media',
  MANAGEMENT: 'Management',
};

const DURATION_PRESETS = [15, 20, 30, 45, 60];

function todayIstKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function formatGroupHeading(dateKey: string): string {
  const noon = new Date(`${dateKey}T12:00:00+05:30`);
  if (Number.isNaN(noon.getTime())) return dateKey;
  return noon.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatBookedAtIst(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export interface InterviewSlotsSectionProps {
  token: string;
  slots: AdminInterviewSlot[];
  loading: boolean;
  error: string | null;
  cycles: HiringCycleInfo[];
  currentCycle: string | null;
  activeCycle: string;
  onCycleChange: (cycle: string) => void;
  onRefresh: () => void;
}

export function InterviewSlotsSection({
  token,
  slots,
  loading,
  error,
  cycles,
  currentCycle,
  activeCycle,
  onCycleChange,
  onRefresh,
}: InterviewSlotsSectionProps) {
  const effectiveCycle = activeCycle || currentCycle || cycles[0]?.cycle || '';

  // ── Creation-card state ──────────────────────────────────────────────
  const [date, setDate] = useState<string>(() => todayIstKey());
  const [startTime, setStartTime] = useState('10:00');
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState('25');
  const [durationMode, setDurationMode] = useState<'count' | 'end'>('count');
  const [count, setCount] = useState(8);
  const [endTime, setEndTime] = useState('13:00');
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [capacity, setCapacity] = useState(1);
  const [role, setRole] = useState<'' | SlotApplyingRole>('');
  const [venue, setVenue] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Slot-row state ───────────────────────────────────────────────────
  const [drawerSlotId, setDrawerSlotId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminInterviewSlot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ bookingId: string; name: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [mutatingSlotId, setMutatingSlotId] = useState<string | null>(null);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [venueDraft, setVenueDraft] = useState('');

  const groups = useMemo(() => groupSlotsByIstDate(slots), [slots]);
  const drawerSlot = drawerSlotId ? (slots.find((s) => s.id === drawerSlotId) ?? null) : null;

  const dayExisting = useMemo(
    () => slots.filter((s) => istDateKeyOf(s.startsAt) === date),
    [slots, date],
  );
  const dayGaps = useMemo(
    () => (dayExisting.length > 0 ? computeDayGaps(dayExisting, date) : []),
    [dayExisting, date],
  );

  // Live preview, debounced. Skips invalid input without hitting the server.
  useEffect(() => {
    if (!token || !effectiveCycle) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    let localError: string | null = null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) localError = 'Pick a valid date.';
    else if (!/^\d{2}:\d{2}$/.test(startTime)) localError = 'Start time must be HH:mm.';
    else if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 480) {
      localError = 'Slot length must be between 15 and 480 minutes.';
    } else if (durationMode === 'count' && (!Number.isInteger(count) || count < 1 || count > 200)) {
      localError = 'Number of slots must be between 1 and 200.';
    } else if (durationMode === 'end' && !/^\d{2}:\d{2}$/.test(endTime)) {
      localError = 'End time must be HH:mm.';
    } else if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480) {
      localError = 'Break must be between 0 and 480 minutes.';
    }
    if (localError) {
      setPreview(null);
      setPreviewError(localError);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = window.setTimeout(() => {
      const series: SeriesInput = {
        cycle: effectiveCycle,
        date,
        startTime,
        slotMinutes,
        breakMinutes,
        ...(durationMode === 'count' ? { count } : { endTime }),
      };
      void previewSlotSeries(token, series)
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch((e) => {
          setPreview(null);
          setPreviewError(e instanceof Error ? e.message : 'Preview failed');
        })
        .finally(() => {
          setPreviewLoading(false);
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [token, effectiveCycle, date, startTime, slotMinutes, durationMode, count, endTime, breakMinutes]);

  // Bulk endpoint always creates capacity-1 role-less slots, so any non-default
  // More-options value falls back to sequential single creates with identical
  // conflict-skip semantics (per-row 409 slot_overlap counts as skipped).
  // Capacity/role still require per-slot creates (the bulk endpoint fixes
  // capacity 1 / any role). Venue is handled by the bulk endpoint itself, so a
  // venue-only change stays on the fast single-request path.
  const customized = capacity !== 1 || role !== '';
  const okCount = preview?.okCount ?? 0;

  const confirmCreate = async () => {
    if (!preview || okCount === 0 || creating || !effectiveCycle) return;
    setCreating(true);
    try {
      if (customized) {
        let created = 0;
        let skipped = 0;
        for (const row of preview.slots) {
          if (row.status !== 'ok') {
            skipped += 1;
            continue;
          }
          try {
            await createInterviewSlot(token, {
              cycle: effectiveCycle,
              date,
              startTime: formatIstClock(row.startsAt),
              endTime: formatIstClock(row.endsAt),
              capacity,
              ...(role ? { applyingRole: role } : {}),
              ...(venue.trim() ? { venue: venue.trim() } : {}),
            });
            created += 1;
          } catch (e) {
            if (e instanceof SlotAdminError && e.status === 409) skipped += 1;
            else throw e;
          }
        }
        toast.success(formatBulkResultMessage(created, skipped));
      } else {
        const series: SeriesInput = {
          cycle: effectiveCycle,
          date,
          startTime,
          slotMinutes,
          breakMinutes,
          venue: venue.trim() || null,
          ...(durationMode === 'count' ? { count } : { endTime }),
        };
        const result = await bulkCreateSlots(token, series);
        toast.success(formatBulkResultMessage(result.created, result.skipped.length));
      }
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Slot creation failed');
    } finally {
      setCreating(false);
    }
  };

  const toggleOpen = async (slot: AdminInterviewSlot) => {
    setMutatingSlotId(slot.id);
    try {
      await updateInterviewSlot(token, slot.id, { isOpen: !slot.isOpen });
      toast.success(slot.isOpen ? 'Slot closed' : 'Slot opened');
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setMutatingSlotId(null);
    }
  };

  const stepCapacity = async (slot: AdminInterviewSlot, delta: 1 | -1) => {
    const next = slot.capacity + delta;
    if (next < 1) return;
    setMutatingSlotId(slot.id);
    try {
      await updateInterviewSlot(token, slot.id, { capacity: next });
      toast.success(`Capacity set to ${next}`);
      onRefresh();
    } catch (e) {
      // 409s surface here: capacity_below_booked / capacity_locked.
      toast.error(e instanceof Error ? e.message : 'Capacity update failed');
    } finally {
      setMutatingSlotId(null);
    }
  };

  const saveVenue = async (slot: AdminInterviewSlot) => {
    setMutatingSlotId(slot.id);
    try {
      await updateInterviewSlot(token, slot.id, { venue: venueDraft.trim() || null });
      toast.success(venueDraft.trim() ? 'Venue updated' : 'Venue cleared');
      setEditingVenueId(null);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Venue update failed');
    } finally {
      setMutatingSlotId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInterviewSlot(token, deleteTarget.id);
      toast.success('Slot deleted');
      setDeleteTarget(null);
      if (drawerSlotId === deleteTarget.id) setDrawerSlotId(null);
      onRefresh();
    } catch (e) {
      // Known 409: slot_booked ("Cancel bookings first").
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const confirmCancelBooking = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelSlotBooking(token, cancelTarget.bookingId);
      toast.success(`Booking cancelled — ${cancelTarget.name} was re-invited to pick again`);
      setCancelTarget(null);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const handleReconcile = async () => {
    if (!effectiveCycle || reconciling) return;
    setReconciling(true);
    try {
      const result = await reconcileSlotCounters(token, effectiveCycle);
      toast.success(formatReconcileMessage(result.checked, result.fixed.length));
      if (result.fixed.length > 0) onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reconcile failed');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {cycles.length > 0 && (
          <select
            value={effectiveCycle}
            onChange={(e) => onCycleChange(e.target.value)}
            className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
            aria-label="Interview slot cycle"
            title="Interview slot cycle"
          >
            {cycles.map(({ cycle: c, count: n }) => (
              <option key={c} value={c}>
                {c} ({n})
              </option>
            ))}
          </select>
        )}
        <Button size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw size={13} className="mr-1.5" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReconcile}
          disabled={reconciling || !effectiveCycle}
          title="Recount bookings per slot and repair drifted counters"
        >
          <RefreshCw size={13} className="mr-1.5" />
          {reconciling ? 'Reconciling…' : 'Reconcile counters'}
        </Button>
        <span className="text-[12px] text-[var(--ds-text-3)] tabular-nums">
          {loading ? 'Loading slots…' : `${slots.length} slot${slots.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* ── Slot creation card ─────────────────────────────────────────── */}
      <DSCard padded className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <CalendarPlus size={14} className="text-[var(--accent)]" />
          <h2 className="text-[14px] font-semibold">Create interview slots</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Date (IST)" required hint="past disabled">
            <Input
              type="date"
              value={date}
              min={todayIstKey()}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-[13px]"
            />
          </Field>
          <Field label="Start time (IST)" required>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-[13px]"
            />
          </Field>
          <Field label="Time per slot" required hint="minutes">
            <div className="flex items-center gap-1.5 flex-wrap">
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSlotMinutes(m)}
                  className={cn(
                    'h-7 px-2.5 rounded-[6px] text-[12px] font-medium border transition-colors',
                    slotMinutes === m
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-transparent'
                      : 'bg-transparent text-[var(--ds-text-3)] border-[var(--border-default)] hover:text-[var(--ds-text-1)]',
                  )}
                >
                  {m}
                </button>
              ))}
              <Input
                type="number"
                min={15}
                max={480}
                value={customMinutes}
                onChange={(e) => {
                  setCustomMinutes(e.target.value);
                  const parsed = Number.parseInt(e.target.value, 10);
                  if (Number.isInteger(parsed)) setSlotMinutes(parsed);
                }}
                className="h-7 w-[72px] text-[12px]"
                aria-label="Custom slot length in minutes"
                title="Custom slot length in minutes"
              />
            </div>
          </Field>
          <Field label="Series length" required>
            <div className="flex items-center gap-1.5">
              <div className="inline-flex items-center p-[3px] gap-[2px] bg-[var(--surface-soft)] rounded-[8px] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setDurationMode('count')}
                  className={cn(
                    'px-2.5 h-6 text-[12px] font-medium rounded-[6px] transition-all whitespace-nowrap',
                    durationMode === 'count'
                      ? 'bg-[var(--bg-raised)] text-[var(--ds-text-1)] shadow-[var(--shadow-xs)]'
                      : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
                  )}
                >
                  Number of slots
                </button>
                <button
                  type="button"
                  onClick={() => setDurationMode('end')}
                  className={cn(
                    'px-2.5 h-6 text-[12px] font-medium rounded-[6px] transition-all whitespace-nowrap',
                    durationMode === 'end'
                      ? 'bg-[var(--bg-raised)] text-[var(--ds-text-1)] shadow-[var(--shadow-xs)]'
                      : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
                  )}
                >
                  End time
                </button>
              </div>
              {durationMode === 'count' ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCount((c) => Math.max(1, c - 1))}
                    className="size-7 rounded-[6px] border border-[var(--border-default)] flex items-center justify-center text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)]"
                    aria-label="Fewer slots"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-8 text-center text-[13px] font-mono tabular-nums">{count}</span>
                  <button
                    type="button"
                    onClick={() => setCount((c) => Math.min(200, c + 1))}
                    className="size-7 rounded-[6px] border border-[var(--border-default)] flex items-center justify-center text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)]"
                    aria-label="More slots"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              ) : (
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-7 text-[12px] w-[110px]"
                />
              )}
            </div>
          </Field>
        </div>

        {/* Single venue for the whole series — every slot created here gets it. */}
        <Field label="Venue (applies to every slot in this series)" hint="optional — you can still edit a slot's venue later">
          <div className="relative">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ds-text-3)]" />
            <Input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Seminar Hall 2"
              className="h-8 text-[13px] pl-8"
            />
          </div>
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--ds-text-2)] hover:text-[var(--ds-text-1)]"
            aria-expanded={showMore}
          >
            <ChevronDown size={13} className={cn('transition-transform', showMore && 'rotate-180')} />
            More options
          </button>
          {showMore && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <Field label="Break between slots" hint="minutes, default 0">
                <Input
                  type="number"
                  min={0}
                  max={480}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number.parseInt(e.target.value, 10) || 0)}
                  className="h-8 text-[13px]"
                />
              </Field>
              <Field label="Capacity per slot" hint="default 1">
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                  className="h-8 text-[13px]"
                />
              </Field>
              <Field label="Role tag" hint="default any">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as '' | SlotApplyingRole)}
                  className="h-8 px-2.5 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3">
            <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-2">
              Live preview
            </div>
            {previewLoading && !preview ? (
              <div className="flex items-center gap-2 text-[12.5px] text-[var(--ds-text-3)] py-2">
                <Loader2 size={13} className="animate-spin" />
                Checking for overlaps…
              </div>
            ) : previewError ? (
              <div className="text-[12.5px] text-[var(--danger)] py-1">{previewError}</div>
            ) : preview && preview.slots.length > 0 ? (
              <ul className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1">
                {preview.slots.map((row) => (
                  <li
                    key={row.startsAt}
                    className={cn(
                      'flex items-center gap-2 text-[12.5px] px-2 py-1 rounded-[6px] border',
                      row.status === 'ok'
                        ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]'
                        : 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]',
                    )}
                  >
                    <Clock size={12} className="shrink-0" />
                    <span className="font-mono tabular-nums">{describePreviewSlot(row, breakMinutes)}</span>
                    {row.status === 'conflict' && row.conflictsWith && (
                      <span className="ml-auto text-[11px]">
                        skips — overlaps {formatSlotRangeIst(row.conflictsWith.startsAt, row.conflictsWith.endsAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12.5px] text-[var(--ds-text-3)] italic py-1">
                Nothing to preview yet — adjust the inputs above.
              </div>
            )}
            {preview && (
              <div className="mt-2 text-[12px] text-[var(--ds-text-3)] tabular-nums">
                {preview.okCount} new · {preview.skipCount} conflicting
                {previewLoading && <Loader2 size={11} className="inline ml-2 animate-spin" />}
              </div>
            )}
          </div>

          <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3">
            <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-2">
              Day timeline · {date}
            </div>
            {dayExisting.length === 0 ? (
              <div className="text-[12.5px] text-[var(--ds-text-3)] italic py-1">
                No slots on this day yet — the whole day is free.
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1">
                  {dayExisting.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 text-[12.5px] px-2 py-1 rounded-[6px] bg-[var(--bg-raised)] border border-[var(--border-subtle)]"
                    >
                      <span className="font-mono tabular-nums">{formatSlotRangeIst(s.startsAt, s.endsAt)}</span>
                      <span className="ml-auto text-[11.5px] text-[var(--ds-text-3)] tabular-nums">
                        booked {s.bookedCount}/{s.capacity}
                      </span>
                    </li>
                  ))}
                </ul>
                {dayGaps.length > 0 && (
                  <div className="mt-2 text-[12px] text-[var(--ds-text-3)]">
                    Gaps:{' '}
                    <span className="font-mono tabular-nums">
                      {dayGaps
                        .slice(0, 4)
                        .map((g) => `${formatIstClock(g.startsAt)}–${formatIstClock(g.endsAt)}`)
                        .join(', ')}
                      {dayGaps.length > 4 ? ` +${dayGaps.length - 4} more` : ''}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={confirmCreate} disabled={creating || previewLoading || okCount === 0}>
            {creating ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <CalendarPlus size={13} className="mr-1.5" />}
            {bulkCreateButtonLabel(okCount)}
          </Button>
          {customized && (
            <span className="text-[11.5px] text-[var(--ds-text-3)]">
              Capacity / role set — creates slots one by one so those stick.
            </span>
          )}
        </div>
      </DSCard>

      {/* ── Date-grouped slots ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<CalendarPlus size={18} />}
            title="No interview slots"
            body={effectiveCycle ? `No slots in cycle ${effectiveCycle} yet — create the first series above.` : 'Create the first series above.'}
          />
        </DSCard>
      ) : (
        groups.map((group) => {
          const booked = group.slots.reduce((n, s) => n + s.bookedCount, 0);
          const seats = group.slots.reduce((n, s) => n + s.capacity, 0);
          return (
            <DSCard key={group.dateKey} padded className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[13.5px] font-semibold">{formatGroupHeading(group.dateKey)}</div>
                <span className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
                  {group.slots.length} slots · booked {booked}/{seats}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {group.slots.map((s) => {
                  const busy = mutatingSlotId === s.id;
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center gap-2 sm:gap-3 px-2.5 py-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] flex-wrap',
                        !s.isOpen && 'opacity-60',
                      )}
                    >
                      <span className="font-mono tabular-nums text-[12.5px] font-medium">
                        {formatSlotRangeIst(s.startsAt, s.endsAt)}
                      </span>
                      {s.applyingRole ? (
                        <Pill tone="accent" size="xs">
                          {ROLE_LABEL[s.applyingRole] ?? s.applyingRole}
                        </Pill>
                      ) : (
                        <Pill tone="neutral" size="xs">
                          Any role
                        </Pill>
                      )}
                      {editingVenueId === s.id ? (
                        <span className="inline-flex items-center gap-1">
                          <Input
                            value={venueDraft}
                            onChange={(e) => setVenueDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveVenue(s);
                              } else if (e.key === 'Escape') {
                                setEditingVenueId(null);
                              }
                            }}
                            placeholder="Seminar Hall 2"
                            autoFocus
                            aria-label="Venue"
                            className="h-7 w-[140px] text-[12px]"
                          />
                          <button
                            type="button"
                            onClick={() => void saveVenue(s)}
                            disabled={busy}
                            className="size-6 rounded-[5px] border border-[var(--border-default)] flex items-center justify-center text-[var(--success)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                            aria-label="Save venue"
                            title="Save venue"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingVenueId(null)}
                            disabled={busy}
                            className="size-6 rounded-[5px] border border-[var(--border-default)] flex items-center justify-center text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                            aria-label="Cancel venue edit"
                            title="Cancel"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {s.venue ? (
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ds-text-3)] max-w-[160px]">
                              <MapPin size={11} className="shrink-0" />
                              <span className="truncate">{s.venue}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ds-text-3)] italic">
                              <MapPin size={11} />
                              No venue
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVenueId(s.id);
                              setVenueDraft(s.venue ?? '');
                            }}
                            disabled={busy}
                            className="size-6 rounded-[5px] border border-[var(--border-default)] flex items-center justify-center text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                            aria-label="Edit venue"
                            title="Edit venue"
                          >
                            <Pencil size={11} />
                          </button>
                        </span>
                      )}
                      <div className="flex items-center gap-1 min-w-[120px] flex-1">
                        <ProgressBar
                          value={s.bookedCount}
                          max={Math.max(1, s.capacity)}
                          tone={s.bookedCount >= s.capacity ? 'success' : 'accent'}
                          className="flex-1"
                        />
                        <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums whitespace-nowrap">
                          {s.bookedCount}/{s.capacity}
                        </span>
                        <button
                          type="button"
                          onClick={() => void stepCapacity(s, -1)}
                          disabled={busy || s.capacity <= 1}
                          className="size-6 rounded-[5px] border border-[var(--border-default)] flex items-center justify-center text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                          aria-label="Lower capacity"
                          title="Lower capacity"
                        >
                          <Minus size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void stepCapacity(s, 1)}
                          disabled={busy}
                          className="size-6 rounded-[5px] border border-[var(--border-default)] flex items-center justify-center text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
                          aria-label="Raise capacity"
                          title="Raise capacity"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-text-2)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={s.isOpen}
                          disabled={busy}
                          onChange={() => void toggleOpen(s)}
                        />
                        Open
                      </label>
                      <button
                        type="button"
                        onClick={() => setDrawerSlotId(s.id)}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-[6px] border border-[var(--border-default)] text-[12px] text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)]"
                      >
                        <Users size={12} />
                        {s.bookings.length}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(s)}
                        disabled={s.bookedCount > 0}
                        title={s.bookedCount > 0 ? 'Cancel bookings first — slots with bookings cannot be deleted' : 'Delete slot'}
                        className="size-7 rounded-[6px] border border-[var(--border-default)] flex items-center justify-center text-[var(--ds-text-3)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] disabled:opacity-40 disabled:pointer-events-none"
                        aria-label="Delete slot"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </DSCard>
          );
        })
      )}

      {/* ── Booking-list drawer ────────────────────────────────────────── */}
      <Dialog open={Boolean(drawerSlot)} onOpenChange={(o) => !o && setDrawerSlotId(null)}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {drawerSlot ? formatSlotRangeIst(drawerSlot.startsAt, drawerSlot.endsAt) : 'Bookings'}
            </DialogTitle>
          </DialogHeader>
          {drawerSlot && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[12px] text-[var(--ds-text-3)]">
                <span className="font-mono tabular-nums">
                  {istDateKeyOf(drawerSlot.startsAt)} · cycle {drawerSlot.cycle}
                </span>
                {drawerSlot.venue && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} />
                    {drawerSlot.venue}
                  </span>
                )}
              </div>
              {(drawerSlot.bookings ?? []).length === 0 ? (
                <div className="text-[12.5px] text-[var(--ds-text-3)] italic py-2">No bookings on this slot yet.</div>
              ) : (
                drawerSlot.bookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{b.name}</div>
                      <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">{b.email}</div>
                      <div className="text-[11px] text-[var(--ds-text-3)] mt-0.5">
                        {ROLE_LABEL[b.applyingRole] ?? b.applyingRole} · booked {formatBookedAtIst(b.bookedAt)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCancelTarget({ bookingId: b.id, name: b.name })}
                      className="text-[var(--danger)] border-[var(--danger-border)] hover:bg-[var(--danger-bg)] shrink-0"
                    >
                      Cancel
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDrawerSlotId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slot?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? formatSlotRangeIst(deleteTarget.startsAt, deleteTarget.endsAt) : ''} will be
              removed permanently. Slots with bookings cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {deleting ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.name} will lose the seat and get a fresh invite to pick another slot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelBooking}
              disabled={cancelling}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {cancelling ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
