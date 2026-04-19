import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type EventInvitation } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MailOpen,
  MapPin,
  QrCode,
  Reply,
  XCircle,
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { toast } from 'sonner';

type InvitationActionState = {
  id: string;
  action: 'accept' | 'decline';
} | null;

function isFuture(date?: string | null) {
  return Boolean(date && new Date(date).getTime() > Date.now());
}

function isPast(date?: string | null) {
  return Boolean(date && new Date(date).getTime() < Date.now());
}

function getInvitationEventHref(invitation: EventInvitation) {
  const eventIdentifier = invitation.event?.slug || invitation.eventId;
  return `/events/${eventIdentifier}`;
}

function getCountdownLabel(startDate?: string) {
  if (!startDate) return null;

  const diffMs = new Date(startDate).getTime() - Date.now();
  if (diffMs <= 0) return 'Started';

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays >= 1) return `${totalDays} day${totalDays === 1 ? '' : 's'} left`;
  if (totalHours >= 1) return `${totalHours} hour${totalHours === 1 ? '' : 's'} left`;

  const totalMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  return `${totalMinutes} min left`;
}

function InvitationStatusBadge({ status }: { status: EventInvitation['status'] }) {
  const statusClassName: Record<EventInvitation['status'], string> = {
    PENDING: 'border-amber-200 bg-amber-100 text-amber-800',
    ACCEPTED: 'border-emerald-200 bg-emerald-100 text-emerald-800',
    DECLINED: 'border-slate-200 bg-slate-100 text-slate-700',
    REVOKED: 'border-red-200 bg-red-100 text-red-700',
    EXPIRED: 'border-slate-200 bg-slate-100 italic text-slate-600',
  };

  return (
    <Badge variant="outline" className={statusClassName[status]}>
      {status}
    </Badge>
  );
}

function EventImageBackground({ invitation }: { invitation: EventInvitation }) {
  const imageUrl = invitation.event?.imageUrl ? processImageUrl(invitation.event.imageUrl, 'event-cover') : null;

  if (!imageUrl) {
    return <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.6),_transparent_35%),linear-gradient(135deg,_#451a03,_#78350f_45%,_#111827)]" />;
  }

  return (
    <>
      <img
        src={imageUrl}
        alt={invitation.event?.title || 'Invitation'}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/10" />
    </>
  );
}

export default function DashboardInvitations() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { invitationId: highlightedInvitationId } = useParams<{ invitationId?: string }>();
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionState, setActionState] = useState<InvitationActionState>(null);

  const invitationsQuery = useQuery({
    queryKey: ['invitations', 'my'],
    queryFn: () => api.getMyInvitations(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const invitations = invitationsQuery.data ?? [];

  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'PENDING'),
    [invitations],
  );
  const acceptedInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === 'ACCEPTED'),
    [invitations],
  );
  const historyInvitations = useMemo(
    () => invitations.filter((invitation) => ['DECLINED', 'REVOKED', 'EXPIRED'].includes(invitation.status)),
    [invitations],
  );
  const highlightedInvitation = useMemo(
    () => invitations.find((invitation) => invitation.id === highlightedInvitationId) ?? null,
    [highlightedInvitationId, invitations],
  );

  useEffect(() => {
    if (!highlightedInvitation) return;
    if (['DECLINED', 'REVOKED', 'EXPIRED'].includes(highlightedInvitation.status)) {
      setHistoryOpen(true);
    }
  }, [highlightedInvitation]);

  useEffect(() => {
    if (!highlightedInvitationId || invitationsQuery.isLoading) return;

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`invitation-card-${highlightedInvitationId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedInvitationId, invitationsQuery.isLoading, invitations.length, historyOpen]);

  const refreshInvitationData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invitations', 'my'] }),
      queryClient.invalidateQueries({ queryKey: ['registrations', 'my'] }),
    ]);
  };

  const acceptMutation = useMutation({
    mutationFn: (invitationId: string) => api.acceptInvitation(invitationId, token!),
    onSuccess: async (data) => {
      toast.success(`Invitation accepted for ${data.invitation.event?.title || 'the event'}.`);
      await refreshInvitationData();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to accept invitation.');
    },
    onSettled: () => {
      setActionState(null);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (invitationId: string) => api.declineInvitation(invitationId, token!),
    onSuccess: async (invitation) => {
      toast.success(
        invitation.status === 'DECLINED'
          ? `Declined invitation for ${invitation.event?.title || 'the event'}.`
          : 'Invitation updated.',
      );
      await refreshInvitationData();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update invitation.');
    },
    onSettled: () => {
      setActionState(null);
    },
  });

  const runAccept = (invitationId: string) => {
    setActionState({ id: invitationId, action: 'accept' });
    acceptMutation.mutate(invitationId);
  };

  const runDecline = (invitationId: string) => {
    setActionState({ id: invitationId, action: 'decline' });
    declineMutation.mutate(invitationId);
  };

  if (invitationsQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (invitationsQuery.isError) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-10 text-center text-red-700">
          {invitationsQuery.error instanceof Error ? invitationsQuery.error.message : 'Failed to load invitations.'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold text-gray-900">
            <MailOpen className="h-7 w-7 text-amber-600" />
            My Invitations
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Review guest invitations, respond quickly, and use the same event QR ticket once accepted.
          </p>
        </div>
        <Badge className="w-fit bg-amber-100 text-amber-900">
          {pendingInvitations.length} pending
        </Badge>
      </div>

      {highlightedInvitationId && highlightedInvitation ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="py-4 text-sm text-amber-900">
            Highlighting your invitation for <span className="font-semibold">{highlightedInvitation.event?.title || 'this event'}</span>.
          </CardContent>
        </Card>
      ) : null}

      {pendingInvitations.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Pending</h2>
            <p className="text-sm text-gray-500">Respond before the event ends.</p>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {pendingInvitations.map((invitation) => {
              const isAccepting = actionState?.id === invitation.id && actionState.action === 'accept' && acceptMutation.isPending;
              const isDeclining = actionState?.id === invitation.id && actionState.action === 'decline' && declineMutation.isPending;

              return (
                <div
                  key={invitation.id}
                  id={`invitation-card-${invitation.id}`}
                  className={`relative aspect-[16/9] overflow-hidden rounded-[28px] border border-amber-200 shadow-xl shadow-amber-100/40 ${
                    invitation.id === highlightedInvitationId ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                  }`}
                >
                  <EventImageBackground invitation={invitation} />

                  <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <Badge className="border-amber-300 bg-amber-300/90 text-amber-950 shadow-sm">
                        {invitation.role}
                      </Badge>
                      <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                        {invitation.event?.startDate ? formatDate(invitation.event.startDate) : 'Date TBA'}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-amber-200/90">code.scriet invitation</p>
                        <h3 className="mt-2 font-serif text-3xl leading-tight text-white">
                          {invitation.event?.title || 'Event Invitation'}
                        </h3>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/85">
                          {invitation.event?.venue && (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" />
                              {invitation.event.venue}
                            </span>
                          )}
                          {invitation.event?.startDate && (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-4 w-4" />
                              {formatDateTime(invitation.event.startDate)}
                            </span>
                          )}
                        </div>
                        {invitation.customMessage && (
                          <p className="mt-4 max-w-2xl rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm leading-relaxed text-white/90 backdrop-blur">
                            {invitation.customMessage}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button
                          className="bg-amber-400 text-amber-950 hover:bg-amber-300"
                          disabled={isAccepting || isDeclining}
                          onClick={() => runAccept(invitation.id)}
                        >
                          {isAccepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          className="border-white/25 bg-white/10 text-white hover:bg-white/20"
                          disabled={isAccepting || isDeclining}
                          onClick={() => runDecline(invitation.id)}
                        >
                          {isDeclining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Decline
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <Card className="border-dashed border-amber-200 bg-amber-50/60">
          <CardContent className="py-10 text-center text-gray-600">
            No pending invitations right now.
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Accepted</h2>
          <p className="text-sm text-gray-500">Open the event page to view your live QR ticket.</p>
        </div>

        {acceptedInvitations.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-gray-500">
              Accepted invitations will appear here once you confirm them.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {acceptedInvitations.map((invitation) => (
              <Card
                key={invitation.id}
                id={`invitation-card-${invitation.id}`}
                className={`border-emerald-200 bg-white shadow-sm ${
                  invitation.id === highlightedInvitationId ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                }`}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl text-gray-900">{invitation.event?.title || 'Accepted Invitation'}</CardTitle>
                      <p className="mt-1 text-sm text-gray-500">{invitation.role}</p>
                    </div>
                    <InvitationStatusBadge status={invitation.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    {invitation.event?.startDate && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4 text-emerald-600" />
                        {getCountdownLabel(invitation.event.startDate)}
                      </span>
                    )}
                    {invitation.event?.venue && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-emerald-600" />
                        {invitation.event.venue}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Your guest registration is active. Open the event page to present the same QR ticket used by registered participants.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => navigate(getInvitationEventHref(invitation))}>
                      <QrCode className="mr-2 h-4 w-4" />
                      View QR
                    </Button>
                    {isFuture(invitation.event?.startDate) && (
                      <Button
                        variant="ghost"
                        className="text-gray-600 hover:text-red-700"
                        onClick={() => runDecline(invitation.id)}
                        disabled={actionState?.id === invitation.id && declineMutation.isPending}
                      >
                        <Reply className="mr-2 h-4 w-4" />
                        Change mind? Decline
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm"
          onClick={() => setHistoryOpen((current) => !current)}
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900">History</h2>
            <p className="text-sm text-gray-500">Declined, revoked, and expired invitations.</p>
          </div>
          {historyOpen ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
        </button>

        {historyOpen && (
          historyInvitations.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No historical invitations yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {historyInvitations.map((invitation) => {
                const canReaccept = invitation.status === 'DECLINED' && !isPast(invitation.event?.endDate || invitation.event?.startDate);

                return (
                  <Card
                    key={invitation.id}
                    id={`invitation-card-${invitation.id}`}
                    className={`border-slate-200 ${
                      invitation.id === highlightedInvitationId ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                    }`}
                  >
                    <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="truncate text-lg font-semibold text-gray-900">{invitation.event?.title || 'Invitation'}</h3>
                          <InvitationStatusBadge status={invitation.status} />
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {invitation.role}
                          {invitation.event?.startDate ? ` · ${formatDateTime(invitation.event.startDate)}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link to={getInvitationEventHref(invitation)}>
                          <Button variant="outline">View Event</Button>
                        </Link>
                        {canReaccept && (
                          <Button onClick={() => runAccept(invitation.id)}>
                            <Reply className="mr-2 h-4 w-4" />
                            Reconsider — Accept
                          </Button>
                        )}
                        {invitation.status === 'REVOKED' && (
                          <Button variant="ghost" disabled>
                            <XCircle className="mr-2 h-4 w-4" />
                            Withdrawn
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </section>
    </div>
  );
}
