import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, type CompetitionRound, type Event } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
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
  targetImageUrl: string;
};

const DEFAULT_FORM: FormState = {
  eventId: '',
  title: '',
  description: '',
  durationMinutes: 30,
  targetImageUrl: '',
};

const statusBadgeClass: Record<CompetitionRound['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  ACTIVE: 'bg-green-100 text-green-700 border-green-300',
  LOCKED: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  JUDGING: 'bg-blue-100 text-blue-700 border-blue-300',
  FINISHED: 'bg-amber-100 text-amber-800 border-amber-300',
};

const BASE_PLAYGROUND_URL = import.meta.env.VITE_PLAYGROUND_URL ||
  (import.meta.env.DEV ? 'http://localhost:5174' : 'https://code.codescriet.dev');

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

  const teamEvents = useMemo(
    () => events.filter((event) => event.teamRegistration === true),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const query = eventFilter.trim().toLowerCase();
    if (!query) return teamEvents;
    return teamEvents.filter((event) => event.title.toLowerCase().includes(query));
  }, [teamEvents, eventFilter]);

  const selectedEvents = selectedEventId
    ? filteredEvents.filter((event) => event.id === selectedEventId)
    : filteredEvents;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const fetchedEvents = await api.getEvents();
      const eligibleEvents = fetchedEvents.filter((event) => event.teamRegistration === true);
      setEvents(eligibleEvents);

      const roundsEntries = await Promise.all(
        eligibleEvents.map(async (event) => {
          const response = await api.getCompetitionRoundsAdmin(event.id, token);
          return [event.id, response.rounds] as const;
        }),
      );
      setRoundsByEvent(Object.fromEntries(roundsEntries));
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

  const openCreate = (eventId?: string) => {
    setForm({
      ...DEFAULT_FORM,
      eventId: eventId || selectedEventId || filteredEvents[0]?.id || '',
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
      targetImageUrl: round.targetImageUrl || '',
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
        targetImageUrl: form.targetImageUrl.trim() || undefined,
      };
      if (!payload.eventId) {
        throw new Error('Please select an event');
      }

      if (editingRound) {
        await api.updateCompetitionRound(editingRound.id, {
          title: payload.title,
          description: payload.description,
          duration: payload.duration,
          targetImageUrl: payload.targetImageUrl || null,
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
    const confirmed = window.confirm('Start this round? Contestants will be able to see the editor and the countdown timer will begin.');
    if (!confirmed) return;
    try {
      await api.startCompetitionRound(roundId, token);
      setSuccess('Round started');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to start round'));
    }
  };

  const onLockRound = async (roundId: string) => {
    if (!token) return;
    const confirmed = window.confirm('Lock this round now? All unsaved work will be auto-submitted and contestants will no longer be able to edit.');
    if (!confirmed) return;
    try {
      await api.lockCompetitionRound(roundId, token);
      setSuccess('Round locked');
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
    const confirmed = window.confirm(`Delete "${round.title}"?`);
    if (!confirmed) return;
    try {
      await api.deleteCompetitionRound(round.id, token);
      setSuccess('Round deleted');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to delete round'));
    }
  };

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
              <option value="">All team events</option>
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
            <p className="text-gray-500">No team-registration events found.</p>
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
                        {event.status} · {event.teamMinSize || 1}-{event.teamMaxSize || 4} members per team
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
                              Duration: {formatDuration(round.duration)}
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

                        {(round.status === 'DRAFT' || round.status === 'ACTIVE' || round.status === 'LOCKED' || round.status === 'JUDGING' || round.status === 'FINISHED') && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Contestant link:{' '}
                            <a
                              href={`${BASE_PLAYGROUND_URL}/competition/${round.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold underline break-all"
                            >
                              {`${BASE_PLAYGROUND_URL}/competition/${round.id}`}
                            </a>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {round.status === 'DRAFT' && (
                            <>
                              <Button size="sm" className="gap-2" onClick={() => void onStartRound(round.id)}>
                                <Play className="h-4 w-4" />
                                Start Round
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                asChild
                              >
                                <a href={`${BASE_PLAYGROUND_URL}/competition/${round.id}`} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  Open Round Link
                                </a>
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => openEdit(round)}>
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2 text-red-600" onClick={() => void onDeleteRound(round)}>
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </>
                          )}

                          {round.status === 'ACTIVE' && (
                            <>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => void onLockRound(round.id)}>
                                <Square className="h-4 w-4" />
                                Lock Now
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                asChild
                              >
                                <a href={`${BASE_PLAYGROUND_URL}/competition/${round.id}`} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  Open Round Link
                                </a>
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/admin/competition/${round.id}/judge`)}>
                                <Eye className="h-4 w-4" />
                                View Submissions
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
                                <a href={`${BASE_PLAYGROUND_URL}/competition/${round.id}`} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  Open Round Link
                                </a>
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/admin/competition/${round.id}/judge`)}>
                                <Eye className="h-4 w-4" />
                                View Submissions
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
                            </>
                          )}

                          {round.status === 'FINISHED' && (
                            <>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => viewResults(round.id)}>
                                <Eye className="h-4 w-4" />
                                View Results
                              </Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => void exportResults(round)}>
                                <Download className="h-4 w-4" />
                                Export Results
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
              Contestants never see the reference image; it is only used in judging.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitForm} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Event</label>
              <select
                value={form.eventId}
                onChange={(e) => setForm((prev) => ({ ...prev, eventId: e.target.value }))}
                className="h-10 w-full rounded-lg border-2 border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                required
                disabled={Boolean(editingRound)}
              >
                <option value="">Select event</option>
                {teamEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Title</label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Round title"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Description (optional)</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Round instructions"
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Duration (minutes)</label>
              <Input
                type="number"
                min={5}
                max={120}
                required
                value={form.durationMinutes}
                onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value || 0) }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Reference image URL (optional)</label>
              <Input
                type="url"
                value={form.targetImageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, targetImageUrl: e.target.value }))}
                placeholder="https://..."
              />
            </div>

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
    </div>
  );
}
