// Admin Competition page — round lifecycle management.
// Design source: code-scriet-innerdashboard/project/js/screen-admin.jsx
//   - AdminCompetitionScreen (lines 371-431) — header, round-card grid, global lifecycle stepper.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, type CompetitionRound, type Event, type EventTeam, type Problem } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { getPlaygroundLaunchUrl, getPlaygroundPublicUrl } from '@/lib/playgroundUrl';
import { useSettings } from '@/context/SettingsContext';
import { DSCard, EmptyState, Pill, type PillTone } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RoundActionDialog } from '@/components/admin/competition/RoundActionDialog';
import { NumericPromptDialog } from '@/components/dash';
import {
  Activity,
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type FormState = {
  eventId: string;
  title: string;
  description: string;
  durationMinutes: number;
  participantScope: 'ALL' | 'SELECTED_TEAMS';
  leadersOnly: boolean;
  allowedTeamIds: string[];
  targetImageUrl: string;
  roundType: 'IMAGE_TARGET' | 'DSA';
  problems: Array<{ problemId: string; displayOrder: number; points: number }>;
  // Contest config (redesign). finalWeight = this round's raw weight in the event-final;
  // penaltyModel / proctored / freeze drive ranking + the live arena.
  finalWeight: number;
  proctored: boolean;
  penaltyModel: 'BEST_SCORE' | 'ICPC';
  teamAggregation: 'BEST_PER_PROBLEM' | 'AVERAGE' | 'BEST_MEMBER';
  leaderboardFreezeMinutes: number;
};

const DEFAULT_FORM: FormState = {
  eventId: '',
  title: '',
  description: '',
  durationMinutes: 30,
  participantScope: 'ALL',
  leadersOnly: false,
  allowedTeamIds: [],
  targetImageUrl: '',
  roundType: 'IMAGE_TARGET',
  problems: [],
  finalWeight: 1,
  proctored: false,
  penaltyModel: 'BEST_SCORE',
  teamAggregation: 'BEST_PER_PROBLEM',
  leaderboardFreezeMinutes: 0,
};

// Default per-problem weight seeded from difficulty (the admin can still override).
const DIFFICULTY_WEIGHT: Record<string, number> = { EASY: 100, MEDIUM: 200, HARD: 300 };
function seedWeightFromDifficulty(difficulty?: string): number {
  return DIFFICULTY_WEIGHT[(difficulty || '').toUpperCase()] ?? 100;
}

// Map each round status to a dashboard v2 Pill tone (matches design line 387).
const statusPill: Record<CompetitionRound['status'], { tone: PillTone; label: string; dot: boolean }> = {
  DRAFT:    { tone: 'neutral', label: 'Draft',    dot: false },
  ACTIVE:   { tone: 'success', label: 'Active',   dot: true  },
  LOCKED:   { tone: 'warning', label: 'Locked',   dot: false },
  JUDGING:  { tone: 'info',    label: 'Judging',  dot: false },
  FINISHED: { tone: 'accent',  label: 'Finished', dot: false },
};

const LIFECYCLE: Array<CompetitionRound['status']> = ['DRAFT', 'ACTIVE', 'LOCKED', 'JUDGING', 'FINISHED'];
const LIFECYCLE_LABELS: Record<CompetitionRound['status'], string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Start',
  LOCKED: 'Lock',
  JUDGING: 'Judging',
  FINISHED: 'Finish',
};

// Inline per-card lifecycle indicator (one chip per stage, highlights current).
// Design line 412-427 has this as a global stepper; we use a per-card slim
// version to keep the at-a-glance "where is this round" cue per row.
function LifecycleStepper({ status }: { status: CompetitionRound['status'] }) {
  const activeIdx = LIFECYCLE.indexOf(status);
  return (
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] font-semibold">
      {LIFECYCLE.map((s, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        return (
          <div key={s} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center justify-center size-[6px] rounded-full',
                current ? 'bg-[var(--accent)]' : done ? 'bg-[var(--accent)]/40' : 'bg-[var(--border-default)]',
              )}
            />
            <span
              className={cn(
                current ? 'text-[var(--ds-text-1)]' : done ? 'text-[var(--ds-text-2)]' : 'text-[var(--ds-text-3)]',
              )}
            >
              {LIFECYCLE_LABELS[s]}
            </span>
            {i < LIFECYCLE.length - 1 && (
              <span className={cn('h-px w-2', done ? 'bg-[var(--accent)]/40' : 'bg-[var(--border-subtle)]')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatRemaining(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '--:--';
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export default function AdminCompetition() {
  const { token } = useAuth();
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [roundsByEvent, setRoundsByEvent] = useState<Record<string, CompetitionRound[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<CompetitionRound | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [eventTeamsMap, setEventTeamsMap] = useState<Record<string, EventTeam[]>>({});
  // NumericPromptDialog replaces the window.prompt for "raise submit cap" on a round.
  const [capTarget, setCapTarget] = useState<CompetitionRound | null>(null);
  const [extendTarget, setExtendTarget] = useState<CompetitionRound | null>(null);
  const [finalEvent, setFinalEvent] = useState<Event | null>(null);
  const [problemCatalog, setProblemCatalog] = useState<Problem[]>([]);
  const [roundActionDialog, setRoundActionDialog] = useState<{
    action: 'start' | 'lock' | 'delete';
    round: CompetitionRound;
  } | null>(null);

  const getCompetitionRoundUrl = (round: CompetitionRound) => {
    if (round.roundType === 'DSA') {
      const firstProblem = ((round.problems ?? [])[0] as unknown as { id?: string; problemId?: string; problem?: Problem }) ?? {};
      const problemId = firstProblem.problem?.id ?? firstProblem.problemId ?? firstProblem.id;
      return problemId ? `/competition/${round.id}/solve/${problemId}` : `/competition/${round.id}/results`;
    }
    return getPlaygroundLaunchUrl(`/competition/${round.id}`);
  };

  const getCompetitionRoundPublicUrl = (round: CompetitionRound) => {
    if (round.roundType === 'DSA') {
      const firstProblem = ((round.problems ?? [])[0] as unknown as { id?: string; problemId?: string; problem?: Problem }) ?? {};
      const problemId = firstProblem.problem?.id ?? firstProblem.problemId ?? firstProblem.id;
      return problemId ? `${window.location.origin}/competition/${round.id}/solve/${problemId}` : `${window.location.origin}/competition/${round.id}/results`;
    }
    return getPlaygroundPublicUrl(`/competition/${round.id}`);
  };

  const filteredEvents = useMemo(() => {
    const query = eventFilter.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) => event.title.toLowerCase().includes(query));
  }, [events, eventFilter]);

  const selectedEvents = selectedEventId
    ? filteredEvents.filter((event) => event.id === selectedEventId)
    : filteredEvents;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const fetchedEvents = await api.getEvents();
      setEvents(fetchedEvents);
      const fetchedProblems = await api.adminGetProblems(token);
      setProblemCatalog(fetchedProblems.problems);

      const roundsEntries = await Promise.all(fetchedEvents.map(async (event) => {
        const response = await api.getCompetitionRoundsAdmin(event.id, token);
        return [event.id, response.rounds] as const;
      }));
      setRoundsByEvent(Object.fromEntries(roundsEntries));

      const teamEvents = fetchedEvents.filter((event) => event.teamRegistration);
      const teamsEntries = await Promise.all(teamEvents.map(async (event) => {
        try {
          const response = await api.getEventTeams(event.id, token);
          return [event.id, response.teams.map((team) => ({ ...team, eventId: event.id }))] as const;
        } catch {
          return [event.id, []] as const;
        }
      }));
      setEventTeamsMap(Object.fromEntries(teamsEntries));
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to load competition data'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live-round poll: refresh ONLY the rounds of events that currently have an ACTIVE
  // round — not the full load() (events list + problem catalog + every event's
  // rounds/teams). Keeps the 10s tick cheap while a round is running.
  //
  // `refreshActiveRounds` reads the latest rounds from a ref (not a closure dep) so it
  // stays referentially stable — otherwise it would be re-created on every poll (each
  // poll calls setRoundsByEvent), tearing down and recreating the interval each tick.
  const roundsByEventRef = useRef(roundsByEvent);
  useEffect(() => {
    roundsByEventRef.current = roundsByEvent;
  }, [roundsByEvent]);

  const refreshActiveRounds = useCallback(async () => {
    if (!token) return;
    const activeEventIds = Object.entries(roundsByEventRef.current)
      .filter(([, list]) => list.some((round) => round.status === 'ACTIVE'))
      .map(([eventId]) => eventId);
    if (activeEventIds.length === 0) return;
    try {
      const entries = await Promise.all(activeEventIds.map(async (eventId) => {
        const response = await api.getCompetitionRoundsAdmin(eventId, token);
        return [eventId, response.rounds] as const;
      }));
      setRoundsByEvent((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    } catch {
      // transient poll failure — keep the last good rounds; next tick retries.
    }
  }, [token]);

  // A boolean gate (not roundsByEvent itself) so the interval is created once when a
  // round goes active and torn down once it ends — it doesn't re-arm on every poll.
  const hasActiveRound = useMemo(
    () => Object.values(roundsByEvent).some((list) =>
      list.some((round) => round.status === 'ACTIVE'),
    ),
    [roundsByEvent],
  );

  useEffect(() => {
    if (!hasActiveRound) return;
    const id = window.setInterval(() => {
      void refreshActiveRounds();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [hasActiveRound, refreshActiveRounds]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const openCreate = (eventId?: string) => {
    const resolvedEventId = eventId || selectedEventId || filteredEvents[0]?.id || '';
    setForm({
      ...DEFAULT_FORM,
      eventId: resolvedEventId,
      participantScope: 'ALL',
      leadersOnly: false,
      allowedTeamIds: [],
      roundType: 'IMAGE_TARGET',
      problems: [],
    });
    setEditingRound(null);
    setCreateOpen(true);
  };

  const openEdit = (round: CompetitionRound) => {
    setEditingRound(round);
    setForm({
      eventId: round.eventId,
      title: round.title,
      description: round.description || '',
      durationMinutes: Math.max(5, Math.floor(round.duration / 60)),
      participantScope: round.participantScope || 'ALL',
      leadersOnly: round.leadersOnly || false,
      allowedTeamIds: round.allowedTeamIds || [],
      targetImageUrl: round.targetImageUrl || '',
      roundType: round.roundType || 'IMAGE_TARGET',
      problems: ((round.problems ?? []) as unknown as Array<{ id?: string; problemId?: string; points?: number; displayOrder?: number; problem?: Problem }>).map((link, index) => ({
        problemId: link.problem?.id ?? link.problemId ?? link.id ?? '',
        displayOrder: link.displayOrder ?? index,
        points: link.points ?? 100,
      })).filter((link) => link.problemId),
      finalWeight: round.finalWeight ?? 1,
      proctored: round.proctored ?? false,
      penaltyModel: round.penaltyModel ?? 'BEST_SCORE',
      teamAggregation: round.teamAggregation ?? 'BEST_PER_PROBLEM',
      leaderboardFreezeMinutes: round.leaderboardFreezeMinutes ?? 0,
    });
    setCreateOpen(true);
  };

  const closeDialog = () => {
    setCreateOpen(false);
    setEditingRound(null);
    setForm(DEFAULT_FORM);
  };

  const onSubmitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        eventId: form.eventId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        duration: Math.max(5, form.durationMinutes) * 60,
        roundType: form.roundType,
        participantScope: form.participantScope,
        leadersOnly: selectedFormEvent?.teamRegistration ? form.leadersOnly : false,
        allowedTeamIds: form.participantScope === 'SELECTED_TEAMS' ? form.allowedTeamIds : [],
        targetImageUrl: form.roundType === 'DSA' ? undefined : form.targetImageUrl.trim() || undefined,
        problems: form.roundType === 'DSA'
          ? form.problems.map((problem, index) => ({ ...problem, displayOrder: index }))
          : undefined,
        finalWeight: form.finalWeight,
        proctored: form.proctored,
        penaltyModel: form.penaltyModel,
        teamAggregation: form.teamAggregation,
        leaderboardFreezeMinutes: form.leaderboardFreezeMinutes > 0 ? form.leaderboardFreezeMinutes : null,
      };
      if (!payload.eventId) {
        throw new Error('Please select an event');
      }
      if (payload.participantScope === 'SELECTED_TEAMS' && payload.allowedTeamIds.length === 0) {
        throw new Error('Please select at least one team for selected teams mode');
      }
      if (payload.roundType === 'DSA' && (!payload.problems || payload.problems.length === 0)) {
        throw new Error('Please select at least one problem for DSA mode');
      }

      if (editingRound) {
        await api.updateCompetitionRound(editingRound.id, {
          title: payload.title,
          description: payload.description,
          duration: payload.duration,
          roundType: payload.roundType,
          participantScope: payload.participantScope,
          leadersOnly: payload.leadersOnly,
          allowedTeamIds: payload.allowedTeamIds,
          targetImageUrl: payload.roundType === 'DSA' ? null : payload.targetImageUrl || null,
          problems: payload.problems,
          finalWeight: payload.finalWeight,
          proctored: payload.proctored,
          penaltyModel: payload.penaltyModel,
          teamAggregation: payload.teamAggregation,
          leaderboardFreezeMinutes: payload.leaderboardFreezeMinutes,
        }, token);
        setSuccess('Round updated successfully');
      } else {
        await api.createCompetitionRound(payload, token);
        setSuccess('Round created successfully');
      }
      closeDialog();
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to save round'));
    } finally {
      setSaving(false);
    }
  };

  const onStartRound = async (roundId: string) => {
    if (!token) return;
    try {
      await api.startCompetitionRound(roundId, token);
      setSuccess('Round started');
      setRoundActionDialog(null);
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to start round'));
    }
  };

  const onLockRound = async (roundId: string) => {
    if (!token) return;
    try {
      await api.lockCompetitionRound(roundId, token);
      setSuccess('Round locked');
      setRoundActionDialog(null);
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to lock round'));
    }
  };

  const onBeginJudging = async (roundId: string) => {
    if (!token) return;
    try {
      await api.beginJudging(roundId, token);
      setSuccess('Round moved to judging');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to begin judging'));
    }
  };

  const onFinishRound = async (roundId: string) => {
    if (!token) return;
    try {
      await api.finishCompetition(roundId, token);
      setSuccess('Results published');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to publish results'));
    }
  };

  const onDeleteRound = async (round: CompetitionRound) => {
    if (!token) return;
    try {
      await api.deleteCompetitionRound(round.id, token);
      setSuccess('Round deleted');
      setRoundActionDialog(null);
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to delete round'));
    }
  };

  const selectedFormEvent = events.find((event) => event.id === form.eventId) || null;
  const selectedFormTeams = form.eventId ? (eventTeamsMap[form.eventId] || []) : [];

  const viewResults = (roundId: string) => {
    navigate(`/competition/${roundId}/results`);
  };

  const exportResults = async (round: CompetitionRound) => {
    if (!token) return;
    try {
      const blob = await api.exportCompetitionResults(round.id, token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${round.title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60) || 'competition'}-results.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setSuccess('Results exported');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to export results'));
    }
  };

  const publishAsPractice = async (round: CompetitionRound) => {
    if (!token) return;
    try {
      await api.publishContestAsPractice(round.id, token);
      setSuccess('Contest problems published to practice');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to publish problems to practice'));
    }
  };

  const raiseCap = (round: CompetitionRound) => {
    setCapTarget(round);
  };

  const commitRaiseCap = async (newCap: number) => {
    if (!token || !capTarget) return;
    try {
      await api.raiseContestCap(capTarget.id, { newCap }, token);
      setSuccess('Submit cap raised');
      setCapTarget(null);
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to raise submit cap'));
    }
  };

  const commitExtend = async (addMinutes: number) => {
    if (!token || !extendTarget) return;
    try {
      await api.extendCompetitionRound(extendTarget.id, Math.max(1, Math.round(addMinutes)), token);
      setSuccess(`Extended by ${Math.round(addMinutes)} min`);
      setExtendTarget(null);
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to extend round'));
    }
  };

  const rejudgeRound = async (round: CompetitionRound) => {
    if (!token) return;
    try {
      await api.rejudgeCompetitionRound(round.id, token);
      setSuccess('Rejudge queued for all problems');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to rejudge round'));
    }
  };

  if (loading) {
    return (
      <div data-dashboard data-accent={accent} className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  // Flat round list across all events for the grid (kept ordered by event group).
  const totalRounds = Object.values(roundsByEvent).reduce((sum, list) => sum + list.length, 0);

  return (
    <div data-dashboard data-accent={accent} className="flex flex-col gap-5">
      {/* Header — matches design line 374-381 */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--ds-text-1)]">Competition</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Round lifecycle and judging.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => openCreate()} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create round
          </Button>
        </div>
      </div>

      {/* Inline alerts */}
      {error && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[12.5px]">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)] text-[12.5px]">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="flex-1">{success}</span>
        </div>
      )}

      {/* Filter row */}
      <DSCard padded={false} className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-2.5">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
            <Input
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              placeholder="Filter events…"
              className="pl-9 h-9 text-[13px]"
            />
          </div>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="h-9 w-full px-3 text-[13px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
          >
            <option value="">All events</option>
            {filteredEvents.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
        </div>
      </DSCard>

      {/* Event-grouped rounds */}
      {selectedEvents.length === 0 ? (
        <DSCard>
          <EmptyState
            icon={<Calendar size={18} />}
            title="No events found"
            body="Try clearing the filter, or create a new event first."
          />
        </DSCard>
      ) : (
        <div className="flex flex-col gap-5">
          {selectedEvents.map((event) => {
            const rounds = roundsByEvent[event.id] || [];
            return (
              <section key={event.id} className="flex flex-col gap-3">
                {/* Event group header — single line, matches the design's
                    inline event-meta on each card but elevated to a section
                    header so the per-card row stays compact. */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold tracking-tight truncate">{event.title}</h2>
                    <p className="text-[12px] text-[var(--ds-text-3)] mt-0.5">
                      <Pill tone={event.status === 'UPCOMING' ? 'info' : event.status === 'ONGOING' ? 'success' : 'neutral'} size="xs">{event.status}</Pill>
                      <span className="ml-2">
                        {event.teamRegistration
                          ? `${event.teamMinSize || 1}–${event.teamMaxSize || 4} per team`
                          : 'Individual participation'}
                      </span>
                      <span className="ml-2 font-mono tabular-nums">{rounds.length} round{rounds.length === 1 ? '' : 's'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {rounds.some((r) => r.status === 'FINISHED') && (
                      <Button size="sm" variant="ghost" onClick={() => setFinalEvent(event)} className="gap-1.5">
                        <Trophy className="h-3.5 w-3.5" />
                        Final standings
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openCreate(event.id)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Add round
                    </Button>
                  </div>
                </div>

                {rounds.length === 0 ? (
                  <DSCard className="border-dashed border-[var(--border-default)]">
                    <div className="text-[12.5px] text-[var(--ds-text-3)] text-center py-3">
                      No rounds yet for this event.
                    </div>
                  </DSCard>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {rounds.map((round) => {
                      const sp = statusPill[round.status];
                      const teamCount = event.teamRegistration
                        ? (round.participantScope === 'SELECTED_TEAMS'
                            ? round.allowedTeamIds?.length || 0
                            : (eventTeamsMap[event.id] || []).length)
                        : null;
                      return (
                        <DSCard key={round.id} className="flex flex-col gap-3">
                          {/* Top row: status + type pills (design line 386-389) */}
                          <div className="flex items-center justify-between gap-2">
                            <Pill tone={sp.tone} size="xs" dot={sp.dot}>{sp.label}</Pill>
                            <Pill tone="neutral" size="xs">
                              {round.roundType === 'DSA' ? 'DSA' : 'Image Target'}
                            </Pill>
                          </div>

                          {/* Title block (design line 390-393) */}
                          <div>
                            <div className="text-[11px] text-[var(--ds-text-3)] truncate">{event.title}</div>
                            <div className="text-[15px] font-semibold mt-0.5 text-[var(--ds-text-1)] leading-tight">{round.title}</div>
                            {round.description && (
                              <p className="text-[12px] text-[var(--ds-text-3)] mt-1 line-clamp-2">{round.description}</p>
                            )}
                          </div>

                          {/* Meta row (design line 394-398) */}
                          <div className="flex items-center gap-3 text-[11.5px] text-[var(--ds-text-3)] flex-wrap">
                            {teamCount !== null && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span className="font-mono tabular-nums">{teamCount}</span> teams
                              </span>
                            )}
                            {round.roundType === 'DSA' && (
                              <span className="inline-flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                <span className="font-mono tabular-nums">{(round.problems ?? []).length}</span> problems
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span className="font-mono tabular-nums">{Math.round(round.duration / 60)}m</span>
                            </span>
                            {(round.submissionCount ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                <span className="font-mono tabular-nums">{round.submissionCount}</span> submitted
                              </span>
                            )}
                            {round.status === 'ACTIVE' && (
                              <span className="font-mono tabular-nums text-[var(--success)]">
                                {formatRemaining(round.remainingSeconds)} left
                              </span>
                            )}
                          </div>

                          {/* Per-card lifecycle indicator */}
                          <div className="-mx-0.5 -mb-0.5 pt-1 border-t border-[var(--border-subtle)]">
                            <LifecycleStepper status={round.status} />
                          </div>

                          {/* DSA problem chips */}
                          {round.roundType === 'DSA' && (round.problems ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {((round.problems ?? []) as unknown as Array<{ id?: string; title?: string; points?: number; problem?: Problem }>).map((link, index) => (
                                <Pill key={link.id ?? link.problem?.id ?? index} tone="info" size="xs">
                                  {link.title ?? link.problem?.title ?? `Problem ${index + 1}`} · {link.points ?? 100}p
                                </Pill>
                              ))}
                            </div>
                          )}

                          {/* Contestant link */}
                          <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2.5 py-2 text-[11px] text-[var(--ds-text-2)] truncate">
                            <span className="text-[var(--ds-text-3)] mr-1">Link:</span>
                            <a
                              href={getCompetitionRoundUrl(round)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[var(--accent)] hover:underline break-all"
                            >
                              {getCompetitionRoundPublicUrl(round)}
                            </a>
                          </div>

                          {/* Actions — primary action + secondary in a single row.
                              Matches design line 399-403 (Judge / Edit / Manage)
                              while keeping every real-world status-dependent op. */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {round.status === 'DRAFT' && (
                              <>
                                <Button size="sm" onClick={() => setRoundActionDialog({ action: 'start', round })} className="gap-1.5">
                                  <Play className="h-3.5 w-3.5" /> Start
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => openEdit(round)} className="gap-1.5">
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setRoundActionDialog({ action: 'delete', round })} className="gap-1.5 text-[var(--danger)]">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {round.status === 'ACTIVE' && (
                              <>
                                <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/competition/${round.id}/monitor`)} className="gap-1.5">
                                  <Activity className="h-3.5 w-3.5" /> Monitor
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/competition/${round.id}/judge`)} className="gap-1.5">
                                  <Eye className="h-3.5 w-3.5" /> Submissions
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setRoundActionDialog({ action: 'lock', round })} className="gap-1.5">
                                  <Square className="h-3.5 w-3.5" /> Lock
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setExtendTarget(round)} className="gap-1.5">
                                  <Clock className="h-3.5 w-3.5" /> Extend
                                </Button>
                                {round.roundType === 'DSA' && (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => void raiseCap(round)} className="gap-1.5">
                                      Raise cap
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => void rejudgeRound(round)} className="gap-1.5">
                                      <RefreshCw className="h-3.5 w-3.5" /> Rejudge
                                    </Button>
                                  </>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => setRoundActionDialog({ action: 'delete', round })} className="gap-1.5 text-[var(--danger)]">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {round.status === 'LOCKED' && (
                              <>
                                <Button size="sm" onClick={() => void onBeginJudging(round.id)} className="gap-1.5">
                                  <ClipboardCheck className="h-3.5 w-3.5" /> Begin judging
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/competition/${round.id}/judge`)} className="gap-1.5">
                                  <Eye className="h-3.5 w-3.5" /> View
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setRoundActionDialog({ action: 'delete', round })} className="gap-1.5 text-[var(--danger)]">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {round.status === 'JUDGING' && (
                              <>
                                <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/competition/${round.id}/judge`)} className="gap-1.5">
                                  <Trophy className="h-3.5 w-3.5" /> Judge
                                </Button>
                                <Button size="sm" onClick={() => void onFinishRound(round.id)} className="gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Publish
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setRoundActionDialog({ action: 'delete', round })} className="gap-1.5 text-[var(--danger)]">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {round.status === 'FINISHED' && (
                              <>
                                <Button size="sm" variant="secondary" onClick={() => viewResults(round.id)} className="gap-1.5">
                                  <Eye className="h-3.5 w-3.5" /> Results
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => void exportResults(round)} className="gap-1.5">
                                  <Download className="h-3.5 w-3.5" /> Export
                                </Button>
                                {round.roundType === 'DSA' && (
                                  <Button size="sm" variant="ghost" onClick={() => void publishAsPractice(round)} className="gap-1.5">
                                    Practice
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => setRoundActionDialog({ action: 'delete', round })} className="gap-1.5 text-[var(--danger)]">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </DSCard>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Global lifecycle reference — design line 408-428 */}
      {totalRounds > 0 && (
        <DSCard>
          <div className="text-[13.5px] font-semibold mb-1">Round lifecycle</div>
          <p className="text-[12.5px] text-[var(--ds-text-3)] mb-4">
            Stages run linearly. Draft → Start → Lock → Judging → Finish. You can re-open a previous stage with explicit confirmation.
          </p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(['Draft', 'Start', 'Lock', 'Judging', 'Finish'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2 shrink-0">
                <div
                  className={cn(
                    'px-3 h-9 rounded-[8px] inline-flex items-center gap-2 text-[12.5px] font-medium border',
                    'bg-[var(--bg-raised)] text-[var(--ds-text-2)] border-[var(--border-default)]',
                  )}
                >
                  <span className="size-[6px] rounded-full bg-[var(--ds-text-3)]/40" />
                  {s}
                </div>
                {i < 4 && <span className="h-px w-4 bg-[var(--border-subtle)]" />}
              </div>
            ))}
          </div>
        </DSCard>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => (!open ? closeDialog() : setCreateOpen(open))}>
        <DialogContent data-dashboard data-accent={accent}>
            <DialogHeader>
              <DialogTitle>{editingRound ? 'Edit Round' : 'Create Competition Round'}</DialogTitle>
              <DialogDescription>
                Configure contest mode and access: everyone, admin-selected teams, or one representative per team.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmitForm} className="space-y-3">
            <div>
              <label htmlFor="competition-event" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Event</label>
              <select
                id="competition-event"
                value={form.eventId}
                onChange={(e) => {
                  const nextEventId = e.target.value;
                  const nextEvent = events.find((event) => event.id === nextEventId);
                  setForm((prev) => ({
                    ...prev,
                    eventId: nextEventId,
                    participantScope: nextEvent?.teamRegistration ? prev.participantScope : 'ALL',
                    leadersOnly: nextEvent?.teamRegistration ? prev.leadersOnly : false,
                    allowedTeamIds: [],
                  }));
                }}
                className="h-10 w-full rounded-lg border-2 border-[var(--accent-ring)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--ds-text-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                required
                disabled={Boolean(editingRound)}
              >
                <option value="">Select event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="competition-round-type" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Round type</label>
              <select
                id="competition-round-type"
                value={form.roundType}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  roundType: e.target.value as 'IMAGE_TARGET' | 'DSA',
                  targetImageUrl: e.target.value === 'DSA' ? '' : prev.targetImageUrl,
                }))}
                className="h-10 w-full rounded-lg border-2 border-[var(--accent-ring)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--ds-text-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="IMAGE_TARGET">HTML/CSS Build (image target)</option>
                <option value="DSA">DSA Coding (auto judge)</option>
              </select>
            </div>

            {selectedFormEvent?.teamRegistration && (
              <div>
                <label htmlFor="competition-participant-scope" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Which teams can participate?</label>
                <select
                  id="competition-participant-scope"
                  value={form.participantScope}
                  onChange={(e) => {
                    const nextScope = e.target.value as 'ALL' | 'SELECTED_TEAMS';
                    setForm((prev) => ({
                      ...prev,
                      participantScope: nextScope,
                      allowedTeamIds: nextScope === 'SELECTED_TEAMS' ? prev.allowedTeamIds : [],
                    }));
                  }}
                  className="h-10 w-full rounded-lg border-2 border-[var(--accent-ring)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--ds-text-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                >
                  <option value="ALL">Allow everyone (all teams)</option>
                  <option value="SELECTED_TEAMS">Allow only teams selected by admin</option>
                </select>
              </div>
            )}

            {selectedFormEvent?.teamRegistration && (
              <div>
                <label htmlFor="competition-leaders-only" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Who can submit from each eligible team?</label>
                <select
                  id="competition-leaders-only"
                  value={form.leadersOnly ? 'LEADERS_ONLY' : 'ALL_MEMBERS'}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      leadersOnly: e.target.value === 'LEADERS_ONLY',
                    }));
                  }}
                  className="h-10 w-full rounded-lg border-2 border-[var(--accent-ring)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--ds-text-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                >
                  <option value="ALL_MEMBERS">Allow everyone on an eligible team</option>
                  <option value="LEADERS_ONLY">Allow only one representative (team leader)</option>
                </select>
              </div>
            )}

            {selectedFormEvent && !selectedFormEvent.teamRegistration && (
              <div className="rounded-lg border border-[var(--accent-ring)] bg-[var(--accent-subtle)] px-3 py-2 text-xs text-[var(--ds-text-1)]">
                This event is individual-based, so everyone registered for the event can participate.
              </div>
            )}

            {selectedFormEvent?.teamRegistration && form.participantScope === 'SELECTED_TEAMS' && (
              <div>
                <p className="mb-1 block text-sm font-medium text-[var(--ds-text-2)]">
                  Selected teams ({form.allowedTeamIds.length})
                </p>
                {selectedFormTeams.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--accent-ring)] bg-[var(--accent-subtle)] px-3 py-2 text-sm text-[var(--ds-text-1)]">
                    No teams found for this event yet.
                  </div>
                ) : (
                  <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-[var(--accent-ring)] bg-[var(--accent-subtle)]/40 p-3">
                    {selectedFormTeams.map((team) => {
                      const checked = form.allowedTeamIds.includes(team.id);
                      return (
                        <div key={team.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3 py-2 text-sm">
                          <span className="min-w-0 truncate font-medium text-[var(--ds-text-1)]">{team.teamName}</span>
                          <input
                            id={`admin-competition-team-${team.id}`}
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setForm((prev) => {
                                if (e.target.checked) {
                                  return { ...prev, allowedTeamIds: Array.from(new Set([...prev.allowedTeamIds, team.id])) };
                                }
                                return { ...prev, allowedTeamIds: prev.allowedTeamIds.filter((id) => id !== team.id) };
                              });
                            }}
                            className="h-4 w-4 rounded border-[var(--accent-ring)] text-[var(--accent)] focus:ring-[var(--accent)]"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1 text-xs text-[var(--ds-text-3)]">
                  {form.leadersOnly
                    ? 'Only team leaders from admin-selected teams can open and submit this round.'
                    : 'Everyone from admin-selected teams can open and submit this round.'}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="competition-title" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Title</label>
              <Input
                id="competition-title"
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Round title"
              />
            </div>

            <div>
              <label htmlFor="competition-description" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Description (optional)</label>
              <Textarea
                id="competition-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Round instructions"
                rows={3}
              />
            </div>

            <div>
              <label htmlFor="competition-duration" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Duration (minutes)</label>
              <Input
                id="competition-duration"
                type="number"
                min={5}
                max={120}
                required
                value={form.durationMinutes}
                onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value || 0) }))}
              />
            </div>

            {/* Contest settings — ranking model, event-final weight, proctoring, freeze */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--ds-text-3)]">Contest settings</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="competition-penalty" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Ranking model</label>
                  <select
                    id="competition-penalty"
                    value={form.penaltyModel}
                    onChange={(e) => setForm((prev) => ({ ...prev, penaltyModel: e.target.value as 'BEST_SCORE' | 'ICPC' }))}
                    className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--ds-text-2)]"
                  >
                    <option value="BEST_SCORE">Best score (ties: earliest)</option>
                    <option value="ICPC">ICPC (ties: penalty)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="competition-final-weight" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Event-final weight</label>
                  <Input
                    id="competition-final-weight"
                    type="number"
                    min={0}
                    max={1000}
                    step={0.1}
                    value={form.finalWeight}
                    onChange={(e) => setForm((prev) => ({ ...prev, finalWeight: Number(e.target.value || 0) }))}
                  />
                  <p className="mt-1 text-[11px] text-[var(--ds-text-3)]">Relative weight of this round in the event final (normalized across rounds).</p>
                </div>
                <div>
                  <label htmlFor="competition-freeze" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Leaderboard freeze (min)</label>
                  <Input
                    id="competition-freeze"
                    type="number"
                    min={0}
                    max={1440}
                    value={form.leaderboardFreezeMinutes}
                    onChange={(e) => setForm((prev) => ({ ...prev, leaderboardFreezeMinutes: Number(e.target.value || 0) }))}
                  />
                  <p className="mt-1 text-[11px] text-[var(--ds-text-3)]">Freeze the public board in the final N minutes (0 = never).</p>
                </div>
                <label htmlFor="competition-proctored" className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-[var(--ds-text-2)]">
                  <input
                    id="competition-proctored"
                    type="checkbox"
                    checked={form.proctored}
                    onChange={(e) => setForm((prev) => ({ ...prev, proctored: e.target.checked }))}
                    className="h-4 w-4 rounded border-[var(--accent-ring)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  Proctored (auto-submit + lock on tab switch)
                </label>
                {selectedFormEvent?.teamRegistration && form.roundType === 'DSA' && (
                  <div className="sm:col-span-2">
                    <label htmlFor="competition-team-agg" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Team score (how members fold)</label>
                    <select
                      id="competition-team-agg"
                      value={form.teamAggregation}
                      onChange={(e) => setForm((prev) => ({ ...prev, teamAggregation: e.target.value as FormState['teamAggregation'] }))}
                      className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--ds-text-2)]"
                    >
                      <option value="BEST_PER_PROBLEM">Best per problem (best member on each problem)</option>
                      <option value="AVERAGE">Average of members' round scores</option>
                      <option value="BEST_MEMBER">Best single member</option>
                    </select>
                    <p className="mt-1 text-[11px] text-[var(--ds-text-3)]">Only applies to team events on DSA rounds.</p>
                  </div>
                )}
              </div>
            </div>

            {form.roundType === 'IMAGE_TARGET' ? (
              <div>
                <label htmlFor="competition-target-image" className="text-sm font-medium text-[var(--ds-text-2)] mb-1 block">Reference image URL (optional)</label>
                <Input
                  id="competition-target-image"
                  type="url"
                  value={form.targetImageUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, targetImageUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            ) : (
              <div>
                <p className="mb-1 block text-sm font-medium text-[var(--ds-text-2)]">Problems &amp; weights</p>
                <p className="mb-1 text-[11px] text-[var(--ds-text-3)]">Weight seeds from difficulty (Easy 100 · Medium 200 · Hard 300) — edit freely. Each problem&apos;s share is normalized within the round; its weight is split across the problem&apos;s private tests only.</p>
                <div className="space-y-2 rounded-lg border border-[var(--accent-ring)] bg-[var(--accent-subtle)]/40 p-3">
                  <select
                    value=""
                    onChange={(event) => {
                      const problemId = event.target.value;
                      if (!problemId || form.problems.some((item) => item.problemId === problemId)) return;
                      const added = problemCatalog.find((item) => item.id === problemId);
                      setForm((prev) => ({
                        ...prev,
                        problems: [...prev.problems, { problemId, displayOrder: prev.problems.length, points: seedWeightFromDifficulty(added?.difficulty) }],
                      }));
                    }}
                    className="h-10 w-full rounded-lg border border-[var(--accent-ring)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--ds-text-2)]"
                  >
                    <option value="">Add a problem</option>
                    {problemCatalog.map((problem) => (
                      <option key={problem.id} value={problem.id}>{problem.title} ({problem.difficulty})</option>
                    ))}
                  </select>
                  {(() => {
                    const totalWeight = form.problems.reduce((sum, item) => sum + (item.points || 0), 0) || 1;
                    return form.problems.map((link, index) => {
                      const problem = problemCatalog.find((item) => item.id === link.problemId);
                      const sharePct = Math.round(((link.points || 0) / totalWeight) * 1000) / 10;
                      return (
                        <div key={link.problemId} className="grid grid-cols-[1fr,96px,52px,36px] items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3 py-2 text-sm">
                          <span className="min-w-0 truncate font-medium text-[var(--ds-text-1)]">
                            {problem?.title ?? link.problemId}
                            {problem?.difficulty && <span className="ml-1.5 text-[11px] text-[var(--ds-text-3)]">{problem.difficulty}</span>}
                          </span>
                          <Input
                            type="number"
                            min={1}
                            max={1000}
                            value={link.points}
                            aria-label="Weight"
                            onChange={(event) => setForm((prev) => ({
                              ...prev,
                              problems: prev.problems.map((item, itemIndex) => itemIndex === index ? { ...item, points: Number(event.target.value) } : item),
                            }))}
                          />
                          <span className="text-right font-mono tabular-nums text-[12px] text-[var(--ds-text-3)]">{sharePct}%</span>
                          <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, problems: prev.problems.filter((_, itemIndex) => itemIndex !== index) }))}
                            className="rounded p-2 text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                            title="Remove problem"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingRound ? 'Update Round' : 'Create Round'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {finalEvent && token && (
        <FinalStandingsDialog event={finalEvent} token={token} onClose={() => setFinalEvent(null)} />
      )}

      <RoundActionDialog
        action={roundActionDialog}
        onCancel={() => setRoundActionDialog(null)}
        onConfirm={(act) => {
          if (act.action === 'start') {
            void onStartRound(act.round.id);
            return;
          }
          if (act.action === 'lock') {
            void onLockRound(act.round.id);
            return;
          }
          void onDeleteRound(act.round);
        }}
      />

      <NumericPromptDialog
        open={Boolean(capTarget)}
        onOpenChange={(o) => !o && setCapTarget(null)}
        title="Raise submit cap"
        description={capTarget ? `Round: ${capTarget.title}` : undefined}
        label="New submit cap"
        defaultValue={10}
        min={1}
        max={1000}
        confirmLabel="Raise cap"
        onCommit={(value) => void commitRaiseCap(Math.max(1, Math.round(value)))}
      />

      <NumericPromptDialog
        open={Boolean(extendTarget)}
        onOpenChange={(o) => !o && setExtendTarget(null)}
        title="Extend round time"
        description={extendTarget ? `Round: ${extendTarget.title}` : undefined}
        label="Add minutes"
        defaultValue={10}
        min={1}
        max={600}
        confirmLabel="Extend"
        onCommit={(value) => void commitExtend(value)}
      />
    </div>
  );
}

// Event-final standings (Phase F): combined weighted standings across an event's FINISHED
// rounds, with publish toggle + CSV export. Admin-only.
function FinalStandingsDialog({ event, token, onClose }: { event: Event; token: string; onClose: () => void }) {
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';
  const queryClient = useQueryClient();
  const finalQuery = useQuery({
    queryKey: ['event-final', event.id],
    queryFn: () => api.getEventFinal(event.id, token),
  });
  const data = finalQuery.data;
  const [busy, setBusy] = useState(false);

  const togglePublish = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await api.publishEventFinal(event.id, !data.event.publishedAt, token);
      await queryClient.invalidateQueries({ queryKey: ['event-final', event.id] });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const head = ['Rank', data.event.teamRegistration ? 'Team' : 'Participant', 'Final', ...data.rounds.map((r) => r.title)];
    const rows = data.standings.map((s) => [
      String(s.rank), s.name, String(s.final),
      ...data.rounds.map((r) => { const pr = s.perRound.find((p) => p.roundId === r.id); return pr?.score == null ? '' : String(pr.score); }),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60)}-final.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-dashboard data-accent={accent} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Final standings — {event.title}</DialogTitle>
          <DialogDescription>
            Combined across finished rounds by each round&apos;s normalized weight (capped 0–100).
          </DialogDescription>
        </DialogHeader>
        {finalQuery.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" /></div>
        ) : !data || data.standings.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--ds-text-3)]">No finished rounds with results yet.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-[var(--ds-text-3)]">
              <span>Round weights:</span>
              {data.rounds.map((r) => (
                <span key={r.id} className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5">{r.title}: {Math.round(r.weight * 100)}%</span>
              ))}
            </div>
            <div className="max-h-[50vh] overflow-auto mt-2">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[var(--ds-text-3)] border-b border-[var(--border-subtle)]">
                    <th className="py-1.5 pr-2 w-10">#</th>
                    <th className="py-1.5 pr-2">{data.event.teamRegistration ? 'Team' : 'Participant'}</th>
                    {data.rounds.map((r) => <th key={r.id} className="py-1.5 px-2 text-right">{r.title}</th>)}
                    <th className="py-1.5 pl-2 text-right">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((s) => (
                    <tr key={s.entrantId} className="border-b border-[var(--border-subtle)]">
                      <td className="py-1.5 pr-2 font-mono font-semibold">{s.rank}</td>
                      <td className="py-1.5 pr-2 truncate">{s.name}</td>
                      {data.rounds.map((r) => {
                        const pr = s.perRound.find((p) => p.roundId === r.id);
                        return <td key={r.id} className="py-1.5 px-2 text-right font-mono tabular-nums text-[var(--ds-text-2)]">{pr?.score == null ? '–' : pr.score}</td>;
                      })}
                      <td className="py-1.5 pl-2 text-right font-mono font-semibold tabular-nums">{s.final}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data || data.standings.length === 0} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={() => void togglePublish()} disabled={busy || !data} className="gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {data?.event.publishedAt ? 'Unpublish' : 'Publish to public'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
