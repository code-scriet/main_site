// Admin · Backdate console — retroactive event records (PRESIDENT / super admin).
//
// Deliberately unlisted: no sidebar entry, reachable only by typing /admin/backdate.
// It exists for a narrow, occasional job — reconstructing the record of something
// that already happened (a guest who spoke two years ago, attendance that was never
// scanned) so a certificate for it can be issued with an honest date. Every organic
// path correctly refuses that work; this is the audited escape hatch.
//
// The route itself is wrapped in SuperAdminOrPresidentRoute (App.tsx) and every
// endpoint re-checks authority server-side, so hiding the link is presentation, not
// security.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  History, Search, UserPlus, Trash2, Loader2, CalendarClock, ShieldAlert,
  Check, X, Award, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, type BackdateRegistrationInput, type CertType, type Event as EventT } from '@/lib/api';
import { Banner, DSCard, EmptyState, Field, Pill, SegmentedTabs, Section } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const GUEST_CERT_TYPES: CertType[] = ['SPEAKER', 'APPRECIATION', 'PARTICIPATION', 'COMPLETION', 'WINNER'];

/**
 * A datetime-local input yields wall-clock text with no zone ("2024-03-15T10:00").
 * `new Date(...)` on that string reads it in the browser's zone, which is what the
 * admin means — they typed the local time the event actually ran at. Converting to a
 * real ISO instant here keeps the server's bounds check working on an unambiguous value.
 */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Seed the date picker from the event's own start, which is the answer ~90% of the time. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function AdminBackdate() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [eventSearch, setEventSearch] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string; hasInvitation: boolean } | null>(null);

  // Add-person form
  const [personEmail, setPersonEmail] = useState('');
  const [registrationType, setRegistrationType] = useState<'PARTICIPANT' | 'GUEST'>('GUEST');
  const [registeredAt, setRegisteredAt] = useState('');
  const [guestRole, setGuestRole] = useState('Guest Speaker');
  const [guestDesignation, setGuestDesignation] = useState('');
  const [guestCompany, setGuestCompany] = useState('');
  const [certificateType, setCertificateType] = useState<CertType>('SPEAKER');
  const [attendedDays, setAttendedDays] = useState<Set<number>>(new Set([1]));
  const [reason, setReason] = useState('');

  const eventsQuery = useQuery({
    queryKey: ['admin', 'backdate', 'events'],
    queryFn: () => api.getEvents(),
    enabled: Boolean(token),
  });

  const snapshotQuery = useQuery({
    queryKey: ['admin', 'backdate', 'snapshot', selectedEventId],
    queryFn: () => api.getBackdateEventSnapshot(selectedEventId!, token!),
    enabled: Boolean(token && selectedEventId),
  });

  const events = useMemo(() => {
    const all = (eventsQuery.data ?? []) as EventT[];
    const q = eventSearch.trim().toLowerCase();
    const filtered = q ? all.filter((e) => e.title.toLowerCase().includes(q)) : all;
    // Most-recent first — a backdate job is almost always about a recent-ish past event.
    return [...filtered]
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 40);
  }, [eventsQuery.data, eventSearch]);

  const snapshot = snapshotQuery.data;
  const eventDays = snapshot?.event.eventDays ?? 1;

  const selectEvent = (event: EventT) => {
    setSelectedEventId(event.id);
    // Seed the recorded moment from the event's start so the common case is one click.
    setRegisteredAt(isoToLocalInput(event.startDate));
    setAttendedDays(new Set([1]));
  };

  const addMutation = useMutation({
    mutationFn: (input: BackdateRegistrationInput) =>
      api.createBackdatedRegistration(selectedEventId!, input, token!),
    onSuccess: (result) => {
      if (result.reusedExistingRegistration) {
        // Say plainly that the date was NOT applied. The server deliberately keeps an
        // existing registration's timestamp (it may be a real organic one), so a
        // cheerful "records updated" would send the admin away believing a date
        // correction landed when it didn't.
        const extra = [
          result.retypedFrom ? `type changed from ${result.retypedFrom}` : null,
          result.markedDays.length ? `${result.markedDays.length} day(s) marked present` : null,
        ].filter(Boolean).join(' · ');
        toast.warning('Already registered — existing registration date kept', {
          description: `${extra ? `${extra}. ` : ''}Remove and re-add them to change the registration date itself.`,
        });
      } else {
        toast.success(
          result.markedDays.length
            ? `Registration recorded · ${result.markedDays.length} day(s) marked present.`
            : 'Registration recorded.',
        );
      }
      setPersonEmail('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backdate', 'snapshot', selectedEventId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to record participation'),
  });

  const attendanceMutation = useMutation({
    mutationFn: (input: { registrationId: string; dayNumber: number; attended: boolean; scannedAt: string | null }) =>
      api.setBackdatedAttendance(input.registrationId, input, token!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backdate', 'snapshot', selectedEventId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to update attendance'),
  });

  const removeMutation = useMutation({
    mutationFn: (input: { registrationId: string; dropInvitation: boolean }) =>
      api.deleteBackdatedRegistration(input.registrationId, token!, input.dropInvitation),
    onSuccess: () => {
      toast.success('Registration removed.');
      setRemoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backdate', 'snapshot', selectedEventId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to remove the registration'),
  });

  const submitAdd = () => {
    const iso = localInputToIso(registeredAt);
    if (!personEmail.trim()) {
      toast.error('Enter the person\'s account email');
      return;
    }
    if (!iso) {
      toast.error('Pick the date this should be recorded as');
      return;
    }
    addMutation.mutate({
      email: personEmail.trim(),
      registrationType,
      registeredAt: iso,
      reason: reason.trim() || null,
      ...(registrationType === 'GUEST'
        ? {
            guestRole: guestRole.trim() || 'Guest',
            guestDesignation: guestDesignation.trim() || null,
            guestCompany: guestCompany.trim() || null,
            certificateType,
          }
        : {}),
      attendedDays: Array.from(attendedDays).sort((a, b) => a - b),
    });
  };

  const toggleDay = (day: number) => {
    setAttendedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const toggleAttendance = (registrationId: string, dayNumber: number, currentlyAttended: boolean) => {
    const iso = localInputToIso(registeredAt) ?? snapshot?.event.startDate ?? null;
    attendanceMutation.mutate({
      registrationId,
      dayNumber,
      attended: !currentlyAttended,
      scannedAt: currentlyAttended ? null : iso,
    });
  };

  return (
    <div className="space-y-6">
      <Section
        eyebrow={<span className="inline-flex items-center gap-1.5"><History size={11} /> Restricted</span>}
        title="Backdate console"
        description="Reconstruct the record of something that already happened, so a certificate for it can carry an honest date. Every change here is written to the audit log with the real time it was made."
      />

      <Banner tone="warning" title="These records are dated in the past">
        Registrations, guest invitations and attendance created here are stamped with the date you
        choose, not today, and are marked as retroactive. Nothing is emailed and no notification is
        sent — the member hears about it only when you issue the certificate.
      </Banner>

      {/* ── Event picker ─────────────────────────────────────────── */}
      <Section
        title="1 · Pick the event"
        action={(
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)]" />
            <Input
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
              placeholder="Search events…"
              className="pl-9 h-9 text-[13px]"
            />
          </div>
        )}
      >
        {eventsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--ds-text-3)] py-6">
            <Loader2 size={14} className="animate-spin" /> Loading events…
          </div>
        ) : events.length === 0 ? (
          <EmptyState title="No events found" body="Try a different search." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => selectEvent(event)}
                className={cn(
                  'text-left rounded-xl border p-3 transition-colors',
                  selectedEventId === event.id
                    ? 'border-[var(--accent)] bg-[var(--bg-sunken)]'
                    : 'border-[var(--border)] hover:bg-[var(--bg-sunken)]',
                )}
              >
                <div className="text-[13.5px] font-medium truncate">{event.title}</div>
                <div className="text-[11.5px] text-[var(--ds-text-3)] mt-1 flex items-center gap-2 font-mono tabular-nums">
                  <CalendarClock size={11} />
                  {new Date(event.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  <Pill tone={event.status === 'PAST' ? 'neutral' : 'accent'} size="sm">{event.status}</Pill>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      {selectedEventId && snapshotQuery.isLoading && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--ds-text-3)] py-6">
          <Loader2 size={14} className="animate-spin" /> Loading event records…
        </div>
      )}

      {snapshot && (
        <>
          {/* ── Add a person ───────────────────────────────────────── */}
          <Section
            title={`2 · Record a person on “${snapshot.event.title}”`}
            description="They must already have an account — this records their participation, it does not create a user."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Account email">
                <Input
                  value={personEmail}
                  onChange={(e) => setPersonEmail(e.target.value)}
                  placeholder="speaker@example.com"
                  type="email"
                  className="h-9 text-[13px]"
                />
              </Field>

              <Field label="Recorded as (date & time)">
                <Input
                  type="datetime-local"
                  value={registeredAt}
                  onChange={(e) => setRegisteredAt(e.target.value)}
                  className="h-9 text-[13px]"
                />
              </Field>

              <Field label="Recorded as">
                <SegmentedTabs
                  items={[
                    { value: 'GUEST', label: 'Guest / Speaker' },
                    { value: 'PARTICIPANT', label: 'Participant' },
                  ]}
                  value={registrationType}
                  onChange={(v) => setRegistrationType(v as 'PARTICIPANT' | 'GUEST')}
                />
              </Field>

              <Field label="Reason (kept in the audit log)">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Speaker records predate the invitations feature"
                  className="h-9 text-[13px]"
                />
              </Field>

              {registrationType === 'GUEST' && (
                <>
                  <Field label="Role at the event">
                    <Input value={guestRole} onChange={(e) => setGuestRole(e.target.value)} className="h-9 text-[13px]" />
                  </Field>
                  <Field label="Certificate type">
                    <select
                      value={certificateType}
                      onChange={(e) => setCertificateType(e.target.value as CertType)}
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-3 text-[13px]"
                    >
                      {GUEST_CERT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Designation (optional)">
                    <Input value={guestDesignation} onChange={(e) => setGuestDesignation(e.target.value)} placeholder="Senior Engineer" className="h-9 text-[13px]" />
                  </Field>
                  <Field label="Company (optional)">
                    <Input value={guestCompany} onChange={(e) => setGuestCompany(e.target.value)} placeholder="Acme Corp" className="h-9 text-[13px]" />
                  </Field>
                </>
              )}
            </div>

            <div className="mt-4">
              <div className="text-[12px] text-[var(--ds-text-2)] mb-2">Mark present on</div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: eventDays }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'px-3 h-8 rounded-lg border text-[12.5px] transition-colors',
                      attendedDays.has(day)
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--ds-text-3)] hover:bg-[var(--bg-sunken)]',
                    )}
                  >
                    {snapshot.event.dayLabels[day - 1] || `Day ${day}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button onClick={submitAdd} disabled={addMutation.isPending} size="sm">
                {addMutation.isPending
                  ? <><Loader2 size={14} className="mr-2 animate-spin" /> Recording…</>
                  : <><UserPlus size={14} className="mr-2" /> Record participation</>}
              </Button>
              <Link
                to={`/admin/events/${snapshot.event.id}/attendance?tab=certificates`}
                className="text-[12.5px] text-[var(--accent)] hover:underline inline-flex items-center gap-1.5"
              >
                <Award size={13} /> Issue certificates for this event <ExternalLink size={11} />
              </Link>
            </div>
          </Section>

          {/* ── Existing records ───────────────────────────────────── */}
          <Section
            title="3 · Records on this event"
            description={`${snapshot.registrations.length} registration${snapshot.registrations.length === 1 ? '' : 's'} · click a day chip to toggle attendance`}
          >
            {snapshot.registrations.length === 0 ? (
              <EmptyState title="Nobody is registered yet" body="Use the form above to record someone." />
            ) : (
              <DSCard className="overflow-x-auto p-0">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11.5px] uppercase tracking-wide text-[var(--ds-text-3)] border-b border-[var(--border)]">
                      <th className="px-4 py-2.5 text-left font-medium">Person</th>
                      <th className="px-4 py-2.5 text-left font-medium">Type</th>
                      <th className="px-4 py-2.5 text-left font-medium">Registered</th>
                      <th className="px-4 py-2.5 text-left font-medium">Attendance</th>
                      <th className="px-4 py-2.5 text-right font-medium">·</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.registrations.map((reg) => (
                      <tr key={reg.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-[220px]">{reg.user.name}</div>
                          <div className="text-[11.5px] text-[var(--ds-text-3)] truncate max-w-[220px]">{reg.user.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <Pill tone={reg.registrationType === 'GUEST' ? 'info' : 'neutral'} size="sm">
                              {reg.registrationType}
                            </Pill>
                            {reg.backdatedBy && (
                              <Pill tone="warning" size="sm">
                                <ShieldAlert size={9} className="mr-1" />Retro
                              </Pill>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-[11.5px] text-[var(--ds-text-3)] whitespace-nowrap">
                          {fmtDateTime(reg.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: eventDays }, (_, i) => i + 1).map((day) => {
                              const record = reg.dayAttendances.find((d) => d.dayNumber === day);
                              const attended = Boolean(record?.attended);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  title={attended ? `Present — ${fmtDateTime(record?.scannedAt)}` : 'Mark present'}
                                  disabled={attendanceMutation.isPending}
                                  onClick={() => toggleAttendance(reg.id, day, attended)}
                                  className={cn(
                                    'h-7 min-w-7 px-2 rounded-md border text-[11.5px] inline-flex items-center gap-1 transition-colors disabled:opacity-50',
                                    attended
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                      : 'border-[var(--border)] text-[var(--ds-text-3)] hover:bg-[var(--bg-sunken)]',
                                  )}
                                >
                                  {attended ? <Check size={10} /> : <X size={10} />}D{day}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            title="Remove from this event"
                            onClick={() => setRemoveTarget({
                              id: reg.id,
                              name: reg.user.name,
                              hasInvitation: snapshot.invitations.some((inv) => inv.registrationId === reg.id),
                            })}
                            className="h-7 w-7 rounded-md grid place-items-center text-[var(--ds-text-3)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DSCard>
            )}

            {snapshot.invitations.length > 0 && (
              <div className="mt-5">
                <div className="text-[12.5px] font-medium text-[var(--ds-text-2)] mb-2">
                  Guest invitations ({snapshot.invitations.length})
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {snapshot.invitations.map((inv) => (
                    <DSCard key={inv.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium truncate">
                            {inv.inviteeUser?.name || inv.inviteeNameSnapshot || inv.inviteeEmail || 'Unknown'}
                          </div>
                          <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">
                            {inv.role} · {inv.certificateType}
                          </div>
                          <div className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums mt-1">
                            invited {fmtDateTime(inv.invitedAt)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Pill tone={inv.status === 'ACCEPTED' ? 'success' : 'neutral'} size="sm">{inv.status}</Pill>
                          {inv.backdatedBy && <Pill tone="warning" size="sm">Retro</Pill>}
                        </div>
                      </div>
                    </DSCard>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name} from this event?</AlertDialogTitle>
            <AlertDialogDescription>
              Their registration and all attendance records for this event are deleted, and their QR
              token stops working. Any certificates already issued to them are not affected.
              {removeTarget?.hasInvitation && ' Their guest invitation is kept but returned to Pending.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMutation.mutate({ registrationId: removeTarget.id, dropInvitation: false })}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
