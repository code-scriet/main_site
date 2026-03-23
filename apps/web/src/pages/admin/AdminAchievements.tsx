import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Trophy, Loader2, AlertCircle, Plus, Trash2, Edit2, X, Check, 
  Calendar, Users, Image as ImageIcon, Star, Tag
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';

export default function AdminAchievements() {
  const { token } = useAuth();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [achievementToDelete, setAchievementToDelete] = useState<Achievement | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    content: '',
    shortDescription: '',
    eventName: '',
    achievedBy: '',
    imageUrl: '',
    imageGallery: '',
    date: new Date().toISOString().split('T')[0],
    tags: '',
    featured: false,
  });

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const data = await api.getAchievements({ includeContent: true });
      setAchievements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load achievements');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      content: '',
      shortDescription: '',
      eventName: '',
      achievedBy: '',
      imageUrl: '',
      imageGallery: '',
      date: new Date().toISOString().split('T')[0],
      tags: '',
      featured: false,
    });
    setEditingId(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    setForm({
      title: '',
      description: '',
      content: '',
      shortDescription: '',
      eventName: '',
      achievedBy: '',
      imageUrl: '',
      imageGallery: '',
      date: new Date().toISOString().split('T')[0],
      tags: '',
      featured: false,
    });
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (achievement: Achievement) => {
    setForm({
      title: achievement.title,
      description: achievement.description,
      content: achievement.content || '',
      shortDescription: achievement.shortDescription || '',
      eventName: achievement.eventName || '',
      achievedBy: achievement.achievedBy,
      imageUrl: achievement.imageUrl || '',
      imageGallery: achievement.imageGallery?.join('\n') || '',
      date: achievement.date.split('T')[0],
      tags: achievement.tags?.join(', ') || '',
      featured: achievement.featured || false,
    });
    setEditingId(achievement.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      toast.error('Authentication required');
      return;
    }
    
    if (!form.title.trim() || !form.description.trim() || !form.achievedBy.trim()) {
      toast.error('Title, description, and achieved by are required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      const data = {
        title: form.title.trim(),
        description: form.description.trim(),
        content: form.content.trim() || undefined,
        shortDescription: form.shortDescription.trim() || undefined,
        eventName: form.eventName.trim() || undefined,
        achievedBy: form.achievedBy.trim(),
        imageUrl: form.imageUrl.trim() || undefined,
        imageGallery: form.imageGallery.trim() 
          ? form.imageGallery.split('\n').map(url => url.trim()).filter(Boolean) 
          : undefined,
        date: form.date,
        tags: form.tags.trim() 
          ? form.tags.split(',').map(tag => tag.trim()).filter(Boolean) 
          : [],
        featured: form.featured,
      };
      
      if (editingId) {
        await api.updateAchievement(editingId, data, token);
        toast.success('Achievement updated successfully');
      } else {
        await api.createAchievement(data, token);
        toast.success('Achievement created successfully');
      }
      
      resetForm();
      await loadAchievements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save achievement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;

    try {
      setError(null);
      await api.deleteAchievement(id, token);
      toast.success('Achievement deleted successfully');
      setAchievementToDelete(null);
      await loadAchievements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete achievement');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Achievements Management</h1>
          <p className="text-gray-500">Manage club achievements and milestones</p>
        </div>
        <Button onClick={openCreateForm} className="bg-amber-500 hover:bg-amber-600">
          <Plus className="h-4 w-4 mr-2" />
          Add Achievement
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-600" />
                {editingId ? 'Edit Achievement' : 'Add New Achievement'}
              </CardTitle>
              <CardDescription>
                Fill in the details for the achievement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={form.title}
                      onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Achievement title"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="eventName">Event/Competition Name</Label>
                    <Input
                      id="eventName"
                      value={form.eventName}
                      onChange={(e) => setForm(f => ({ ...f, eventName: e.target.value }))}
                      placeholder="e.g., Hackathon 2026"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="achievedBy">Achieved By *</Label>
                    <Input
                      id="achievedBy"
                      value={form.achievedBy}
                      onChange={(e) => setForm(f => ({ ...f, achievedBy: e.target.value }))}
                      placeholder="Names of achievers"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shortDescription">Short Description (for cards)</Label>
                  <Input
                    id="shortDescription"
                    value={form.shortDescription}
                    onChange={(e) => setForm(f => ({ ...f, shortDescription: e.target.value }))}
                    placeholder="Brief summary (max 300 chars)"
                    maxLength={300}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Full description of the achievement"
                    rows={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Detailed Content (Markdown)</Label>
                  <Textarea
                    id="content"
                    value={form.content}
                    onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Detailed content with markdown support. This will be shown on the achievement detail page."
                    rows={6}
                  />
                  <p className="text-xs text-gray-500">Supports Markdown formatting</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="imageUrl">Cover Image URL</Label>
                    <Input
                      id="imageUrl"
                      value={form.imageUrl}
                      onChange={(e) => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags (comma separated)</Label>
                    <Input
                      id="tags"
                      value={form.tags}
                      onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                      placeholder="hackathon, first-place, web-dev"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imageGallery">Image Gallery URLs (one per line)</Label>
                  <Textarea
                    id="imageGallery"
                    value={form.imageGallery}
                    onChange={(e) => setForm(f => ({ ...f, imageGallery: e.target.value }))}
                    placeholder="https://image1.jpg&#10;https://image2.jpg&#10;https://image3.jpg"
                    rows={4}
                  />
                  <p className="text-xs text-gray-500">Add one image URL per line for the gallery</p>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="featured"
                    checked={form.featured}
                    onCheckedChange={(checked: boolean) => setForm(f => ({ ...f, featured: checked }))}
                  />
                  <Label htmlFor="featured" className="flex items-center gap-2 cursor-pointer">
                    <Star className="h-4 w-4 text-amber-500" />
                    Featured Achievement
                  </Label>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600">
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {editingId ? 'Update' : 'Create'} Achievement
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Achievements List */}
      <Card>
        <CardHeader>
          <CardTitle>All Achievements ({achievements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : achievements.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 text-amber-300 mx-auto mb-4" />
              <p className="text-gray-500">No achievements yet. Add your first achievement!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {achievements.map((achievement) => (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-amber-300 transition-colors gap-4"
                >
                  <div className="flex items-start gap-4">
                    {achievement.imageUrl ? (
                      <img
                        src={achievement.imageUrl}
                        alt={achievement.title}
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Trophy className="h-8 w-8 text-amber-600" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{achievement.title}</h3>
                        {achievement.featured && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                            <Star className="h-3 w-3 mr-1" />
                            Featured
                          </Badge>
                        )}
                      </div>
                      
                      {achievement.eventName && (
                        <p className="text-sm text-amber-600">{achievement.eventName}</p>
                      )}
                      
                      <p className="text-sm text-gray-600 line-clamp-1 mt-1">
                        {achievement.shortDescription || achievement.description}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{achievement.achievedBy}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(achievement.date)}</span>
                        </div>
                        {achievement.imageGallery && achievement.imageGallery.length > 0 && (
                          <div className="flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" />
                            <span>{achievement.imageGallery.length} images</span>
                          </div>
                        )}
                      </div>
                      
                      {achievement.tags && achievement.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {achievement.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              <Tag className="h-2 w-2 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                          {achievement.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{achievement.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 sm:flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(achievement)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAchievementToDelete(achievement)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(achievementToDelete)} onOpenChange={(open) => !open && setAchievementToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete achievement?</AlertDialogTitle>
            <AlertDialogDescription>
              {achievementToDelete
                ? `This will permanently remove "${achievementToDelete.title}" and its detail content.`
                : 'This achievement will be permanently removed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (achievementToDelete) {
                  void handleDelete(achievementToDelete.id);
                }
              }}
            >
              Delete Achievement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
