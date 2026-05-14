import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
        {/* Basic Info - Always Open */}
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
              Basic Information
            </CardTitle>
            <CardDescription>Event title, description, and type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-2">
                <label htmlFor="create-event-title" className="text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  id="create-event-title"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="e.g., DSA Bootcamp 2026"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="create-event-type" className="text-sm font-medium text-gray-700">Event Type</label>
                <select
                  id="create-event-type"
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
              <label htmlFor="create-event-short-description" className="text-sm font-medium text-gray-700">
                Short Description <span className="text-gray-400">(for event cards - max 300 chars)</span>
              </label>
              <textarea
                id="create-event-short-description"
                name="shortDescription"
                value={form.shortDescription}
                onChange={handleChange}
                placeholder="Brief summary that appears on event cards..."
                maxLength={300}
                className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-gray-500 text-right">{form.shortDescription.length}/300</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="create-event-description" className="text-sm font-medium text-gray-700">
                Full Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="create-event-description"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Detailed description. Supports basic markdown:&#10;# Heading&#10;- Bullet points&#10;1. Numbered lists"
                className="w-full min-h-[150px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                required
              />
            </div>

            <div className="flex items-center gap-3">
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
                Featured Event <span className="text-gray-400">(will be highlighted)</span>
              </label>
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
                <label htmlFor="create-event-start-date" className="text-sm font-medium text-gray-700">
                  Event Start Date & Time <span className="text-red-500">*</span>
                </label>
                <Input
                  id="create-event-start-date"
                  name="startDate"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="create-event-end-date" className="text-sm font-medium text-gray-700">Event End Date & Time</label>
                <Input
                  id="create-event-end-date"
                  name="endDate"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={handleChange}
                />
                <p className="text-xs text-gray-500">Leave empty for single-day events</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="create-event-days" className="text-sm font-medium text-gray-700">
                  Attendance Days
                </label>
                <Input
                  id="create-event-days"
                  name="eventDays"
                  type="number"
                  min="1"
                  max="10"
                  value={form.eventDays}
                  onChange={handleChange}
                />
                <p className="text-xs text-gray-500">Use more than 1 for multi-day attendance tracking.</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                <label htmlFor="create-event-location" className="text-sm font-medium text-gray-700">Location</label>
                <Input
                  id="create-event-location"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g., Online / Campus / City Name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="create-event-venue" className="text-sm font-medium text-gray-700">Venue</label>
                <Input
                  id="create-event-venue"
                  name="venue"
                  value={form.venue}
                  onChange={handleChange}
                  placeholder="e.g., Room 101 / Zoom / Google Meet"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="create-event-capacity" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Maximum Capacity
                </label>
                <Input
                  id="create-event-capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={handleChange}
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="create-event-target-audience" className="text-sm font-medium text-gray-700">Target Audience</label>
                <Input
                  id="create-event-target-audience"
                  name="targetAudience"
                  value={form.targetAudience}
                  onChange={handleChange}
                  placeholder="e.g., Beginners, 2nd Year Students, etc."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="create-event-prerequisites" className="text-sm font-medium text-gray-700">Prerequisites</label>
              <textarea
                id="create-event-prerequisites"
                name="prerequisites"
                value={form.prerequisites}
                onChange={handleChange}
                placeholder="What should participants know or bring? e.g., Basic programming knowledge, Laptop required"
                className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Media - Cover Image & Video */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-amber-600" />
              Media
            </CardTitle>
            <CardDescription>Cover image, video, and gallery</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="create-event-image-url" className="text-sm font-medium text-gray-700">Cover Image URL</label>
                <Input
                  id="create-event-image-url"
                  name="imageUrl"
                  type="url"
                  value={form.imageUrl}
                  onChange={handleChange}
                  placeholder="Google Drive link or direct image URL"
                />
                <p className="text-xs text-gray-500">Supports Google Drive shareable links</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="create-event-video-url" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Video URL
                </label>
                <Input
                  id="create-event-video-url"
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

        {/* Speakers */}
        <CollapsibleSection 
          title="Speakers & Instructors" 
          icon={<User className="h-5 w-5 text-amber-600" />}
          badge={speakers.length > 0 ? `${speakers.length}` : undefined}
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
                    placeholder="Role (e.g., Software Engineer at Google)"
                    value={speaker.role}
                    onChange={(e) => updateSpeaker(index, 'role', e.target.value)}
                  />
                </div>
                <Input
                  placeholder="Profile image URL (Google Drive or direct link)"
                  value={speaker.image || ''}
                  onChange={(e) => updateSpeaker(index, 'image', e.target.value)}
                />
                <textarea
                  placeholder="Short bio..."
                  value={speaker.bio || ''}
                  onChange={(e) => updateSpeaker(index, 'bio', e.target.value)}
                  className="w-full min-h-[60px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                  className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
