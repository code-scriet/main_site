import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Registration, Event } from '@/lib/api';
import { Calendar, MapPin, Clock, Loader2, AlertCircle, Plus, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate, formatTime, formatDateTime } from '@/lib/dateUtils';
import EventCard from '@/components/home/EventCard';
import { Markdown } from '@/components/ui/markdown';

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
      message: `Opens ${formatDate(regStart)}`, 
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
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [availableEvents, setAvailableEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const isCoreMember = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN';
  
  // Check if academic details are complete
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

  const handleRegister = async (event: Event) => {
    if (!token) {
      setError('Please log in to register for events');
      return;
    }
    
    // Check if academic details are complete - redirect to profile if not
    if (!hasCompleteAcademicDetails) {
      // Save pending registration
      localStorage.setItem('pendingEventRegistration', event.id);
      navigate('/dashboard/profile', { state: { message: 'Please complete your profile to register for events', pendingEventId: event.id } });
      return;
    }

    if (event.registrationFields && event.registrationFields.length > 0) {
      navigate(`/events/${event.slug || event.id}?register=1`);
      return;
    }
    
    try {
      console.log('Registering for event:', event.id);
      setRegisteringId(event.id);
      setError(null);
      await api.registerForEvent(event.id, token);
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
                  className="rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-colors overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
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
                          {formatDate(reg.event.startDate)} at {formatTime(reg.event.startDate)}
                        </span>
                        {reg.event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {reg.event.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedEventId(expandedEventId === reg.eventId ? null : reg.eventId)}
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-100"
                      >
                        {expandedEventId === reg.eventId ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-1" />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-1" />
                            View Details
                          </>
                        )}
                      </Button>
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
                          'Cancel'
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Expanded Event Details */}
                  {expandedEventId === reg.eventId && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-amber-200 bg-white p-4"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Description */}
                        <div className="sm:col-span-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                            <FileText className="h-4 w-4 text-amber-600" />
                            Description
                          </div>
                          <div className="text-sm text-gray-600 prose prose-sm max-w-none">
                            <Markdown>{reg.event.description || 'No description available'}</Markdown>
                          </div>
                        </div>
                        
                        {/* Event Type */}
                        {reg.event.eventType && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">Event Type</div>
                            <Badge variant="outline">{reg.event.eventType}</Badge>
                          </div>
                        )}
                        
                        {/* Venue */}
                        {reg.event.venue && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">Venue</div>
                            <p className="text-sm text-gray-600">{reg.event.venue}</p>
                          </div>
                        )}
                        
                        {/* Time Details */}
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-1">Start Time</div>
                          <p className="text-sm text-gray-600">{formatDateTime(reg.event.startDate)}</p>
                        </div>
                        
                        {reg.event.endDate && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">End Time</div>
                            <p className="text-sm text-gray-600">{formatDateTime(reg.event.endDate)}</p>
                          </div>
                        )}
                        
                        {/* Capacity */}
                        {reg.event.capacity && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">Capacity</div>
                            <p className="text-sm text-gray-600">
                              {reg.event._count?.registrations || 0} / {reg.event.capacity} registered
                            </p>
                          </div>
                        )}
                        
                        {/* Prerequisites */}
                        {reg.event.prerequisites && (
                          <div className="sm:col-span-2">
                            <div className="text-sm font-medium text-gray-700 mb-1">Prerequisites</div>
                            <p className="text-sm text-gray-600">{reg.event.prerequisites}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
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
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
