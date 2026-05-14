import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { Calendar, Loader2, AlertCircle, ArrowLeft, Star, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { useEventForm } from '@/hooks/useEventForm';
import { validateEventFormDates } from '@/lib/eventForm';
import { CollapsibleSection } from '@/components/events/form/CollapsibleSection';
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

export default function CreateEvent() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  
  const [loading, setLoading] = useState(false);
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
  
  const {
    speakers, addSpeaker, updateSpeaker, removeSpeaker,
    resources, addResource, updateResource, removeResource,
    faqs, addFaq, updateFaq, removeFaq,
    imageGallery, addGalleryImage, updateGalleryImage, removeGalleryImage,
    tags, newTag, setNewTag, addTag, removeTag,
    registrationFields, addRegistrationField, updateRegistrationField, removeRegistrationField,
  } = useEventForm({ onChange: () => setIsDirty(true) });

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

    if (!token) {
      setError('Authentication token not found. Please log in again.');
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
      setLoading(true);
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
      
      const createdEvent = await api.createEvent({
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
        registrationFields: normalizedRegistrationFields.length > 0 ? normalizedRegistrationFields : undefined,
      }, token);

      setIsDirty(false);
      if (user?.role === 'ADMIN' || user?.role === 'PRESIDENT') {
        navigate(`/admin/events/${createdEvent.id}/edit`);
        return;
      }

      navigate('/dashboard/events');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/dashboard/events">
          <Button variant="ghost" size="icon" aria-label="Back to dashboard events">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Create Event</h1>
          <p className="text-gray-600">Add a new event with all the details</p>
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

      <form onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-6">
        <BasicInformationSection
          idPrefix="create-event"
          form={form}
          onChange={handleChange}
          description="Event title, description, and type"
          showFeatured
          titlePlaceholder="e.g., DSA Bootcamp 2026"
          shortDescriptionLabelHint="(for event cards - max 300 chars)"
          shortDescriptionPlaceholder="Brief summary that appears on event cards..."
          descriptionPlaceholder="Detailed description. Supports basic markdown:&#10;# Heading&#10;- Bullet points&#10;1. Numbered lists"
        />

        <EventScheduleSection
          idPrefix="create-event"
          form={form}
          onChange={handleChange}
          description="When will the event take place?"
        />

        <RegistrationTimelineSection
          idPrefix="create-event"
          form={form}
          onChange={handleChange}
          onTeamSizeChange={(patch) => {
            setIsDirty(true);
            setForm(prev => ({ ...prev, ...patch }));
          }}
          description="Control when users can register for this event"
        />

        <ExtraRegistrationFieldsSection
          idPrefix="create-event"
          fields={registrationFields}
          onAdd={addRegistrationField}
          onUpdate={updateRegistrationField}
          onRemove={removeRegistrationField}
          description="Add extra fields required at registration time (for example: GitHub URL, Hackathon Team Name, Resume Link)."
          emptyMessage="No extra fields configured. Users will register directly without a popup form."
        />

        <LocationCapacitySection
          idPrefix="create-event"
          form={form}
          onChange={handleChange}
          description="Where and how many participants"
        />

        <MediaSection
          idPrefix="create-event"
          form={form}
          onChange={handleChange}
          description="Cover image, video, and gallery"
        />

        {/* Event Highlights */}
        <CollapsibleSection 
          title="Event Highlights" 
          icon={<Star className="h-5 w-5 text-amber-600" />}
        >
          <div className="space-y-2">
            <label htmlFor="create-event-highlights" className="text-sm font-medium text-gray-700">Key highlights of the event</label>
            <textarea
              id="create-event-highlights"
              name="highlights"
              value={form.highlights}
              onChange={handleChange}
              placeholder="- Hands-on coding sessions&#10;- Certificate of completion&#10;- Networking opportunities"
              className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
            />
          </div>
        </CollapsibleSection>

        {/* Agenda */}
        <CollapsibleSection 
          title="Agenda / Schedule" 
          icon={<Calendar className="h-5 w-5 text-amber-600" />}
        >
          <div className="space-y-2">
            <label htmlFor="create-event-agenda" className="text-sm font-medium text-gray-700">Detailed event schedule</label>
            <textarea
              id="create-event-agenda"
              name="agenda"
              value={form.agenda}
              onChange={handleChange}
              placeholder="## Day 1&#10;- 10:00 AM - Opening Ceremony&#10;- 11:00 AM - Keynote Session&#10;&#10;## Day 2&#10;- 10:00 AM - Workshops"
              className="w-full min-h-[150px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
            />
          </div>
        </CollapsibleSection>

        {/* Learning Outcomes */}
        <CollapsibleSection 
          title="What You'll Learn" 
          icon={<Target className="h-5 w-5 text-amber-600" />}
        >
          <div className="space-y-2">
            <label htmlFor="create-event-learning-outcomes" className="text-sm font-medium text-gray-700">What participants will gain</label>
            <textarea
              id="create-event-learning-outcomes"
              name="learningOutcomes"
              value={form.learningOutcomes}
              onChange={handleChange}
              placeholder="- Master the fundamentals of React&#10;- Build a complete project from scratch&#10;- Understand best practices"
              className="w-full min-h-[120px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
            />
          </div>
        </CollapsibleSection>

        <EventSpeakersSection
          speakers={speakers}
          onAdd={addSpeaker}
          onUpdate={updateSpeaker}
          onRemove={removeSpeaker}
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
          <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Event...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Create Event
              </>
            )}
          </Button>
          <Link to="/dashboard/events" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
