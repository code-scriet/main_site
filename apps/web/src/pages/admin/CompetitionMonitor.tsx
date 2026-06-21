// Admin live monitor (Phase E) — real-time-ish (polling) view of a contest round:
// participants with online/lock/violation state + live score, a recent-submission feed,
// and a clarifications broadcaster. Drives the proctor unlock action. Polling respects
// the free-tier (no dedicated competition socket).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useContestAdminSocket } from '@/hooks/useContestSocket';
import { useSettings } from '@/context/SettingsContext';
import { api, type CompetitionClarification } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { formatDateTime } from '@/lib/dateUtils';
import { Avatar, DSCard, EmptyState, Pill } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, ChevronLeft, Download, Loader2, Lock, MessageSquarePlus, RefreshCw, Send, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';

const ONLINE_WINDOW_MS = 60_000;

export default function CompetitionMonitor() {
  const { roundId = '' } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';

  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [clarification, setClarification] = useState('');
  const [posting, setPosting] = useState(false);

  const monitorQuery = useQuery({
    queryKey: ['competition-monitor', roundId],
    queryFn: () => api.getCompetitionMonitor(roundId, token!),
    enabled: Boolean(roundId && token),
    refetchInterval: (q) => (q.state.data?.round.status === 'ACTIVE' || q.state.data?.round.status === 'LOCKED' ? 8_000 : 20_000),
  });
  const clarQuery = useQuery({
    queryKey: ['competition-monitor-clarifications', roundId],
    queryFn: () => api.getCompetitionClarifications(roundId, token!),
    enabled: Boolean(roundId && token),
    refetchInterval: 20_000,
  });

  const monitor = monitorQuery.data;

  // Live push: any contest event refreshes the monitor (debounced so a burst of submits
  // coalesces) — no manual reload. The 8s poll above stays as a fallback.
  const refetchTimerRef = useRef<number | null>(null);
  useContestAdminSocket(roundId, Boolean(roundId && token), {
    onChange: () => {
      if (refetchTimerRef.current) return;
      refetchTimerRef.current = window.setTimeout(() => {
        refetchTimerRef.current = null;
        void monitorQuery.refetch();
      }, 1200);
    },
    onClarification: () => { void clarQuery.refetch(); },
  });
  useEffect(() => () => { if (refetchTimerRef.current) window.clearTimeout(refetchTimerRef.current); }, []);

  const setLock = useCallback(async (userId: string, locked: boolean) => {
    if (!token) return;
    setUnlocking(userId);
    setError(null);
    try {
      if (locked) await api.lockCompetitionParticipant(roundId, userId, token);
      else await api.unlockCompetitionParticipant(roundId, userId, token);
      await monitorQuery.refetch();
    } catch (err) {
      setError(extractApiErrorMessage(err, locked ? 'Failed to lock participant' : 'Failed to unlock participant'));
    } finally {
      setUnlocking(null);
    }
  }, [token, roundId, monitorQuery]);

  const exportCsv = useCallback(async (sheet?: 'violations') => {
    if (!token) return;
    try {
      const blob = await api.exportCompetitionMonitor(roundId, token, sheet);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${monitor?.round.title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'round'}-${sheet ?? 'monitor'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Export failed'));
    }
  }, [token, roundId, monitor]);

  const postClarification = useCallback(async () => {
    if (!token || !clarification.trim()) return;
    setPosting(true);
    setError(null);
    try {
      await api.postCompetitionClarification(roundId, clarification.trim(), token);
      setClarification('');
      await clarQuery.refetch();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to post clarification'));
    } finally {
      setPosting(false);
    }
  }, [token, roundId, clarification, clarQuery]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error]);

  const isOnline = (lastSeenAt: string | null) => Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS);

  if (monitorQuery.isLoading) {
    return <div data-dashboard data-accent={accent} className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" /></div>;
  }
  if (monitorQuery.isError || !monitor) {
    return (
      <div data-dashboard data-accent={accent}>
        <DSCard>
          <EmptyState icon={<AlertCircle size={18} />} title="Round not found" body="It may have been deleted or you don't have access." action={<Button size="sm" onClick={() => navigate('/admin/competition')}>Back to rounds</Button>} />
        </DSCard>
      </div>
    );
  }

  const lockedCount = monitor.participants.filter((p) => p.locked).length;
  const onlineCount = monitor.participants.filter((p) => isOnline(p.lastSeenAt)).length;

  return (
    <div data-dashboard data-accent={accent} className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/admin/competition')} className="size-8 rounded-[8px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" aria-label="Back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] text-[var(--ds-text-3)]">Live monitor · {monitor.round.roundType === 'DSA' ? 'DSA' : 'Image Target'}</div>
          <h1 className="text-[20px] font-semibold tracking-tight truncate">{monitor.round.title}</h1>
        </div>
        <Pill tone={monitor.round.status === 'ACTIVE' ? 'success' : 'neutral'} dot={monitor.round.status === 'ACTIVE'} size="md">{monitor.round.status}</Pill>
        <Button variant="outline" size="sm" onClick={() => void exportCsv()} className="gap-1.5"><Download className="h-3.5 w-3.5" />CSV</Button>
        <Button variant="outline" size="sm" onClick={() => void exportCsv('violations')} className="gap-1.5"><Download className="h-3.5 w-3.5" />Violations</Button>
        <Button variant="outline" size="sm" onClick={() => void monitorQuery.refetch()} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill tone="info" size="sm">{monitor.participants.length} participant{monitor.participants.length === 1 ? '' : 's'}</Pill>
        <Pill tone="success" size="sm" dot>{onlineCount} online</Pill>
        {lockedCount > 0 && <Pill tone="danger" size="sm" icon={<Lock size={11} />}>{lockedCount} locked</Pill>}
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[12.5px]">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Participants */}
        <DSCard padded={false} className="lg:col-span-2">
          <div className="p-3 border-b border-[var(--border-subtle)] text-[13.5px] font-semibold">Participants</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                  <th className="py-2 px-3">Participant</th>
                  <th className="py-2 px-3 text-right">Score</th>
                  <th className="py-2 px-3 text-right">Rank</th>
                  <th className="py-2 px-3 text-center">Violations</th>
                  <th className="py-2 px-3 text-right">State</th>
                </tr>
              </thead>
              <tbody>
                {monitor.participants.map((p) => (
                  <tr key={p.userId} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]/40">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="relative">
                          <Avatar name={p.name} size={26} />
                          {isOnline(p.lastSeenAt) && <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-[var(--success)] border border-[var(--bg-raised)]" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          {p.email && <p className="text-[11px] text-[var(--ds-text-3)] truncate font-mono">{p.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">{p.score}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--ds-text-2)]">{p.rank ?? '—'}</td>
                    <td className="py-2.5 px-3 text-center">
                      {p.violationCount > 0 ? <Pill tone="warning" size="xs">{p.violationCount}</Pill> : <span className="text-[var(--ds-text-3)]">0</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {p.locked ? (
                        <Button size="sm" variant="outline" disabled={unlocking === p.userId} onClick={() => void setLock(p.userId, false)} className="gap-1.5 text-[var(--danger)] border-[var(--danger-border)]">
                          {unlocking === p.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                          Unlock
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={unlocking === p.userId} onClick={() => void setLock(p.userId, true)} className="gap-1.5 text-[var(--ds-text-3)]" title="Lock this participant">
                          {unlocking === p.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                          Lock
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {monitor.participants.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-[var(--ds-text-3)]">No participants yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DSCard>

        {/* Right column: clarifications + feed */}
        <div className="flex flex-col gap-4">
          <DSCard>
            <div className="text-[13.5px] font-semibold mb-2 flex items-center gap-1.5"><MessageSquarePlus className="h-4 w-4" />Broadcast clarification</div>
            <Textarea value={clarification} onChange={(e) => setClarification(e.target.value)} rows={3} maxLength={2000} placeholder="Announce a clarification to all contestants…" />
            <div className="flex justify-end mt-2">
              <Button size="sm" disabled={posting || !clarification.trim()} onClick={() => void postClarification()} className="gap-1.5">
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Send
              </Button>
            </div>
            <div className="mt-3 space-y-2 max-h-[180px] overflow-y-auto">
              {(clarQuery.data?.clarifications ?? []).map((c: CompetitionClarification) => (
                <div key={c.id} className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2.5 py-1.5">
                  <p className="text-[12px] text-[var(--ds-text-1)] whitespace-pre-wrap">{c.message}</p>
                  <p className="text-[10.5px] text-[var(--ds-text-3)] mt-0.5">{formatDateTime(c.createdAt)}</p>
                </div>
              ))}
            </div>
          </DSCard>

          <DSCard padded={false}>
            <div className="p-3 border-b border-[var(--border-subtle)] text-[13.5px] font-semibold">Recent submissions</div>
            <div className="max-h-[280px] overflow-y-auto">
              {monitor.recentSubmissions.map((s) => (
                <div key={s.id} className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-2 text-[12px]">
                  <span className={cn('size-2 rounded-full shrink-0', s.verdict === 'ACCEPTED' ? 'bg-[var(--success)]' : s.score > 0 ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]')} />
                  <span className="flex-1 min-w-0 truncate font-medium">{s.userName}</span>
                  <span className="font-mono tabular-nums text-[var(--ds-text-2)]">{s.score}</span>
                  <span className="text-[10.5px] text-[var(--ds-text-3)]">{s.verdict}</span>
                </div>
              ))}
              {monitor.recentSubmissions.length === 0 && <div className="py-8 text-center text-[12px] text-[var(--ds-text-3)]">No submissions yet.</div>}
            </div>
          </DSCard>
        </div>
      </div>
    </div>
  );
}
