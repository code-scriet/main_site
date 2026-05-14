import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type NetworkProfile, type NetworkStatus, type NetworkEvent, type PendingNetworkUser } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import {
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
  Linkedin,
  Twitter,
  Github,
  Globe,
  Users,
  RefreshCw,
  Pencil,
  Phone,
  Save,
  FileText,
  Plus,
  Calendar,
  Video,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { NetworkStatsRow } from '@/components/admin/network/NetworkStatsRow';
import { PendingUsersBanner } from '@/components/admin/network/PendingUsersBanner';
import { RejectProfileDialog } from '@/components/admin/network/RejectProfileDialog';
import { DeleteProfileDialog } from '@/components/admin/network/DeleteProfileDialog';
import { PendingUserActionDialog } from '@/components/admin/network/PendingUserActionDialog';
import { NetworkProfileCard } from '@/components/admin/network/NetworkProfileCard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const connectionTypeLabels: Record<string, string> = {
  GUEST_SPEAKER: 'Guest Speaker',
  GMEET_SESSION: 'GMeet Session',
  EVENT_JUDGE: 'Event Judge',
  MENTOR: 'Mentor',
  INDUSTRY_PARTNER: 'Industry Partner',
  ALUMNI: 'Alumni',
  OTHER: 'Other',
};

const statusColors: Record<NetworkStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  VERIFIED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
};

type NetworkCategoryFilter = 'ANY' | 'PROFESSIONAL' | 'ALUMNI';

export default function AdminNetwork() {
  const { token } = useAuth();
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingNetworkUser[]>([]);
  const [counts, setCounts] = useState({ PENDING: 0, VERIFIED: 0, REJECTED: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<NetworkStatus | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');
  const [connectionCategory, setConnectionCategory] = useState<NetworkCategoryFilter>('ANY');

  // Dialogs
  const [viewProfile, setViewProfile] = useState<NetworkProfile | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ profile: NetworkProfile } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<NetworkProfile | null>(null);
  const [editDialog, setEditDialog] = useState<NetworkProfile | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editEvents, setEditEvents] = useState<NetworkEvent[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingUserAction, setPendingUserAction] = useState<{
    type: 'revert' | 'delete';
    pendingUser: PendingNetworkUser;
  } | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const [profilesData, pendingUsersData] = await Promise.all([
        api.getNetworkAll(token),
        api.getNetworkPendingUsers(token),
      ]);
      setProfiles(profilesData.profiles);
      setCounts(profilesData.counts);
      setPendingUsers(pendingUsersData.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  // Filter profiles
  const filteredProfiles = profiles.filter((p) => {
    if (activeTab !== 'ALL' && p.status !== activeTab) return false;
    if (connectionCategory === 'ALUMNI' && p.connectionType !== 'ALUMNI') return false;
    if (connectionCategory === 'PROFESSIONAL' && p.connectionType === 'ALUMNI') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.company.toLowerCase().includes(q) ||
        p.user?.email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleVerify = async (profile: NetworkProfile) => {
    if (!token) return;
    setActionLoading(true);
    try {
      await api.verifyNetworkProfile(profile.id, token);
      await fetchProfiles();
      setViewProfile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!token || !rejectDialog) return;
    setActionLoading(true);
    try {
      await api.rejectNetworkProfile(rejectDialog.profile.id, rejectReason, token);
      await fetchProfiles();
      setRejectDialog(null);
      setRejectReason('');
      setViewProfile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteDialog) return;
    setActionLoading(true);
    try {
      await api.deleteNetworkProfile(deleteDialog.id, token);
      await fetchProfiles();
      setDeleteDialog(null);
      setViewProfile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevertPendingUser = async (pendingUser: PendingNetworkUser) => {
    if (!token) return;
    setActionLoading(true);
    try {
      await api.revertPendingNetworkUser(pendingUser.id, token);
      setPendingUserAction(null);
      await fetchProfiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move user back to normal flow');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePendingUser = async (pendingUser: PendingNetworkUser) => {
    if (!token) return;
    setActionLoading(true);
    try {
      await api.deletePendingNetworkUser(pendingUser.id, token);
      setPendingUserAction(null);
      await fetchProfiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete pending user');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditDialog = (profile: NetworkProfile) => {
    setEditForm({
      fullName: profile.fullName || '',
      designation: profile.designation || '',
      company: profile.company || '',
      industry: profile.industry || '',
      bio: profile.bio || '',
      profilePhoto: profile.profilePhoto || '',
      phone: profile.phone || '',
      linkedinUsername: profile.linkedinUsername || '',
      twitterUsername: profile.twitterUsername || '',
      githubUsername: profile.githubUsername || '',
      personalWebsite: profile.personalWebsite || '',
      connectionNote: profile.connectionNote || '',
      connectedSince: profile.connectedSince?.toString() || '',
      displayOrder: (profile.displayOrder ?? 0).toString(),
      adminNotes: profile.adminNotes || '',
      connectionType: profile.connectionType || '',
      passoutYear: profile.passoutYear?.toString() || '',
      degree: profile.degree || '',
      branch: profile.branch || '',
      rollNumber: profile.rollNumber || '',
      achievements: profile.achievements || '',
      currentLocation: profile.currentLocation || '',
    });
    // Initialize events from profile
    const events = (profile.events as NetworkEvent[] | null) || [];
    setEditEvents(Array.isArray(events) ? events : []);
    setEditDialog(profile);
    setViewProfile(null);
  };

  const handleEditSave = async () => {
    if (!token || !editDialog) return;
    setEditSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      const stringFields = [
        'fullName', 'designation', 'company', 'industry', 'bio',
        'profilePhoto', 'phone', 'linkedinUsername', 'twitterUsername',
        'githubUsername', 'personalWebsite', 'connectionNote', 'adminNotes',
        'connectionType', 'degree', 'branch', 'rollNumber', 'achievements', 'currentLocation'
      ];
      
      const nullableFields = new Set([
        'bio', 'profilePhoto', 'phone', 'linkedinUsername', 'twitterUsername',
        'githubUsername', 'personalWebsite', 'connectionNote', 'adminNotes',
        'degree', 'branch', 'rollNumber', 'achievements', 'currentLocation'
      ]);

      for (const field of stringFields) {
        if (editForm[field] !== undefined) {
          if (editForm[field] === '' && nullableFields.has(field)) {
            updates[field] = null;
          } else {
            updates[field] = editForm[field];
          }
        }
      }
      if (editForm.connectedSince) {
        updates.connectedSince = parseInt(editForm.connectedSince);
      }
      if (editForm.passoutYear) {
        const parsedYear = parseInt(editForm.passoutYear, 10);
        updates.passoutYear = Number.isFinite(parsedYear) ? parsedYear : null;
      } else {
        updates.passoutYear = null;
      }
      if (editForm.displayOrder !== undefined) {
        const parsedDisplayOrder = parseInt(editForm.displayOrder, 10);
        updates.displayOrder = Number.isFinite(parsedDisplayOrder) ? parsedDisplayOrder : 0;
      }
      // Include events
      updates.events = editEvents;
      await api.updateNetworkProfileAdmin(editDialog.id, updates, token);
      await fetchProfiles();
      setEditDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  // Event management helpers
  const addEvent = () => {
    setEditEvents([...editEvents, { title: '', date: '', description: '', type: '', link: '' }]);
  };

  const updateEvent = (index: number, field: keyof NetworkEvent, value: string) => {
    const updated = [...editEvents];
    updated[index] = { ...updated[index], [field]: value };
    setEditEvents(updated);
  };

  const removeEvent = (index: number) => {
    setEditEvents(editEvents.filter((_, i) => i !== index));
  };

  const handleExportExcel = async (options: {
    exportAll?: boolean;
    category?: NetworkCategoryFilter;
  } = {}) => {
    if (!token) {
      setError('Authentication required');
      return;
    }

    try {
      setExporting(true);
      setError(null);

      const params = new URLSearchParams();

      if (!options.exportAll) {
        if (activeTab !== 'ALL') {
          params.append('status', activeTab);
        }
        if (search.trim()) {
          params.append('search', search.trim());
        }
      }

      const exportCategory = options.category ?? connectionCategory;
      if (exportCategory !== 'ANY') {
        params.append('category', exportCategory);
      }

      params.append('includePendingUsers', 'true');

      const query = params.toString();
      const response = await fetch(`${API_URL}/network/admin/export${query ? `?${query}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to download network Excel file');
      }

      let filename = `network_profiles_${new Date().toISOString().split('T')[0]}.xlsx`;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch?.[1]) {
          filename = filenameMatch[1];
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download network Excel file');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-6 w-6 text-amber-600" />
              Network Management
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Manage industry professional profiles and verifications
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportExcel({ exportAll: true })}
              disabled={loading || exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportExcel()}
              disabled={loading || exporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Visible
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportExcel({ exportAll: true, category: 'PROFESSIONAL' })}
              disabled={loading || exporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Professional
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportExcel({ exportAll: true, category: 'ALUMNI' })}
              disabled={loading || exporting}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Alumni
            </Button>
            <Button variant="outline" size="sm" onClick={fetchProfiles} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <NetworkStatsRow counts={counts} activeTab={activeTab} onSelect={setActiveTab} />

        {/* Tabs & Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-2">
            {(['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] as const).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            {([
              { key: 'ANY', label: 'Any' },
              { key: 'PROFESSIONAL', label: 'Professional/Network' },
              { key: 'ALUMNI', label: 'Alumni' },
            ] as const).map((option) => (
              <Button
                key={option.key}
                variant={connectionCategory === option.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConnectionCategory(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, company, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <PendingUsersBanner
          pendingUsers={pendingUsers}
          actionLoading={actionLoading}
          onRevert={(pendingUser) => setPendingUserAction({ type: 'revert', pendingUser })}
          onDelete={(pendingUser) => setPendingUserAction({ type: 'delete', pendingUser })}
        />

        {/* Profiles List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={fetchProfiles}>Retry</Button>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No profiles found {search && 'matching your search'}.
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filteredProfiles.map((profile, index) => (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <NetworkProfileCard
                    profile={profile}
                    actionLoading={actionLoading}
                    onView={() => setViewProfile(profile)}
                    onEdit={() => openEditDialog(profile)}
                    onVerify={() => handleVerify(profile)}
                    onReject={() => setRejectDialog({ profile })}
                    onDelete={() => setDeleteDialog(profile)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* View Profile Dialog */}
        <Dialog open={!!viewProfile} onOpenChange={() => setViewProfile(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {viewProfile && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden">
                      <img
                        src={
                          viewProfile.profilePhoto ||
                          '/fallback-avatar.svg'
                        }
                        alt={viewProfile.fullName}
                        className="w-full h-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = '/fallback-avatar.svg';
                        }}
                      />
                    </div>
                    <div>
                      <span>{viewProfile.fullName}</span>
                      <Badge
                        variant="outline"
                        className={`ml-2 ${statusColors[viewProfile.status]}`}
                      >
                        {viewProfile.status}
                      </Badge>
                    </div>
                  </DialogTitle>
                  <DialogDescription>
                    {viewProfile.designation} at {viewProfile.company}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Email</p>
                      <p className="font-medium">{viewProfile.user?.email}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Industry</p>
                      <p className="font-medium">{viewProfile.industry}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Connection Type</p>
                      <p className="font-medium">
                        {connectionTypeLabels[viewProfile.connectionType]}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Connected Since</p>
                      <p className="font-medium">{viewProfile.connectedSince || 'Not specified'}</p>
                    </div>
                    {viewProfile.phone && (
                      <div>
                        <p className="text-gray-500">Phone</p>
                        <p className="font-medium flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {viewProfile.phone}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Bio */}
                  {viewProfile.bio && (
                    <div>
                      <p className="text-gray-500 text-sm mb-1">Bio</p>
                      <p className="text-sm bg-gray-50 p-3 rounded-md">{viewProfile.bio}</p>
                    </div>
                  )}

                  {/* Connection Note */}
                  {viewProfile.connectionNote && (
                    <div>
                      <p className="text-gray-500 text-sm mb-1">Connection Details</p>
                      <p className="text-sm bg-amber-50 p-3 rounded-md border border-amber-100">
                        {viewProfile.connectionNote}
                      </p>
                    </div>
                  )}

                  {/* Admin Notes */}
                  {viewProfile.adminNotes && (
                    <div>
                      <p className="text-gray-500 text-sm mb-1 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Admin Notes (Highlights)
                      </p>
                      <div className="text-sm bg-gray-50 p-3 rounded-md border prose prose-sm max-w-none">
                        <Markdown>{viewProfile.adminNotes}</Markdown>
                      </div>
                    </div>
                  )}

                  {/* Social Links */}
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Social Links</p>
                    <div className="flex gap-3">
                      {viewProfile.linkedinUsername && (
                        <a
                          href={`https://linkedin.com/in/${viewProfile.linkedinUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                        >
                          <Linkedin className="h-4 w-4" /> LinkedIn
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {viewProfile.twitterUsername && (
                        <a
                          href={`https://twitter.com/${viewProfile.twitterUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sky-500 hover:underline text-sm"
                        >
                          <Twitter className="h-4 w-4" /> Twitter
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {viewProfile.githubUsername && (
                        <a
                          href={`https://github.com/${viewProfile.githubUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-gray-800 hover:underline text-sm"
                        >
                          <Github className="h-4 w-4" /> GitHub
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {viewProfile.personalWebsite && (
                        <a
                          href={viewProfile.personalWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-green-600 hover:underline text-sm"
                        >
                          <Globe className="h-4 w-4" /> Website
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!viewProfile.linkedinUsername &&
                        !viewProfile.twitterUsername &&
                        !viewProfile.githubUsername &&
                        !viewProfile.personalWebsite && (
                          <span className="text-gray-400 text-sm">No social links provided</span>
                        )}
                    </div>
                  </div>

                  {/* Rejection Reason */}
                  {viewProfile.status === 'REJECTED' && viewProfile.rejectionReason && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-sm font-medium">Rejection Reason:</p>
                      <p className="text-red-600 text-sm">{viewProfile.rejectionReason}</p>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex gap-2 w-full flex-wrap justify-end">
                      <Button
                        variant="outline"
                        onClick={() => openEditDialog(viewProfile)}
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Edit Profile
                      </Button>
                      {viewProfile.status === 'PENDING' && (
                        <>
                          <Button
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleVerify(viewProfile)}
                            disabled={actionLoading}
                          >
                            {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Verify
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => {
                              setViewProfile(null);
                              setRejectDialog({ profile: viewProfile });
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                  <Button variant="outline" onClick={() => setViewProfile(null)}>
                    Close
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <RejectProfileDialog
          target={rejectDialog?.profile ?? null}
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onCancel={() => setRejectDialog(null)}
          onConfirm={handleReject}
          loading={actionLoading}
        />

        <DeleteProfileDialog
          target={deleteDialog}
          onCancel={() => setDeleteDialog(null)}
          onConfirm={handleDelete}
          loading={actionLoading}
        />

        {/* Edit Dialog */}
        <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {editDialog && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Pencil className="h-5 w-5 text-amber-600" />
                    Edit Profile — {editDialog.fullName}
                  </DialogTitle>
                  <DialogDescription>
                    Edit profile details and add admin notes (markdown supported).
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-full-name">Full Name</Label>
                      <Input
                        id="admin-network-full-name"
                        value={editForm.fullName || ''}
                        onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-designation">Designation</Label>
                      <Input
                        id="admin-network-designation"
                        value={editForm.designation || ''}
                        onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-company">Company</Label>
                      <Input
                        id="admin-network-company"
                        value={editForm.company || ''}
                        onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-industry">Industry</Label>
                      <Input
                        id="admin-network-industry"
                        value={editForm.industry || ''}
                        onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="admin-network-connection-type">Connection Type</Label>
                    <select
                      id="admin-network-connection-type"
                      value={editForm.connectionType || ''}
                      onChange={(e) => setEditForm({ ...editForm, connectionType: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select Connection Type</option>
                      {Object.entries(connectionTypeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Alumni Fields */}
                  {editForm.connectionType === 'ALUMNI' && (
                    <div className="p-4 bg-amber-50/50 rounded-lg border border-amber-100 space-y-4">
                      <h4 className="font-semibold text-amber-900 text-sm">Alumni Details</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="admin-network-passout-year">Passout Year</Label>
                          <Input
                            id="admin-network-passout-year"
                            type="number"
                            value={editForm.passoutYear || ''}
                            onChange={(e) => setEditForm({ ...editForm, passoutYear: e.target.value })}
                            placeholder="e.g. 2024"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="admin-network-current-location">Current Location</Label>
                          <Input
                            id="admin-network-current-location"
                            value={editForm.currentLocation || ''}
                            onChange={(e) => setEditForm({ ...editForm, currentLocation: e.target.value })}
                            placeholder="e.g. Bangalore, India"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="admin-network-degree">Degree</Label>
                          <Input
                            id="admin-network-degree"
                            value={editForm.degree || ''}
                            onChange={(e) => setEditForm({ ...editForm, degree: e.target.value })}
                            placeholder="e.g. B.Tech"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="admin-network-branch">Branch</Label>
                          <Input
                            id="admin-network-branch"
                            value={editForm.branch || ''}
                            onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                            placeholder="e.g. Computer Science"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="admin-network-roll-number">College Roll Number</Label>
                          <Input
                            id="admin-network-roll-number"
                            value={editForm.rollNumber || ''}
                            onChange={(e) => setEditForm({ ...editForm, rollNumber: e.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="admin-network-achievements">Achievements / Highlights</Label>
                        <Textarea
                          id="admin-network-achievements"
                          value={editForm.achievements || ''}
                          onChange={(e) => setEditForm({ ...editForm, achievements: e.target.value })}
                          placeholder="Notable college achievements..."
                          rows={2}
                        />
                      </div>
                    </div>
                  )}

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-network-phone" className="flex items-center gap-1">
                      <Phone className="h-4 w-4" /> Phone Number
                    </Label>
                    <Input
                      id="admin-network-phone"
                      value={editForm.phone || ''}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="+91 9876543210"
                    />
                    <p className="text-xs text-gray-400">Private — not shown publicly</p>
                  </div>

                  {/* Bio */}
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-network-bio">Bio</Label>
                    <Textarea
                      id="admin-network-bio"
                      value={editForm.bio || ''}
                      onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {/* Profile Photo */}
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-network-profile-photo">Profile Photo URL</Label>
                    <Input
                      id="admin-network-profile-photo"
                      value={editForm.profilePhoto || ''}
                      onChange={(e) => setEditForm({ ...editForm, profilePhoto: e.target.value })}
                      placeholder="https://example.com/photo.jpg"
                    />
                  </div>

                  {/* Social Links */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-linkedin" className="flex items-center gap-1 text-sm">
                        <Linkedin className="h-3 w-3 text-blue-600" /> LinkedIn
                      </Label>
                      <Input
                        id="admin-network-linkedin"
                        value={editForm.linkedinUsername || ''}
                        onChange={(e) => setEditForm({ ...editForm, linkedinUsername: e.target.value })}
                        placeholder="username"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-twitter" className="flex items-center gap-1 text-sm">
                        <Twitter className="h-3 w-3 text-sky-500" /> Twitter
                      </Label>
                      <Input
                        id="admin-network-twitter"
                        value={editForm.twitterUsername || ''}
                        onChange={(e) => setEditForm({ ...editForm, twitterUsername: e.target.value })}
                        placeholder="username"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-github" className="flex items-center gap-1 text-sm">
                        <Github className="h-3 w-3" /> GitHub
                      </Label>
                      <Input
                        id="admin-network-github"
                        value={editForm.githubUsername || ''}
                        onChange={(e) => setEditForm({ ...editForm, githubUsername: e.target.value })}
                        placeholder="username"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-website" className="flex items-center gap-1 text-sm">
                        <Globe className="h-3 w-3 text-green-600" /> Website
                      </Label>
                      <Input
                        id="admin-network-website"
                        value={editForm.personalWebsite || ''}
                        onChange={(e) => setEditForm({ ...editForm, personalWebsite: e.target.value })}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>

                  {/* Connection Note */}
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-network-connection-note">Connection Details</Label>
                    <Textarea
                      id="admin-network-connection-note"
                      value={editForm.connectionNote || ''}
                      onChange={(e) => setEditForm({ ...editForm, connectionNote: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Connected Since */}
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-connected-since">Connected Since (Year)</Label>
                      <Input
                        id="admin-network-connected-since"
                        type="number"
                        value={editForm.connectedSince || ''}
                        onChange={(e) => setEditForm({ ...editForm, connectedSince: e.target.value })}
                        min={2000}
                        max={new Date().getFullYear()}
                      />
                    </div>
                    {/* Display Order */}
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-display-order">Display Order Number</Label>
                      <Input
                        id="admin-network-display-order"
                        type="number"
                        value={editForm.displayOrder || '0'}
                        onChange={(e) => setEditForm({ ...editForm, displayOrder: e.target.value })}
                        min={0}
                      />
                      <p className="text-xs text-gray-400">
                        Lower number appears earlier on network/home listings.
                      </p>
                    </div>
                  </div>

                  {/* Admin Notes — Markdown */}
                  <div className="space-y-2 pt-4 border-t">
                    <p className="flex items-center gap-2 text-base font-semibold">
                      <FileText className="h-4 w-4 text-amber-600" />
                      Highlights & Contributions (Admin Notes)
                    </p>
                    <p className="text-xs text-gray-500">
                      Write in Markdown. This content will be displayed publicly on the profile page under "Highlights & Contributions". Use this to note what the person achieved, topics they covered in sessions, awards, etc.
                    </p>
                    <Textarea
                      id="admin-network-admin-notes"
                      value={editForm.adminNotes || ''}
                      onChange={(e) => setEditForm({ ...editForm, adminNotes: e.target.value })}
                      rows={8}
                      placeholder={`## Session Topic\nConducted a session on **React Server Components** covering:\n- Server vs Client components\n- Data fetching patterns\n- Performance benefits\n\n## Achievements\n- 🏆 Helped 3 students land internships\n- Published research paper on distributed systems`}
                      className="font-mono text-sm"
                    />
                    {/* Live Preview */}
                    {editForm.adminNotes && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                        <div className="p-4 bg-gray-50 rounded-lg border prose prose-sm max-w-none">
                          <Markdown>{editForm.adminNotes}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Events / Sessions Management */}
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 text-base font-semibold">
                        <Calendar className="h-4 w-4 text-amber-600" />
                        Sessions & Events
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={addEvent}>
                        <Plus className="h-3 w-3 mr-1" /> Add Event
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Record sessions, talks, or events this person hosted or participated in. This will be displayed as a timeline on their profile.
                    </p>
                    
                    {editEvents.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <Video className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-400">No events added yet</p>
                        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={addEvent}>
                          <Plus className="h-3 w-3 mr-1" /> Add First Event
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {editEvents.map((event, index) => (
                          <div key={index} className="p-4 bg-gray-50 rounded-lg border relative">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6 text-gray-400 hover:text-red-500"
                              onClick={() => removeEvent(index)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                              <div className="col-span-2 sm:col-span-1">
                                <Label htmlFor={`admin-network-event-title-${index}`} className="text-xs">Event Title *</Label>
                                <Input
                                  id={`admin-network-event-title-${index}`}
                                  value={event.title}
                                  onChange={(e) => updateEvent(index, 'title', e.target.value)}
                                  placeholder="React Server Components Workshop"
                                  className="mt-1"
                                />
                              </div>
                              <div className="col-span-2 sm:col-span-1">
                                <Label htmlFor={`admin-network-event-date-${index}`} className="text-xs">Date</Label>
                                <Input
                                  id={`admin-network-event-date-${index}`}
                                  value={event.date}
                                  onChange={(e) => updateEvent(index, 'date', e.target.value)}
                                  placeholder="January 2026"
                                  className="mt-1"
                                />
                              </div>
                              <div className="col-span-2 sm:col-span-1">
                                <Label htmlFor={`admin-network-event-type-${index}`} className="text-xs">Type</Label>
                                <Input
                                  id={`admin-network-event-type-${index}`}
                                  value={event.type || ''}
                                  onChange={(e) => updateEvent(index, 'type', e.target.value)}
                                  placeholder="GMeet Session, In-Person Talk, Workshop"
                                  className="mt-1"
                                />
                              </div>
                              <div className="col-span-2 sm:col-span-1">
                                <Label htmlFor={`admin-network-event-link-${index}`} className="text-xs">Recording/Link (optional)</Label>
                                <Input
                                  id={`admin-network-event-link-${index}`}
                                  value={event.link || ''}
                                  onChange={(e) => updateEvent(index, 'link', e.target.value)}
                                  placeholder="https://youtube.com/..."
                                  className="mt-1"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label htmlFor={`admin-network-event-description-${index}`} className="text-xs">Description (optional)</Label>
                                <Textarea
                                  id={`admin-network-event-description-${index}`}
                                  value={event.description || ''}
                                  onChange={(e) => updateEvent(index, 'description', e.target.value)}
                                  placeholder="Topics covered, key takeaways, etc."
                                  rows={2}
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditDialog(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleEditSave}
                    disabled={editSaving}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  >
                    {editSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <PendingUserActionDialog
          action={pendingUserAction}
          onCancel={() => setPendingUserAction(null)}
          onConfirm={(act) => {
            if (act.type === 'revert') {
              void handleRevertPendingUser(act.pendingUser);
            } else {
              void handleDeletePendingUser(act.pendingUser);
            }
          }}
        />
    </div>
  );
}
