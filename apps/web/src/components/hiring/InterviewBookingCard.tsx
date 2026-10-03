// Post-booking confirmation panel for a candidate's interview slot.
// Used by the slot picker page and the dashboard hiring-status card.

import { useState } from 'react';
import { CalendarCheck, CalendarPlus, CheckCircle2, Clock, Loader2, MapPin, Ticket } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
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
import { googleCalendarUrl } from '@/lib/calendar';
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
  const { settings } = useSettings();
  const whatToExpect = settings?.interviewWhatToExpect?.trim()
    || 'A short conversation about your application, interests and availability. Bring your college ID and be ready to talk through one thing you have built or learned recently.';
  const slot = booking.slot;
  const startsAt = formatISTWithSuffix(slot.startsAt) || '—';
  const endsAt = formatISTWithSuffix(slot.endsAt) || '—';
  const cancellable = isCancellableSlot(slot.startsAt);
  // Direct link to Google Calendar's new-event page — lets the candidate set
  // their own reminder without going through a downloaded file.
  const gcHref = googleCalendarUrl({
    title: 'code.scriet interview',
    description: `Booking reference ${bookingReference(booking.id)}. Arrive 5 minutes early with a valid college ID. Set a reminder in Google Calendar so you don't miss it.`,
    location: slot.venue?.trim() ? slot.venue : undefined,
    startDate: slot.startsAt,
    endDate: slot.endsAt,
  });

  return (
    <>
      <DSCard className="overflow-hidden" data-testid="interview-booking-card">
        <div className="h-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" aria-hidden />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid place-items-center size-10 rounded-[var(--radius-md)] bg-[var(--success-bg)] text-[var(--success)] shrink-0">
              <CheckCircle2 size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold tracking-tight">Interview slot confirmed</h3>
                <Pill tone="success" size="xs">Booked</Pill>
              </div>
              <p className="text-sm text-[var(--ds-text-3)] mt-2">
                Your seat is held. Arrive 5 minutes early with a valid college ID.
              </p>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <Clock size={14} className="text-[var(--ds-text-3)] shrink-0" />
              <div className="min-w-0">
                <div className="font-mono tabular-nums text-[var(--ds-text-1)]">{startsAt}</div>
                <div className="font-mono tabular-nums text-xs text-[var(--ds-text-3)]">ends {endsAt}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <MapPin size={14} className="text-[var(--ds-text-3)] shrink-0" />
              <span className="truncate">{slot.venue?.trim() ? slot.venue : 'Venue to be announced'}</span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <Ticket size={14} className="text-[var(--ds-text-3)] shrink-0" />
              <span className="text-xs text-[var(--ds-text-3)]">
                Booking reference{' '}
                <span className="font-mono tabular-nums font-semibold text-[var(--ds-text-1)]">
                  {bookingReference(booking.id)}
                </span>
              </span>
            </div>
          </dl>

          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-3)]">
              What to expect
            </div>
            <p className="text-sm text-[var(--ds-text-2)] mt-1.5 leading-relaxed">
              {whatToExpect}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              asChild
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            >
              <a href={gcHref} target="_blank" rel="noreferrer noopener">
                <CalendarCheck size={14} className="mr-1.5" />
                Add to Google Calendar
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDownloadICS}
              className="text-[var(--accent)] hover:bg-[var(--accent-subtle)] border-[var(--accent-ring)]"
            >
              <CalendarPlus size={14} className="mr-1.5" />
              Download .ics
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
              <span className="text-xs text-[var(--ds-text-3)]">
                Cancellation closes 24 hours before your slot.
              </span>
            )}
          </div>
        </div>
      </DSCard>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <AlertDialogContent data-dashboard="true">
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