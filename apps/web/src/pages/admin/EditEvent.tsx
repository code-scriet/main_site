import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  Calendar, Loader2, AlertCircle, ArrowLeft, MapPin, Users,
  Image, FileText, Plus, X, Star, Target, User, Link as LinkIcon,
  HelpCircle, Video, Tag, Trash2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeLocal } from '@/lib/dateUtils';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { useEventForm } from '@/hooks/useEventForm';
import {
  eventTypes,
  resourceTypes,
  validateEventFormDates,
} from '@/lib/eventForm';
import { CollapsibleSection } from '@/components/events/form/CollapsibleSection';
import { ExtraRegistrationFieldsSection } from '@/components/events/form/ExtraRegistrationFieldsSection';
import { RegistrationTimelineSection } from '@/components/events/form/RegistrationTimelineSection';

export default function EditEvent() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChangesWarning(isDirty);
  
  // Basic form state
  const [form, setForm] = useState({
    title: '',
    shortDescription: '',
    description: '',
    eventType: 'Workshop',
    startDate: '',
    endDate: '',
    eventDays: '1',
    registrationStartDate: '',
    registrationEndDate: '',
    location: '',
    venue: '',
    capacity: '',
    prerequisites: '',
    imageUrl: '',
    status: 'UPCOMING' as 'UPCOMING' | 'ONGOING' | 'PAST',
    // Extended fields
    agenda: '',
    highlights: '',
    learningOutcomes: '',
    targetAudience: '',
    videoUrl: '',
    featured: false,
    allowLateRegistration: false,
    // Team registration
    teamRegistration: false,
    teamMinSize: 2,
    teamMaxSize: 4,
  });
  
  // Track if event has registrations (to disable team toggle)
  const [hasRegistrations, setHasRegistrations] = useState(false);
  
  const {
    speakers, setSpeakers, addSpeaker, updateSpeaker, removeSpeaker,
    resources, setResources, addResource, updateResource, removeResource,
    faqs, setFaqs, addFaq, updateFaq, removeFaq,
    imageGallery, setImageGallery, addGalleryImage, updateGalleryImage, removeGalleryImage,
    tags, setTags, newTag, setNewTag, addTag, removeTag,
    registrationFields, setRegistrationFields, addRegistrationField, updateRegistrationField, removeRegistrationField,
  } = useEventForm({ onChange: () => setIsDirty(true) });

  const loadEvent = useCallback(async () => {
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
        shortDescription: event.shortDescription || '',
        description: event.description || '',
        eventType: event.eventType || 'Workshop',
        startDate: formatDateTimeLocal(event.startDate),
        endDate: formatDateTimeLocal(event.endDate),
        eventDays: (event.eventDays ?? 1).toString(),
        registrationStartDate: formatDateTimeLocal(event.registrationStartDate),
        registrationEndDate: formatDateTimeLocal(event.registrationEndDate),
        location: event.location || '',
        venue: event.venue || '',
        capacity: event.capacity?.toString() || '',
        prerequisites: event.prerequisites || '',
        imageUrl: event.imageUrl || '',
        status: event.status || 'UPCOMING',
        agenda: event.agenda || '',
        highlights: event.highlights || '',
        learningOutcomes: event.learningOutcomes || '',
        targetAudience: event.targetAudience || '',
        videoUrl: event.videoUrl || '',
        featured: event.featured || false,
        allowLateRegistration: event.allowLateRegistration ?? false,
        // Team registration
        teamRegistration: event.teamRegistration ?? false,
        teamMinSize: event.teamMinSize ?? 2,
        teamMaxSize: event.teamMaxSize ?? 4,
      });
      
      // Check if event has registrations
      setHasRegistrations((event._count?.registrations || 0) > 0);
      
      // Load array fields
      setSpeakers(event.speakers || []);
      setResources(event.resources || []);
      setFaqs(event.faqs || []);
      setImageGallery(event.imageGallery || []);
      setTags(event.tags || []);
      setRegistrationFields(event.registrationFields || []);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setForm(prev => ({ ...prev, [name]: checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const baseValidation = validateEventFormDates(form);
    if (!baseValidation.ok) {
      setError(baseValidation.error);
      return;
    }
    const { startDate, endDate, regStartDate, regEndDate } = baseValidation.dates;

    if (!token || !id) {
      setError('Authentication error. Please log in again.');
      return;
    }

    const parsedEventDays = Number.parseInt(form.eventDays, 10);
    if (!Number.isInteger(parsedEventDays) || parsedEventDays < 1 || parsedEventDays > 10) {
      setError('Attendance days must be between 1 and 10');
      return;
    }

    // Only validate registration closing before event start if late registration is NOT allowed
    if (!form.allowLateRegistration && regEndDate && regEndDate > startDate) {
      setError('Registration should close before or when the event starts');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      // Filter out empty entries
      const validSpeakers = speakers.filter(s => s.name.trim());
      const validResources = resources.filter(r => r.title.trim() && r.url.trim());
      const validFaqs = faqs.filter(f => f.question.trim() && f.answer.trim());
      const validGallery = imageGallery.filter(url => url.trim());
      const normalizedRegistrationFields = registrationFields
        .map((field) => ({
          ...field,
          label: field.label.trim(),
          placeholder: field.placeholder?.trim() || undefined,
          pattern: field.pattern?.trim() || undefined,
        }))
        .filter((field) => field.label.length > 0);
      
      await api.updateEvent(id, {
        title: form.title.trim(),
        description: form.description.trim(),
        eventType: form.eventType,
        startDate: startDate.toISOString(),
        endDate: endDate?.toISOString(),
        eventDays: parsedEventDays,
        registrationStartDate: regStartDate?.toISOString(),
        registrationEndDate: regEndDate?.toISOString(),
        location: form.location.trim() || undefined,
        venue: form.venue.trim() || undefined,
        capacity: form.capacity ? parseInt(form.capacity) : undefined,
        prerequisites: form.prerequisites.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        status: form.status,
        // Extended fields
        shortDescription: form.shortDescription.trim() || undefined,
        agenda: form.agenda.trim() || undefined,
        highlights: form.highlights.trim() || undefined,
        learningOutcomes: form.learningOutcomes.trim() || undefined,
        targetAudience: form.targetAudience.trim() || undefined,
        videoUrl: form.videoUrl.trim() || undefined,
        featured: form.featured,
        allowLateRegistration: form.allowLateRegistration,
        // Team registration
        teamRegistration: form.teamRegistration,
        teamMinSize: form.teamRegistration ? form.teamMinSize : undefined,
        teamMaxSize: form.teamRegistration ? form.teamMaxSize : undefined,
        // Array fields
        speakers: validSpeakers.length > 0 ? validSpeakers : undefined,
        resources: validResources.length > 0 ? validResources : undefined,
        faqs: validFaqs.length > 0 ? validFaqs : undefined,
        imageGallery: validGallery.length > 0 ? validGallery : undefined,
        tags: tags.length > 0 ? tags : undefined,
        registrationFields: normalizedRegistrationFields.length > 0 ? normalizedRegistrationFields : [],
      }, token);

      setIsDirty(false);
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
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/event-registrations">
          <Button variant="ghost" size="icon" aria-label="Back to event registrations">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-amber-900">Edit Event</h1>
          <p className="text-gray-600">Update event details</p>
        </div>
        <Link to={`/admin/event-registrations?eventId=${id}&tab=invitations`}>
          <Button variant="outline">
            <Users className="mr-2 h-4 w-4" />
            Manage Invitations
          </Button>
        </Link>
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

      <form onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-6">
        {/* Event Status */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" />
              Event Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <label htmlFor="edit-event-status" className="text-sm font-medium text-gray-700">Status</label>
                <select
                  id="edit-event-status"
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="UPCOMING">Upcoming</option>
                  <option value="ONGOING">Ongoing</option>
                  <option value="PAST">Past</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="featured"
                  name="featured"
                  checked={form.featured}
                  onChange={handleChange}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                />
                <label htmlFor="featured" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  Featured
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-2">
                <label htmlFor="edit-event-title" className="text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  id="edit-event-title"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-event-type" className="text-sm font-medium text-gray-700">Event Type</label>
                <select
                  id="edit-event-type"
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
              <label htmlFor="edit-event-short-description" className="text-sm font-medium text-gray-700">
                Short Description <span className="text-gray-400">(max 300 chars)</span>
              </label>
              <textarea
                id="edit-event-short-description"
                name="shortDescription"
                value={form.shortDescription}
                onChange={handleChange}
                maxLength={300}
                className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-gray-500 text-right">{form.shortDescription.length}/300</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-event-description" className="text-sm font-medium text-gray-700">
                Full Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="edit-event-description"
                name="description"
                value={form.description}
                onChange={handleChange}
                className="w-full min-h-[150px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                required
              />
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
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="edit-event-start-date" className="text-sm font-medium text-gray-700">
                  Start Date & Time <span className="text-red-500">*</span>
                </label>
                <Input
                  id="edit-event-start-date"
                  name="startDate"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-event-end-date" className="text-sm font-medium text-gray-700">End Date & Time</label>
                <Input
                  id="edit-event-end-date"
                  name="endDate"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-event-days" className="text-sm font-medium text-gray-700">
                  Attendance Days
                </label>
                <Input
                  id="edit-event-days"
                  name="eventDays"
                  type="number"
                  min="1"
                  max="10"
                  value={form.eventDays}
                  onChange={handleChange}
                />
                <p className="text-xs text-gray-500">
                  Set how many attendance days this event should track.
                  {hasRegistrations ? ' Reducing days may be blocked if attendance exists on removed days.' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <RegistrationTimelineSection
          idPrefix="edit-event"
          form={form}
          onChange={handleChange}
          onTeamSizeChange={(patch) => {
            setIsDirty(true);
            setForm(prev => ({ ...prev, ...patch }));
          }}
          hasRegistrations={hasRegistrations}
        />

        <ExtraRegistrationFieldsSection
          idPrefix="edit-event"
          fields={registrationFields}
          onAdd={addRegistrationField}
          onUpdate={updateRegistrationField}
          onRemove={removeRegistrationField}
          emptyMessage="No extra fields configured. Users can register directly."
        />

        {/* Location & Capacity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-amber-600" />
              Location & Capacity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="edit-event-location" className="text-sm font-medium text-gray-700">Location</label>
                <Input
                  id="edit-event-location"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="Location"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-event-venue" className="text-sm font-medium text-gray-700">Venue</label>
                <Input
                  id="edit-event-venue"
                  name="venue"
                  value={form.venue}
                  onChange={handleChange}
                  placeholder="Venue"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="edit-event-capacity" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Capacity
                </label>
                <Input
                  id="edit-event-capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={handleChange}
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-event-target-audience" className="text-sm font-medium text-gray-700">Target Audience</label>
                <Input
                  id="edit-event-target-audience"
                  name="targetAudience"
                  value={form.targetAudience}
                  onChange={handleChange}
                  placeholder="Who should attend"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-event-prerequisites" className="text-sm font-medium text-gray-700">Prerequisites</label>
              <textarea
                id="edit-event-prerequisites"
                name="prerequisites"
                value={form.prerequisites}
                onChange={handleChange}
                className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Media */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-amber-600" />
              Media
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="edit-event-image-url" className="text-sm font-medium text-gray-700">Cover Image URL</label>
                <Input
                  id="edit-event-image-url"
                  name="imageUrl"
                  type="url"
                  value={form.imageUrl}
                  onChange={handleChange}
                  placeholder="Google Drive or direct URL"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-event-video-url" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Video URL
                </label>
                <Input
                  id="edit-event-video-url"
                  name="videoUrl"
                  type="url"
                  value={form.videoUrl}
                  onChange={handleChange}
                  placeholder="YouTube, Vimeo, or Loom link"
                />
                <p className="text-xs text-gray-500">We convert supported video links into a safe embed URL automatically.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Extended Content Sections */}
        <CollapsibleSection 
          title="Event Highlights" 
          icon={<Star className="h-5 w-5 text-amber-600" />}
          defaultOpen={!!form.highlights}
        >
          <textarea
            aria-label="Event highlights"
            name="highlights"
            value={form.highlights}
            onChange={handleChange}
            placeholder="Key highlights..."
            className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
          />
        </CollapsibleSection>

        <CollapsibleSection 
          title="Agenda / Schedule" 
          icon={<Calendar className="h-5 w-5 text-amber-600" />}
          defaultOpen={!!form.agenda}
        >
          <textarea
            aria-label="Event agenda"
            name="agenda"
            value={form.agenda}
            onChange={handleChange}
            placeholder="Event schedule..."
            className="w-full min-h-[150px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
          />
        </CollapsibleSection>

        <CollapsibleSection 
          title="What You'll Learn" 
          icon={<Target className="h-5 w-5 text-amber-600" />}
          defaultOpen={!!form.learningOutcomes}
        >
          <textarea
            aria-label="Learning outcomes"
            name="learningOutcomes"
            value={form.learningOutcomes}
            onChange={handleChange}
            placeholder="Learning outcomes..."
            className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
          />
        </CollapsibleSection>

        {/* Speakers */}
        <CollapsibleSection 
          title="Speakers & Instructors" 
          icon={<User className="h-5 w-5 text-amber-600" />}
          badge={speakers.length > 0 ? `${speakers.length}` : undefined}
          defaultOpen={speakers.length > 0}
        >
          <div className="space-y-4">
            {speakers.map((speaker, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Speaker {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSpeaker(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Name"
                    value={speaker.name}
                    onChange={(e) => updateSpeaker(index, 'name', e.target.value)}
                  />
                  <Input
                    placeholder="Role"
                    value={speaker.role}
                    onChange={(e) => updateSpeaker(index, 'role', e.target.value)}
                  />
                </div>
                <Input
                  placeholder="Image URL"
                  value={speaker.image || ''}
                  onChange={(e) => updateSpeaker(index, 'image', e.target.value)}
                />
                <textarea
                  placeholder="Bio..."
                  value={speaker.bio || ''}
                  onChange={(e) => updateSpeaker(index, 'bio', e.target.value)}
                  className="w-full min-h-[60px] px-3 py-2 border border-input rounded-md bg-background text-sm"
                />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addSpeaker} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Speaker
            </Button>
          </div>
        </CollapsibleSection>

        {/* Resources */}
        <CollapsibleSection 
          title="Resources & Materials" 
          icon={<LinkIcon className="h-5 w-5 text-amber-600" />}
          badge={resources.length > 0 ? `${resources.length}` : undefined}
          defaultOpen={resources.length > 0}
        >
          <div className="space-y-4">
            {resources.map((resource, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Resource {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeResource(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Title"
                    value={resource.title}
                    onChange={(e) => updateResource(index, 'title', e.target.value)}
                  />
                  <Input
                    placeholder="URL"
                    value={resource.url}
                    onChange={(e) => updateResource(index, 'url', e.target.value)}
                  />
                  <select
                    value={resource.type}
                    onChange={(e) => updateResource(index, 'type', e.target.value)}
                    className="h-10 px-3 border border-input rounded-md bg-background text-sm"
                  >
                    {resourceTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addResource} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Resource
            </Button>
          </div>
        </CollapsibleSection>

        {/* FAQs */}
        <CollapsibleSection 
          title="FAQs" 
          icon={<HelpCircle className="h-5 w-5 text-amber-600" />}
          badge={faqs.length > 0 ? `${faqs.length}` : undefined}
          defaultOpen={faqs.length > 0}
        >
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">FAQ {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFaq(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  placeholder="Question"
                  value={faq.question}
                  onChange={(e) => updateFaq(index, 'question', e.target.value)}
                />
                <textarea
                  placeholder="Answer"
                  value={faq.answer}
                  onChange={(e) => updateFaq(index, 'answer', e.target.value)}
                  className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm"
                />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addFaq} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add FAQ
            </Button>
          </div>
        </CollapsibleSection>

        {/* Image Gallery */}
        <CollapsibleSection 
          title="Image Gallery" 
          icon={<Image className="h-5 w-5 text-amber-600" />}
          badge={imageGallery.filter(u => u.trim()).length > 0 ? `${imageGallery.filter(u => u.trim()).length}` : undefined}
          defaultOpen={imageGallery.length > 0}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Add Google Drive shareable links for event images</p>
            {imageGallery.map((url, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Google Drive image URL"
                  value={url}
                  onChange={(e) => updateGalleryImage(index, e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeGalleryImage(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addGalleryImage} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Image
            </Button>
          </div>
        </CollapsibleSection>

        {/* Tags */}
        <CollapsibleSection 
          title="Tags" 
          icon={<Tag className="h-5 w-5 text-amber-600" />}
          badge={tags.length > 0 ? `${tags.length}` : undefined}
          defaultOpen={tags.length > 0}
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="px-3 py-1 gap-2">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(index)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Submit */}
        <div className="flex gap-4 sticky bottom-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200">
          <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
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
