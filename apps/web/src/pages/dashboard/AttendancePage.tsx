import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Event } from '@/lib/api';
import { QrCode, Loader2, Calendar, MapPin, Users, ChevronRight, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatTime } from '@/lib/dateUtils';

/**
 * Compute the effective event status from actual dates, not the potentially-stale
 * DB field (the background scheduler that updates statuses is off by default).
 */
function computeEffectiveStatus(event: Event): 'UPCOMING' | 'ONGOING' | 'PAST' {
  const now = new Date();
  const start = new Date(event.startDate);
  // Mirror the backend scan window: endDate OR startDate + 4h fallback
  const end = event.endDate
    ? new Date(event.endDate)
    : new Date(start.getTime() + 4 * 60 * 60 * 1000);

  if (now < start) return 'UPCOMING';
  if (now > end) return 'PAST';
  return 'ONGOING';
}

export default function AttendancePage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      setError(null);

      try {
        const all = await api.getEvents();
        // Use date-computed status to filter correctly even if DB is stale
        const active = all
          .filter((event) => {
            const status = computeEffectiveStatus(event);
            return status === 'ONGOING' || status === 'UPCOMING';
          })
          .sort((a, b) => {
            const sa = computeEffectiveStatus(a);
            const sb = computeEffectiveStatus(b);
            // ONGOING first
            if (sa === 'ONGOING' && sb !== 'ONGOING') return -1;
            if (sb === 'ONGOING' && sa !== 'ONGOING') return 1;
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
          });

        setEvents(active);
        if (active.length === 1) setSelectedEventId(active[0].id);
      } catch {
        setError('Failed to load events for attendance.');
      } finally {
        setLoading(false);
      }
    };

    void loadEvents();
  }, [token]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const openScanner = () => {
    if (!selectedEventId) return;
    navigate(`/dashboard/events/${selectedEventId}/attendance?tab=scanner`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl w-full">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-10 text-center space-y-3">
            <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl w-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-semibold text-gray-900">Take Attendance</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select an event and open the QR scanner.
        </p>
      </motion.div>

      {events.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="border-gray-100 shadow-sm">
            <CardContent className="py-16 text-center">
              <QrCode className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No active events</p>
              <p className="text-sm text-gray-400 mt-1">
                Attendance scanning is only available for upcoming and ongoing events.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="space-y-4"
        >
          {/* Event selector */}
          <div>
            <label htmlFor="event-select" className="block text-sm font-medium text-gray-700 mb-2">
              Choose event
            </label>
            <select
              id="event-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 transition"
            >
              <option value="">— Select an event —</option>
              {events.map((event) => {
                const status = computeEffectiveStatus(event);
                return (
                  <option key={event.id} value={event.id}>
                    {status === 'ONGOING' ? 'Ongoing' : 'Upcoming'}: {event.title} — {formatDate(event.startDate)}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Selected event preview */}
          {selectedEvent && (
            <motion.div
              key={selectedEvent.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border border-gray-100 bg-white shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-gray-900 text-base leading-snug break-words">
                  {selectedEvent.title}
                </h3>
                {(() => {
                  const s = computeEffectiveStatus(selectedEvent);
                  return (
                    <Badge
                      variant={s === 'ONGOING' ? 'warning' : 'success'}
                      className="shrink-0 text-xs whitespace-nowrap"
                    >
                      {s}
                    </Badge>
                  );
                })()}
              </div>

               <div className="space-y-1.5 text-sm text-gray-500">
                 <div className="flex flex-wrap items-center gap-2">
                   <Calendar className="h-3.5 w-3.5 shrink-0" />
                   {formatDate(selectedEvent.startDate)} at {formatTime(selectedEvent.startDate)}
                   {selectedEvent.endDate && (
                    <span className="text-gray-400">→ {formatTime(selectedEvent.endDate)}</span>
                  )}
                </div>
                {selectedEvent.location && (
                   <div className="flex items-center gap-2 min-w-0">
                     <MapPin className="h-3.5 w-3.5 shrink-0" />
                     <span className="truncate">{selectedEvent.location}</span>
                   </div>
                 )}
                {selectedEvent.capacity && (
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    {selectedEvent._count?.registrations ?? 0} / {selectedEvent.capacity} registered
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Open Scanner CTA */}
          <Button
            onClick={openScanner}
            disabled={!selectedEventId}
            className="w-full h-11 text-sm font-medium"
          >
            <QrCode className="h-4 w-4 mr-2" />
            Open Scanner
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>

          {/* Quick-access list for all active events */}
          {events.length > 1 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                All active events
              </p>
              <div className="space-y-1">
                {events.map((event) => {
                  const s = computeEffectiveStatus(event);
                  return (
                    <button
                      key={event.id}
                      onClick={() => navigate(`/dashboard/events/${event.id}/attendance?tab=scanner`)}
                      className="w-full flex items-center justify-between rounded-lg px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge
                          variant={s === 'ONGOING' ? 'warning' : 'success'}
                          className="shrink-0 text-xs whitespace-nowrap"
                        >
                          {s}
                        </Badge>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                          <p className="text-xs text-gray-400">{formatDate(event.startDate)}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
