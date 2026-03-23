import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, type Event } from '@/lib/api';

import AdminScanner from '@/components/attendance/AdminScanner';
import AttendanceManager from '@/components/attendance/AttendanceManager';
import EventCertificateWizard from '@/components/attendance/EventCertificateWizard';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
  Loader2,
  ArrowLeft,
  Settings,
  QrCode,
  Users,
  Award,
  ExternalLink,
} from 'lucide-react';

const VALID_TABS = ['details', 'scanner', 'manage', 'certificates'] as const;
type TabValue = (typeof VALID_TABS)[number];

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: 'bg-blue-100 text-blue-800 border-blue-300',
  ONGOING: 'bg-green-100 text-green-800 border-green-300',
  PAST: 'bg-gray-100 text-gray-700 border-gray-300',
};

export default function EventAdminHub() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  // Core members access via /dashboard/events/:id/attendance; admins via /admin/events/:id/attendance
  const isAdminPath = location.pathname.startsWith('/admin');
  const backHref = isAdminPath ? `/admin/events/${eventId}/edit` : '/dashboard/events';

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rawTab = searchParams.get('tab') as TabValue | null;
  const activeTab: TabValue = (() => {
    if (!rawTab || !VALID_TABS.includes(rawTab)) return 'details';
    if (rawTab === 'certificates' && !isAdmin) return 'details';
    return rawTab;
  })();

  const setActiveTab = useCallback(
    (tab: TabValue) => {
      setSearchParams({ tab }, { replace: true });
    },
    [setSearchParams],
  );

  const handleEndSession = useCallback(() => {
    setActiveTab('manage');
  }, [setActiveTab]);

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getEvent(eventId)
      .then((data) => {
        if (!cancelled) setEvent(data);
      })
      .catch(() => {
        if (!cancelled) setError('Event not found or failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error || !event || !eventId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-lg text-gray-600">{error ?? 'Event not found.'}</p>
        <Link to={isAdminPath ? '/admin/event-registrations' : '/dashboard/events'}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-6xl space-y-6 px-4 py-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Link to={backHref}>
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>

          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl font-bold text-gray-900">
              {event.title}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant="outline"
                className={STATUS_COLORS[event.status] ?? STATUS_COLORS.UPCOMING}
              >
                {event.status}
              </Badge>
            </div>
          </div>
        </div>

        <Link
          to={`/events/${event.slug || event.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm" className="gap-1.5">
            View Event Page
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'} h-auto`}>
          <TabsTrigger value="details" className="gap-1.5" aria-label="Open event details tab">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Details</span>
          </TabsTrigger>
          <TabsTrigger value="scanner" className="gap-1.5" aria-label="Open scanner tab">
            <QrCode className="h-4 w-4" />
            <span className="hidden sm:inline">Scanner</span>
          </TabsTrigger>
          <TabsTrigger value="manage" className="gap-1.5" aria-label="Open attendee management tab">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Manage</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="certificates" className="gap-1.5" aria-label="Open certificates tab">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Certificates</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card className="border-amber-200">
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-lg font-semibold text-gray-800">
                Event Information
              </h2>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-gray-500">Title</dt>
                  <dd className="text-gray-900">{event.title}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Status</dt>
                  <dd className="text-gray-900">{event.status}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Start Date</dt>
                  <dd className="text-gray-900">
                    {new Date(event.startDate).toLocaleString()}
                  </dd>
                </div>
                {event.endDate && (
                  <div>
                    <dt className="font-medium text-gray-500">End Date</dt>
                    <dd className="text-gray-900">
                      {new Date(event.endDate).toLocaleString()}
                    </dd>
                  </div>
                )}
                {event.location && (
                  <div>
                    <dt className="font-medium text-gray-500">Location</dt>
                    <dd className="text-gray-900">{event.location}</dd>
                  </div>
                )}
                {event.venue && (
                  <div>
                    <dt className="font-medium text-gray-500">Venue</dt>
                    <dd className="text-gray-900">{event.venue}</dd>
                  </div>
                )}
              </dl>

              <div className="pt-2">
                {isAdminPath ? (
                  <Link to={`/admin/events/${eventId}/edit`}>
                    <Button className="gap-2 bg-amber-600 hover:bg-amber-700">
                      <Settings className="h-4 w-4" />
                      Edit Event Details
                    </Button>
                  </Link>
                ) : (
                  <p className="text-sm text-gray-500">Contact an admin to edit event details.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scanner Tab */}
        <TabsContent value="scanner">
          <AdminScanner
            eventId={eventId}
            token={token!}
            onEndSession={handleEndSession}
          />
        </TabsContent>

        {/* Manage Tab */}
        <TabsContent value="manage">
          <AttendanceManager eventId={eventId} token={token!} />
        </TabsContent>

        {/* Certificates Tab — admin only */}
        {isAdmin && (
          <TabsContent value="certificates">
            <EventCertificateWizard
              eventId={eventId}
              eventName={event.title}
              token={token!}
            />
          </TabsContent>
        )}
      </Tabs>
    </motion.div>
  );
}
