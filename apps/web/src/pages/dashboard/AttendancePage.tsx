import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Event } from '@/lib/api';
import { QrCode, Loader2, Calendar, MapPin, Users, ChevronRight, AlertCircle, History } from 'lucide-react';
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

function compareAttendanceEvents(a: Event, b: Event): number {
  const order: Record<ReturnType<typeof computeEffectiveStatus>, number> = {
    ONGOING: 0,
    UPCOMING: 1,
    PAST: 2,
  };

  const statusA = computeEffectiveStatus(a);
  const statusB = computeEffectiveStatus(b);

  if (order[statusA] !== order[statusB]) {
    return order[statusA] - order[statusB];
  }

  const timeA = new Date(a.startDate).getTime();
  const timeB = new Date(b.startDate).getTime();

  if (statusA === 'PAST') {
    return timeB - timeA;
  }

  return timeA - timeB;
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
        const sorted = [...all].sort(compareAttendanceEvents);
        setEvents(sorted);
        setSelectedEventId((current) => {
          if (current && sorted.some((event) => event.id === current)) {
            return current;
          }

          return sorted[0]?.id ?? '';
        });
      } catch {
        setError('Failed to load events for attendance.');
      } finally {
        setLoading(false);
      }
    };

    void loadEvents();
  }, [token]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );
  const activeEvents = useMemo(
    () => events.filter((event) => computeEffectiveStatus(event) !== 'PAST'),
    [events],
  );
  const pastEvents = useMemo(
    () => events.filter((event) => computeEffectiveStatus(event) === 'PAST'),
    [events],
  );
  const selectedEventStatus = selectedEvent ? computeEffectiveStatus(selectedEvent) : null;

  const openScanner = () => {
    if (!selectedEventId || selectedEventStatus === 'PAST') return;
    navigate(`/dashboard/events/${selectedEventId}/attendance?tab=scanner`);
  };

  const openAttendanceManager = (eventId: string) => {
    navigate(`/dashboard/events/${eventId}/attendance?tab=manage`);
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

  if (events.length === 0) {
    return (
      <div className="max-w-xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="border-gray-100 shadow-sm">
            <CardContent className="py-16 text-center">
              <QrCode className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No events found</p>
              <p className="text-sm text-gray-400 mt-1">
                Once events are created, you can scan live attendance and review past attendance from here.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl w-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-semibold text-gray-900">Take Attendance</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open the scanner for live events, or review attendance records for past ones.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="space-y-6"
      >
        {activeEvents.length === 0 && (
          <Card className="border-gray-100 shadow-sm">
            <CardContent className="py-6 text-center">
              <History className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-700 font-medium">No live attendance sessions right now</p>
              <p className="text-sm text-gray-400 mt-1">
                You can still review and export attendance for past events below.
              </p>
            </CardContent>
          </Card>
        )}

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
            {activeEvents.length > 0 && (
              <optgroup label="Upcoming & ongoing">
                {activeEvents.map((event) => {
                  const status = computeEffectiveStatus(event);
                  return (
                    <option key={event.id} value={event.id}>
                      {status}: {event.title} — {formatDate(event.startDate)}
                    </option>
                  );
                })}
              </optgroup>
            )}
            {pastEvents.length > 0 && (
              <optgroup label="Past events">
                {pastEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    Past: {event.title} — {formatDate(event.startDate)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {selectedEvent && selectedEventStatus && (
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
              <Badge
                variant={
                  selectedEventStatus === 'ONGOING'
                    ? 'warning'
                    : selectedEventStatus === 'UPCOMING'
                      ? 'success'
                      : 'secondary'
                }
                className="shrink-0 text-xs whitespace-nowrap"
              >
                {selectedEventStatus}
              </Badge>
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

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {selectedEventStatus !== 'PAST' && (
                <Button onClick={openScanner} className="h-11 text-sm font-medium sm:flex-1">
                  <QrCode className="h-4 w-4 mr-2" />
                  Open Scanner
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              <Button
                variant={selectedEventStatus === 'PAST' ? 'default' : 'outline'}
                onClick={() => openAttendanceManager(selectedEvent.id)}
                className="h-11 text-sm font-medium sm:flex-1"
              >
                <History className="h-4 w-4 mr-2" />
                View Attendance
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {activeEvents.length > 1 && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Live & upcoming events
            </p>
            <div className="space-y-1">
              {activeEvents.map((event) => {
                const status = computeEffectiveStatus(event);
                return (
                  <button
                    key={event.id}
                    onClick={() => navigate(`/dashboard/events/${event.id}/attendance?tab=scanner`)}
                    className="w-full flex items-center justify-between rounded-lg px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge
                        variant={status === 'ONGOING' ? 'warning' : 'success'}
                        className="shrink-0 text-xs whitespace-nowrap"
                      >
                        {status}
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

        {pastEvents.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Past events
            </p>
            <div className="space-y-1">
              {pastEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => openAttendanceManager(event.id)}
                  className="w-full flex items-center justify-between rounded-lg px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="secondary" className="shrink-0 text-xs whitespace-nowrap">
                      PAST
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs text-gray-400">{formatDate(event.startDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="hidden sm:inline">View attendance</span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
