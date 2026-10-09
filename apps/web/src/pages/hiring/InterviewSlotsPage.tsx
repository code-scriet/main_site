// Shared candidate slot surface for both entry points:
//   - /dashboard/hiring/slots (logged-in, session auth, inside DashboardLayout)
//   - /hiring/slots?token=      (magic-link, public, token passed as ?token=)
// Token mode hides login-requiring chrome (no dashboard nav, no sign-in CTAs
// beyond the invalid-link case) and never fetches without its token.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { DSCard, EmptyState } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { InterviewBookingCard } from '@/components/hiring/InterviewBookingCard';
import { InterviewSlotPicker } from '@/components/hiring/InterviewSlotPicker';
import { InterviewUpdates } from '@/components/hiring/InterviewUpdates';
import { api, SlotApiError, type CandidateBooking, type SlotAuth } from '@/lib/api';
import { isSlotPast, slotBookErrorCopy } from '@/lib/interviewSlotsCandidate';
import { downloadICS } from '@/lib/calendar';
import { cn } from '@/lib/utils';

function useSlotAuth(slotToken: string | null): { auth: SlotAuth; canFetch: boolean } {
  const { token: sessionToken, isLoading: authLoading } = useAuth();
  return useMemo(() => {
    if (slotToken) return { auth: { slotToken }, canFetch: true };
    if (authLoading) return { auth: {}, canFetch: false };
    return { auth: sessionToken ? { sessionToken } : {}, canFetch: Boolean(sessionToken) };
  }, [slotToken, sessionToken, authLoading]);
}

export function InterviewSlotsContent({ embedded = false }: { embedded?: boolean } = {}) {
  const [searchParams] = useSearchParams();
  const slotToken = searchParams.get('token');
  const isTokenMode = Boolean(slotToken);
  const { token: sessionToken } = useAuth();
  const { auth, canFetch } = useSlotAuth(slotToken);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const bookingQ = useQuery({
    queryKey: ['interview-my-booking', slotToken ? `token:${slotToken.slice(0, 12)}` : 'session'],
    queryFn: () => api.getMyInterviewBooking(auth),
    enabled: canFetch,
    // A magic-link tab has no session, so the notifications socket (and its
    // live:invalidate bridge) never attaches there. Refetching on focus is what
    // keeps a returning candidate from staring at a stale booking state.
    refetchOnWindowFocus: true,
    retry: false,
  });
  const bookingData = bookingQ.data;
  const hasBooking = Boolean(bookingData && bookingData.hasBooking);
  const booking: CandidateBooking | null = bookingData && bookingData.hasBooking ? bookingData.booking : null;
  // Set when the candidate is logged in but not yet in the interview pipeline
  // (no application, or PENDING / SELECTED / REJECTED). The picker is hidden and
  // an explanatory card is shown instead of a raw error.
  const lockReason =
    bookingData && !bookingData.hasBooking ? (bookingData as { reason?: string }).reason ?? null : null;
  const showPicker = (!hasBooking || pickerOpen) && !lockReason;

  const slotsQ = useQuery({
    queryKey: ['interview-slots-available', slotToken ? `token:${slotToken.slice(0, 12)}` : 'session'],
    queryFn: () => api.getAvailableInterviewSlots(auth),
    enabled: canFetch && bookingQ.isFetched && showPicker,
    // Live list while the picker is open; paused once booked.
    refetchInterval: showPicker ? 30_000 : false,
    refetchIntervalInBackground: false,
    // The 30s interval is paused in a background tab, so a returning candidate
    // could otherwise keep a row whose start time already passed until the next
    // tick. Refreshing on focus closes that gap immediately.
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const slots = useMemo(() => slotsQ.data?.slots ?? [], [slotsQ.data]);

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['interview-my-booking'] });
    void qc.invalidateQueries({ queryKey: ['interview-slots-available'] });
  };

  const bookMut = useMutation({
    mutationFn: (id: string) => api.bookInterviewSlot(id, auth),
    onSuccess: () => {
      toast.success('Interview slot confirmed');
      setSelectedId(null);
      setPickerOpen(false);
      invalidateAll();
    },
    onError: (e: unknown) => {
      const errorType = e instanceof SlotApiError ? e.errorType : undefined;
      if (errorType === 'already_booked') {
        toast.message(slotBookErrorCopy(errorType));
        setPickerOpen(false);
        void qc.invalidateQueries({ queryKey: ['interview-my-booking'] });
        return;
      }
      // Any 409 means the list changed under us — refresh it. A server-side
      // past_slot (400) is the same situation one step further: the row is dead.
      if (errorType === 'past_slot' || (e instanceof SlotApiError && e.status === 409)) {
        if (errorType === 'past_slot') setSelectedId(null);
        void qc.invalidateQueries({ queryKey: ['interview-slots-available'] });
      }
      toast.error(slotBookErrorCopy(errorType));
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => api.cancelMyInterviewBooking(auth),
    onSuccess: () => {
      toast.success('Booking cancelled. Pick a new slot whenever you are ready.');
      setPickerOpen(false);
      invalidateAll();
    },
    onError: (e: unknown) => {
      const errorType = e instanceof SlotApiError ? e.errorType : undefined;
      toast.error(slotBookErrorCopy(errorType));
    },
  });

  const handleDownloadICS = () => {
    if (!booking) return;
    downloadICS(
      {
        title: 'Interview — code.scriet',
        description: `Interview booking reference ${booking.id.replace(/-/g, '').slice(0, 8).toUpperCase()}. Arrive 5 minutes early with a valid college ID.`,
        location: booking.slot.venue?.trim() ? booking.slot.venue : undefined,
        startDate: booking.slot.startsAt,
        endDate: booking.slot.endsAt,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
      'interview-slot.ics',
    );
  };

  const bookingError = bookingQ.error;
  const linkBroken =
    bookingError instanceof SlotApiError && (bookingError.status === 410 || bookingError.status === 401);

  return (
    <div className={cn('flex flex-col gap-6 w-full', !embedded && 'max-w-[880px] mx-auto')}>
      {!embedded && (
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">
            Hiring · Interview
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Pick your interview slot</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 tabular-nums">
            Slots fill on a first-come-first-served basis. All times are IST.
          </p>
        </motion.div>
      )}

      {!canFetch && !isTokenMode && (
        <DSCard padded>
          <EmptyState
            icon={<LogIn size={18} />}
            title="Sign in to pick your slot"
            body="Your interview invitation is tied to your account. Sign in to see the open slots."
            action={
              <Button asChild className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                <Link to="/signin">Sign in</Link>
              </Button>
            }
          />
        </DSCard>
      )}

      {canFetch && bookingQ.isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
          ))}
        </div>
      )}

      {canFetch && linkBroken && (
        <DSCard padded>
          <EmptyState
            icon={<CalendarDays size={18} />}
            title="This link is no longer valid"
            body="Interview links expire after 7 days. If you still need a slot, reply to your invitation email and the hiring team will send a fresh link."
          />
        </DSCard>
      )}

      {canFetch && bookingQ.isError && !linkBroken && (
        <DSCard padded>
          <EmptyState
            icon={<CalendarDays size={18} />}
            title="Could not load your booking"
            body="Check your connection and try again."
            action={
              <Button size="sm" variant="outline" onClick={() => void bookingQ.refetch()}>
                Retry
              </Button>
            }
          />
        </DSCard>
      )}

      {canFetch && bookingQ.isSuccess && !hasBooking && lockReason && (
        <DSCard padded>
          <EmptyState
            icon={<CalendarDays size={18} />}
            title={lockReason === 'no_application' ? 'No application found' : 'Interview not scheduled yet'}
            body={
              lockReason === 'no_application'
                ? 'We could not find a hiring application on this account. Apply to join the team and the hiring panel will review it.'
                : 'Slot picking opens once the hiring team moves your application to “Interview scheduled”. You will get an email and a bell notification when it does.'
            }
            action={
              lockReason === 'no_application' ? (
                <Button asChild className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                  <Link to="/join-us">Join our team</Link>
                </Button>
              ) : undefined
            }
          />
        </DSCard>
      )}

      {canFetch && bookingQ.isSuccess && hasBooking && booking && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.35 }}
        >
          <InterviewBookingCard
            booking={booking}
            cancelling={cancelMut.isPending}
            onChangeSlot={() => setPickerOpen(true)}
            onConfirmCancel={() => cancelMut.mutate()}
            onDownloadICS={handleDownloadICS}
          />
        </motion.div>
      )}

      {canFetch && bookingQ.isSuccess && showPicker && (
        <div className="flex flex-col gap-4">
          {slotsQ.isLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
              ))}
            </div>
          )}
          {slotsQ.isError && (
            <DSCard padded>
              <EmptyState
                icon={<CalendarDays size={18} />}
                title="Could not load open slots"
                body="Check your connection and try again."
                action={
                  <Button size="sm" variant="outline" onClick={() => void slotsQ.refetch()}>
                    Retry
                  </Button>
                }
              />
            </DSCard>
          )}
          {slotsQ.isSuccess && (
            <InterviewSlotPicker
              slots={slots}
              selectedId={selectedId}
              onSelect={setSelectedId}
              confirming={bookMut.isPending}
              onConfirm={() => {
                if (!selectedId || bookMut.isPending) return;
                // Guard the one case polling can produce: the slot crossed its
                // start time while the page sat open. Say so locally instead of
                // firing a booking request the server is going to refuse.
                const chosen = slots.find((s) => s.id === selectedId);
                if (chosen && isSlotPast(chosen.startsAt)) {
                  toast.message(slotBookErrorCopy('past_slot'));
                  setSelectedId(null);
                  void qc.invalidateQueries({ queryKey: ['interview-slots-available'] });
                  return;
                }
                bookMut.mutate(selectedId);
              }}
              hasExistingBooking={hasBooking}
            />
          )}
        </div>
      )}

      {canFetch && (isTokenMode || Boolean(sessionToken)) && (
        <InterviewUpdates auth={isTokenMode ? { slotToken } : { sessionToken }} />
      )}

      {bookMut.isPending && (
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--ds-text-3)]" role="status">
          <Loader2 size={13} className="animate-spin" /> Confirming your slot…
        </div>
      )}
    </div>
  );
}

// Reused verbatim by the dashboard "My Application" tab so candidates find and
// book their open slots inline (not only on the dedicated slots route).
export function InterviewSlotsPage() {
  const [searchParams] = useSearchParams();
  const isTokenMode = Boolean(searchParams.get('token'));

  if (isTokenMode) {
    return (
      <Layout>
        <SEO title="Pick your interview slot" noIndex={true} />
        <div className="mx-auto max-w-[1000px] px-4 sm:px-6 py-10">
          <InterviewSlotsContent />
        </div>
      </Layout>
    );
  }
  return (
    <>
      <SEO title="Pick your interview slot" noIndex={true} />
      <InterviewSlotsContent />
    </>
  );
}

export default InterviewSlotsPage;
