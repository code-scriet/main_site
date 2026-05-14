import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type NetworkProfile, type NetworkStatus, type NetworkEvent, type PendingNetworkUser } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Users, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { NetworkStatsRow } from '@/components/admin/network/NetworkStatsRow';
import { PendingUsersBanner } from '@/components/admin/network/PendingUsersBanner';
import { RejectProfileDialog } from '@/components/admin/network/RejectProfileDialog';
import { DeleteProfileDialog } from '@/components/admin/network/DeleteProfileDialog';
import { PendingUserActionDialog } from '@/components/admin/network/PendingUserActionDialog';
import { NetworkProfileCard } from '@/components/admin/network/NetworkProfileCard';
import { ViewProfileDialog } from '@/components/admin/network/ViewProfileDialog';
import { EditProfileDialog } from '@/components/admin/network/EditProfileDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

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

        <ViewProfileDialog
          profile={viewProfile}
          actionLoading={actionLoading}
          onClose={() => setViewProfile(null)}
          onEdit={(profile) => openEditDialog(profile)}
          onVerify={(profile) => handleVerify(profile)}
          onReject={(profile) => {
            setViewProfile(null);
            setRejectDialog({ profile });
          }}
        />

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

        <EditProfileDialog
          target={editDialog}
          form={editForm}
          onFormChange={setEditForm}
          events={editEvents}
          onAddEvent={addEvent}
          onUpdateEvent={updateEvent}
          onRemoveEvent={removeEvent}
          saving={editSaving}
          onCancel={() => setEditDialog(null)}
          onSave={handleEditSave}
        />

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
