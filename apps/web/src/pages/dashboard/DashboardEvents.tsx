import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Registration, Event } from '@/lib/api';
import { Calendar, MapPin, Users, Clock, Loader2, AlertCircle, Plus, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

// Helper to get registration status
function getRegistrationStatus(event: Event): {
  status: 'not_started' | 'open' | 'closed' | 'full' | 'past';
  message: string;
  canRegister: boolean;
} {
  const now = new Date();
  const eventStart = new Date(event.startDate);
  const regStart = event.registrationStartDate ? new Date(event.registrationStartDate) : null;
  const regEnd = event.registrationEndDate ? new Date(event.registrationEndDate) : eventStart;

  if (event.status === 'PAST') {
    return { status: 'past', message: 'Event has ended', canRegister: false };
  }

  if (event.capacity && event._count && event._count.registrations >= event.capacity) {
    return { status: 'full', message: 'Event is full', canRegister: false };
  }

  if (regStart && now < regStart) {
    return { 
      status: 'not_started', 
      message: `Opens ${regStart.toLocaleDateString()}`, 
      canRegister: false 
    };
  }

  if (regEnd && now > regEnd) {
    return { status: 'closed', message: 'Registration closed', canRegister: false };
  }

  return { status: 'open', message: 'Registration open', canRegister: true };
}

export default function DashboardEvents() {
  const { user, token } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [availableEvents, setAvailableEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const isCoreMember = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN';

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
      setError(null);
      
      const [regs, events] = await Promise.all([
        api.getMyRegistrations(token),
        api.getEvents(),
      ]);
      
      setRegistrations(regs);
      
      // Filter out events user is already registered for
      const registeredEventIds = new Set(regs.map(r => r.eventId));
      setAvailableEvents(events.filter(e => !registeredEventIds.has(e.id) && e.status !== 'PAST'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (eventId: string) => {
    if (!token) {
      setError('Please log in to register for events');
      return;
    }
    
    // Check if profile is completed
    if (user && !user.profileCompleted) {
      setError('Please complete your profile before registering for events');
      return;
    }
    
    try {
      console.log('Registering for event:', eventId);
      setRegisteringId(eventId);
      setError(null);
      await api.registerForEvent(eventId, token);
      console.log('Registration successful');
      await loadData();
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setRegisteringId(null);
    }
  };

  const handleCancel = async (eventId: string) => {
    if (!token) {
      setError('Please log in to cancel registration');
      return;
    }
    try {
      setCancelingId(eventId);
      setError(null);
      await api.cancelRegistration(eventId, token);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel registration');
    } finally {
      setCancelingId(null);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Events</h1>
          <p className="text-gray-600">Manage your event registrations</p>
        </div>
        {isCoreMember && (
          <Link to="/dashboard/events/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </Link>
        )}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      {/* My Registrations */}
      <Card>
        <CardHeader>
          <CardTitle>My Registered Events</CardTitle>
          <CardDescription>Events you've signed up for</CardDescription>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>You haven't registered for any events yet.</p>
              <p className="text-sm mt-1">Browse available events below!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {registrations.map((reg, index) => (
                <motion.div
                  key={reg.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-colors gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-amber-900">{reg.event.title}</h3>
                      <Badge variant={
                        reg.event.status === 'UPCOMING' ? 'success' :
                        reg.event.status === 'ONGOING' ? 'warning' : 'secondary'
                      }>
                        {reg.event.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(reg.event.startDate).toLocaleDateString()}
                      </span>
                      {reg.event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {reg.event.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancel(reg.eventId)}
                    disabled={cancelingId === reg.eventId}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {cancelingId === reg.eventId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Cancel Registration'
                    )}
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Events */}
      <Card>
        <CardHeader>
          <CardTitle>Available Events</CardTitle>
          <CardDescription>Upcoming events you can register for</CardDescription>
        </CardHeader>
        <CardContent>
          {availableEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No available events at the moment.</p>
              <p className="text-sm mt-1">Check back later for new events!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {availableEvents.map((event, index) => {
                const regStatus = getRegistrationStatus(event);
                
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-4 rounded-lg border border-amber-200 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-amber-900">{event.title}</h3>
                      <Badge variant={event.status === 'UPCOMING' ? 'success' : 'warning'}>
                        {event.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{event.description}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(event.startDate).toLocaleDateString()}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {event.location}
                        </span>
                      )}
                      {event.capacity && (
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {event._count?.registrations || 0}/{event.capacity}
                        </span>
                      )}
                    </div>
                    
                    {/* Registration Status Badge */}
                    <div className={`flex items-center gap-2 text-xs px-2 py-1 rounded mb-3 ${
                      regStatus.status === 'open' ? 'bg-green-50 text-green-700' :
                      regStatus.status === 'not_started' ? 'bg-blue-50 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {regStatus.status === 'open' ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      <span>{regStatus.message}</span>
                    </div>
                    
                    <Button
                      className="w-full"
                      onClick={() => handleRegister(event.id)}
                      disabled={registeringId === event.id || !regStatus.canRegister}
                    >
                      {registeringId === event.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Registering...
                        </>
                      ) : !regStatus.canRegister ? (
                        regStatus.message
                      ) : (
                        'Register Now'
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
