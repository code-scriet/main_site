import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Users, Clock, CheckCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Event } from '@/lib/api';
import { formatDate as formatDisplayDate } from '@/lib/dateUtils';

interface EventCardProps {
  event: Event;
  index?: number;
  isRegistered?: boolean;
  registrationStatus?: {
    canRegister: boolean;
    status: string;
    message: string;
  };
  onRegister?: (event: Event) => void;
  registering?: boolean;
  showActions?: boolean;
  registerLabel?: string;
}

const processImageUrl = (url: string, size: 'card' | 'detail' = 'card') => {
  if (url.includes('unsplash.com')) {
    return url + (size === 'card' ? '&w=600&h=400&fit=crop' : '&w=1200&h=600&fit=crop');
  }
  return url;
};

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case 'UPCOMING': return 'success';
    case 'ONGOING': return 'warning';
    case 'PAST': return 'secondary';
    default: return 'default';
  }
};

export default function EventCard({ 
  event, 
  index = 0, 
  isRegistered = false,
  registrationStatus,
  onRegister,
  registering = false,
  showActions = true,
  registerLabel = 'Register Now',
}: EventCardProps) {
  return (
    <motion.div
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
                  {formatDisplayDate(event.startDate, 'short')}
                  {event.endDate && ` - ${formatDisplayDate(event.endDate, 'short')}`}
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

            {showActions && registrationStatus && (
              <>
                {/* Registration Status */}
                <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                  registrationStatus.status === 'open' ? 'bg-green-50 text-green-700' :
                  registrationStatus.status === 'not_started' ? 'bg-blue-50 text-blue-700' :
                  registrationStatus.status === 'closed' || registrationStatus.status === 'full' ? 'bg-gray-100 text-gray-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  <Clock className="h-4 w-4" />
                  <span>{registrationStatus.message}</span>
                </div>

                <div className="pt-2">
                  {isRegistered ? (
                    <Button 
                      variant="secondary" 
                      className="w-full bg-green-50 text-green-700 border border-green-200" 
                      disabled
                      onClick={(e) => e.preventDefault()}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Registered
                    </Button>
                  ) : event.status !== 'PAST' && registrationStatus.canRegister && onRegister ? (
                    <Button 
                      onClick={(e) => {
                        e.preventDefault();
                        onRegister(event);
                      }}
                      className="w-full bg-amber-600 hover:bg-amber-700"
                      disabled={registering}
                    >
                      {registering ? 'Registering...' : registerLabel}
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
