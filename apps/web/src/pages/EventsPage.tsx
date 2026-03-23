import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Loader2, Clock, CheckCircle, LogIn, ArrowRight, Star } from 'lucide-react';
import { api, type Event } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { getRegistrationStatus } from '@/lib/registrationStatus';
import { toast } from 'sonner';

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

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<EventStatus | 'ALL'>('ALL');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  
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
          } catch {
            toast.error('Could not load your event registrations');
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
      toast.error(regStatus.message);
      return;
    }

    if (!user || !token) {
      // Save pending registration
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      // Redirect to sign in
      navigate('/signin', { state: { from: '/events', message: 'Please sign in to register for events', pendingEventId: event.id } });
      return;
    }

    // Check if academic details are complete - redirect to profile if not
    if (!user.phone || !user.course || !user.branch || !user.year) {
      // Save pending registration
      localStorage.setItem('pendingEventRegistration', event.id);
      localStorage.setItem('pendingEventRegistrationType', event.teamRegistration ? 'team' : 'solo');
      navigate('/dashboard/profile', { state: { message: 'Please complete your profile to register for events', pendingEventId: event.id } });
      return;
    }

    if (event.teamRegistration) {
      navigate(`/events/${event.slug || event.id}`);
      return;
    }

    if (event.registrationFields && event.registrationFields.length > 0) {
      localStorage.setItem('pendingEventRegistrationType', 'solo');
      navigate(`/events/${event.slug || event.id}?register=1`);
      return;
    }

    try {
      setRegistering(event.id);
      await api.registerForEvent(event.id, token);
      toast.success(`Successfully registered for "${event.title}"!`);
      
      // Refresh events to update registration count
      const updatedEvents = await api.getEvents();
      setEvents(updatedEvents);

      // Refresh user registrations
      const registrations = await api.getMyRegistrations(token);
      setRegisteredEventIds(new Set(registrations.map(r => r.eventId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register');
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
        description="Explore upcoming and past events from codescriet — hackathons, workshops, and tech events at SCRIET."
        url="/events"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Events', url: 'https://codescriet.dev/events' },
        ]}
      />
      {/* Hero Section */}
      <section className="py-14 sm:py-16 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-3xl sm:text-5xl font-bold mb-4">Events</h1>
            <p className="text-base sm:text-xl text-amber-50 max-w-2xl mx-auto">
              Join us for workshops, hackathons, and learning sessions
            </p>
          </motion.div>
        </div>
      </section>

      {/* Filter Tabs */}
      <section className="py-6 sm:py-8 bg-white border-b border-amber-200 sticky top-under-header z-40">
        <div className="container mx-auto px-4">
          <div className="no-scrollbar flex flex-nowrap items-center justify-start gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
            {tabs.map((tab) => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? 'default' : 'outline'}
                onClick={() => setActiveTab(tab.key as EventStatus | 'ALL')}
                className="min-w-24 shrink-0"
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
                const eventHref = `/events/${event.slug || event.id}`;
                
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: Math.min(index * 0.1, 0.5) }}
                  >
                    <Card className="h-full overflow-hidden group hover:shadow-xl transition-all duration-300">
                      <Link to={eventHref} className="block">
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
                      </Link>
                      <Link to={eventHref} className="block">
                        <CardHeader>
                          <CardTitle className="line-clamp-1 group-hover:text-amber-600 transition-colors">{event.title}</CardTitle>
                        </CardHeader>
                      </Link>
                      <Link to={eventHref} className="block flex-1">
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
                        </CardContent>
                      </Link>
                      <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
                        {event.status !== 'PAST' && regStatus.canRegister ? (
                          registeredEventIds.has(event.id) ? (
                            <Button 
                              variant="secondary" 
                              className="w-full bg-green-50 text-green-700 border border-green-200 opacity-100 cursor-default" 
                              disabled
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Registered
                            </Button>
                          ) : user ? (
                            <Button 
                              className="w-full bg-amber-600 hover:bg-amber-700" 
                              onClick={() => handleRegister(event)}
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
                              onClick={() => navigate('/signin', { state: { from: '/events' } })}
                            >
                              <LogIn className="h-4 w-4 mr-2" />
                              Sign In to Register
                            </Button>
                          )
                        ) : event.status === 'ONGOING' ? (
                          <Button variant="secondary" className="w-full" disabled>
                            Event in Progress
                          </Button>
                        ) : (
                          <Button variant="outline" className="w-full" disabled>
                            {regStatus.message}
                          </Button>
                        )}
                        <Button asChild variant="outline" className="w-full">
                          <Link to={eventHref}>
                            View Details
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Link>
                        </Button>
                      </div>
                    </Card>
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
