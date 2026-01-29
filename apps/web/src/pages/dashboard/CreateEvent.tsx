import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api, type Speaker, type Resource, type FAQ } from '@/lib/api';
import { 
  Calendar, Loader2, AlertCircle, ArrowLeft, Clock, MapPin, Users, 
  Image, FileText, Plus, X, Star, Target, User, Link as LinkIcon,
  HelpCircle, Video, Tag, Trash2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

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

const resourceTypes = [
  { value: 'pdf', label: 'PDF Document' },
  { value: 'video', label: 'Video' },
  { value: 'github', label: 'GitHub Repo' },
  { value: 'slides', label: 'Slides' },
  { value: 'link', label: 'External Link' },
  { value: 'other', label: 'Other' },
];

// Collapsible Section Component
function CollapsibleSection({ 
  title, 
  icon, 
  children, 
  defaultOpen = false,
  badge
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Card className={isOpen ? 'border-amber-200' : ''}>
      <CardHeader 
        className="cursor-pointer hover:bg-amber-50/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
            {badge && <Badge variant="secondary" className="ml-2">{badge}</Badge>}
          </CardTitle>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>
      </CardHeader>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-0">{children}</CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function CreateEvent() {
  const navigate = useNavigate();
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Basic form state
  const [form, setForm] = useState({
    title: '',
    shortDescription: '',
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
    // Extended fields
    agenda: '',
    highlights: '',
    learningOutcomes: '',
    targetAudience: '',
    videoUrl: '',
    featured: false,
  });
  
  // Array fields
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [imageGallery, setImageGallery] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  // Speaker management
  const addSpeaker = () => {
    setSpeakers(prev => [...prev, { name: '', role: '', bio: '', image: '' }]);
  };
  
  const updateSpeaker = (index: number, field: keyof Speaker, value: string) => {
    setSpeakers(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };
  
  const removeSpeaker = (index: number) => {
    setSpeakers(prev => prev.filter((_, i) => i !== index));
  };

  // Resource management
  const addResource = () => {
    setResources(prev => [...prev, { title: '', url: '', type: 'link' }]);
  };
  
  const updateResource = (index: number, field: keyof Resource, value: string) => {
    setResources(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };
  
  const removeResource = (index: number) => {
    setResources(prev => prev.filter((_, i) => i !== index));
  };

  // FAQ management
  const addFaq = () => {
    setFaqs(prev => [...prev, { question: '', answer: '' }]);
  };
  
  const updateFaq = (index: number, field: keyof FAQ, value: string) => {
    setFaqs(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };
  
  const removeFaq = (index: number) => {
    setFaqs(prev => prev.filter((_, i) => i !== index));
  };

  // Gallery management
  const addGalleryImage = () => {
    setImageGallery(prev => [...prev, '']);
  };
  
  const updateGalleryImage = (index: number, value: string) => {
    setImageGallery(prev => prev.map((url, i) => i === index ? value : url));
  };
  
  const removeGalleryImage = (index: number) => {
    setImageGallery(prev => prev.filter((_, i) => i !== index));
  };

  // Tag management
  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags(prev => [...prev, newTag.trim()]);
      setNewTag('');
    }
  };
  
  const removeTag = (index: number) => {
    setTags(prev => prev.filter((_, i) => i !== index));
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
      setLoading(true);
      setError(null);
      
      // Filter out empty entries
      const validSpeakers = speakers.filter(s => s.name.trim());
      const validResources = resources.filter(r => r.title.trim() && r.url.trim());
      const validFaqs = faqs.filter(f => f.question.trim() && f.answer.trim());
      const validGallery = imageGallery.filter(url => url.trim());
      
      await api.createEvent({
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
        // Extended fields
        shortDescription: form.shortDescription.trim() || undefined,
        agenda: form.agenda.trim() || undefined,
        highlights: form.highlights.trim() || undefined,
        learningOutcomes: form.learningOutcomes.trim() || undefined,
        targetAudience: form.targetAudience.trim() || undefined,
        videoUrl: form.videoUrl.trim() || undefined,
        featured: form.featured,
        // Array fields
        speakers: validSpeakers.length > 0 ? validSpeakers : undefined,
        resources: validResources.length > 0 ? validResources : undefined,
        faqs: validFaqs.length > 0 ? validFaqs : undefined,
        imageGallery: validGallery.length > 0 ? validGallery : undefined,
        tags: tags.length > 0 ? tags : undefined,
      }, token);

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
          <Button variant="ghost" size="icon">
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

      <form onSubmit={handleSubmit} className="space-y-6">
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
                <label className="text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="e.g., DSA Bootcamp 2026"
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
                Short Description <span className="text-gray-400">(for event cards - max 300 chars)</span>
              </label>
              <textarea
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
              <label className="text-sm font-medium text-gray-700">
                Full Description <span className="text-red-500">*</span>
              </label>
              <textarea
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
        <Card className="border-amber-200 bg-amber-50/50">
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
                <p className="text-xs text-gray-500">When users can start registering</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Registration Closes</label>
                <Input
                  name="registrationEndDate"
                  type="datetime-local"
                  value={form.registrationEndDate}
                  onChange={handleChange}
                />
                <p className="text-xs text-gray-500">Last date to register</p>
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
                <label className="text-sm font-medium text-gray-700">Target Audience</label>
                <Input
                  name="targetAudience"
                  value={form.targetAudience}
                  onChange={handleChange}
                  placeholder="e.g., Beginners, 2nd Year Students, etc."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Prerequisites</label>
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
                <label className="text-sm font-medium text-gray-700">Cover Image URL</label>
                <Input
                  name="imageUrl"
                  type="url"
                  value={form.imageUrl}
                  onChange={handleChange}
                  placeholder="Google Drive link or direct image URL"
                />
                <p className="text-xs text-gray-500">Supports Google Drive shareable links</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Video URL
                </label>
                <Input
                  name="videoUrl"
                  type="url"
                  value={form.videoUrl}
                  onChange={handleChange}
                  placeholder="YouTube or Vimeo embed URL"
                />
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
            <label className="text-sm font-medium text-gray-700">Key highlights of the event</label>
            <textarea
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
            <label className="text-sm font-medium text-gray-700">Detailed event schedule</label>
            <textarea
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
            <label className="text-sm font-medium text-gray-700">What participants will gain</label>
            <textarea
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
