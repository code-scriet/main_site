// Dashboard v2 — My Invitations.
// Tabs: Pending / Accepted / Declined / Expired (derived). Accept/decline inline (optimistic).
// Deep-link via /dashboard/invitations/:invitationId expands a single card.
// Design source: screen-stubs.jsx:182-239 + brief §6.10.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Check, X, ExternalLink, MapPin, Calendar, QrCode } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type EventInvitation } from '@/lib/api';
import { Avatar, DSCard, EmptyState, Pill, UnderlineTabs } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { QRTicketSheet } from '@/components/attendance/QRTicket';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TabId = 'pending' | 'accepted' | 'declined' | 'expired';

function deriveStatus(inv: EventInvitation): TabId {
  if (inv.status === 'PENDING') {
    if (inv.event?.endDate && new Date(inv.event.endDate).getTime() < Date.now()) return 'expired';
    return 'pending';
  }
  if (inv.status === 'ACCEPTED') return 'accepted';
  if (inv.status === 'DECLINED') return 'declined';
  return 'expired';
}

export default function DashboardInvitations() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { invitationId } = useParams<{ invitationId?: string }>();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabId>('pending');
  // Guest QR-ticket sheet — restored from HEAD (E9). Loaded on demand per invitation event.
  const [ticketInvitation, setTicketInvitation] = useState<EventInvitation | null>(null);
  const qrQuery = useQuery({
    queryKey: ['my-qr', ticketInvitation?.event?.id],
    queryFn: () => api.getMyQR(ticketInvitation!.event!.id, token!),
    enabled: Boolean(ticketInvitation && ticketInvitation.event?.id && token),
  });

  const q = useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => api.getMyInvitations(token!),
    enabled: Boolean(token),
  });

  const grouped = useMemo(() => {
    const all = q.data ?? [];
    return {
      pending: all.filter((i) => deriveStatus(i) === 'pending'),
      accepted: all.filter((i) => deriveStatus(i) === 'accepted'),
      declined: all.filter((i) => deriveStatus(i) === 'declined'),
      expired: all.filter((i) => deriveStatus(i) === 'expired'),
    };
  }, [q.data]);

  // Auto-select tab for deep-linked invitation
  useEffect(() => {
    if (invitationId && q.data) {
      const found = q.data.find((i) => i.id === invitationId);
      if (found) setTab(deriveStatus(found));
    }
  }, [invitationId, q.data]);

  const items = grouped[tab];

  const acceptMut = useMutation({
    mutationFn: (id: string) => api.acceptInvitation(id, token!),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['my-invitations'] });
      const prev = qc.getQueryData<EventInvitation[]>(['my-invitations']);
      qc.setQueryData<EventInvitation[]>(['my-invitations'], (old) =>
        (old ?? []).map((i) => (i.id === id ? { ...i, status: 'ACCEPTED', respondedAt: new Date().toISOString() } : i)),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['my-invitations'], ctx.prev);
      toast.error('Could not accept');
    },
    onSuccess: () => {
      toast.success('Invitation accepted');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-invitations'] }),
  });

  const declineMut = useMutation({
    mutationFn: (id: string) => api.declineInvitation(id, token!),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['my-invitations'] });
      const prev = qc.getQueryData<EventInvitation[]>(['my-invitations']);
      qc.setQueryData<EventInvitation[]>(['my-invitations'], (old) =>
        (old ?? []).map((i) => (i.id === id ? { ...i, status: 'DECLINED', respondedAt: new Date().toISOString() } : i)),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['my-invitations'], ctx.prev);
      toast.error('Could not decline');
    },
    onSuccess: () => {
      toast.success('Invitation declined');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-invitations'] }),
  });

  const tabsItems = [
    { value: 'pending' as const, label: 'Pending', count: grouped.pending.length },
    { value: 'accepted' as const, label: 'Accepted', count: grouped.accepted.length },
    { value: 'declined' as const, label: 'Declined', count: grouped.declined.length },
    { value: 'expired' as const, label: 'Expired', count: grouped.expired.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">My invitations</h1>
        <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Accept or decline before the event starts.</p>
      </div>

      <UnderlineTabs items={tabsItems} value={tab} onChange={(v) => setTab(v as TabId)} />

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Inbox size={18} />}
            title={tab === 'pending' ? 'No pending invitations' : `Nothing in ${tab}`}
            body={
              tab === 'pending'
                ? "When someone invites you as a speaker, judge, or guest, you'll see it here."
                : 'Invitations move here once they change state.'
            }
          />
        </DSCard>
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {items.map((inv) => {
            const isExpanded = invitationId === inv.id;
            const startDate = inv.event?.startDate ? new Date(inv.event.startDate) : null;
            return (
              <DSCard key={inv.id} padded className={cn(isExpanded && 'ring-2 ring-[var(--accent-ring)]')}>
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-[8px] bg-[var(--surface-soft)] text-[var(--ds-text-3)] flex items-center justify-center shrink-0">
                    <Inbox size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Pill tone="accent" size="xs">{inv.role}</Pill>
                      {inv.certificateEnabled && (
                        <Pill tone="info" size="xs">+{inv.certificateType.toLowerCase()} certificate</Pill>
                      )}
                      <span className="text-[10.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
                        invited {new Date(inv.invitedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="text-[14px] font-semibold truncate">{inv.event?.title ?? 'Event'}</div>
                    <div className="text-[11.5px] text-[var(--ds-text-3)] mt-1 flex items-center gap-2 flex-wrap">
                      {inv.invitedBy?.name && (
                        <span className="inline-flex items-center gap-1">
                          <Avatar name={inv.invitedBy.name} size={14} />
                          from {inv.invitedBy.name}
                        </span>
                      )}
                      {startDate && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Calendar size={11} />
                          {startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {inv.event?.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} />
                          {inv.event.venue}
                        </span>
                      )}
                    </div>
                    {inv.customMessage && (
                      <p className={cn('text-[12.5px] text-[var(--ds-text-2)] mt-2 leading-relaxed', !isExpanded && 'line-clamp-2')}>
                        “{inv.customMessage}”
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-3 flex-wrap">
                  {tab === 'accepted' && inv.event && (
                    <Button size="sm" onClick={() => setTicketInvitation(inv)}>
                      <QrCode size={13} className="mr-1.5" />
                      View QR ticket
                    </Button>
                  )}
                  {inv.event && (
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/events/${inv.event!.slug || inv.event!.id}`)}>
                      <ExternalLink size={13} className="mr-1.5" />
                      Event page
                    </Button>
                  )}
                  {tab === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={declineMut.isPending}
                        onClick={() => declineMut.mutate(inv.id)}
                      >
                        <X size={13} className="mr-1.5" />
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={acceptMut.isPending}
                        onClick={() => acceptMut.mutate(inv.id)}
                      >
                        <Check size={13} className="mr-1.5" />
                        Accept
                      </Button>
                    </>
                  )}
                </div>
              </DSCard>
            );
          })}
        </div>
      )}

      {ticketInvitation && ticketInvitation.event && qrQuery.data && (
        <QRTicketSheet
          open={Boolean(ticketInvitation)}
          onOpenChange={(open) => !open && setTicketInvitation(null)}
          event={{
            title: ticketInvitation.event.title,
            startDate: ticketInvitation.event.startDate ?? null,
            endDate: ticketInvitation.event.endDate ?? null,
            status: ticketInvitation.event.status,
            eventType: ticketInvitation.event.eventType ?? undefined,
          }}
          attendanceToken={qrQuery.data.attendanceToken ?? null}
          attended={qrQuery.data.attended ?? false}
          scannedAt={qrQuery.data.scannedAt ?? null}
          intro={(
            <span className="text-[12px] text-[var(--ds-text-3)]">
              You're invited as <strong>{ticketInvitation.role}</strong>. Present this QR at the event entrance.
            </span>
          )}
        />
      )}
    </div>
  );
}
