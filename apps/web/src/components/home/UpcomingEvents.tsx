import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, ArrowRight, Loader2, Users, Clock } from 'lucide-react';
import { api, type Event } from '@/lib/api';
import { formatTime, getWeekdayShort, getMonthShort, getDayOfMonth } from '@/lib/dateUtils';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useAuth } from '@/context/AuthContext';

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
    return { status: 'past', message: 'Event ended', canRegister: false };
  }

  if (event.capacity && event._count && event._count.registrations >= event.capacity) {
    return { status: 'full', message: 'Sold out', canRegister: false };
  }

  if (regStart && now < regStart) {
    return { status: 'not_started', message: 'Coming soon', canRegister: false };
  }

  if (regEnd && now > regEnd) {
    return { status: 'closed', message: 'Closed', canRegister: false };
  }

  return { status: 'open', message: 'Register now', canRegister: true };
}

export function UpcomingEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  const { token } = useAuth();
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await api.getEvents('UPCOMING');
        setEvents(data.slice(0, 3));
        
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
        console.error('Failed to fetch events:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [token]);

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.15;

  return (
    <section className="py-24 bg-gradient-to-b from-amber-50/50 to-white relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute top-1/2 left-0 w-64 h-64 bg-amber-100 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 opacity-50" />
      
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: animationY }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6"
        >
          <div>
            <motion.div 
              initial={{ opacity: 0, scale: shouldReduceMotion ? 0.95 : 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 text-orange-700 mb-4"
            >
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">Don't Miss Out</span>
            </motion.div>
            
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3">
              Upcoming{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-600">
                Events
              </span>
            </h2>
            <p className="text-gray-600 text-lg">Join us for exciting workshops, hackathons, and learning sessions</p>
          </div>
          
          <Link to="/events">
            <Button variant="outline" size="lg" className="group border-gray-300 hover:border-amber-500 hover:bg-amber-50">
              View All Events
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>

        {/* Events Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
          </div>
        ) : events.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 mb-6">
              <Calendar className="h-10 w-10 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No upcoming events</h3>
            <p className="text-gray-500">Check back soon for exciting new events!</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {events.map((event, index) => {
              const regStatus = getRegistrationStatus(event);
              const isRegistered = registeredEventIds.has(event.id);
              
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: animationY }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: animationDuration, delay: index * staggerDelay }}
                  viewport={{ once: true }}
                  whileHover={!isMobile ? { y: -8 } : undefined}
                  className="group"
                >
                  <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-500">
                    {/* Image Container */}
                    <div className="relative h-56 overflow-hidden">
                      {event.imageUrl ? (
                        <img
                          src={event.imageUrl}
                          alt={event.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 flex items-center justify-center">
                          <Calendar className="h-20 w-20 text-white/30" />
                        </div>
                      )}
                      
                      {/* Overlay Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      
                      {/* Badges */}
                      <div className="absolute top-4 left-4 flex gap-2">
                        {event.eventType && (
                          <Badge className="bg-white/90 text-gray-800 backdrop-blur-sm shadow-sm">
                            {event.eventType}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Registration Status */}
                      <div className="absolute top-4 right-4">
                        <Badge 
                          className={`backdrop-blur-sm shadow-sm ${
                            isRegistered ? 'bg-green-600 text-white' :
                            regStatus.status === 'open' ? 'bg-green-500 text-white' :
                            regStatus.status === 'not_started' ? 'bg-blue-500 text-white' :
                            'bg-gray-500 text-white'
                          }`}
                        >
                          {isRegistered ? 'Registered' : regStatus.message}
                        </Badge>
                      </div>
                      
                      {/* Date Badge */}
                      <div className="absolute bottom-4 left-4">
                        <div className="bg-white rounded-xl px-4 py-2 shadow-lg">
                          <p className="text-xs text-gray-500 uppercase tracking-wider">
                            {getWeekdayShort(event.startDate)}
                          </p>
                          <p className="text-2xl font-bold text-gray-900">
                            {getDayOfMonth(event.startDate)}
                          </p>
                          <p className="text-xs text-amber-600 font-medium">
                            {getMonthShort(event.startDate)}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-amber-600 transition-colors">
                        {event.title}
                      </h3>
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                        {event.description}
                      </p>
                      
                      {/* Meta Info */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="h-4 w-4 text-amber-500" />
                          <span>{formatTime(event.startDate)}</span>
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <MapPin className="h-4 w-4 text-amber-500" />
                            <span className="line-clamp-1">{event.location}</span>
                          </div>
                        )}
                        {event.capacity && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 text-amber-500" />
                            <span>{event._count?.registrations || 0}/{event.capacity} spots filled</span>
                          </div>
                        )}
                      </div>
                      
                      {/* CTA */}
                      <Link to="/events">
                        {isRegistered ? (
                          <Button 
                            className="w-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                          >
                            Registered
                          </Button>
                        ) : (
                          <Button 
                            className={`w-full ${
                              regStatus.canRegister 
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                            disabled={!regStatus.canRegister}
                          >
                            {regStatus.canRegister ? 'View & Register' : regStatus.message}
                          </Button>
                        )}
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
