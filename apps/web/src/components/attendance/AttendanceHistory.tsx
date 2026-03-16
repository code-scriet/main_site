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
    <Card className="border-amber-200/50 dark:border-amber-800/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
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
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 rounded-full bg-amber-100 p-3 dark:bg-amber-900/30">
              <Calendar className="h-6 w-6 text-amber-500" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No attendance history yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Attend events and scan QR codes to build your history.
            </p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <>
            <p className="mb-4 text-sm font-medium text-amber-700 dark:text-amber-300">
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
                  <div className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3 transition-colors hover:bg-amber-50 dark:border-amber-900/20 dark:bg-amber-950/20 dark:hover:bg-amber-950/30">
                    {/* Thumbnail */}
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-amber-200/50 dark:bg-amber-800/30">
                      {record.event.imageUrl ? (
                        <img
                          src={record.event.imageUrl}
                          alt={record.event.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Calendar className="h-5 w-5 text-amber-400 dark:text-amber-600" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/events/${record.event.slug}`}
                          className="group flex items-center gap-1 text-sm font-semibold text-foreground hover:text-amber-700 dark:hover:text-amber-300"
                        >
                          <span className="truncate">{record.event.title}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>

                        <Badge
                          variant="secondary"
                          className="flex-shrink-0 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
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
                      </div>
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
