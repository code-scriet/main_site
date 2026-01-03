wimport { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { Calendar, Loader2, AlertCircle, ArrowLeft, Clock, MapPin, Users, Image, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeLocal } from '@/lib/dateUtils';

const eventTypes = [
  'Workshop',
  'Hackathon',
  'Meetup',
  'Bootcamp',
  'Competition',
  'Webinar',
  'Social Event',
  'Other',
];

export default function EditEvent() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    eventType: 'Workshop',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    location: '',
    venue: '',
    capacity: '',
    prerequisites: '',
    imageUrl: '',
    status: 'UPCOMING' as 'UPCOMING' | 'ONGOING' | 'PAST',
  });

  useEffect(() => {
    loadEvent();
  }, [id]);

  const loadEvent = async () => {
    if (!id) {
      setError('Event ID not found');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const event = await api.getEvent(id);
      setForm({
        title: event.title || '',
        description: event.description || '',
        eventType: event.eventType || 'Workshop',
        startDate: formatDateTimeLocal(event.startDate),
        endDate: formatDateTimeLocal(event.endDate),
        registrationStartDate: formatDateTimeLocal(event.registrationStartDate),
        registrationEndDate: formatDateTimeLocal(event.registrationEndDate),
        location: event.location || '',
        venue: event.venue || '',
        capacity: event.capacity?.toString() || '',
        prerequisites: event.prerequisites || '',
        imageUrl: event.imageUrl || '',
        status: event.status || 'UPCOMING',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.title.trim() || !form.description.trim() || !form.startDate) {
      setError('Please fill in all required fields (Title, Description, Event Start Date)');
      return;
    }

    if (!token) {
      setError('Authentication token not found. Please log in again.');
      return;
    }

    if (!id) {
      setError('Event ID not found');
      return;
    }

    // Validate dates
    const startDate = new Date(form.startDate);
    const endDate = form.endDate ? new Date(form.endDate) : null;
    const regStartDate = form.registrationStartDate ? new Date(form.registrationStartDate) : null;
    const regEndDate = form.registrationEndDate ? new Date(form.registrationEndDate) : null;

    if (endDate && endDate < startDate) {
      setError('Event end date must be after start date');
      return;
    }

    if (regStartDate && regEndDate && regEndDate < regStartDate) {
      setError('Registration end date must be after registration start date');
      return;
    }

    if (regEndDate && regEndDate > startDate) {
      setError('Registration should close before or when the event starts');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      await api.updateEvent(id, {
        title: form.title.trim(),
        description: form.description.trim(),
        eventType: form.eventType,
        startDate: startDate.toISOString(),
        endDate: endDate?.toISOString(),
        registrationStartDate: regStartDate?.toISOString(),
        registrationEndDate: regEndDate?.toISOString(),
        location: form.location.trim() || undefined,
        venue: form.venue.trim() || undefined,
        capacity: form.capacity ? parseInt(form.capacity) : undefined,
        prerequisites: form.prerequisites.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        status: form.status,
      }, token);

      navigate('/admin/event-registrations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update event');
    } finally {
      setSaving(false);
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/event-registrations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Edit Event</h1>
          <p className="text-gray-600">Update event details</p>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
              Basic Information
            </CardTitle>
            <CardDescription>Event title and description</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="e.g., DSA Bootcamp 2025"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Event Type</label>
                <select
                  name="eventType"
                  value={form.eventType}
                  onChange={handleChange}
                  className="w-full h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {eventTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Describe the event - what participants will learn, schedule, what to expect, etc."
                className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Prerequisites (Optional)</label>
              <textarea
                name="prerequisites"
                value={form.prerequisites}
                onChange={handleChange}
                placeholder="What should participants know or bring? e.g., Basic programming knowledge, Laptop required"
                className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Event Status */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" />
              Event Status
            </CardTitle>
            <CardDescription>Current status of the event</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="UPCOMING">Upcoming</option>
                <option value="ONGOING">Ongoing</option>
                <option value="PAST">Past</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Event Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" />
              Event Schedule
            </CardTitle>
            <CardDescription>When will the event take place?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Event Start Date & Time <span className="text-red-500">*</span>
                </label>
                <Input
                  name="startDate"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Event End Date & Time</label>
                <Input
                  name="endDate"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={handleChange}
                />
                <p className="text-xs text-gray-500">Leave empty for single-day events</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Registration Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Registration Timeline
            </CardTitle>
            <CardDescription>Control when users can register for this event</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Registration Opens</label>
                <Input
                  name="registrationStartDate"
                  type="datetime-local"
                  value={form.registrationStartDate}
                  onChange={handleChange}
                />
                <p className="text-xs text-gray-500">When users can start registering (leave empty for immediately)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Registration Closes</label>
                <Input
                  name="registrationEndDate"
                  type="datetime-local"
                  value={form.registrationEndDate}
                  onChange={handleChange}
                />
                <p className="text-xs text-gray-500">Last date to register (leave empty for until event starts)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location & Capacity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-amber-600" />
              Location & Capacity
            </CardTitle>
            <CardDescription>Where and how many participants</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Location</label>
                <Input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g., Online / Campus / City Name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Venue</label>
                <Input
                  name="venue"
                  value={form.venue}
                  onChange={handleChange}
                  placeholder="e.g., Room 101 / Zoom / Google Meet"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Maximum Capacity
                </label>
                <Input
                  name="capacity"
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={handleChange}
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  Cover Image URL
                </label>
                <Input
                  name="imageUrl"
                  type="url"
                  value={form.imageUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/event-image.jpg"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-4">
          <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
          <Link to="/admin/event-registrations" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
