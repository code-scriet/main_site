// Post-booking confirmation panel for a candidate's interview slot.
// Used by the slot picker page and the dashboard hiring-status card.

import { useState } from 'react';
import { CalendarPlus, CheckCircle2, Clock, Loader2, MapPin, Ticket } from 'lucide-react';
import { DSCard, Pill } from '@/components/dash';
import { Button } from '@/components/ui/button';
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
import type { CandidateBooking } from '@/lib/api';
import { bookingReference, formatISTWithSuffix, isCancellableSlot } from '@/lib/interviewSlotsCandidate';

interface Props {
  booking: CandidateBooking;
  cancelling: boolean;
  onChangeSlot: () => void;
  onConfirmCancel: () => void;
  onDownloadICS: () => void;
}

export function InterviewBookingCard({ booking, cancelling, onChangeSlot, onConfirmCancel, onDownloadICS }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const slot = booking.slot;
  const startsAt = formatISTWithSuffix(slot.startsAt) || '—';
  const endsAt = formatISTWithSuffix(slot.endsAt) || '—';
  const cancellable = isCancellableSlot(slot.startsAt);

  return (
    <>
      <DSCard className="overflow-hidden" data-testid="interview-booking-card">
        <div className="h-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" aria-hidden />
        <div className="pt-4">
          <div className="flex items-start gap-3">
            <span className="grid place-items-center size-10 rounded-[10px] bg-[var(--success-bg)] text-[var(--success)] shrink-0">
              <CheckCircle2 size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-semibold tracking-tight">Interview slot confirmed</h3>
                <Pill tone="success" size="xs">Booked</Pill>
              </div>
              <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1">
                Your seat is held. Arrive 5 minutes early with a valid college ID.
              </p>
            </div>
          </div>

          <dl className="mt-4 grid gap-2.5 text-[13.5px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock size={14} className="text-[var(--ds-text-3)] shrink-0" />
              <div className="min-w-0">
                <div className="font-mono tabular-nums text-[var(--ds-text-1)]">{startsAt}</div>
                <div className="font-mono tabular-nums text-[12px] text-[var(--ds-text-3)]">ends {endsAt}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin size={14} className="text-[var(--ds-text-3)] shrink-0" />
              <span className="truncate">{slot.venue?.trim() ? slot.venue : 'Venue to be announced'}</span>
            </div>
            <div className="flex items-center gap-2.5 min-w-0">
              <Ticket size={14} className="text-[var(--ds-text-3)] shrink-0" />
              <span className="text-[12.5px] text-[var(--ds-text-3)]">
                Booking reference{' '}
                <span className="font-mono tabular-nums font-semibold text-[var(--ds-text-1)]">
                  {bookingReference(booking.id)}
                </span>
              </span>
            </div>
          </dl>

          <div className="mt-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3.5 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ds-text-3)]">
              What to expect
            </div>
            <p className="text-[12.5px] text-[var(--ds-text-2)] mt-1 leading-relaxed">
              A short conversation about your application, interests and availability. Bring your
              college ID and be ready to talk through one thing you have built or learned recently.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={onDownloadICS}
              className="border-amber-200 text-amber-800 hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-[#1a140b]"
            >
              <CalendarPlus size={14} className="mr-1.5" />
              Add to calendar
            </Button>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={onChangeSlot}>
              Change slot
            </Button>
            {cancellable ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmOpen(true)}
                disabled={cancelling}
                className="text-[var(--danger)] hover:bg-[var(--danger-bg)]"
              >
                {cancelling && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                Cancel booking
              </Button>
            ) : (
              <span className="text-[12px] text-[var(--ds-text-3)]">
                Cancellation closes 24 hours before your slot.
              </span>
            )}
          </div>
        </div>
      </DSCard>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Your slot for {startsAt} will be released and your application will go back to
              the pick-a-slot state. There is no undo, but you can book again right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep my slot</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onConfirmCancel();
              }}
              disabled={cancelling}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {cancelling && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
