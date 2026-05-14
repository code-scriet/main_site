import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { Calendar, Loader2, AlertCircle, ArrowLeft, Users, Star, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeLocal } from '@/lib/dateUtils';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { useEventForm } from '@/hooks/useEventForm';
import { validateEventFormDates } from '@/lib/eventForm';
import { ExtraRegistrationFieldsSection } from '@/components/events/form/ExtraRegistrationFieldsSection';
import { RegistrationTimelineSection } from '@/components/events/form/RegistrationTimelineSection';
import { BasicInformationSection } from '@/components/events/form/BasicInformationSection';
import { EventScheduleSection } from '@/components/events/form/EventScheduleSection';
import { LocationCapacitySection } from '@/components/events/form/LocationCapacitySection';
import { MediaSection } from '@/components/events/form/MediaSection';
import { EventSpeakersSection } from '@/components/events/form/EventSpeakersSection';
import { EventResourcesSection } from '@/components/events/form/EventResourcesSection';
import { EventFaqsSection } from '@/components/events/form/EventFaqsSection';
import { EventGallerySection } from '@/components/events/form/EventGallerySection';
import { EventTagsSection } from '@/components/events/form/EventTagsSection';
import { EventTextareaSection } from '@/components/events/form/EventTextareaSection';
import { EventStatusSection } from '@/components/events/form/EventStatusSection';

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
  }, [id, setSpeakers, setResources, setFaqs, setImageGallery, setTags, setRegistrationFields]);

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
        <EventStatusSection
          idPrefix="edit-event"
          status={form.status}
          featured={form.featured}
          onChange={handleChange}
        />

        <BasicInformationSection
          idPrefix="edit-event"
          form={form}
          onChange={handleChange}
        />

        <EventScheduleSection
          idPrefix="edit-event"
          form={form}
          onChange={handleChange}
          endDateHint=""
          eventDaysHint={`Set how many attendance days this event should track.${
            hasRegistrations ? ' Reducing days may be blocked if attendance exists on removed days.' : ''
          }`}
        />

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

        <LocationCapacitySection
          idPrefix="edit-event"
          form={form}
          onChange={handleChange}
          locationPlaceholder="Location"
          venuePlaceholder="Venue"
          capacityLabel="Capacity"
          targetAudiencePlaceholder="Who should attend"
          prerequisitesPlaceholder=""
        />

        <MediaSection
          idPrefix="edit-event"
          form={form}
          onChange={handleChange}
          imageUrlPlaceholder="Google Drive or direct URL"
          imageUrlHint=""
        />

        <EventTextareaSection
          idPrefix="edit-event"
          name="highlights"
          title="Event Highlights"
          icon={<Star className="h-5 w-5 text-amber-600" />}
          value={form.highlights}
          onChange={handleChange}
          placeholder="Key highlights..."
          defaultOpen={!!form.highlights}
        />

        <EventTextareaSection
          idPrefix="edit-event"
          name="agenda"
          title="Agenda / Schedule"
          icon={<Calendar className="h-5 w-5 text-amber-600" />}
          value={form.agenda}
          onChange={handleChange}
          placeholder="Event schedule..."
          minHeight="150px"
          defaultOpen={!!form.agenda}
        />

        <EventTextareaSection
          idPrefix="edit-event"
          name="learningOutcomes"
          title="What You'll Learn"
          icon={<Target className="h-5 w-5 text-amber-600" />}
          value={form.learningOutcomes}
          onChange={handleChange}
          placeholder="Learning outcomes..."
          defaultOpen={!!form.learningOutcomes}
        />

        <EventSpeakersSection
          speakers={speakers}
          onAdd={addSpeaker}
          onUpdate={updateSpeaker}
          onRemove={removeSpeaker}
          rolePlaceholder="Role"
          imagePlaceholder="Image URL"
          bioPlaceholder="Bio..."
        />

        <EventResourcesSection
          resources={resources}
          onAdd={addResource}
          onUpdate={updateResource}
          onRemove={removeResource}
        />

        <EventFaqsSection
          faqs={faqs}
          onAdd={addFaq}
          onUpdate={updateFaq}
          onRemove={removeFaq}
        />

        <EventGallerySection
          imageGallery={imageGallery}
          onAdd={addGalleryImage}
          onUpdate={updateGalleryImage}
          onRemove={removeGalleryImage}
        />

        <EventTagsSection
          tags={tags}
          newTag={newTag}
          onNewTagChange={setNewTag}
          onAddTag={addTag}
          onRemoveTag={removeTag}
        />

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
