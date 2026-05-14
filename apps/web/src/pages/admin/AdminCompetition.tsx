import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, type CompetitionRound, type Event, type EventTeam, type Problem } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { getPlaygroundLaunchUrl, getPlaygroundPublicUrl } from '@/lib/playgroundUrl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RoundActionDialog } from '@/components/admin/competition/RoundActionDialog';
import {
  Calendar,
  Loader2,
  Plus,
  Play,
  Square,
  Trash2,
  Pencil,
  Search,
  Trophy,
  RefreshCw,
  Eye,
  ClipboardCheck,
  CheckCircle2,
  Download,
  ExternalLink,
} from 'lucide-react';

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
};

const statusBadgeClass: Record<CompetitionRound['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  ACTIVE: 'bg-green-100 text-green-700 border-green-300',
  LOCKED: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  JUDGING: 'bg-blue-100 text-blue-700 border-blue-300',
  FINISHED: 'bg-amber-100 text-amber-800 border-amber-300',
};

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} min`;
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

  useEffect(() => {
    const activePresent = Object.values(roundsByEvent).some((list) =>
      list.some((round) => round.status === 'ACTIVE'),
    );
    if (!activePresent) return;
    const id = window.setInterval(() => {
      void load();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [roundsByEvent, load]);

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

  const raiseCap = async (round: CompetitionRound) => {
    if (!token) return;
    const value = window.prompt('New submit cap for this round', '10');
    if (!value) return;
    try {
      await api.raiseContestCap(round.id, { newCap: Number(value) }, token);
      setSuccess('Submit cap raised');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to raise submit cap'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Competition Management</h1>
          <p className="text-sm text-gray-500">Create, start, lock, judge, and publish competition rounds.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => openCreate()} className="gap-2">
            <Plus className="h-4 w-4" />
            New Round
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-5 text-sm text-red-700">
            {error}
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-5 text-sm text-green-700">
            {success}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr,220px] gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                placeholder="Filter events"
                className="pl-10"
              />
            </div>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="h-10 rounded-lg border-2 border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
            >
              <option value="">All events</option>
              {filteredEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {selectedEvents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No events found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {selectedEvents.map((event) => {
            const rounds = roundsByEvent[event.id] || [];
            return (
              <Card key={event.id}>
                <CardHeader className="border-b border-amber-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{event.title}</CardTitle>
                      <CardDescription>
                        {event.status} · {event.teamRegistration
                          ? `${event.teamMinSize || 1}-${event.teamMaxSize || 4} members per team`
                          : 'Open participation'}
                      </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => openCreate(event.id)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add Round
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {rounds.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-4 py-6 text-sm text-amber-700">
                      No rounds yet for this event.
                    </div>
                  ) : (
                    rounds.map((round) => (
                      <div
                        key={round.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-base font-semibold text-gray-900">{round.title}</p>
                            <p className="text-sm text-gray-500">
                              {round.roundType === 'DSA' ? 'DSA coding round' : 'HTML/CSS build round'} · Duration: {formatDuration(round.duration)}
                              {round.status === 'ACTIVE' && (
                                <span className="ml-2 font-mono text-green-700">· {formatRemaining(round.remainingSeconds)}</span>
                              )}
                            </p>
                            {round.description && (
                              <p className="text-sm text-gray-600 mt-1">{round.description}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={statusBadgeClass[round.status]}>
                            {round.status}
                          </Badge>
                        </div>

                        <div className="text-xs text-gray-500">
                          Submissions: {round.submissionCount ?? 0}
                        </div>
                        <div className="text-xs text-gray-500">
                          Teams: {event.teamRegistration
                            ? (
                                round.participantScope === 'SELECTED_TEAMS'
                                  ? `Selected teams (${round.allowedTeamIds?.length || 0})`
                                  : 'All teams'
                              )
                            : 'All registered participants'}
                        </div>
                        {event.teamRegistration && (
                          <div className="text-xs text-gray-500">
                            Access: {round.leadersOnly ? 'Only team leaders' : 'All team members'}
                          </div>
                        )}

                        {(round.status === 'DRAFT' || round.status === 'ACTIVE' || round.status === 'LOCKED' || round.status === 'JUDGING' || round.status === 'FINISHED') && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Contestant link:{' '}
                            <a
                              href={getCompetitionRoundUrl(round)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold underline break-all"
                            >
                              {getCompetitionRoundPublicUrl(round)}
                            </a>
                          </div>
                        )}

                        {round.roundType === 'DSA' && (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {((round.problems ?? []) as unknown as Array<{ id?: string; title?: string; points?: number; problem?: Problem }>).map((link, index) => (
                              <span key={link.id ?? link.problem?.id ?? index} className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                                {link.title ?? link.problem?.title ?? `Problem ${index + 1}`} · {link.points ?? 100} pts
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {round.status === 'DRAFT' && (
                            <>
                              <Button size="sm" className="gap-2" onClick={() => setRoundActionDialog({ action: 'start', round })}>
                                <Play className="h-4 w-4" />
                                Start Round
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                asChild
                              >
                                <a href={getCompetitionRoundUrl(round)} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  Open Round Link
                                </a>
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => openEdit(round)}>
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2 text-red-600" onClick={() => setRoundActionDialog({ action: 'delete', round })}>
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </>
                          )}

                          {round.status === 'ACTIVE' && (
                            <>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => setRoundActionDialog({ action: 'lock', round })}>
                                <Square className="h-4 w-4" />
                                Lock Now
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                asChild
                              >
                                <a href={getCompetitionRoundUrl(round)} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  Open Round Link
                                </a>
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/admin/competition/${round.id}/judge`)}>
                                <Eye className="h-4 w-4" />
                                View Submissions
                              </Button>
                              {round.roundType === 'DSA' && (
                                <Button size="sm" variant="outline" className="gap-2" onClick={() => void raiseCap(round)}>
                                  Raise Cap
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="gap-2 text-red-600" onClick={() => setRoundActionDialog({ action: 'delete', round })}>
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </>
                          )}

                          {round.status === 'LOCKED' && (
                            <>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => void onBeginJudging(round.id)}>
                                <ClipboardCheck className="h-4 w-4" />
                                Begin Judging
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                asChild
                              >
                                <a href={getCompetitionRoundUrl(round)} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  Open Round Link
                                </a>
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/admin/competition/${round.id}/judge`)}>
                                <Eye className="h-4 w-4" />
                                View Submissions
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2 text-red-600" onClick={() => setRoundActionDialog({ action: 'delete', round })}>
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </>
                          )}

                           {round.status === 'JUDGING' && (
                             <>
                               <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/admin/competition/${round.id}/judge`)}>
                                 <Trophy className="h-4 w-4" />
                                 Judge Submissions
                               </Button>
                               <Button size="sm" className="gap-2" onClick={() => void onFinishRound(round.id)}>
                                 <CheckCircle2 className="h-4 w-4" />
                                 Publish Results
                               </Button>
                               <Button size="sm" variant="outline" className="gap-2 text-red-600" onClick={() => setRoundActionDialog({ action: 'delete', round })}>
                                 <Trash2 className="h-4 w-4" />
                                 Delete
                               </Button>
                             </>
                           )}

                           {round.status === 'FINISHED' && (
                             <>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => viewResults(round.id)}>
                                <Eye className="h-4 w-4" />
                                View Results
                              </Button>
                                {round.roundType === 'DSA' && (
                                  <Button size="sm" variant="outline" className="gap-2" onClick={() => void publishAsPractice(round)}>
                                    Publish as Practice
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className="gap-2" onClick={() => void exportResults(round)}>
                                  <Download className="h-4 w-4" />
                                  Export Results
                                </Button>
                                <Button size="sm" variant="outline" className="gap-2 text-red-600" onClick={() => setRoundActionDialog({ action: 'delete', round })}>
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </Button>
                              </>
                            )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => (!open ? closeDialog() : setCreateOpen(open))}>
        <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRound ? 'Edit Round' : 'Create Competition Round'}</DialogTitle>
              <DialogDescription>
                Configure contest mode and access: everyone, admin-selected teams, or one representative per team.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmitForm} className="space-y-3">
            <div>
              <label htmlFor="competition-event" className="text-sm font-medium text-gray-700 mb-1 block">Event</label>
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
                className="h-10 w-full rounded-lg border-2 border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
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
              <label htmlFor="competition-round-type" className="text-sm font-medium text-gray-700 mb-1 block">Round type</label>
              <select
                id="competition-round-type"
                value={form.roundType}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  roundType: e.target.value as 'IMAGE_TARGET' | 'DSA',
                  targetImageUrl: e.target.value === 'DSA' ? '' : prev.targetImageUrl,
                }))}
                className="h-10 w-full rounded-lg border-2 border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
              >
                <option value="IMAGE_TARGET">HTML/CSS Build (image target)</option>
                <option value="DSA">DSA Coding (auto judge)</option>
              </select>
            </div>

            {selectedFormEvent?.teamRegistration && (
              <div>
                <label htmlFor="competition-participant-scope" className="text-sm font-medium text-gray-700 mb-1 block">Which teams can participate?</label>
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
                  className="h-10 w-full rounded-lg border-2 border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                >
                  <option value="ALL">Allow everyone (all teams)</option>
                  <option value="SELECTED_TEAMS">Allow only teams selected by admin</option>
                </select>
              </div>
            )}

            {selectedFormEvent?.teamRegistration && (
              <div>
                <label htmlFor="competition-leaders-only" className="text-sm font-medium text-gray-700 mb-1 block">Who can submit from each eligible team?</label>
                <select
                  id="competition-leaders-only"
                  value={form.leadersOnly ? 'LEADERS_ONLY' : 'ALL_MEMBERS'}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      leadersOnly: e.target.value === 'LEADERS_ONLY',
                    }));
                  }}
                  className="h-10 w-full rounded-lg border-2 border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                >
                  <option value="ALL_MEMBERS">Allow everyone on an eligible team</option>
                  <option value="LEADERS_ONLY">Allow only one representative (team leader)</option>
                </select>
              </div>
            )}

            {selectedFormEvent && !selectedFormEvent.teamRegistration && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This event is individual-based, so everyone registered for the event can participate.
              </div>
            )}

            {selectedFormEvent?.teamRegistration && form.participantScope === 'SELECTED_TEAMS' && (
              <div>
                <p className="mb-1 block text-sm font-medium text-gray-700">
                  Selected teams ({form.allowedTeamIds.length})
                </p>
                {selectedFormTeams.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    No teams found for this event yet.
                  </div>
                ) : (
                  <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                    {selectedFormTeams.map((team) => {
                      const checked = form.allowedTeamIds.includes(team.id);
                      return (
                        <div key={team.id} className="flex items-center justify-between gap-3 rounded-md border border-amber-100 bg-white px-3 py-2 text-sm">
                          <span className="min-w-0 truncate font-medium text-gray-800">{team.teamName}</span>
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
                            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {form.leadersOnly
                    ? 'Only team leaders from admin-selected teams can open and submit this round.'
                    : 'Everyone from admin-selected teams can open and submit this round.'}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="competition-title" className="text-sm font-medium text-gray-700 mb-1 block">Title</label>
              <Input
                id="competition-title"
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Round title"
              />
            </div>

            <div>
              <label htmlFor="competition-description" className="text-sm font-medium text-gray-700 mb-1 block">Description (optional)</label>
              <Textarea
                id="competition-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Round instructions"
                rows={3}
              />
            </div>

            <div>
              <label htmlFor="competition-duration" className="text-sm font-medium text-gray-700 mb-1 block">Duration (minutes)</label>
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

            {form.roundType === 'IMAGE_TARGET' ? (
              <div>
                <label htmlFor="competition-target-image" className="text-sm font-medium text-gray-700 mb-1 block">Reference image URL (optional)</label>
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
                <p className="mb-1 block text-sm font-medium text-gray-700">Problems</p>
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <select
                    value=""
                    onChange={(event) => {
                      const problemId = event.target.value;
                      if (!problemId || form.problems.some((item) => item.problemId === problemId)) return;
                      setForm((prev) => ({
                        ...prev,
                        problems: [...prev.problems, { problemId, displayOrder: prev.problems.length, points: 100 }],
                      }));
                    }}
                    className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm text-gray-700"
                  >
                    <option value="">Add a problem</option>
                    {problemCatalog.map((problem) => (
                      <option key={problem.id} value={problem.id}>{problem.title} ({problem.difficulty})</option>
                    ))}
                  </select>
                  {form.problems.map((link, index) => {
                    const problem = problemCatalog.find((item) => item.id === link.problemId);
                    return (
                      <div key={link.problemId} className="grid grid-cols-[1fr,96px,36px] items-center gap-2 rounded-md border border-amber-100 bg-white px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-medium text-gray-800">{problem?.title ?? link.problemId}</span>
                        <Input
                          type="number"
                          min={1}
                          max={1000}
                          value={link.points}
                          onChange={(event) => setForm((prev) => ({
                            ...prev,
                            problems: prev.problems.map((item, itemIndex) => itemIndex === index ? { ...item, points: Number(event.target.value) } : item),
                          }))}
                        />
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, problems: prev.problems.filter((_, itemIndex) => itemIndex !== index) }))}
                          className="rounded p-2 text-red-600 hover:bg-red-50"
                          title="Remove problem"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
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
    </div>
  );
}
