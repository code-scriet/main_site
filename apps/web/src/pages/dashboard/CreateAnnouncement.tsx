import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { Bell, Loader2, AlertCircle, ArrowLeft, Image as ImageIcon, Link as LinkIcon, FileText, Tag, Pin, Star, Clock, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface AttachmentItem {
  title: string;
  url: string;
  type: string;
}

interface LinkItem {
  title: string;
  url: string;
}

export default function CreateAnnouncement() {
  const navigate = useNavigate();
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [form, setForm] = useState({
    title: '',
    body: '',
    shortDescription: '',
    priority: 'MEDIUM',
    imageUrl: '',
    imageGallery: [] as string[],
    attachments: [] as AttachmentItem[],
    links: [] as LinkItem[],
    tags: [] as string[],
    featured: false,
    pinned: false,
    expiresAt: '',
  });
  
  const [newGalleryUrl, setNewGalleryUrl] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newAttachment, setNewAttachment] = useState<AttachmentItem>({ title: '', url: '', type: 'link' });
  const [newLink, setNewLink] = useState<LinkItem>({ title: '', url: '' });
  const [coverPreviewError, setCoverPreviewError] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      if (name === 'imageUrl') {
        setCoverPreviewError(false);
      }
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const addGalleryImage = () => {
    if (newGalleryUrl.trim()) {
      setForm(prev => ({ ...prev, imageGallery: [...prev.imageGallery, newGalleryUrl.trim()] }));
      setNewGalleryUrl('');
    }
  };

  const removeGalleryImage = (index: number) => {
    setForm(prev => ({ ...prev, imageGallery: prev.imageGallery.filter((_, i) => i !== index) }));
  };

  const addTag = () => {
    if (newTag.trim() && !form.tags.includes(newTag.trim())) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const addAttachment = () => {
    if (newAttachment.title.trim() && newAttachment.url.trim()) {
      setForm(prev => ({ ...prev, attachments: [...prev.attachments, { ...newAttachment }] }));
      setNewAttachment({ title: '', url: '', type: 'link' });
    }
  };

  const removeAttachment = (index: number) => {
    setForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== index) }));
  };

  const addLink = () => {
    if (newLink.title.trim() && newLink.url.trim()) {
      setForm(prev => ({ ...prev, links: [...prev.links, { ...newLink }] }));
      setNewLink({ title: '', url: '' });
    }
  };

  const removeLink = (index: number) => {
    setForm(prev => ({ ...prev, links: prev.links.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.title.trim() || !form.body.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (!token) {
      setError('Authentication token not found. Please log in again.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      await api.createAnnouncement({
        title: form.title.trim(),
        body: form.body.trim(),
        shortDescription: form.shortDescription.trim() || undefined,
        priority: form.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
        imageUrl: form.imageUrl.trim() || undefined,
        imageGallery: form.imageGallery.length > 0 ? form.imageGallery : undefined,
        attachments: form.attachments.length > 0 ? form.attachments : undefined,
        links: form.links.length > 0 ? form.links : undefined,
        tags: form.tags.length > 0 ? form.tags : undefined,
        featured: form.featured,
        pinned: form.pinned,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      }, token);

      navigate('/dashboard/announcements');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create announcement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/dashboard/announcements">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-amber-900">New Announcement</h1>
          <p className="text-gray-600">Create a new announcement for members</p>
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
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              Basic Information
            </CardTitle>
            <CardDescription>Title, content, and priority</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="create-announcement-title" className="text-sm font-medium text-gray-700">
                Title <span className="text-red-500">*</span>
              </label>
              <Input
                id="create-announcement-title"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g., Important: New Event Registration"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="create-announcement-short-description" className="text-sm font-medium text-gray-700">
                Short Description <span className="text-gray-400">(optional)</span>
              </label>
              <Input
                id="create-announcement-short-description"
                name="shortDescription"
                value={form.shortDescription}
                onChange={handleChange}
                placeholder="Brief summary for cards and previews"
                maxLength={200}
              />
              <p className="text-xs text-gray-500">{form.shortDescription.length}/200 characters</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="create-announcement-body" className="text-sm font-medium text-gray-700">
                Content <span className="text-red-500">*</span>
              </label>
              <textarea
                id="create-announcement-body"
                name="body"
                value={form.body}
                onChange={handleChange}
                placeholder="Write your announcement here... Markdown is supported!"
                className="w-full min-h-[200px] px-3 py-2 border border-input rounded-md bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                required
              />
              <p className="text-xs text-gray-500">Supports Markdown formatting</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="create-announcement-priority" className="text-sm font-medium text-gray-700">Priority</label>
                <select
                  id="create-announcement-priority"
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                  className="w-full h-10 px-3 py-2 border border-input rounded-md bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="LOW">Low - General information</option>
                  <option value="MEDIUM">Medium - Important updates</option>
                  <option value="HIGH">High - Requires attention</option>
                  <option value="URGENT">Urgent - Immediate action needed</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="create-announcement-expires-at" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Expires At <span className="text-gray-400">(optional)</span>
                </label>
                <Input
                  id="create-announcement-expires-at"
                  type="datetime-local"
                  name="expiresAt"
                  value={form.expiresAt}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <label htmlFor="create-announcement-pinned" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="create-announcement-pinned"
                  type="checkbox"
                  name="pinned"
                  checked={form.pinned}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <Pin className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-gray-700">Pin to top</span>
              </label>
              
              <label htmlFor="create-announcement-featured" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="create-announcement-featured"
                  type="checkbox"
                  name="featured"
                  checked={form.featured}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <Star className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">Featured</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Options Toggle */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
          {showAdvanced ? 'Hide' : 'Show'} Advanced Options
        </Button>

        {showAdvanced && (
          <>
            {/* Images */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-amber-600" />
                  Images
                </CardTitle>
                <CardDescription>Cover image and gallery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="create-announcement-image-url" className="text-sm font-medium text-gray-700">Cover Image URL</label>
                  <Input
                    id="create-announcement-image-url"
                    name="imageUrl"
                    value={form.imageUrl}
                    onChange={handleChange}
                    placeholder="https://example.com/image.jpg"
                  />
                  {form.imageUrl && !coverPreviewError && (
                    <div className="mt-2 relative rounded-lg overflow-hidden">
                      <img
                        src={form.imageUrl}
                        alt="Cover preview"
                        className="w-full h-40 object-cover"
                        onError={() => setCoverPreviewError(true)}
                      />
                    </div>
                  )}
                  {coverPreviewError && (
                    <p className="text-sm text-amber-700">Preview unavailable for this image URL.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="create-announcement-gallery-url" className="text-sm font-medium text-gray-700">Image Gallery</label>
                  <div className="flex gap-2">
                    <Input
                      id="create-announcement-gallery-url"
                      value={newGalleryUrl}
                      onChange={(e) => setNewGalleryUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGalleryImage())}
                    />
                    <Button type="button" onClick={addGalleryImage} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {form.imageGallery.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">{/* responsive: 2 cols on mobile */}
                      {form.imageGallery.map((url, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={url}
                            alt={`Gallery ${index + 1}`}
                            className="w-full h-20 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-amber-600" />
                  Tags
                </CardTitle>
                <CardDescription>Add tags for categorization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add a tag..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <Button type="button" onClick={addTag} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-amber-900"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attachments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-600" />
                  Attachments
                </CardTitle>
                <CardDescription>Add downloadable files or documents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    value={newAttachment.title}
                    onChange={(e) => setNewAttachment(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Title"
                  />
                  <Input
                    value={newAttachment.url}
                    onChange={(e) => setNewAttachment(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="URL"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newAttachment.type}
                      onChange={(e) => setNewAttachment(prev => ({ ...prev, type: e.target.value }))}
                      className="flex-1 h-10 px-3 py-2 border border-input rounded-md bg-background text-sm"
                    >
                      <option value="link">Link</option>
                      <option value="pdf">PDF</option>
                      <option value="doc">Document</option>
                      <option value="other">Other</option>
                    </select>
                    <Button type="button" onClick={addAttachment} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {form.attachments.length > 0 && (
                  <div className="space-y-2">
                    {form.attachments.map((att, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="font-medium text-sm flex-1">{att.title}</span>
                        <span className="text-xs text-gray-500 uppercase">{att.type}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Related Links */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-amber-600" />
                  Related Links
                </CardTitle>
                <CardDescription>Add external links</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    value={newLink.title}
                    onChange={(e) => setNewLink(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Link title"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={newLink.url}
                      onChange={(e) => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://..."
                    />
                    <Button type="button" onClick={addLink} variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {form.links.length > 0 && (
                  <div className="space-y-2">
                    {form.links.map((link, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <LinkIcon className="h-4 w-4 text-gray-500" />
                        <span className="font-medium text-sm flex-1">{link.title}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline truncate max-w-[150px]">
                          {link.url}
                        </a>
                        <button
                          type="button"
                          onClick={() => removeLink(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Submit Buttons */}
        <div className="flex gap-4">
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              'Publish Announcement'
            )}
          </Button>
          <Link to="/dashboard/announcements" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
