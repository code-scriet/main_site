import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Calendar, Users, Search, Download, Mail, Trash2, Pencil, Phone, GraduationCap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

interface EventWithRegistrations {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  location?: string;
  capacity?: number;
  status: 'UPCOMING' | 'ONGOING' | 'PAST';
  registrations: {
    id: string;
    timestamp: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      phone?: string;
      course?: string;
      branch?: string;
      year?: string;
    };
  }[];
}

export default function AdminEventRegistrations() {
  const { token } = useAuth();
  const [events, setEvents] = useState<EventWithRegistrations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingRegId, setDeletingRegId] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, [token]);

  const loadEvents = async () => {
    if (!token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const data = await api.getEvents();
      // Get detailed registration data for each event
      const eventsWithDetails = await Promise.all(
        data.map(async (event) => {
          try {
            const response = await fetch(`${apiUrl}/events/${event.id}/registrations`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            // API returns { success: true, data: [...] }
            const registrations = result.data || result || [];
            return { ...event, registrations };
          } catch {
            return { ...event, registrations: [] };
          }
        })
      );
      setEvents(eventsWithDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.registrations.some(r => 
      r.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.user.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const exportToExcel = async (event: EventWithRegistrations) => {
    if (!token) {
      setError('Authentication required');
      return;
    }
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/events/${event.id}/registrations/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to export registrations');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.title.replace(/\s+/g, '_')}_registrations.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export');
    }
  };

  const handleDeleteEvent = async (eventId: string, eventTitle: string) => {
    if (!token) {
      setError('Authentication required');
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${eventTitle}"? This action cannot be undone and will remove all registrations for this event.`
    );
    
    if (!confirmed) return;
    
    try {
      setDeletingId(eventId);
      setError(null);
      await api.deleteEvent(eventId, token);
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteRegistration = async (eventId: string, registrationId: string, userName: string) => {
    if (!token) {
      setError('Authentication required');
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to remove "${userName}" from this event?`
    );
    
    if (!confirmed) return;
    
    try {
      setDeletingRegId(registrationId);
      setError(null);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/events/${eventId}/registrations/${registrationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete registration');
      }
      
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove participant');
    } finally {
      setDeletingRegId(null);
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
          <h1 className="text-2xl font-bold text-amber-900">Event Registrations</h1>
          <p className="text-gray-600">View and manage event participants</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by event name, participant name, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              {searchQuery ? 'No events match your search' : 'No events found'}
            </CardContent>
          </Card>
        ) : (
          filteredEvents.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-amber-100">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-amber-600" />
                        {event.title}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{new Date(event.startDate).toLocaleDateString()}</span>
                        {event.location && <span>• {event.location}</span>}
                        <Badge variant={event.status === 'UPCOMING' ? 'default' : 'secondary'}>
                          {event.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                        <Users className="h-3 w-3 mr-1" />
                        {event.registrations.length}
                        {event.capacity && ` / ${event.capacity}`}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedEvent(selectedEvent === event.id ? null : event.id)}
                      >
                        {selectedEvent === event.id ? 'Hide' : 'View'} Details
                      </Button>
                      {event.registrations.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => exportToExcel(event)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Export Excel
                        </Button>
                      )}
                      <Link to={`/admin/events/${event.id}/edit`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteEvent(event.id, event.title)}
                        disabled={deletingId === event.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        {deletingId === event.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {selectedEvent === event.id && (
                  <CardContent>
                    {event.registrations.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No registrations yet</p>
                    ) : (
                      <div className="space-y-2">
                        <h3 className="font-semibold text-sm text-gray-700 mb-3">
                          Participants ({event.registrations.length})
                        </h3>
                        <div className="divide-y divide-gray-100">
                          {event.registrations.map((registration) => (
                            <div
                              key={registration.id}
                              className="py-3 flex items-start justify-between hover:bg-amber-50 px-3 -mx-3 rounded-lg transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                                  {registration.user.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900">
                                      {registration.user.name}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {registration.user.role}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {registration.user.email}
                                    </span>
                                  </div>
                                  {/* Academic Details */}
                                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-1 flex-wrap">
                                    {registration.user.phone && (
                                      <span className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        {registration.user.phone}
                                      </span>
                                    )}
                                    {registration.user.course && registration.user.branch && registration.user.year && (
                                      <span className="flex items-center gap-1">
                                        <GraduationCap className="h-3 w-3" />
                                        {registration.user.course} - {registration.user.branch} - {registration.user.year}
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-400">
                                      Registered: {new Date(registration.timestamp).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteRegistration(event.id, registration.id, registration.user.name)}
                                disabled={deletingRegId === registration.id}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                {deletingRegId === registration.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
