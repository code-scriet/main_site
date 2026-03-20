import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Registration, Event, EventTeam } from '@/lib/api';
import { Calendar, MapPin, Clock, Loader2, Plus, QrCode, Users, MoreVertical, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate, formatTime } from '@/lib/dateUtils';
import { toast } from 'sonner';
import EventCard from '@/components/home/EventCard';
import QRTicket from '@/components/attendance/QRTicket';
import { getRegistrationStatus } from '@/lib/registrationStatus';
import { TeamDashboard } from '@/components/teams';

export default function DashboardEvents() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [availableEvents, setAvailableEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [myTeams, setMyTeams] = useState<Map<string, EventTeam>>(new Map());
  const [teamsLoading, setTeamsLoading] = useState<Map<string, boolean>>(new Map());

  const [activeTab, setActiveTab] = useState('my-events');
  const [qrDialogReg, setQrDialogReg] = useState<Registration | null>(null);
  const [teamDialogEventId, setTeamDialogEventId] = useState<string | null>(null);

  const isCoreMember = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  const hasCompleteAcademicDetails = user?.phone && user?.course && user?.branch && user?.year;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      const [regs, events] = await Promise.all([
        api.getMyRegistrations(token),
        api.getEvents(),
      ]);

      setRegistrations(regs);

      const registeredEventIds = new Set(regs.map(r => r.eventId));
      setAvailableEvents(events.filter(e => !registeredEventIds.has(e.id) && e.status !== 'PAST'));

      // Load team data for team events
      const teamEventIds = regs.filter(r => r.event.teamRegistration).map(r => r.eventId);
      if (teamEventIds.length > 0 && token) {
        await loadTeamsForEvents(teamEventIds);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const loadTeamsForEvents = async (eventIds: string[]) => {
    if (!token) return;

    for (const eventId of eventIds) {
      try {
        setTeamsLoading(prev => new Map(prev).set(eventId, true));
        const team = await api.getMyTeam(eventId, token);
        if (team) {
          setMyTeams(prev => new Map(prev).set(eventId, team));
        }
      } catch {
        // User might not be in a team yet
      } finally {
        setTeamsLoading(prev => new Map(prev).set(eventId, false));
      }
    }
  };

  const handleTeamChange = async (eventId: string) => {
    if (!token) return;
    await loadTeamsForEvents([eventId]);
    await loadData();
  };

  const handleRegister = async (event: Event) => {
    if (!token) {
      toast.error('Please log in to register for events');
      return;
    }

    if (!hasCompleteAcademicDetails) {
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      navigate('/dashboard/profile', { state: { message: 'Please complete your profile to register for events', pendingEventId: event.id } });
      return;
    }

    if (event.teamRegistration) {
      localStorage.setItem('pendingEventRegistrationType', 'team');
      navigate(`/events/${event.slug || event.id}`);
      return;
    }

    if (event.registrationFields && event.registrationFields.length > 0) {
      localStorage.setItem('pendingEventRegistrationType', 'solo');
      navigate(`/events/${event.slug || event.id}?register=1`);
      return;
    }

    try {
      setRegisteringId(event.id);
      localStorage.setItem('pendingEventRegistrationType', 'solo');
      await api.registerForEvent(event.id, token);
      toast.success('Registered successfully!');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setRegisteringId(null);
    }
  };

  const handleCancel = async (eventId: string) => {
    if (!token) {
      toast.error('Please log in to cancel registration');
      return;
    }

    const team = myTeams.get(eventId);
    if (team && team.leaderId === user?.id) {
      toast.error('You are the team leader. Transfer leadership or dissolve the team before cancelling.');
      return;
    }

    try {
      setCancelingId(eventId);
      await api.cancelRegistration(eventId, token);
      toast.success('Registration cancelled');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel registration');
    } finally {
      setCancelingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your event registrations</p>
        </div>
        {isCoreMember && (
          <Link to="/dashboard/events/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Create Event
            </Button>
          </Link>
        )}
      </div>

      {/* Tabbed Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="my-events">My Events</TabsTrigger>
          <TabsTrigger value="browse">Browse Events</TabsTrigger>
        </TabsList>

        {/* Tab 1: My Events — card grid */}
        <TabsContent value="my-events">
          {registrations.length === 0 ? (
            <Card className="border-gray-100 shadow-sm">
              <CardContent className="py-16 text-center">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 font-medium">No registered events yet</p>
                <p className="text-sm text-gray-400 mt-1 mb-4">Browse available events to get started.</p>
                <Button variant="outline" size="sm" onClick={() => setActiveTab('browse')}>
                  Browse Events
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {registrations.map((reg, index) => {
                const team = myTeams.get(reg.eventId);
                const teamLoading = teamsLoading.get(reg.eventId);

                return (
                  <motion.div
                    key={reg.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                  >
                    <div className="rounded-xl bg-white shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200 overflow-hidden">
                      {/* Card content */}
                      <div className="p-5">
                        {/* Title row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 truncate text-[15px]">
                                {reg.event.title}
                              </h3>
                              <Badge
                                variant={
                                  reg.event.status === 'UPCOMING' ? 'success' :
                                  reg.event.status === 'ONGOING' ? 'warning' : 'secondary'
                                }
                                className="text-[10px] px-1.5 py-0 shrink-0"
                              >
                                {reg.event.status}
                              </Badge>
                            </div>

                            {/* Date & location */}
                            <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDate(reg.event.startDate)} at {formatTime(reg.event.startDate)}
                              </span>
                              {reg.event.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[120px]">{reg.event.location}</span>
                                </span>
                              )}
                            </div>

                            {/* Team indicator */}
                            {reg.event.teamRegistration && (
                              <div className="mt-2">
                                {teamLoading ? (
                                  <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Loading team...
                                  </span>
                                ) : team ? (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                                    <Users className="h-3 w-3" />
                                    {team.teamName} — {team.members?.length || 1}/{reg.event.teamMaxSize || 4}
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                    <Users className="h-3 w-3" />
                                    Team Event — No team yet
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 3-dot dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-600">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/events/${reg.event.slug || reg.event.id}`} className="flex items-center gap-2">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Event Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                disabled={cancelingId === reg.eventId}
                                onClick={() => handleCancel(reg.eventId)}
                              >
                                {cancelingId === reg.eventId ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                ) : null}
                                Cancel Registration
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
                        <Link to={`/events/${reg.event.slug || reg.event.id}`}>
                          <Button variant="outline" size="sm" className="h-8 text-xs border-gray-200 text-gray-700 hover:bg-gray-50">
                            View Event
                          </Button>
                        </Link>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-gray-200 text-gray-700 hover:bg-gray-50"
                          onClick={() => setQrDialogReg(reg)}
                        >
                          <QrCode className="h-3.5 w-3.5 mr-1.5" />
                          QR Code
                        </Button>

                        {reg.event.teamRegistration && (
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-none"
                            onClick={() => setTeamDialogEventId(reg.eventId)}
                          >
                            <Users className="h-3.5 w-3.5 mr-1.5" />
                            {team ? 'My Team' : 'Join / Create Team'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Browse Events */}
        <TabsContent value="browse">
          {availableEvents.length === 0 ? (
            <Card className="border-gray-100 shadow-sm">
              <CardContent className="py-16 text-center">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 font-medium">No available events right now</p>
                <p className="text-sm text-gray-400 mt-1">Check back later for new events!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {availableEvents.map((event, index) => {
                const regStatus = getRegistrationStatus(event);
                return (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={index}
                    registrationStatus={regStatus}
                    onRegister={() => handleRegister(event)}
                    registering={registeringId === event.id}
                    showActions={true}
                    registerLabel={event.teamRegistration ? 'Join as Team' : 'Register Now'}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* QR Code Dialog */}
      <Dialog open={!!qrDialogReg} onOpenChange={(open) => !open && setQrDialogReg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your QR Ticket</DialogTitle>
            <DialogDescription>{qrDialogReg?.event.title}</DialogDescription>
          </DialogHeader>
          {qrDialogReg && (
            <QRTicket
              attendanceToken={qrDialogReg.attendanceToken || null}
              attended={qrDialogReg.attended || false}
              scannedAt={qrDialogReg.scannedAt || null}
              event={{
                title: qrDialogReg.event.title,
                startDate: qrDialogReg.event.startDate,
                endDate: qrDialogReg.event.endDate || null,
                status: qrDialogReg.event.status,
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Team Management Dialog */}
      <Dialog open={!!teamDialogEventId} onOpenChange={(open) => !open && setTeamDialogEventId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              My Team
            </DialogTitle>
            {teamDialogEventId && (
              <DialogDescription>
                {registrations.find(r => r.eventId === teamDialogEventId)?.event.title}
              </DialogDescription>
            )}
          </DialogHeader>
          {teamDialogEventId && (
            teamsLoading.get(teamDialogEventId) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Loading team...</span>
              </div>
            ) : myTeams.get(teamDialogEventId) ? (
              <TeamDashboard
                team={myTeams.get(teamDialogEventId)!}
                event={registrations.find(r => r.eventId === teamDialogEventId)!.event}
                onTeamChange={() => handleTeamChange(teamDialogEventId)}
              />
            ) : (
              <div className="text-center py-8">
                <Users className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-600 font-medium">You're not in a team yet</p>
                <p className="text-sm text-gray-400 mt-1 mb-4">Join or create a team from the event page.</p>
                <Link to={`/events/${registrations.find(r => r.eventId === teamDialogEventId)?.event.slug || teamDialogEventId}`}>
                  <Button size="sm" onClick={() => setTeamDialogEventId(null)}>
                    Go to Event Page
                  </Button>
                </Link>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
