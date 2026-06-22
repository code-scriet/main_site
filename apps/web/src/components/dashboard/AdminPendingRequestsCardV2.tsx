// Dashboard v2 — AdminPendingRequests (admin overview card).
// Two queues: Playground daily-limit reset requests + Extra submit-attempt requests.
// Pixel-port of screen-overview.jsx:450 (AdminPendingRequests).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, Terminal } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type PendingCapRequest, type PlaygroundLimitResetRequest } from '@/lib/api';
import { Avatar, Pill } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { relativeTime as sharedRelativeTime } from '@/lib/dateUtils';

// Card-specific wrapper: preserve the em-dash fallback for null timestamps.
function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  return sharedRelativeTime(iso) || '—';
}

export function AdminPendingRequestsCardV2() {
  const { token } = useAuth();
  const qc = useQueryClient();

  const playgroundQ = useQuery({
    queryKey: ['admin-pending-playground-reset'],
    queryFn: () => api.adminGetPendingPlaygroundResetRequests(token!),
    enabled: Boolean(token),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false, // don't poll a backgrounded dashboard tab
    refetchOnWindowFocus: true,
  });
  const capQ = useQuery({
    queryKey: ['admin-pending-cap-requests'],
    queryFn: () => api.adminGetPendingCapRequests(undefined, token!),
    enabled: Boolean(token),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const grantPlayground = useMutation({
    mutationFn: (id: string) => api.adminGrantPlaygroundResetRequest(id, token!),
    onSuccess: () => { toast.success('Reset granted'); qc.invalidateQueries({ queryKey: ['admin-pending-playground-reset'] }); },
    onError: () => toast.error('Failed to grant'),
  });
  const denyPlayground = useMutation({
    mutationFn: (id: string) => api.adminDenyPlaygroundResetRequest(id, token!),
    onSuccess: () => { toast.success('Denied'); qc.invalidateQueries({ queryKey: ['admin-pending-playground-reset'] }); },
    onError: () => toast.error('Failed to deny'),
  });
  const grantCap = useMutation({
    mutationFn: (counterId: string) => api.adminGrantCapRequest(counterId, token!),
    onSuccess: () => { toast.success('Cap raised'); qc.invalidateQueries({ queryKey: ['admin-pending-cap-requests'] }); },
    onError: () => toast.error('Failed to grant'),
  });
  const denyCap = useMutation({
    mutationFn: (counterId: string) => api.adminDenyCapRequest(counterId, token!),
    onSuccess: () => { toast.success('Denied'); qc.invalidateQueries({ queryKey: ['admin-pending-cap-requests'] }); },
    onError: () => toast.error('Failed to deny'),
  });

  const playground = (playgroundQ.data?.requests ?? []) as PlaygroundLimitResetRequest[];
  const caps = (capQ.data?.requests ?? []) as PendingCapRequest[];
  const total = playground.length + caps.length;

  return (
    <section>
      <header className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h2 className="text-[19px] font-semibold tracking-tight mt-1 leading-none">Pending requests</h2>
        </div>
        {total > 0 ? (
          <Pill tone="warning" size="sm">{total} waiting</Pill>
        ) : (
          <Pill tone="success" size="sm">All clear</Pill>
        )}
      </header>
      <div className="grid md:grid-cols-2 gap-x-8 border-y border-[var(--border-subtle)] py-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Cpu size={12} className="text-[var(--ds-text-3)]" />
            <span className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
              Playground · {playground.length}
            </span>
          </div>
          {playground.length === 0 ? (
            <div className="py-3 text-[12px] text-[var(--ds-text-3)] italic">Nothing waiting.</div>
          ) : (
            playground.map((r) => (
              <Row
                key={r.id}
                userName={r.user?.name ?? 'Unknown'}
                userAvatar={r.user?.avatar ?? null}
                note={r.note ?? '—'}
                subtitle={null}
                when={relativeTime(r.createdAt)}
                onDeny={() => denyPlayground.mutate(r.id)}
                onGrant={() => grantPlayground.mutate(r.id)}
                disabled={denyPlayground.isPending || grantPlayground.isPending}
              />
            ))
          )}
        </div>
        <div className="md:border-l md:border-[var(--border-subtle)] md:pl-8 mt-3 md:mt-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Terminal size={12} className="text-[var(--ds-text-3)]" />
            <span className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
              Submit attempts · {caps.length}
            </span>
          </div>
          {caps.length === 0 ? (
            <div className="py-3 text-[12px] text-[var(--ds-text-3)] italic">Nothing waiting.</div>
          ) : (
            caps.map((r) => (
              <Row
                key={r.id}
                userName={r.user?.name ?? 'Unknown'}
                userAvatar={r.user?.avatar ?? null}
                subtitle={r.problem?.title ?? null}
                note={r.note ?? '—'}
                when={relativeTime(r.requestedAt)}
                onDeny={() => denyCap.mutate(r.id)}
                onGrant={() => grantCap.mutate(r.id)}
                disabled={denyCap.isPending || grantCap.isPending}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Row({
  userName, userAvatar, subtitle, note, when, onDeny, onGrant, disabled,
}: {
  userName: string;
  userAvatar: string | null;
  subtitle: string | null;
  note: string;
  when: string;
  onDeny: () => void;
  onGrant: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-2 hover:bg-[var(--surface-soft)] -mx-2 rounded-[6px] transition-colors">
      <Avatar name={userName} src={userAvatar} size={26} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] leading-tight">
          <span className="font-medium text-[var(--ds-text-1)]">{userName}</span>
          {subtitle && <span className="text-[var(--ds-text-3)]"> · {subtitle}</span>}
        </div>
        <div className="text-[12px] text-[var(--ds-text-3)] truncate mt-0.5">
          {note === '—' || !note ? <span className="italic">no note</span> : note}
        </div>
      </div>
      <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums hidden sm:inline whitespace-nowrap">{when}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" disabled={disabled} onClick={onDeny}>Deny</Button>
        <Button size="sm" disabled={disabled} onClick={onGrant}>Grant</Button>
      </div>
    </div>
  );
}
