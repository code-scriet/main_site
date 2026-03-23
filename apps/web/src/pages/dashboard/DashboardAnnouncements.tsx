import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
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
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { Announcement } from '@/lib/api';
import { Bell, Loader2, AlertCircle, Plus, User, Clock, Edit2, Trash2, X, Save, Pin, Star, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '@/lib/dateUtils';

const priorityColors = {
  URGENT: 'destructive',
  HIGH: 'destructive', 
  MEDIUM: 'warning',
  LOW: 'secondary',
} as const;

const priorityBgColors = {
  URGENT: 'bg-red-50 border-red-200',
  HIGH: 'bg-orange-50 border-orange-200',
  MEDIUM: 'bg-amber-50 border-amber-200',
  LOW: 'bg-gray-50 border-gray-200',
};

type AnnouncementPriority = Announcement['priority'];

export default function DashboardAnnouncements() {
  const { user, token } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Announcement>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);

  const isCoreMember = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setEditForm({
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async (id: string) => {
    if (!token) {
      setError('Authentication token not found. Please log in again.');
      return;
    }
    try {
      setError(null);
      await api.updateAnnouncement(id, editForm, token);
      setEditingId(null);
      setEditForm({});
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update announcement');
    }
  };

  const handleDelete = async (announcement: Announcement) => {
    if (!token) {
      setError('Authentication token not found. Please log in again.');
      return;
    }
    if (!isAdmin) {
      setError('Only admins can delete announcements.');
      return;
    }
    
    try {
      setDeleting(announcement.id);
      setError(null);
      await api.deleteAnnouncement(announcement.id, token);
      await loadAnnouncements();
      setAnnouncementToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete announcement');
    } finally {
      setDeleting(null);
    }
  };

  const filteredAnnouncements = filter === 'ALL' 
    ? announcements 
    : announcements.filter(a => a.priority === filter);

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
          <h1 className="text-2xl font-bold text-amber-900">Announcements</h1>
          <p className="text-gray-600">Stay updated with the latest news</p>
        </div>
        {isCoreMember && (
          <Link to="/dashboard/announcements/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          </Link>
        )}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((priority) => (
          <Button
            key={priority}
            variant={filter === priority ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(priority)}
          >
            {priority === 'ALL' ? 'All' : priority.charAt(0) + priority.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      {/* Announcements List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-600" />
            All Announcements
          </CardTitle>
          <CardDescription>
            {filteredAnnouncements.length} announcement{filteredAnnouncements.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAnnouncements.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Bell className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No announcements found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAnnouncements.map((announcement, index) => (
                <motion.div
                  key={announcement.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 rounded-lg border ${priorityBgColors[announcement.priority]} transition-all hover:shadow-md`}
                >
                  {editingId === announcement.id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <Input
                          value={editForm.title || ''}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          placeholder="Title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                        <textarea
                          value={editForm.body || ''}
                          onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                          placeholder="Body"
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <select
                          value={editForm.priority || 'LOW'}
                          onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as AnnouncementPriority })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="URGENT">Urgent</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleSaveEdit(announcement.id)} size="sm">
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button onClick={handleCancelEdit} variant="outline" size="sm">
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-amber-900 break-words">{announcement.title}</h3>
                          {announcement.pinned && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                              <Pin className="h-3 w-3 mr-1" />
                              Pinned
                            </Badge>
                          )}
                          {announcement.featured && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                              <Star className="h-3 w-3 mr-1" />
                              Featured
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <Badge variant={priorityColors[announcement.priority]}>
                            {announcement.priority}
                          </Badge>
                          <Link to={`/announcements/${announcement.slug || announcement.id}`} target="_blank">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Open ${announcement.title} in a new tab`}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                          {isCoreMember && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(announcement)}
                                className="h-8 w-8 p-0"
                                aria-label={`Edit ${announcement.title}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setAnnouncementToDelete(announcement)}
                                  disabled={deleting === announcement.id}
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  aria-label={`Delete ${announcement.title}`}
                                >
                                  {deleting === announcement.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {announcement.shortDescription && (
                        <p className="text-sm text-gray-600 italic mb-2">{announcement.shortDescription}</p>
                      )}
                      <div className="text-gray-700 mb-4 line-clamp-3">
                        <Markdown>{announcement.body}</Markdown>
                      </div>
                      {/* Tags */}
                      {announcement.tags && announcement.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {announcement.tags.map((tag, idx) => (
                            <span key={idx} className="text-xs bg-white/50 text-gray-600 px-2 py-0.5 rounded-full border">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        {announcement.creator && (
                          <span className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {announcement.creator.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDate(announcement.createdAt)}
                        </span>
                        {announcement.imageUrl && (
                          <span className="text-xs text-amber-600">Has cover image</span>
                        )}
                        {announcement.imageGallery && (announcement.imageGallery as string[]).length > 0 && (
                          <span className="text-xs text-amber-600">{(announcement.imageGallery as string[]).length} gallery images</span>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(announcementToDelete)} onOpenChange={(open) => !open && setAnnouncementToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              {announcementToDelete
                ? `Delete "${announcementToDelete.title}" permanently? This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deleting)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
              onClick={() => {
                if (announcementToDelete) {
                  void handleDelete(announcementToDelete);
                }
              }}
            >
              {deleting && announcementToDelete?.id === deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Announcement'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
