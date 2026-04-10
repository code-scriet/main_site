import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  Edit2,
  ExternalLink,
  Loader2,
  Pin,
  Plus,
  Save,
  Star,
  Trash2,
  Vote,
  X,
} from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PollCard } from '@/components/polls/PollCard';
import { useAuth } from '@/context/AuthContext';
import { api, type Announcement, type Poll } from '@/lib/api';
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
type ActiveTab = 'announcements' | 'polls';
type PollFilter = 'ALL' | 'OPEN' | 'CLOSED';

function getAnnouncementPreview(body: string): string {
  return body
    .replace(/[#*_`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export default function DashboardAnnouncements() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('announcements');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcementFilter, setAnnouncementFilter] = useState<string>('ALL');
  const [pollFilter, setPollFilter] = useState<PollFilter>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Announcement>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);

  const isCoreMember = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [announcementData, pollData] = await Promise.all([
        api.getAnnouncements(),
        api.getPolls({ includeClosed: true, limit: 50 }, token ?? undefined),
      ]);
      setAnnouncements(announcementData);
      setPolls(pollData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      await loadData();
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
      await loadData();
      setAnnouncementToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete announcement');
    } finally {
      setDeleting(null);
    }
  };

  const filteredAnnouncements =
    announcementFilter === 'ALL'
      ? announcements
      : announcements.filter((announcement) => announcement.priority === announcementFilter);

  const filteredPolls = polls.filter((poll) => {
    if (pollFilter === 'OPEN') return !poll.isClosed;
    if (pollFilter === 'CLOSED') return poll.isClosed;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Announcements</h1>
          <p className="text-gray-600">
            News, updates, and now async polls that members can vote on anytime.
          </p>
        </div>

        {activeTab === 'announcements' && isCoreMember ? (
          <Link to="/dashboard/announcements/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Announcement
            </Button>
          </Link>
        ) : activeTab === 'polls' && isAdmin ? (
          <Link to="/admin/public-view">
            <Button>
              <Vote className="mr-2 h-4 w-4" />
              Public View
            </Button>
          </Link>
        ) : null}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="polls">Polls</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((priority) => (
              <Button
                key={priority}
                variant={announcementFilter === priority ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAnnouncementFilter(priority)}
              >
                {priority === 'ALL' ? 'All' : priority.charAt(0) + priority.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>

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
                <div className="py-8 text-center text-gray-500">
                  <Bell className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <p>No announcements found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredAnnouncements.map((announcement, index) => (
                    <motion.div
                      key={announcement.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className={`rounded-lg border p-4 transition-all hover:shadow-md ${priorityBgColors[announcement.priority]}`}
                    >
                      {editingId === announcement.id ? (
                        <div className="space-y-4">
                          <div>
                            <label htmlFor={`announcement-title-${announcement.id}`} className="mb-1 block text-sm font-medium text-gray-700">
                              Title
                            </label>
                            <Input
                              id={`announcement-title-${announcement.id}`}
                              value={editForm.title || ''}
                              onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                              placeholder="Title"
                            />
                          </div>
                          <div>
                            <label htmlFor={`announcement-body-${announcement.id}`} className="mb-1 block text-sm font-medium text-gray-700">
                              Body
                            </label>
                            <textarea
                              id={`announcement-body-${announcement.id}`}
                              value={editForm.body || ''}
                              onChange={(event) => setEditForm({ ...editForm, body: event.target.value })}
                              rows={4}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                          <div>
                            <label htmlFor={`announcement-priority-${announcement.id}`} className="mb-1 block text-sm font-medium text-gray-700">
                              Priority
                            </label>
                            <select
                              id={`announcement-priority-${announcement.id}`}
                              value={editForm.priority || 'LOW'}
                              onChange={(event) => setEditForm({ ...editForm, priority: event.target.value as AnnouncementPriority })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-amber-500"
                            >
                              <option value="LOW">Low</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HIGH">High</option>
                              <option value="URGENT">Urgent</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => void handleSaveEdit(announcement.id)} size="sm">
                              <Save className="mr-1 h-4 w-4" />
                              Save
                            </Button>
                            <Button onClick={handleCancelEdit} variant="outline" size="sm">
                              <X className="mr-1 h-4 w-4" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words font-semibold text-amber-900">{announcement.title}</h3>
                              {announcement.pinned && (
                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                  <Pin className="mr-1 h-3 w-3" />
                                  Pinned
                                </Badge>
                              )}
                              {announcement.featured && (
                                <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">
                                  <Star className="mr-1 h-3 w-3" />
                                  Featured
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={priorityColors[announcement.priority]}>{announcement.priority}</Badge>
                              <Link to={`/announcements/${announcement.slug || announcement.id}`} target="_blank">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Open ${announcement.title}`}>
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                              {isCoreMember && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(announcement)}
                                  className="h-8 w-8 p-0"
                                  aria-label={`Edit ${announcement.title}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setAnnouncementToDelete(announcement)}
                                  disabled={deleting === announcement.id}
                                  className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
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
                          </div>

                          {announcement.shortDescription && (
                            <p className="mb-2 text-sm italic text-gray-600">{announcement.shortDescription}</p>
                          )}
                          <p className="mb-4 line-clamp-3 text-gray-700">
                            {getAnnouncementPreview(announcement.body)}
                            {announcement.body.length > 180 ? '...' : ''}
                          </p>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                            {announcement.creator && <span>{announcement.creator.name}</span>}
                            <span>{formatDate(announcement.createdAt)}</span>
                            {announcement.tags && announcement.tags.length > 0 && (
                              <span>{announcement.tags.length} tag{announcement.tags.length === 1 ? '' : 's'}</span>
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
        </TabsContent>

        <TabsContent value="polls" className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'OPEN', 'CLOSED'] as const).map((status) => (
              <Button
                key={status}
                variant={pollFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPollFilter(status)}
              >
                {status === 'ALL' ? 'All polls' : status === 'OPEN' ? 'Open polls' : 'Closed polls'}
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Vote className="h-5 w-5 text-amber-600" />
                  Polls
                </CardTitle>
                <CardDescription>
                  {filteredPolls.length} poll{filteredPolls.length !== 1 ? 's' : ''} available to members
                </CardDescription>
              </div>

              {isAdmin && (
                <Link to="/admin/public-view">
                  <Button variant="outline" size="sm">
                    Manage in Public View
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {filteredPolls.length === 0 ? (
                <div className="py-10 text-center text-gray-500">
                  <Vote className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <p>No polls found for this filter.</p>
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredPolls.map((poll) => (
                    <PollCard key={poll.id} poll={poll} actionLabel="Open poll" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
