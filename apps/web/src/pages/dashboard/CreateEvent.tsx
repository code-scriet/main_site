// Dashboard v2 — Create Event.
// Anchor-nav (left) + sectioned body + sticky save bar matching the design.
// Reuses the existing section components (BasicInformationSection etc.) so every field
// + validation + draft behaviour is preserved.
// Design source: screen-admin.jsx:4 (CreateEventScreen).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Calendar, Clock, MapPin, Camera, FileText, Users, Mic, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { useEventForm } from '@/hooks/useEventForm';
import { validateEventFormDates } from '@/lib/eventForm';
import { ExtraRegistrationFieldsSection } from '@/components/events/form/ExtraRegistrationFieldsSection';
import { RegistrationTimelineSection } from '@/components/events/form/RegistrationTimelineSection';
import { TeamRegistrationSection } from '@/components/events/form/TeamRegistrationSection';
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
import { Pill } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Section { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; }

const SECTIONS: Section[] = [
  { id: 'basics', label: 'Basic information', icon: Info },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'registration', label: 'Registration timeline', icon: Clock },
  { id: 'fields', label: 'Registration fields', icon: FileText },
  { id: 'location', label: 'Location & capacity', icon: MapPin },
  { id: 'media', label: 'Media', icon: Camera },
  { id: 'team', label: 'Team registration', icon: Users },
  { id: 'speakers', label: 'Speakers', icon: Mic },
  { id: 'highlights', label: 'Highlights & FAQ', icon: Sparkles },
];

export default function CreateEvent() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [activeSection, setActiveSection] = useState<string>('basics');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChangesWarning(isDirty);

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
    agenda: '',
    highlights: '',
    learningOutcomes: '',
    targetAudience: '',
    videoUrl: '',
    featured: false,
    allowLateRegistration: false,
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

  const dirtyCount = useMemo(() => {
    let n = 0;
    Object.values(form).forEach((v) => {
      if (typeof v === 'string' && v.trim()) n++;
      else if (typeof v === 'boolean' && v) n++;
    });
    return n + tags.length + speakers.filter((s) => s.name.trim()).length + faqs.filter((f) => f.question.trim()).length + resources.filter((r) => r.title.trim()).length + imageGallery.filter((g) => g.trim()).length + registrationFields.length;
  }, [form, tags, speakers, faqs, resources, imageGallery, registrationFields]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    setIsDirty(true);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
    if (!form.allowLateRegistration && regEndDate && regEndDate > startDate) {
      setError('Registration should close before or when the event starts');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const validSpeakers = speakers.filter((s) => s.name.trim());
      const validResources = resources.filter((r) => r.title.trim() && r.url.trim());
      const validFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim());
      const validGallery = imageGallery.filter((u) => u.trim());
      const normalizedRegistrationFields = registrationFields
        .map((field) => ({ ...field, label: field.label.trim(), placeholder: field.placeholder?.trim() || undefined, pattern: field.pattern?.trim() || undefined }))
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
        shortDescription: form.shortDescription.trim() || undefined,
        agenda: form.agenda.trim() || undefined,
        highlights: form.highlights.trim() || undefined,
        learningOutcomes: form.learningOutcomes.trim() || undefined,
        targetAudience: form.targetAudience.trim() || undefined,
        videoUrl: form.videoUrl.trim() || undefined,
        featured: form.featured,
        allowLateRegistration: form.allowLateRegistration,
        teamRegistration: form.teamRegistration,
        teamMinSize: form.teamRegistration ? form.teamMinSize : undefined,
        teamMaxSize: form.teamRegistration ? form.teamMaxSize : undefined,
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

  // Tab switch — only the selected section's content renders, matching the
  // design (screen-admin.jsx:57-211 uses `section === 'basics'`, `section ===
  // 'schedule'`, etc.). On small viewports we also scroll the form area into
  // view so the user lands on the new section after picking it.
  const jumpTo = (id: string) => {
    setActiveSection(id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      const el = document.getElementById('create-event-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-24">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/events')}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] mb-2"
          >
            ← Back to events
          </button>
          <h1 className="text-[24px] font-semibold tracking-tight">Create event</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">All fields can be edited after publishing.</p>
        </div>
        <Pill tone="warning" size="sm" dot>
          Draft
        </Pill>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-5">
        <aside className="lg:col-span-3 lg:sticky lg:top-[72px] lg:self-start">
          <div className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  className={cn(
                    'h-8 px-2 rounded-[7px] inline-flex items-center gap-2 text-[12.5px] transition-colors text-left',
                    active
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                      : 'text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] hover:text-[var(--ds-text-1)]',
                  )}
                >
                  <Icon size={13} className="opacity-80 shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <form id="create-event-form" onSubmit={handleSubmit} className="lg:col-span-9 flex flex-col gap-4">
          {/* Tab-rendered sections — only the active one mounts. The underlying
              section components keep their own React state via props passed
              from the parent hook, so switching tabs preserves all field
              values. Design source: screen-admin.jsx:57-211. */}

          {activeSection === 'basics' && (
            <div role="tabpanel" aria-labelledby="evt-tab-basics">
              <BasicInformationSection
                idPrefix="create-event"
                form={form}
                onChange={handleChange}
                description="Event title, description, and type"
                showFeatured
                titlePlaceholder="e.g., DSA Bootcamp 2026"
                shortDescriptionLabelHint="(for event cards - max 300 chars)"
                shortDescriptionPlaceholder="Brief summary that appears on event cards…"
                descriptionPlaceholder="Detailed description. Supports markdown."
              />
            </div>
          )}

          {activeSection === 'schedule' && (
            <div role="tabpanel" aria-labelledby="evt-tab-schedule">
              <EventScheduleSection idPrefix="create-event" form={form} onChange={handleChange} description="When will the event take place?" />
            </div>
          )}

          {activeSection === 'registration' && (
            <div role="tabpanel" aria-labelledby="evt-tab-registration">
              <RegistrationTimelineSection
                idPrefix="create-event"
                form={form}
                onChange={handleChange}
                description="Control when users can register for this event"
              />
            </div>
          )}

          {activeSection === 'fields' && (
            <div role="tabpanel" aria-labelledby="evt-tab-fields">
              <ExtraRegistrationFieldsSection
                idPrefix="create-event"
                fields={registrationFields}
                onAdd={addRegistrationField}
                onUpdate={updateRegistrationField}
                onRemove={removeRegistrationField}
                description="Add extra fields required at registration time."
                emptyMessage="No extra fields configured."
              />
            </div>
          )}

          {activeSection === 'location' && (
            <div role="tabpanel" aria-labelledby="evt-tab-location">
              <LocationCapacitySection idPrefix="create-event" form={form} onChange={handleChange} description="Where and how many participants" />
            </div>
          )}

          {activeSection === 'media' && (
            <div role="tabpanel" aria-labelledby="evt-tab-media" className="flex flex-col gap-4">
              <MediaSection idPrefix="create-event" form={form} onChange={handleChange} description="Cover image, video, and gallery" />
              <EventGallerySection imageGallery={imageGallery} onAdd={addGalleryImage} onUpdate={updateGalleryImage} onRemove={removeGalleryImage} />
            </div>
          )}

          {activeSection === 'team' && (
            <div role="tabpanel" aria-labelledby="evt-tab-team">
              <TeamRegistrationSection
                idPrefix="create-event"
                form={form}
                onChange={handleChange}
                onTeamSizeChange={(patch) => { setIsDirty(true); setForm((prev) => ({ ...prev, ...patch })); }}
              />
            </div>
          )}

          {activeSection === 'speakers' && (
            <div role="tabpanel" aria-labelledby="evt-tab-speakers" className="flex flex-col gap-4">
              <EventSpeakersSection speakers={speakers} onAdd={addSpeaker} onUpdate={updateSpeaker} onRemove={removeSpeaker} />
              <EventResourcesSection resources={resources} onAdd={addResource} onUpdate={updateResource} onRemove={removeResource} />
            </div>
          )}

          {activeSection === 'highlights' && (
            <div role="tabpanel" aria-labelledby="evt-tab-highlights" className="flex flex-col gap-4">
              <EventTextareaSection
                idPrefix="create-event"
                name="highlights"
                title="Event Highlights"
                icon={<Sparkles className="h-5 w-5" />}
                value={form.highlights}
                onChange={handleChange}
                label="Key highlights"
                placeholder={'- Hands-on coding sessions\n- Certificate of completion\n- Networking opportunities'}
              />
              <EventTextareaSection
                idPrefix="create-event"
                name="agenda"
                title="Agenda / Schedule"
                icon={<Calendar className="h-5 w-5" />}
                value={form.agenda}
                onChange={handleChange}
                label="Detailed event schedule"
                placeholder={'## Day 1\n- 10:00 AM - Opening Ceremony\n- 11:00 AM - Keynote Session\n\n## Day 2\n- 10:00 AM - Workshops'}
                minHeight="150px"
              />
              <EventTextareaSection
                idPrefix="create-event"
                name="learningOutcomes"
                title="What You'll Learn"
                icon={<Sparkles className="h-5 w-5" />}
                value={form.learningOutcomes}
                onChange={handleChange}
                label="What participants will gain"
                placeholder={'- Master the fundamentals of React\n- Build a complete project from scratch\n- Understand best practices'}
              />
              <EventFaqsSection faqs={faqs} onAdd={addFaq} onUpdate={updateFaq} onRemove={removeFaq} />
              <EventTagsSection tags={tags} newTag={newTag} onNewTagChange={setNewTag} onAddTag={addTag} onRemoveTag={removeTag} />
            </div>
          )}
        </form>
      </div>

      <div className="fixed bottom-0 left-0 lg:left-[244px] right-0 z-30 frost border-t border-[var(--border-subtle)] px-4 py-3 flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => navigate('/dashboard/events')}>Discard</Button>
        <div className="flex-1 flex items-center gap-2">
          {isDirty && (
            <Pill tone="warning" size="sm" dot>
              <span className="font-mono tabular-nums">{dirtyCount}</span> field{dirtyCount === 1 ? '' : 's'} filled
            </Pill>
          )}
        </div>
        <Button size="sm" onClick={() => handleSubmit()} disabled={loading || !form.title.trim() || !form.description.trim() || !form.startDate.trim()}>
          {loading ? <><Loader2 size={13} className="mr-1.5 animate-spin" />Creating…</> : <>Create event</>}
        </Button>
      </div>
    </div>
  );
}
