// Dashboard v2 — Admin · Interview pipeline extras (Phase 4).
// "Awaiting slot pick" (INTERVIEW_SCHEDULED with no booking, urgency-sorted,
// per-row resend + notify-all) and the bookings overview (date + role filters,
// client-side CSV export — the API has no bookings export, backend is frozen).
// Slot traffic goes through `@/lib/interviewSlotsAdmin`, never `@/lib/api`.

import { useMemo, useState } from 'react';
import { AlertCircle, BellRing, Download, Inbox, Loader2, Send } from 'lucide-react';
import { Avatar, DSCard, EmptyState, Pill } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  BOOKINGS_CSV_HEADERS,
  buildBookingsCsvRows,
  deriveAwaitingPick,
  downloadCsvText,
  flattenBookings,
  formatSlotRangeIst,
  istDateKeyOf,
  pickableSlots,
  resendSlotInvite,
  toCsvText,
  waitingDaysSince,
  type AdminInterviewSlot,
  type AwaitingApplication,
} from '@/lib/interviewSlotsAdmin';

const ROLE_LABEL: Record<string, string> = {
  TECHNICAL: 'Technical',
  DSA_CHAMPS: 'DSA Champs',
  DESIGNING: 'Designing',
  SOCIAL_MEDIA: 'Social Media',
  MANAGEMENT: 'Management',
};

// ─── Awaiting slot pick ──────────────────────────────────────────────────────

export interface AwaitingPickSectionProps {
  token: string;
  applications: AwaitingApplication[];
  bookedAppIds: ReadonlySet<string>;
  onChanged: () => void;
  /**
   * The cycle's slots. Optional so existing callers keep working; when supplied,
   * an invite is pointless while nothing is pickable (every slot has passed), so
   * the resend actions lock instead of pushing candidates to an empty picker.
   */
  slots?: AdminInterviewSlot[];
}

export function AwaitingPickSection({
  token,
  applications,
  bookedAppIds,
  onChanged,
  slots,
}: AwaitingPickSectionProps) {
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [notifyingAll, setNotifyingAll] = useState(false);

  const rows = useMemo(() => deriveAwaitingPick(applications, bookedAppIds), [applications, bookedAppIds]);
  const pickableCount = useMemo(() => (slots ? pickableSlots(slots).length : null), [slots]);
  const nothingToPick = pickableCount !== null && pickableCount === 0 && rows.length > 0;

  const resend = async (row: AwaitingApplication) => {
    if (nothingToPick) return;
    setResendingId(row.id);
    try {
      // Same-status PATCH + ?resend=true regenerates the token and re-sends
      // the pick email (server-side, see hiring.ts status endpoint).
      await resendSlotInvite(token, row.id);
      toast.success(`Invite re-sent to ${row.name}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingId(null);
    }
  };

  const notifyAll = async () => {
    if (rows.length === 0 || notifyingAll || nothingToPick) return;
    setNotifyingAll(true);
    try {
      const settled = await Promise.allSettled(rows.map((row) => resendSlotInvite(token, row.id)));
      const ok = settled.filter((r) => r.status === 'fulfilled').length;
      const failed = settled.length - ok;
      if (failed === 0) toast.success(`Re-sent invites to all ${ok} awaiting candidates`);
      else toast.error(`Re-sent ${ok}, failed ${failed} — retry the failures individually`);
      onChanged();
    } finally {
      setNotifyingAll(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] text-[var(--ds-text-3)] tabular-nums">
          {rows.length} candidate{rows.length === 1 ? '' : 's'} scheduled but yet to pick a slot
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={notifyAll}
          disabled={rows.length === 0 || notifyingAll || nothingToPick}
          title={nothingToPick ? 'No open slot left to pick — create slots first' : undefined}
        >
          {notifyingAll ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <BellRing size={13} className="mr-1.5" />}
          Notify all awaiting
        </Button>
      </div>

      {nothingToPick && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)] text-[13px]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            Every slot in this cycle has passed, so a re-sent invite would open an empty picker.
            Create slots first, then notify the waiting candidates.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Inbox size={18} />}
            title="Nobody is waiting"
            body="Every INTERVIEW_SCHEDULED candidate has picked a slot."
          />
        </DSCard>
      ) : (
        <DSCard padded={false} className="overflow-hidden">
          <div className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => {
              const waiting = waitingDaysSince(row.createdAt);
              return (
                <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                  <Avatar name={row.name} size={28} />
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-[13px] font-medium truncate">{row.name}</div>
                    <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">
                      {row.email} · {ROLE_LABEL[row.applyingRole] ?? row.applyingRole}
                      {row.cycle ? ` · cycle ${row.cycle}` : ''}
                    </div>
                  </div>
                  <Pill tone={waiting >= 5 ? 'danger' : waiting >= 3 ? 'warning' : 'info'} size="xs">
                    waiting {waiting}d
                  </Pill>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void resend(row)}
                    disabled={resendingId === row.id || nothingToPick}
                    title={nothingToPick ? 'No open slot left to pick — create slots first' : undefined}
                  >
                    {resendingId === row.id ? (
                      <Loader2 size={13} className="mr-1.5 animate-spin" />
                    ) : (
                      <Send size={13} className="mr-1.5" />
                    )}
                    Resend invite
                  </Button>
                </div>
              );
            })}
          </div>
        </DSCard>
      )}
    </div>
  );
}

// ─── Bookings overview ───────────────────────────────────────────────────────

export interface BookingsOverviewSectionProps {
  slots: AdminInterviewSlot[];
}

export function BookingsOverviewSection({ slots }: BookingsOverviewSectionProps) {
  const [dateFilter, setDateFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const rows = useMemo(() => {
    const all = flattenBookings(slots);
    return all.filter((r) => {
      if (dateFilter && istDateKeyOf(r.startsAt) !== dateFilter) return false;
      if (roleFilter !== 'all' && r.candidateRole !== roleFilter) return false;
      return true;
    });
  }, [slots, dateFilter, roleFilter]);

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error('Nothing to export with the current filters');
      return;
    }
    const text = toCsvText(BOOKINGS_CSV_HEADERS, buildBookingsCsvRows(rows));
    const suffix = `${dateFilter || 'all-dates'}-${roleFilter === 'all' ? 'all-roles' : roleFilter.toLowerCase()}`;
    downloadCsvText(`interview-bookings-${suffix}.csv`, text);
    toast.success(`Exported ${rows.length} booking${rows.length === 1 ? '' : 's'} to CSV`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="h-8 text-[13px] w-[160px]"
          aria-label="Filter bookings by date"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
          aria-label="Filter bookings by role"
          title="Filter bookings by role"
        >
          <option value="all">All roles</option>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {(dateFilter || roleFilter !== 'all') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDateFilter('');
              setRoleFilter('all');
            }}
            className="text-[var(--ds-text-3)]"
          >
            Clear filters
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download size={13} className="mr-1.5" />
          Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Inbox size={18} />}
            title="No bookings match"
            body="Try clearing the date or role filter."
          />
        </DSCard>
      ) : (
        <DSCard padded={false} className="overflow-hidden">
          <div className="px-4 h-9 border-b border-[var(--border-subtle)] flex items-center bg-[var(--bg-sunken)] text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
            <span className="flex-1">Candidate</span>
            <span className="w-[190px] hidden md:block">Slot (IST)</span>
            <span className="w-[120px] hidden sm:block">Booked at</span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {rows.map((r) => (
              <div key={r.bookingId} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={r.name} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{r.name}</div>
                  <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">
                    {r.email} · {ROLE_LABEL[r.candidateRole] ?? r.candidateRole}
                  </div>
                  <div className="text-[11.5px] text-[var(--ds-text-3)] md:hidden font-mono tabular-nums">
                    {istDateKeyOf(r.startsAt)} · {formatSlotRangeIst(r.startsAt, r.endsAt)}
                    {r.venue ? ` · ${r.venue}` : ''}
                  </div>
                </div>
                <div className="w-[190px] hidden md:block text-[12px] font-mono tabular-nums">
                  {istDateKeyOf(r.startsAt)} · {formatSlotRangeIst(r.startsAt, r.endsAt)}
                  {r.venue && <div className="text-[var(--ds-text-3)] truncate">{r.venue}</div>}
                </div>
                <div className="w-[120px] hidden sm:block text-[12px] text-[var(--ds-text-3)] tabular-nums">
                  {new Date(r.bookedAt).toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                  })}
                </div>
              </div>
            ))}
          </div>
        </DSCard>
      )}
    </div>
  );
}
