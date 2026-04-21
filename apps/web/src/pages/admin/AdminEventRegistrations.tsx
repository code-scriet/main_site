import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Calendar, Users, Search, Download, Mail, Trash2, Pencil, Phone, GraduationCap, RefreshCw, CheckCircle, AlertCircle, Lock, Unlock, Crown, LayoutList, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type EventAdminRegistration } from '@/lib/api';
import type { EventTeam } from '@/lib/api';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { extractApiErrorMessage } from '@/lib/error';
import AdminEventInvitations from '@/components/events/AdminEventInvitations';

interface EventWithRegistrations {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  location?: string;
  capacity?: number;
  status: 'UPCOMING' | 'ONGOING' | 'PAST';
  teamRegistration?: boolean;
  teamMinSize?: number;
  teamMaxSize?: number;
  registrations: EventAdminRegistration[];
}

type ExportFilterState = {
  year: string;
  branch: string;
  course: string;
  userRole: string;
  registrationType: '' | 'PARTICIPANT' | 'GUEST';
  search: string;
  format: 'xlsx' | 'csv';
};

const DEFAULT_EXPORT_FILTERS: ExportFilterState = {
  year: '',
  branch: '',
  course: '',
  userRole: '',
  registrationType: '',
  search: '',
  format: 'xlsx',
};

export default function AdminEventRegistrations() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<EventWithRegistrations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string | null>(searchParams.get('eventId'));
  const [activeDetailTab, setActiveDetailTab] = useState<'registrations' | 'invitations'>(
    searchParams.get('tab') === 'invitations' ? 'invitations' : 'registrations',
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingRegId, setDeletingRegId] = useState<string | null>(null);
  const [eventSyncSubmitting, setEventSyncSubmitting] = useState(false);
  const [eventSyncResult, setEventSyncResult] = useState<
    { toOngoing: number; toPastFromOngoing: number; toPastFromUpcoming: number; error?: string } | null
  >(null);
  const [exportFiltersByEvent, setExportFiltersByEvent] = useState<Record<string, ExportFilterState>>({});
  const [teamGroupView, setTeamGroupView] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<Map<string, EventTeam[]>>(new Map());
  const [teamDataLoading, setTeamDataLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    | { type: 'event'; eventId: string; eventTitle: string }
    | { type: 'registration'; eventId: string; registrationId: string; userName: string }
    | { type: 'team'; eventId: string; teamId: string; teamName: string }
    | null
  >(null);

  const getExportFiltersForEvent = (eventId: string): ExportFilterState => (
    exportFiltersByEvent[eventId] ?? DEFAULT_EXPORT_FILTERS
  );

  const hasActiveExportFilters = (filters: ExportFilterState): boolean => (
    filters.year.trim().length > 0
    || filters.branch.trim().length > 0
    || filters.course.trim().length > 0
    || filters.userRole.trim().length > 0
    || filters.registrationType.length > 0
    || filters.search.trim().length > 0
  );

  const setExportFilterValue = (
    eventId: string,
    key: keyof ExportFilterState,
    value: string,
  ) => {
    setExportFiltersByEvent((prev) => {
      const current = prev[eventId] ?? DEFAULT_EXPORT_FILTERS;
      const next: ExportFilterState = {
        ...current,
        [key]: value,
      } as ExportFilterState;

      const isDefault = !hasActiveExportFilters(next) && next.format === DEFAULT_EXPORT_FILTERS.format;
      if (isDefault) {
        const { [eventId]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [eventId]: next,
      };
    });
  };

  const clearExportFilters = (eventId: string) => {
    setExportFiltersByEvent((prev) => {
      if (!prev[eventId]) {
        return prev;
      }
      const { [eventId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const loadEvents = useCallback(async () => {
    if (!token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await api.getEvents();
      // Get detailed registration data for each event
      // N+1: Fetches registrations per event. Acceptable — admin-only page,
      // bounded by total event count (typically <50). Would need a dedicated
      // admin endpoint to batch if event count grows significantly.
      const eventsWithDetails = await Promise.all(
        data.map(async (event) => {
          try {
            const registrations = await api.getEventRegistrations(event.id, token);
            return { ...event, registrations };
          } catch {
            return { ...event, registrations: [] };
          }
        })
      );
      setEvents(eventsWithDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (selectedEvent) {
      nextParams.set('eventId', selectedEvent);
      nextParams.set('tab', activeDetailTab);
    } else {
      nextParams.delete('eventId');
      nextParams.delete('tab');
    }

    const current = searchParams.toString();
    const next = nextParams.toString();
    if (current !== next) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeDetailTab, searchParams, selectedEvent, setSearchParams]);

  const openEventDetails = (eventId: string, tab: 'registrations' | 'invitations' = 'registrations') => {
    setSelectedEvent((current) => current === eventId && activeDetailTab === tab ? null : eventId);
    setActiveDetailTab(tab);
  };

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.registrations.some(r => 
      r.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.user.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const exportRegistrations = async (event: EventWithRegistrations) => {
    if (!token) {
      setError('Authentication required');
      return;
    }
    
    try {
      const filters = getExportFiltersForEvent(event.id);
      const normalizedFilters = {
        year: filters.year.trim() || undefined,
        branch: filters.branch.trim() || undefined,
        course: filters.course.trim() || undefined,
        userRole: filters.userRole.trim() || undefined,
        registrationType: filters.registrationType || undefined,
        search: filters.search.trim() || undefined,
      };
      const hasFilters = Object.values(normalizedFilters).some(Boolean);

      const blob = await api.exportEventRegistrations(event.id, token, {
        format: filters.format,
        filters: hasFilters ? normalizedFilters : undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = filters.format === 'csv' ? 'csv' : 'xlsx';
      a.download = `${event.title.replace(/\s+/g, '_')}_registrations.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(hasFilters ? `Filtered ${ext.toUpperCase()} exported` : `${ext.toUpperCase()} exported`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export');
    }
  };

  const handleDeleteEvent = async (eventId: string, eventTitle: string) => {
    if (!token) {
      setError('Authentication required');
      return;
    }

    try {
      setDeletingId(eventId);
      setError(null);
      await api.deleteEvent(eventId, token);
      setConfirmDialog(null);
      toast.success(`Deleted "${eventTitle}"`);
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteRegistration = async (eventId: string, registrationId: string, userName: string) => {
    if (!token) {
      setError('Authentication required');
      return;
    }

    try {
      setDeletingRegId(registrationId);
      setError(null);
      await api.deleteEventRegistration(eventId, registrationId, token);
      setConfirmDialog(null);
      toast.success(`Removed ${userName} from the event`);
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove participant');
    } finally {
      setDeletingRegId(null);
    }
  };

  const toggleTeamGroupView = async (eventId: string) => {
    if (teamGroupView === eventId) {
      setTeamGroupView(null);
      return;
    }
    setTeamGroupView(eventId);
    if (!teamData.has(eventId)) {
      try {
        setTeamDataLoading(eventId);
        const result = await api.getEventTeams(eventId, token!);
        setTeamData(prev => new Map(prev).set(eventId, result.teams));
      } catch (err) {
        toast.error(extractApiErrorMessage(err, 'Failed to load teams'));
        setTeamGroupView(null);
      } finally {
        setTeamDataLoading(null);
      }
    }
  };

  const handleAdminToggleLock = async (teamId: string, eventId: string) => {
    try {
      await api.adminToggleTeamLock(teamId, token!);
      const result = await api.getEventTeams(eventId, token!);
      setTeamData(prev => new Map(prev).set(eventId, result.teams));
      toast.success('Team lock toggled');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to toggle lock'));
    }
  };

  const handleAdminDissolve = async (teamId: string, teamName: string, eventId: string) => {
    try {
      await api.adminDissolveTeam(teamId, token!);
      const result = await api.getEventTeams(eventId, token!);
      setTeamData(prev => new Map(prev).set(eventId, result.teams));
      await loadEvents();
      setConfirmDialog(null);
      toast.success(`Dissolved "${teamName}"`);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Failed to dissolve team'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Event Registrations</h1>
          <p className="text-gray-600">View and manage event participants</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={eventSyncSubmitting || !token}
            onClick={async () => {
              if (!token) return;
              setEventSyncSubmitting(true);
              setEventSyncResult(null);
              try {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
                const res = await fetch(`${apiUrl}/settings/event-status/sync-now`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                  credentials: 'include',
                });
                const data = await res.json();
                if (data.success && data.data) {
                  setEventSyncResult(data.data);
                  await loadEvents();
                } else {
                  setEventSyncResult({
                    toOngoing: 0,
                    toPastFromOngoing: 0,
                    toPastFromUpcoming: 0,
                    error: data.error?.message || 'Sync failed',
                  });
                }
              } catch {
                setEventSyncResult({
                  toOngoing: 0,
                  toPastFromOngoing: 0,
                  toPastFromUpcoming: 0,
                  error: 'Network error',
                });
              } finally {
                setEventSyncSubmitting(false);
              }
            }}
          >
            {eventSyncSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync Event Status Now
          </Button>
        </div>
      </div>

      {eventSyncResult && !eventSyncResult.error && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 text-sm text-green-700">
            <p className="flex items-center gap-2 font-medium mb-1">
              <CheckCircle className="h-4 w-4" />
              Event status sync completed.
            </p>
            <p>
              UPCOMING -&gt; ONGOING: {eventSyncResult.toOngoing} | ONGOING -&gt; PAST: {eventSyncResult.toPastFromOngoing} | UPCOMING -&gt; PAST: {eventSyncResult.toPastFromUpcoming}
            </p>
          </CardContent>
        </Card>
      )}

      {eventSyncResult?.error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-700">
            <p className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              {eventSyncResult.error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by event name, participant name, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              {searchQuery ? 'No events match your search' : 'No events found'}
            </CardContent>
          </Card>
        ) : (
          filteredEvents.map((event) => {
            const participantRegistrations = event.registrations.filter((registration) => registration.registrationType === 'PARTICIPANT');
            const guestRegistrations = event.registrations.filter((registration) => registration.registrationType === 'GUEST');
            const exportFilters = getExportFiltersForEvent(event.id);
            const isFilteredExport = hasActiveExportFilters(exportFilters);
            const userRoleOptions = Array.from(new Set(event.registrations.map((registration) => registration.user.role))).sort();

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border-gray-200">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-gray-400" />
                          {event.title}
                          {event.teamRegistration && (
                            <Badge variant="outline" className="ml-2 text-purple-600 border-purple-300">
                              <Users className="h-3 w-3 mr-1" />
                              Team Event ({event.teamMinSize}-{event.teamMaxSize})
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>{formatDate(event.startDate)}</span>
                          {event.location && <span>• {event.location}</span>}
                          <Badge variant={event.status === 'UPCOMING' ? 'default' : 'secondary'}>
                            {event.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-gray-700">
                          <Users className="h-3 w-3 mr-1" />
                          {participantRegistrations.length} participants
                          {event.capacity && ` / ${event.capacity}`}
                        </Badge>
                        {guestRegistrations.length > 0 && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">
                            {guestRegistrations.length} guests
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant={selectedEvent === event.id && activeDetailTab === 'registrations' ? 'default' : 'outline'}
                          onClick={() => openEventDetails(event.id, 'registrations')}
                        >
                          Registrations
                        </Button>
                        <Button
                          size="sm"
                          variant={selectedEvent === event.id && activeDetailTab === 'invitations' ? 'default' : 'outline'}
                          onClick={() => openEventDetails(event.id, 'invitations')}
                        >
                          Invitations
                        </Button>
                      {event.teamRegistration && (
                        <>
                          <Button
                            size="sm"
                            variant={teamGroupView === event.id ? 'default' : 'outline'}
                            onClick={() => toggleTeamGroupView(event.id)}
                            disabled={teamDataLoading === event.id}
                          >
                            {teamDataLoading === event.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : teamGroupView === event.id ? (
                              <LayoutList className="h-4 w-4 mr-1" />
                            ) : (
                              <LayoutGrid className="h-4 w-4 mr-1" />
                            )}
                            {teamGroupView === event.id ? 'Flat View' : 'Group by Team'}
                          </Button>
                          <Link to={`/admin/events/${event.id}/attendance`}>
                            <Button size="sm" variant="outline">
                              <Users className="h-4 w-4 mr-1" />
                              Hub
                            </Button>
                          </Link>
                        </>
                      )}
                      {event.registrations.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => exportRegistrations(event)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          {isFilteredExport ? 'Export Filtered' : 'Export'}
                        </Button>
                      )}
                      <Link to={`/admin/events/${event.id}/edit`}>
                        <Button size="sm" variant="outline">
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDialog({ type: 'event', eventId: event.id, eventTitle: event.title })}
                        disabled={deletingId === event.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {deletingId === event.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    </div>
                  </CardHeader>

                {selectedEvent === event.id && (
                  <CardContent>
                    <Tabs value={activeDetailTab} onValueChange={(value) => setActiveDetailTab(value as 'registrations' | 'invitations')}>
                      <TabsList className="mb-4 grid w-full max-w-md grid-cols-2">
                        <TabsTrigger value="registrations">
                          Registrations
                        </TabsTrigger>
                        <TabsTrigger value="invitations">
                          Invitations
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="registrations" className="space-y-4">
                        <Card className="border-slate-200 bg-slate-50/70">
                          <CardContent className="space-y-3 pb-4 pt-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-700">Export Filters</p>
                                <p className="text-xs text-slate-500">Use any combination of filters, then export only matching registrations.</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={exportFilters.format}
                                  onChange={(e) => setExportFilterValue(event.id, 'format', e.target.value)}
                                  className="h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                  <option value="xlsx">XLSX</option>
                                  <option value="csv">CSV</option>
                                </select>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={!isFilteredExport}
                                  onClick={() => clearExportFilters(event.id)}
                                >
                                  Clear
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => exportRegistrations(event)}
                                  disabled={event.registrations.length === 0}
                                >
                                  <Download className="mr-1 h-4 w-4" />
                                  {isFilteredExport ? 'Export Filtered' : 'Export All'}
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              <Input
                                value={exportFilters.year}
                                onChange={(e) => setExportFilterValue(event.id, 'year', e.target.value)}
                                placeholder="Year (e.g. 3 or 2026)"
                              />
                              <Input
                                value={exportFilters.branch}
                                onChange={(e) => setExportFilterValue(event.id, 'branch', e.target.value)}
                                placeholder="Branch (e.g. CSE)"
                              />
                              <Input
                                value={exportFilters.course}
                                onChange={(e) => setExportFilterValue(event.id, 'course', e.target.value)}
                                placeholder="Course (e.g. B.Tech)"
                              />

                              <select
                                value={exportFilters.userRole}
                                onChange={(e) => setExportFilterValue(event.id, 'userRole', e.target.value)}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <option value="">All user roles</option>
                                {userRoleOptions.map((role) => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>

                              <select
                                value={exportFilters.registrationType}
                                onChange={(e) => setExportFilterValue(event.id, 'registrationType', e.target.value)}
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <option value="">All registration types</option>
                                <option value="PARTICIPANT">PARTICIPANT</option>
                                <option value="GUEST">GUEST</option>
                              </select>

                              <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <Input
                                  value={exportFilters.search}
                                  onChange={(e) => setExportFilterValue(event.id, 'search', e.target.value)}
                                  placeholder="Search name/email/phone"
                                  className="pl-9"
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {event.registrations.length === 0 ? (
                          <p className="py-8 text-center text-gray-500">No registrations yet</p>
                        ) : teamGroupView === event.id && teamData.has(event.id) ? (
                          <div className="space-y-4">
                            {teamData.get(event.id)!.map((team) => {
                              const memberUserIds = new Set(team.members.map((member) => member.userId));
                              const teamRegs = participantRegistrations.filter((registration) => memberUserIds.has(registration.user.id));
                              return (
                                <Card key={team.id} className="border-purple-100">
                                  <CardHeader className="py-3 px-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm">{team.teamName}</span>
                                        <Badge variant="outline" className="text-xs">
                                          {team.members.length}/{event.teamMaxSize || 4}
                                        </Badge>
                                        {team.isLocked && (
                                          <Badge variant="secondary" className="text-xs gap-1">
                                            <Lock className="h-2.5 w-2.5" /> Locked
                                          </Badge>
                                        )}
                                        {team.members.length >= (event.teamMinSize || 1) ? (
                                          <Badge className="bg-green-100 text-green-700 text-xs">Complete</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Incomplete</Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleAdminToggleLock(team.id, event.id)}>
                                          {team.isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDialog({ type: 'team', teamId: team.id, teamName: team.teamName, eventId: event.id })}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="pt-0 px-4 pb-3">
                                    <div className="divide-y divide-gray-100">
                                      {teamRegs.map((registration) => {
                                        const isLeader = registration.user.id === team.leaderId;
                                        return (
                                          <div key={registration.id} className="py-2 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-semibold flex-shrink-0">
                                                {registration.user.name.charAt(0).toUpperCase()}
                                              </div>
                                              <div>
                                                <div className="flex items-center gap-1.5">
                                                  <span className="text-sm font-medium">{registration.user.name}</span>
                                                  {isLeader && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                                                </div>
                                                <span className="text-xs text-gray-500">{registration.user.email}</span>
                                              </div>
                                            </div>
                                            <Button size="sm" variant="ghost" onClick={() => setConfirmDialog({ type: 'registration', eventId: event.id, registrationId: registration.id, userName: registration.user.name })} disabled={deletingRegId === registration.id} className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7">
                                              {deletingRegId === registration.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                            </Button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}

                            {(() => {
                              const allTeamUserIds = new Set(
                                teamData.get(event.id)!.flatMap((team) => team.members.map((member) => member.userId)),
                              );
                              const unaffiliated = participantRegistrations.filter((registration) => !allTeamUserIds.has(registration.user.id));
                              if (unaffiliated.length === 0) return null;
                              return (
                                <Card className="border-gray-200">
                                  <CardHeader className="py-3 px-4">
                                    <span className="font-semibold text-sm text-gray-500">Unaffiliated Participants ({unaffiliated.length})</span>
                                  </CardHeader>
                                  <CardContent className="pt-0 px-4 pb-3">
                                    <div className="divide-y divide-gray-100">
                                      {unaffiliated.map((registration) => (
                                        <div key={registration.id} className="py-2 flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                                              {registration.user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                              <span className="text-sm font-medium">{registration.user.name}</span>
                                              <span className="text-xs text-gray-500 ml-2">{registration.user.email}</span>
                                            </div>
                                          </div>
                                          <Button size="sm" variant="ghost" onClick={() => setConfirmDialog({ type: 'registration', eventId: event.id, registrationId: registration.id, userName: registration.user.name })} disabled={deletingRegId === registration.id} className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7">
                                            {deletingRegId === registration.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })()}

                            {guestRegistrations.length > 0 && (
                              <Card className="border-amber-200">
                                <CardHeader className="py-3 px-4">
                                  <span className="font-semibold text-sm text-amber-800">Guests ({guestRegistrations.length})</span>
                                </CardHeader>
                                <CardContent className="space-y-3 pt-0 px-4 pb-4">
                                  {guestRegistrations.map((registration) => (
                                    <div key={registration.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-3">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-gray-900">{registration.user.name}</span>
                                          {registration.invitation?.role && <Badge variant="outline">{registration.invitation.role}</Badge>}
                                        </div>
                                        <p className="mt-1 text-sm text-gray-500">{registration.user.email}</p>
                                      </div>
                                      <Button size="sm" variant="outline" onClick={() => setActiveDetailTab('invitations')}>
                                        Manage Invitation
                                      </Button>
                                    </div>
                                  ))}
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <h3 className="font-semibold text-sm text-gray-700">
                                Participants ({participantRegistrations.length})
                              </h3>
                              {participantRegistrations.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-gray-500">
                                  No participant registrations yet.
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-100">
                                  {participantRegistrations.map((registration) => (
                                    <div
                                      key={registration.id}
                                      className="py-3 flex items-start justify-between hover:bg-gray-50 px-3 -mx-3 rounded-lg transition-colors"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold flex-shrink-0">
                                          {registration.user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-gray-900">
                                              {registration.user.name}
                                            </span>
                                            <Badge variant="outline" className="text-xs">
                                              {registration.user.role}
                                            </Badge>
                                          </div>
                                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                            <span className="flex items-center gap-1">
                                              <Mail className="h-3 w-3" />
                                              {registration.user.email}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1 flex-wrap">
                                            {registration.user.phone && (
                                              <span className="flex items-center gap-1">
                                                <Phone className="h-3 w-3" />
                                                {registration.user.phone}
                                              </span>
                                            )}
                                            {registration.user.course && registration.user.branch && registration.user.year && (
                                              <span className="flex items-center gap-1">
                                                <GraduationCap className="h-3 w-3" />
                                                {registration.user.course} - {registration.user.branch} - {registration.user.year}
                                              </span>
                                            )}
                                            <span className="text-xs text-gray-400">
                                              Registered: {formatDate(registration.timestamp)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setConfirmDialog({ type: 'registration', eventId: event.id, registrationId: registration.id, userName: registration.user.name })}
                                        disabled={deletingRegId === registration.id}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      >
                                        {deletingRegId === registration.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <h3 className="font-semibold text-sm text-amber-800">
                                Guests ({guestRegistrations.length})
                              </h3>
                              {guestRegistrations.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-700">
                                  No accepted guest registrations yet.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {guestRegistrations.map((registration) => (
                                    <div
                                      key={registration.id}
                                      className="flex items-start justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"
                                    >
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-medium text-gray-900">{registration.user.name}</span>
                                          {registration.invitation?.role && <Badge variant="outline">{registration.invitation.role}</Badge>}
                                          <Badge variant="outline" className="border-amber-300 text-amber-800">Guest</Badge>
                                        </div>
                                        <p className="mt-1 text-sm text-gray-500">{registration.user.email}</p>
                                        <p className="mt-1 text-xs text-gray-400">Accepted on {formatDate(registration.timestamp)}</p>
                                      </div>
                                      <Button size="sm" variant="outline" onClick={() => setActiveDetailTab('invitations')}>
                                        Manage Invitation
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="invitations">
                        <AdminEventInvitations eventId={event.id} eventTitle={event.title} token={token!} />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                )}
              </Card>
            </motion.div>
            );
          })
        )}
      </div>

      <AlertDialog open={Boolean(confirmDialog)} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.type === 'event'
                ? 'Delete event?'
                : confirmDialog?.type === 'team'
                  ? 'Dissolve team?'
                  : 'Remove registration?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.type === 'event' && (
                `This will permanently delete "${confirmDialog.eventTitle}" and remove all registrations for this event.`
              )}
              {confirmDialog?.type === 'team' && (
                `This will dissolve "${confirmDialog.teamName}" and cancel all member registrations.`
              )}
              {confirmDialog?.type === 'registration' && (
                `This will remove "${confirmDialog.userName}" from this event.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!confirmDialog) return;
                if (confirmDialog.type === 'event') {
                  void handleDeleteEvent(confirmDialog.eventId, confirmDialog.eventTitle);
                  return;
                }
                if (confirmDialog.type === 'team') {
                  void handleAdminDissolve(confirmDialog.teamId, confirmDialog.teamName, confirmDialog.eventId);
                  return;
                }
                void handleDeleteRegistration(confirmDialog.eventId, confirmDialog.registrationId, confirmDialog.userName);
              }}
            >
              {confirmDialog?.type === 'event'
                ? 'Delete Event'
                : confirmDialog?.type === 'team'
                  ? 'Dissolve Team'
                  : 'Remove Registration'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
