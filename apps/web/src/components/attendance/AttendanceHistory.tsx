import { useEffect, useState } from 'react';
import { api, type AttendanceHistoryEvent } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Calendar, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';

interface AttendanceHistoryProps {
  token: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
};

export default function AttendanceHistory({ token }: AttendanceHistoryProps) {
  const [events, setEvents] = useState<AttendanceHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getMyAttendanceHistory(token);
        if (!cancelled) {
          setEvents(data.events);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load attendance history'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Card className="border-gray-100 shadow-sm dark:border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-50">
            <Calendar className="h-4 w-4 text-orange-600" />
          </div>
          Attendance History
        </CardTitle>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading attendance history...
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 rounded-full bg-gray-100 p-4 dark:bg-gray-800">
              <Calendar className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No attendance history yet
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground/70">
              Attend events and scan QR codes to build your history.
            </p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <>
            <p className="mb-4 text-sm font-medium text-gray-600 dark:text-gray-400">
              You've attended{' '}
              <span className="font-bold">
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </span>
            </p>

            <motion.ul
              className="space-y-3"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {events.map((record) => (
                <motion.li key={record.id} variants={itemVariants}>
                  <div className="flex items-start gap-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900/20 dark:hover:bg-gray-900/30">
                    {/* Thumbnail */}
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                      {record.event.imageUrl ? (
                        <img
                          src={record.event.imageUrl}
                          alt={record.event.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Calendar className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/events/${record.event.slug}`}
                          className="group flex items-center gap-1 text-sm font-semibold text-foreground hover:text-amber-600 dark:hover:text-amber-400"
                        >
                          <span className="truncate">{record.event.title}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>

                        <Badge
                          variant="secondary"
                          className="flex-shrink-0 border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300"
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Attended
                        </Badge>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(record.event.startDate)}
                        </span>
                        <span>
                          Scanned at {formatDateTime(record.scannedAt)}
                        </span>
                        {record.eventDays && record.eventDays > 1 && (
                          <span>
                            {record.daysAttended ?? 0}/{record.eventDays} day{record.eventDays === 1 ? '' : 's'} attended
                          </span>
                        )}
                      </div>

                      {record.eventDays && record.eventDays > 1 && (record.dayAttendances?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {record.dayAttendances
                            ?.filter((day) => day.attended)
                            .map((day) => (
                              <Badge key={`${record.id}-day-${day.dayNumber}`} variant="outline" className="text-[10px]">
                                {record.dayLabels?.[day.dayNumber - 1] || `Day ${day.dayNumber}`}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
