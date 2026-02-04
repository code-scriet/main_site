import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Loader2, Clock, AlertCircle, CheckCircle, LogIn, ArrowRight, Star } from 'lucide-react';
import { api, type Event } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { formatDate, formatTime } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';

type EventStatus = 'UPCOMING' | 'ONGOING' | 'PAST';

const statusBadgeVariant = (status: EventStatus) => {
  switch (status) {
    case 'UPCOMING':
      return 'success';
    case 'ONGOING':
      return 'warning';
    case 'PAST':
      return 'secondary';
    default:
      return 'default';
  }
};

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
      message: `Registration opens ${formatDate(regStart)} at ${formatTime(regStart)}`, 
      canRegister: false 
    };
  }

  if (regEnd && now > regEnd) {
    return { status: 'closed', message: 'Registration closed', canRegister: false };
  }

  return { status: 'open', message: 'Registration open', canRegister: true };
}

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<EventStatus | 'ALL'>('ALL');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set());
  
  const { user, token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch events
        const eventsData = await api.getEvents();
        setEvents(eventsData);
        
        // Fetch user registrations if logged in
        if (token) {
          try {
            const registrations = await api.getMyRegistrations(token);
            setRegisteredEventIds(new Set(registrations.map(r => r.eventId)));
          } catch (err) {
            console.error('Failed to fetch user registrations', err);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const handleRegister = async (event: Event) => {
    const regStatus = getRegistrationStatus(event);
    
    if (!regStatus.canRegister) {
      setRegistrationError(regStatus.message);
      setTimeout(() => setRegistrationError(null), 3000);
      return;
    }

    if (!user || !token) {
      // Save pending registration
      localStorage.setItem('pendingEventRegistration', event.id);
      // Redirect to sign in
      navigate('/signin', { state: { from: '/events', message: 'Please sign in to register for events', pendingEventId: event.id } });
      return;
    }

    // Check if academic details are complete - redirect to profile if not
    if (!user.phone || !user.course || !user.branch || !user.year) {
      // Save pending registration
      localStorage.setItem('pendingEventRegistration', event.id);
      navigate('/dashboard/profile', { state: { message: 'Please complete your profile to register for events', pendingEventId: event.id } });
      return;
    }

    try {
      setRegistering(event.id);
      setRegistrationError(null);
      await api.registerForEvent(event.id, token);
      setRegistrationSuccess(`Successfully registered for "${event.title}"!`);
      
      // Refresh events to update registration count
      const updatedEvents = await api.getEvents();
      setEvents(updatedEvents);

      // Refresh user registrations
      const registrations = await api.getMyRegistrations(token);
      setRegisteredEventIds(new Set(registrations.map(r => r.eventId)));
      
      setTimeout(() => setRegistrationSuccess(null), 5000);
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : 'Failed to register');
      setTimeout(() => setRegistrationError(null), 5000);
    } finally {
      setRegistering(null);
    }
  };

  const filteredEvents = activeTab === 'ALL' 
    ? events 
    : events.filter(event => event.status === activeTab);

  const tabs = [
    { key: 'ALL', label: 'All Events' },
    { key: 'UPCOMING', label: 'Upcoming' },
    { key: 'ONGOING', label: 'Ongoing' },
    { key: 'PAST', label: 'Past' },
  ];

  return (
    <Layout>
      <SEO 
        title="Events"
        description="Discover upcoming workshops, hackathons, and coding events by code.scriet - SCRIET's coding club. Register and participate in exciting tech events."
        url="/events"
        keywords="code.scriet events, SCRIET hackathons, coding workshops, programming events, tech events"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Events', url: 'https://codescriet.dev/events' },
        ]}
      />
      {/* Hero Section */}
      <section className="py-16 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-5xl font-bold mb-4">Events</h1>
            <p className="text-xl text-amber-50 max-w-2xl mx-auto">
              Join us for workshops, hackathons, and learning sessions
            </p>
          </motion.div>
        </div>
      </section>

      {/* Success/Error Notifications */}
      {(registrationSuccess || registrationError) && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`flex items-center gap-3 p-4 rounded-lg shadow-lg ${
              registrationSuccess 
                ? 'bg-green-50 border border-green-200 text-green-700' 
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {registrationSuccess ? (
              <CheckCircle className="h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0" />
            )}
            <p className="text-sm font-medium">{registrationSuccess || registrationError}</p>
          </motion.div>
        </div>
      )}

      {/* Filter Tabs */}
      <section className="py-8 bg-white border-b border-amber-200 sticky top-[73px] z-40">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-2">
            {tabs.map((tab) => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? 'default' : 'outline'}
                onClick={() => setActiveTab(tab.key as EventStatus | 'ALL')}
                className="min-w-24"
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Events Grid */}
      <section className="py-12 bg-amber-50 min-h-[60vh]">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-500">{error}</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Try Again
              </Button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg">
                {activeTab === 'ALL' ? 'No events yet. Check back soon!' : `No ${activeTab.toLowerCase()} events`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {filteredEvents.map((event, index) => {
                const regStatus = getRegistrationStatus(event);
                
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                  >
                    <Link to={`/events/${event.slug}`}>
                      <Card className="h-full overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer">
                        <div className="relative overflow-hidden bg-gradient-to-br from-amber-200 to-orange-200" style={{ aspectRatio: '16/9' }}>
                          {event.imageUrl ? (
                            <img
                              src={processImageUrl(event.imageUrl, 'card')}
                              alt={event.title}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Calendar className="h-16 w-16 text-amber-400" />
                            </div>
                          )}
                          <div className="absolute top-4 left-4 flex gap-2">
                            <Badge variant={statusBadgeVariant(event.status)}>
                              {event.status}
                            </Badge>
                            {event.eventType && (
                              <Badge variant="outline" className="bg-white/90">
                                {event.eventType}
                              </Badge>
                            )}
                          </div>
                          {event.featured && (
                            <div className="absolute top-4 right-4">
                              <Badge className="bg-amber-500 text-white">
                                <Star className="h-3 w-3 mr-1" />
                                Featured
                              </Badge>
                            </div>
                          )}
                        </div>
                        <CardHeader>
                          <CardTitle className="line-clamp-1 group-hover:text-amber-600 transition-colors">{event.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <p className="text-gray-600 line-clamp-2">{event.shortDescription || event.description}</p>
                          
                          <div className="space-y-2 text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {formatDate(event.startDate)}
                                {event.endDate && ` - ${formatDate(event.endDate)}`}
                              </span>
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <span>{event.location}{event.venue && ` • ${event.venue}`}</span>
                              </div>
                            )}
                            {event.capacity && (
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span>
                                  {event._count?.registrations || 0} / {event.capacity} registered
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Registration Status */}
                          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                            regStatus.status === 'open' ? 'bg-green-50 text-green-700' :
                            regStatus.status === 'not_started' ? 'bg-blue-50 text-blue-700' :
                            regStatus.status === 'closed' || regStatus.status === 'full' ? 'bg-gray-100 text-gray-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            <Clock className="h-4 w-4" />
                            <span>{regStatus.message}</span>
                          </div>

                          <div className="pt-2 flex flex-col gap-2">
                            {event.status !== 'PAST' && regStatus.canRegister ? (
                              registeredEventIds.has(event.id) ? (
                                <Button 
                                  variant="secondary" 
                                  className="w-full bg-green-50 text-green-700 border border-green-200 opacity-100 cursor-default" 
                                  disabled
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Registered
                                </Button>
                              ) : user ? (
                                <Button 
                                  className="w-full bg-amber-600 hover:bg-amber-700" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleRegister(event);
                                  }}
                                  disabled={registering === event.id}
                                >
                                  {registering === event.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Registering...
                                    </>
                                  ) : (
                                    'Register Now'
                                  )}
                                </Button>
                              ) : (
                                <Button 
                                  className="w-full" 
                                  variant="outline"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    navigate('/signin', { state: { from: '/events' } });
                                  }}
                                >
                                  <LogIn className="h-4 w-4 mr-2" />
                                  Sign In to Register
                                </Button>
                              )
                            ) : event.status === 'ONGOING' ? (
                              <Button variant="secondary" className="w-full" disabled onClick={(e) => e.preventDefault()}>
                                Event in Progress
                              </Button>
                            ) : (
                              <Button variant="outline" className="w-full" disabled onClick={(e) => e.preventDefault()}>
                                {regStatus.message}
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              className="w-full"
                            >
                              View Details
                              <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
