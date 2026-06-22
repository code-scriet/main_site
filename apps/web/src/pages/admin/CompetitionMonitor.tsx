// Admin live monitor (Phase E + redesign) — a socket-first live console for a contest
// round. The /competition relay (on the idle playground server, Phase H) pushes every
// live event; the monitor consumes the PAYLOADS to append a human-readable event log and
// patch participant rows in place — the main API is only hit for the initial snapshot and
// a slow reconcile poll (fast poll only when the relay is down). Features: live log,
// per-participant lock/unlock (status-gated) + raise-cap + code/score override, round-wide
// raise-cap, extend time, unlock-all, clarifications broadcaster, plagiarism review.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useContestAdminSocket } from '@/hooks/useContestSocket';
import { useSettings } from '@/context/SettingsContext';
import {
  api,
  type CompetitionClarification,
  type CompetitionMonitorParticipant,
  type CompetitionSubmission,
  type SubmissionVerdict,
} from '@/lib/api';
import { violationLabel, type ViolationTone } from '@/lib/contestViolations';
import { extractApiErrorMessage } from '@/lib/error';
import { formatDateTime } from '@/lib/dateUtils';
import { Avatar, DSCard, EmptyState, NumericPromptDialog, Pill, StatTile } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Activity, AlertCircle, ChevronLeft, Code2, Copy, Download, GaugeCircle, Loader2, Lock,
  MessageSquarePlus, RefreshCw, ScrollText, Send, ShieldAlert, Timer, Unlock, Wifi, WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ONLINE_WINDOW_MS = 60_000;
const LOG_CAP = 200;
const DSA_VERDICTS: SubmissionVerdict[] = [
  'ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'JUDGE_ERROR',
];

type LogTone = ViolationTone | 'success' | 'info' | 'neutral';
interface LogEntry { id: string; at: number; tone: LogTone; who: string; text: string }

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtRemaining(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function CompetitionMonitor() {
  const { roundId = '' } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';

  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [clarification, setClarification] = useState('');
  const [posting, setPosting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const seededRef = useRef(false);
  const logSeenRef = useRef<Set<string>>(new Set());
  const nameByUserRef = useRef<Map<string, string>>(new Map()); // userId → name, for socket log rows

  // Optimistic lock/score patches applied from socket pushes so a row reflects a change
  // before the next reconcile poll lands.
  const [patches, setPatches] = useState<Record<string, Partial<CompetitionMonitorParticipant>>>({});

  // Live-only dialogs
  const [capTarget, setCapTarget] = useState<{ userId?: string; label: string } | null>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  const [subUser, setSubUser] = useState<{ userId: string; name: string } | null>(null);

  const monitorQuery = useQuery({
    queryKey: ['competition-monitor', roundId],
    queryFn: () => api.getCompetitionMonitor(roundId, token!),
    enabled: Boolean(roundId && token),
    // Socket-first: when the relay is connected the poll is just a slow reconcile; when it's
    // down it's the only channel, so poll fast. Never poll a backgrounded tab.
    refetchInterval: (q) => {
      const live = q.state.data?.round.status === 'ACTIVE' || q.state.data?.round.status === 'LOCKED';
      if (!live) return 20_000;
      return connected ? 30_000 : 8_000;
    },
    refetchIntervalInBackground: false,
  });
  const clarQuery = useQuery({
    queryKey: ['competition-monitor-clarifications', roundId],
    queryFn: () => api.getCompetitionClarifications(roundId, token!),
    enabled: Boolean(roundId && token),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const plagiarismEnabled = settings?.plagiarismCheckEnabled === true;
  const plagiarismQuery = useQuery({
    queryKey: ['competition-monitor-plagiarism', roundId],
    queryFn: () => api.getPlagiarismFlags(roundId, token!),
    enabled: Boolean(roundId && token) && plagiarismEnabled,
  });
  const [runningPlagiarism, setRunningPlagiarism] = useState(false);

  const monitor = monitorQuery.data;
  const status = monitor?.round.status;
  const isLive = status === 'ACTIVE' || status === 'LOCKED';

  const pushLog = useCallback((entry: LogEntry) => {
    if (logSeenRef.current.has(entry.id)) return;
    logSeenRef.current.add(entry.id);
    // Bound the dedup set over a long contest: rebuild it from the visible log when it grows
    // past a few caps' worth (older ids are off-screen and won't reappear in the 50/30 polls).
    if (logSeenRef.current.size > LOG_CAP * 3) logSeenRef.current = new Set([entry.id]);
    setLog((prev) => {
      const next = [entry, ...prev].slice(0, LOG_CAP);
      if (logSeenRef.current.size <= 1) for (const e of next) logSeenRef.current.add(e.id);
      return next;
    });
  }, []);

  // Seed the log once from the first server snapshot (the socket only carries events that
  // happen after the page opens). When the relay is DOWN, also merge new server rows on each
  // poll so the log keeps moving without a socket.
  useEffect(() => {
    if (!monitor) return;
    if (seededRef.current && connected) return;
    const seedViolations = monitor.recentViolations.map((v) => {
      const { label, tone } = violationLabel(v.kind, v.detail);
      return { id: `v:${v.id}`, at: new Date(v.at).getTime(), tone: tone as LogTone, who: v.userName, text: label };
    });
    const seedSubs = monitor.recentSubmissions.map((s) => ({
      id: `s:${s.id}:${s.updatedAt}`,
      at: new Date(s.updatedAt).getTime(),
      tone: (s.verdict === 'ACCEPTED' ? 'success' : s.score > 0 ? 'warning' : 'neutral') as LogTone,
      who: s.userName,
      text: `${s.verdict.replace(/_/g, ' ').toLowerCase()} · ${s.score}`,
    }));
    [...seedViolations, ...seedSubs]
      .sort((a, b) => a.at - b.at) // oldest first so pushLog prepends newest last
      .forEach(pushLog);
    seededRef.current = true;
  }, [monitor, connected, pushLog]);

  useContestAdminSocket(roundId, Boolean(roundId && token), {
    onConnectedChange: setConnected,
    onViolation: (e) => {
      const { label, tone } = violationLabel(e.kind, e.detail);
      pushLog({ id: `v:${e.userId}:${e.at ?? Date.now()}`, at: e.at ?? Date.now(), tone: tone as LogTone, who: e.userName ?? 'Participant', text: label });
      if (typeof e.violationCount === 'number') {
        setPatches((p) => ({ ...p, [e.userId]: { ...p[e.userId], violationCount: e.violationCount, lastViolationAt: new Date(e.at ?? Date.now()).toISOString() } }));
      }
    },
    onSubmission: (e) => {
      pushLog({
        id: `s:${e.userName}:${e.problemId}:${e.at ?? Date.now()}`,
        at: e.at ?? Date.now(),
        tone: (e.verdict === 'ACCEPTED' ? 'success' : e.score > 0 ? 'warning' : 'neutral') as LogTone,
        who: e.userName,
        text: `${e.verdict.replace(/_/g, ' ').toLowerCase()} · ${e.score}`,
      });
    },
    onParticipant: (e) => {
      setPatches((p) => ({ ...p, [e.userId]: { ...p[e.userId], locked: e.locked } }));
      pushLog({ id: `p:${e.userId}:${Date.now()}`, at: Date.now(), tone: e.locked ? 'danger' : 'success', who: nameByUserRef.current.get(e.userId) ?? 'Participant', text: e.locked ? 'was locked' : 'was unlocked' });
    },
    onFirstSolve: (e) => pushLog({ id: `f:${e.problemId}:${e.userName}`, at: Date.now(), tone: 'info', who: e.userName, text: 'First to solve a problem 🎈' }),
    onStatus: (e) => { pushLog({ id: `st:${e.status}:${Date.now()}`, at: Date.now(), tone: 'info', who: '', text: `Round → ${e.status}` }); void monitorQuery.refetch(); },
    onLeaderboard: () => { /* scores reconcile on the next slow poll; no per-tick main-API hit */ },
    onClarification: () => { void clarQuery.refetch(); },
  });

  // 1s countdown tick, only while ACTIVE and the tab is visible (free-tier + perf friendly).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'ACTIVE') return;
    const id = window.setInterval(() => { if (!document.hidden) setNowMs(Date.now()); }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const startedAt = monitor?.round.startedAt ?? null;
  const duration = monitor?.round.duration ?? null;
  const remainingSec = useMemo(() => {
    if (status !== 'ACTIVE' || !startedAt || !duration) return null;
    return duration - (nowMs - new Date(startedAt).getTime()) / 1000;
  }, [status, startedAt, duration, nowMs]);

  // Participants with optimistic socket patches merged in.
  const participants = useMemo(
    () => (monitor?.participants ?? []).map((p) => ({ ...p, ...patches[p.userId] })),
    [monitor?.participants, patches],
  );
  // Keep a userId → name map current so socket-only events (participant lock/unlock) can name
  // the row in the live log.
  useEffect(() => {
    for (const p of monitor?.participants ?? []) nameByUserRef.current.set(p.userId, p.name);
  }, [monitor?.participants]);
  // Clear a patch once the server snapshot agrees (avoids stale optimistic state).
  useEffect(() => {
    if (!monitor) return;
    setPatches((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of monitor.participants) {
        const patch = next[p.userId];
        if (patch && (patch.locked === undefined || patch.locked === p.locked) && (patch.violationCount === undefined || patch.violationCount === p.violationCount)) {
          delete next[p.userId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [monitor]);

  const runPlagiarism = useCallback(async () => {
    if (!token) return;
    setRunningPlagiarism(true);
    setError(null);
    try {
      await api.runPlagiarismCheck(roundId, token);
      await plagiarismQuery.refetch();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to run plagiarism check'));
    } finally {
      setRunningPlagiarism(false);
    }
  }, [token, roundId, plagiarismQuery]);

  const reviewFlag = useCallback(async (flagId: string, fStatus: 'REVIEWED' | 'DISMISSED') => {
    if (!token) return;
    try {
      await api.reviewPlagiarismFlag(roundId, flagId, fStatus, token);
      await plagiarismQuery.refetch();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to update flag'));
    }
  }, [token, roundId, plagiarismQuery]);

  const setLock = useCallback(async (userId: string, locked: boolean) => {
    if (!token) return;
    setBusyUser(userId);
    setError(null);
    try {
      if (locked) await api.lockCompetitionParticipant(roundId, userId, token);
      else await api.unlockCompetitionParticipant(roundId, userId, token);
      setPatches((p) => ({ ...p, [userId]: { ...p[userId], locked } }));
      await monitorQuery.refetch();
    } catch (err) {
      setError(extractApiErrorMessage(err, locked ? 'Failed to lock participant' : 'Failed to unlock participant'));
    } finally {
      setBusyUser(null);
    }
  }, [token, roundId, monitorQuery]);

  const unlockAll = useCallback(async () => {
    if (!token) return;
    const locked = participants.filter((p) => p.locked);
    if (locked.length === 0) return;
    setBusyUser('__all__');
    setError(null);
    try {
      await Promise.all(locked.map((p) => api.unlockCompetitionParticipant(roundId, p.userId, token)));
      await monitorQuery.refetch();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to unlock everyone'));
    } finally {
      setBusyUser(null);
    }
  }, [token, roundId, participants, monitorQuery]);

  const commitRaiseCap = useCallback(async (newCap: number) => {
    if (!token || !capTarget) return;
    setError(null);
    try {
      await api.raiseContestCap(roundId, { ...(capTarget.userId ? { userId: capTarget.userId } : {}), newCap }, token);
      pushLog({ id: `cap:${capTarget.userId ?? 'all'}:${Date.now()}`, at: Date.now(), tone: 'info', who: '', text: `Submit cap raised to ${newCap} (${capTarget.label})` });
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to raise cap'));
    } finally {
      setCapTarget(null);
    }
  }, [token, roundId, capTarget, pushLog]);

  const commitExtend = useCallback(async (addMinutes: number) => {
    if (!token) return;
    setError(null);
    try {
      await api.extendCompetitionRound(roundId, addMinutes, token);
      await monitorQuery.refetch();
      pushLog({ id: `ext:${Date.now()}`, at: Date.now(), tone: 'info', who: '', text: `Round extended by ${addMinutes} min` });
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to extend round'));
    } finally {
      setExtendOpen(false);
    }
  }, [token, roundId, monitorQuery, pushLog]);

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

  const isOnline = (lastSeenAt: string | null | undefined) => Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS);

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

  const lockedCount = participants.filter((p) => p.locked).length;
  const onlineCount = participants.filter((p) => isOnline(p.lastSeenAt)).length;
  const submissionCount = monitor.recentSubmissions.length;

  const toneClass: Record<LogTone, string> = {
    danger: 'bg-[var(--danger)]', warning: 'bg-[var(--warning)]', success: 'bg-[var(--success)]',
    info: 'bg-[var(--accent)]', neutral: 'bg-[var(--ds-text-3)]',
  };

  return (
    <div data-dashboard data-accent={accent} className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/admin/competition')} className="size-8 rounded-[8px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center" aria-label="Back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] text-[var(--ds-text-3)] flex items-center gap-1.5">
            Live monitor · {monitor.round.roundType === 'DSA' ? 'DSA' : 'Image Target'}
            <span className={cn('inline-flex items-center gap-1', connected ? 'text-[var(--success)]' : 'text-[var(--ds-text-3)]')}>
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {connected ? 'realtime' : 'polling'}
            </span>
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight truncate">{monitor.round.title}</h1>
        </div>
        <Pill tone={status === 'ACTIVE' ? 'success' : status === 'FINISHED' ? 'accent' : 'neutral'} dot={status === 'ACTIVE'} size="md">{status}</Pill>
        {isLive && (
          <Button variant="outline" size="sm" onClick={() => setExtendOpen(true)} className="gap-1.5"><Timer className="h-3.5 w-3.5" />Extend</Button>
        )}
        {isLive && (
          <Button variant="outline" size="sm" onClick={() => setCapTarget({ label: 'whole round' })} className="gap-1.5"><GaugeCircle className="h-3.5 w-3.5" />Raise cap</Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void exportCsv()} className="gap-1.5"><Download className="h-3.5 w-3.5" />CSV</Button>
        <Button variant="outline" size="sm" onClick={() => void exportCsv('violations')} className="gap-1.5"><Download className="h-3.5 w-3.5" />Violations</Button>
        <Button variant="outline" size="sm" onClick={() => void monitorQuery.refetch()} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
      </div>

      {status === 'FINISHED' && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[12.5px] text-[var(--ds-text-2)]">
          <ShieldAlert className="h-4 w-4 text-[var(--accent)]" />
          Contest ended — results are published and all participant locks were cleared. Live controls are disabled.
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Participants" value={String(participants.length)} />
        <StatTile label="Online" value={String(onlineCount)} />
        <StatTile label="Locked" value={String(lockedCount)} />
        <StatTile label={status === 'ACTIVE' ? 'Time left' : 'Submissions'} value={status === 'ACTIVE' && remainingSec != null ? fmtRemaining(remainingSec) : String(submissionCount)} />
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[12.5px]">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Participants */}
        <DSCard padded={false} className="lg:col-span-2">
          <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold">Participants</span>
            {isLive && lockedCount > 0 && (
              <Button size="sm" variant="ghost" disabled={busyUser === '__all__'} onClick={() => void unlockAll()} className="gap-1.5 text-[var(--ds-text-3)]">
                {busyUser === '__all__' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}Unlock all
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                  <th className="py-2 px-3">Participant</th>
                  <th className="py-2 px-3 text-right">Score</th>
                  <th className="py-2 px-3 text-right">Rank</th>
                  <th className="py-2 px-3 text-center">Flags</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.userId} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]/40">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="relative">
                          <Avatar name={p.name} size={26} />
                          {isOnline(p.lastSeenAt) && <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-[var(--success)] border border-[var(--bg-raised)]" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate flex items-center gap-1.5">
                            {p.name}
                            {p.locked && <Lock className="h-3 w-3 text-[var(--danger)]" />}
                          </p>
                          {p.email && <p className="text-[11px] text-[var(--ds-text-3)] truncate font-mono">{p.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">{p.score}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--ds-text-2)]">{p.rank ?? '—'}</td>
                    <td className="py-2.5 px-3 text-center">
                      {p.violationCount > 0 ? <Pill tone="warning" size="xs">{p.violationCount}</Pill> : <span className="text-[var(--ds-text-3)]">0</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setSubUser({ userId: p.userId, name: p.name })} title="View code & change marks" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center">
                          <Code2 className="h-3.5 w-3.5" />
                        </button>
                        {isLive && (
                          <button onClick={() => setCapTarget({ userId: p.userId, label: p.name })} title="Raise this participant's submit cap" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center">
                            <GaugeCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isLive && (p.locked ? (
                          <Button size="sm" variant="outline" disabled={busyUser === p.userId} onClick={() => void setLock(p.userId, false)} className="gap-1.5 text-[var(--danger)] border-[var(--danger-border)]">
                            {busyUser === p.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}Unlock
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={busyUser === p.userId} onClick={() => void setLock(p.userId, true)} className="gap-1.5 text-[var(--ds-text-3)]" title="Lock this participant">
                            {busyUser === p.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}Lock
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {participants.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-[var(--ds-text-3)]">No participants yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DSCard>

        {/* Right column: live log + clarifications */}
        <div className="flex flex-col gap-4">
          <DSCard padded={false}>
            <div className="p-3 border-b border-[var(--border-subtle)] text-[13.5px] font-semibold flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-[var(--accent)]" />Live log
              <span className="ml-auto text-[10.5px] font-normal text-[var(--ds-text-3)]">{log.length}</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {log.map((e) => (
                <div key={e.id} className="px-3 py-1.5 border-b border-[var(--border-subtle)] flex items-start gap-2 text-[12px]">
                  <span className={cn('mt-1 size-2 rounded-full shrink-0', toneClass[e.tone])} />
                  <span className="flex-1 min-w-0">
                    {e.who && <span className="font-medium">{e.who} </span>}
                    <span className="text-[var(--ds-text-2)]">{e.text}</span>
                  </span>
                  <span className="text-[10px] text-[var(--ds-text-3)] tabular-nums shrink-0">{clockTime(e.at)}</span>
                </div>
              ))}
              {log.length === 0 && (
                <div className="py-8 text-center text-[12px] text-[var(--ds-text-3)] flex flex-col items-center gap-1.5">
                  <ScrollText className="h-5 w-5 opacity-50" />No events yet.
                </div>
              )}
            </div>
          </DSCard>

          <DSCard>
            <div className="text-[13.5px] font-semibold mb-2 flex items-center gap-1.5"><MessageSquarePlus className="h-4 w-4" />Broadcast clarification</div>
            <Textarea value={clarification} onChange={(e) => setClarification(e.target.value)} rows={3} maxLength={2000} placeholder="Announce a clarification to all contestants…" />
            <div className="flex justify-end mt-2">
              <Button size="sm" disabled={posting || !clarification.trim()} onClick={() => void postClarification()} className="gap-1.5">
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Send
              </Button>
            </div>
            <div className="mt-3 space-y-2 max-h-[160px] overflow-y-auto">
              {(clarQuery.data?.clarifications ?? []).map((c: CompetitionClarification) => (
                <div key={c.id} className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2.5 py-1.5">
                  <p className="text-[12px] text-[var(--ds-text-1)] whitespace-pre-wrap">{c.message}</p>
                  <p className="text-[10.5px] text-[var(--ds-text-3)] mt-0.5">{formatDateTime(c.createdAt)}</p>
                </div>
              ))}
            </div>
          </DSCard>
        </div>
      </div>

      {/* Plagiarism review (Phase H4) — admin-run, human-in-the-loop. */}
      {plagiarismEnabled && (
        <DSCard padded={false}>
          <div className="p-3 flex items-center justify-between gap-2 flex-wrap border-b border-[var(--border-subtle)]">
            <div>
              <div className="text-[13.5px] font-semibold flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />Plagiarism review</div>
              <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">Code-similarity suspicions for you to judge — not automatic penalties.</div>
            </div>
            <Button size="sm" disabled={runningPlagiarism} onClick={() => void runPlagiarism()} className="gap-1.5">
              {runningPlagiarism ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Run check
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                  <th className="py-2 px-3">Problem</th>
                  <th className="py-2 px-3">Pair</th>
                  <th className="py-2 px-3 text-right">Similarity</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Review</th>
                </tr>
              </thead>
              <tbody>
                {(plagiarismQuery.data?.flags ?? []).map((f) => (
                  <tr key={f.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]/40">
                    <td className="py-2.5 px-3 text-[var(--ds-text-2)] truncate max-w-[180px]">{f.problemTitle}</td>
                    <td className="py-2.5 px-3 font-medium">{f.userAName} <span className="text-[var(--ds-text-3)]">↔</span> {f.userBName}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                      <span className={cn(f.similarity >= 0.9 ? 'text-[var(--danger)]' : f.similarity >= 0.8 ? 'text-[var(--warning)]' : 'text-[var(--ds-text-2)]')}>
                        {Math.round(f.similarity * 100)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <Pill tone={f.status === 'REVIEWED' ? 'danger' : f.status === 'DISMISSED' ? 'neutral' : 'warning'} size="xs">{f.status}</Pill>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => void reviewFlag(f.id, 'REVIEWED')} title="Mark as confirmed/suspicious">Flag</Button>
                        <Button size="sm" variant="ghost" onClick={() => void reviewFlag(f.id, 'DISMISSED')} className="text-[var(--ds-text-3)]" title="False positive">Dismiss</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(plagiarismQuery.data?.flags?.length ?? 0) === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-[12px] text-[var(--ds-text-3)]">No flags. Run a check after submissions come in.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DSCard>
      )}

      {/* Raise-cap dialog (per-participant or round-wide) */}
      {capTarget && (
        <NumericPromptDialog
          open
          onOpenChange={(o) => !o && setCapTarget(null)}
          title={`Raise submit cap — ${capTarget.label}`}
          description="New per-problem submission cap for the contest context."
          defaultValue={20}
          min={1}
          max={100}
          confirmLabel="Raise cap"
          onCommit={(v) => void commitRaiseCap(v)}
        />
      )}
      {/* Extend dialog */}
      {extendOpen && (
        <NumericPromptDialog
          open
          onOpenChange={(o) => !o && setExtendOpen(false)}
          title="Extend round"
          description="Add minutes to the live timer — the countdown extends for everyone."
          defaultValue={5}
          min={1}
          max={600}
          confirmLabel="Extend"
          onCommit={(v) => void commitExtend(v)}
        />
      )}

      {/* Submission code + score/verdict dialog */}
      {subUser && (
        <SubmissionDialog
          roundId={roundId}
          token={token!}
          user={subUser}
          roundType={monitor.round.roundType}
          onClose={() => setSubUser(null)}
          onChanged={() => void monitorQuery.refetch()}
          accent={accent}
        />
      )}
    </div>
  );
}

// ── Submission code viewer + inline score/verdict override ──────────────────────────────
// Lazy-loads the round's submissions (admin endpoint returns CODE) and filters to the
// selected participant. DSA → /problems override (score+verdict); IMAGE_TARGET →
// competition score. Closes the monitor's "can't view code / change marks" gap.
function SubmissionDialog({
  roundId, token, user, roundType, onClose, onChanged, accent,
}: {
  roundId: string;
  token: string;
  user: { userId: string; name: string };
  roundType?: 'IMAGE_TARGET' | 'DSA';
  onClose: () => void;
  onChanged: () => void;
  accent: string;
}) {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<CompetitionSubmission[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { score: string; verdict: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.getCompetitionSubmissions(roundId, token);
      setSubs(res.submissions.filter((s) => s.userId === user.userId));
    } catch (e) {
      setErr(extractApiErrorMessage(e, 'Failed to load submissions'));
    } finally {
      setLoading(false);
    }
  }, [roundId, token, user.userId]);

  useEffect(() => { void load(); }, [load]);

  const saveOverride = useCallback(async (sub: CompetitionSubmission) => {
    const d = draft[sub.id] ?? { score: String(sub.score ?? 0), verdict: sub.verdict ?? '' };
    const scoreNum = d.score.trim() === '' ? undefined : Number(d.score);
    if (scoreNum !== undefined && (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
      setErr('Score must be between 0 and 100');
      return;
    }
    setBusy(sub.id);
    setErr(null);
    try {
      if (roundType === 'DSA' && sub.problemId) {
        await api.adminOverrideSubmission(sub.problemId, sub.id, {
          ...(scoreNum !== undefined ? { score: scoreNum } : {}),
          ...(d.verdict ? { verdict: d.verdict as SubmissionVerdict } : {}),
        }, token);
      } else {
        await api.scoreCompetitionSubmission(roundId, sub.id, { ...(scoreNum !== undefined ? { score: scoreNum } : {}) }, token);
      }
      await load();
      onChanged();
    } catch (e) {
      setErr(extractApiErrorMessage(e, 'Failed to save'));
    } finally {
      setBusy(null);
    }
  }, [draft, roundType, roundId, token, load, onChanged]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-dashboard data-accent={accent} className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submissions — {user.name}</DialogTitle>
          <DialogDescription>View submitted code and override score{roundType === 'DSA' ? ' / verdict' : ''}.</DialogDescription>
        </DialogHeader>
        {err && <div className="px-3 py-2 rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[12px]">{err}</div>}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" /></div>
        ) : subs.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--ds-text-3)]">No submissions from this participant yet.</p>
        ) : (
          <div className="space-y-4">
            {subs.map((sub) => {
              const d = draft[sub.id] ?? { score: String(sub.score ?? 0), verdict: sub.verdict ?? '' };
              return (
                <div key={sub.id} className="rounded-[10px] border border-[var(--border-subtle)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--surface-soft)] border-b border-[var(--border-subtle)] flex items-center gap-2 flex-wrap">
                    <span className="text-[12.5px] font-semibold">{sub.problemTitle ?? 'Submission'}</span>
                    {sub.verdict && <Pill tone={sub.verdict === 'ACCEPTED' ? 'success' : 'neutral'} size="xs">{sub.verdict}</Pill>}
                    <span className="text-[11px] text-[var(--ds-text-3)] font-mono">{sub.language ?? ''}</span>
                    <span className="ml-auto text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">{sub.passedCount ?? 0}/{sub.totalCount ?? 0} · {sub.score ?? 0}</span>
                    <button onClick={() => void navigator.clipboard.writeText(sub.code)} title="Copy code" className="size-6 rounded-[6px] hover:bg-[var(--bg-raised)] text-[var(--ds-text-3)] flex items-center justify-center"><Copy className="h-3 w-3" /></button>
                  </div>
                  <pre className="max-h-[240px] overflow-auto bg-[var(--bg-sunken)] p-3 text-[11.5px] leading-relaxed font-mono whitespace-pre">{sub.code || '— empty —'}</pre>
                  <div className="px-3 py-2 flex items-center gap-2 flex-wrap border-t border-[var(--border-subtle)]">
                    <label className="text-[11.5px] text-[var(--ds-text-3)]">Score</label>
                    <input
                      type="number" min={0} max={100} step={0.5} value={d.score}
                      onChange={(e) => setDraft((p) => ({ ...p, [sub.id]: { ...d, score: e.target.value } }))}
                      className="h-7 w-20 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2 text-[12px] focus:border-[var(--accent)] outline-none"
                    />
                    {roundType === 'DSA' && (
                      <select
                        value={d.verdict}
                        onChange={(e) => setDraft((p) => ({ ...p, [sub.id]: { ...d, verdict: e.target.value } }))}
                        className="h-7 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2 text-[11.5px] focus:border-[var(--accent)] outline-none"
                      >
                        <option value="">Keep verdict</option>
                        {DSA_VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    )}
                    <Button size="sm" disabled={busy === sub.id} onClick={() => void saveOverride(sub)} className="gap-1.5 ml-auto">
                      {busy === sub.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Save override
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
