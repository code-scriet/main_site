import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Shield, Loader2, AlertCircle, Plus, Trash2, UserPlus, Edit2, X, Link2, Unlink, Search } from 'lucide-react';
import { api, type TeamMember } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

type LinkedUserInfo = UserSearchResult & {
  bio?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
};

export default function AdminTeam() {
  const { token } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null);
  const [linkedUserInfo, setLinkedUserInfo] = useState<LinkedUserInfo | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<{ memberId: string; userName: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    role: '',
    team: 'Technical',
    imageUrl: '',
    linkedin: '',
    github: '',
    twitter: '',
    instagram: '',
    order: 0,
    // Profile content fields
    slug: '',
    bio: '',
    vision: '',
    story: '',
    expertise: '',
    achievements: '',
    website: '',
  });
  const loadTeam = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getTeam();
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const resetForm = () => {
    setForm({
      name: '',
      role: '',
      team: 'Technical',
      imageUrl: '',
      linkedin: '',
      github: '',
      twitter: '',
      instagram: '',
      order: 0,
      slug: '',
      bio: '',
      vision: '',
      story: '',
      expertise: '',
      achievements: '',
      website: '',
    });
    setEditingId(null);
    setShowForm(false);
    setLinkingUserId(null);
    setLinkedUserInfo(null);
    setUserSearchQuery('');
    setUserSearchResults([]);
  };

  const handleEdit = (member: TeamMember) => {
    const synced = member._syncedFrom || {};
    
    setForm({
      name: member.name,
      role: member.role,
      team: member.team,
      imageUrl: synced.imageUrl === 'user' ? '' : (member.imageUrl || ''),
      linkedin: synced.linkedin === 'user' ? '' : (member.linkedin || ''),
      github: synced.github === 'user' ? '' : (member.github || ''),
      twitter: synced.twitter === 'user' ? '' : (member.twitter || ''),
      instagram: synced.instagram === 'user' ? '' : (member.instagram || ''),
      order: member.order || 0,
      slug: synced.slug === 'user' ? '' : (member.slug || ''),
      bio: synced.bio === 'user' ? '' : (member.bio || ''),
      vision: synced.vision === 'user' ? '' : (member.vision || ''),
      story: synced.story === 'user' ? '' : (member.story || ''),
      expertise: synced.expertise === 'user' ? '' : (member.expertise || ''),
      achievements: synced.achievements === 'user' ? '' : (member.achievements || ''),
      website: synced.website === 'user' ? '' : (member.website || ''),
    });
    
    setEditingId(member.id);
    setShowForm(true);
    setLinkingUserId(member.userId || null);
    // Store user info if linked (will show name/email in the UI)
    if (member.userId && member.user) {
      setLinkedUserInfo(member.user);
    } else if (member.userId) {
      setLinkedUserInfo({ id: member.userId, name: 'Linked User', email: '' });
    } else {
      setLinkedUserInfo(null);
    }
    setUserSearchQuery('');
    setUserSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      toast.error('Authentication required');
      return;
    }
    
    if (!form.name.trim() || !form.role.trim() || !form.team.trim()) {
      toast.error('Name, role, and team are required');
      return;
    }

    // Generate avatar URL if not provided
    const imageUrl = form.imageUrl.trim();

    try {
      setSaving(true);
      setError(null);
      
      const data = {
        name: form.name.trim(),
        role: form.role.trim(),
        team: form.team,
        imageUrl: imageUrl || undefined,
        linkedin: form.linkedin.trim(),
        github: form.github.trim(),
        twitter: form.twitter.trim(),
        instagram: form.instagram.trim(),
        order: form.order,
        slug: form.slug.trim(),
        bio: form.bio.trim(),
        vision: form.vision.trim(),
        story: form.story.trim(),
        expertise: form.expertise.trim(),
        achievements: form.achievements.trim(),
        website: form.website.trim(),
        userId: linkingUserId || undefined,
      };

      if (editingId) {
        await api.updateTeamMember(editingId, data, token);
        toast.success('Team member updated successfully');
      } else {
        await api.createTeamMember(data, token);
        toast.success('Team member added successfully');
      }
      
      resetForm();
      await loadTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save member');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) {
      toast.error('Authentication required');
      return;
    }
    
    try {
      await api.deleteTeamMember(id, token);
      toast.success('Team member removed');
      setMemberToDelete(null);
      await loadTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete member');
    }
  };

  // Search users for linking
  const searchUsers = useCallback(async (query: string) => {
    if (!token || query.length < 2) {
      setUserSearchResults([]);
      return;
    }
    try {
      setSearchingUsers(true);
      const response = await api.searchUsers(query, token);
      setUserSearchResults(response.users || []);
    } catch {
      setUserSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  }, [token]);

  const clearLinkedUserState = () => {
    if (linkedUserInfo) {
      setForm((prev) => ({
        ...prev,
        name: prev.name === linkedUserInfo.name ? '' : prev.name,
        imageUrl: prev.imageUrl === (linkedUserInfo.avatar || '') ? '' : prev.imageUrl,
        linkedin: prev.linkedin === (linkedUserInfo.linkedinUrl || '') ? '' : prev.linkedin,
        github: prev.github === (linkedUserInfo.githubUrl || '') ? '' : prev.github,
        twitter: prev.twitter === (linkedUserInfo.twitterUrl || '') ? '' : prev.twitter,
        bio: prev.bio === (linkedUserInfo.bio || '') ? '' : prev.bio,
        website: prev.website === (linkedUserInfo.websiteUrl || '') ? '' : prev.website,
      }));
    }

    setLinkingUserId(null);
    setLinkedUserInfo(null);
  };

  // Debounced user search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (userSearchQuery.length >= 2) {
        void searchUsers(userSearchQuery);
      } else {
        setUserSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchUsers, userSearchQuery]);

  // Link team member to user
  const handleLinkUser = async (memberId: string, userId: string) => {
    if (!token) return;
    try {
      setSaving(true);
      const linkedMember = await api.linkTeamMemberToUser(memberId, userId, token);
      
      // Fetch full user to populate empty form fields if we're currently editing
      if (editingId === memberId) {
        // Update slug from the API response (backend auto-generates it)
        if (linkedMember?.slug) {
          setForm(prev => ({
            ...prev,
            slug: prev.slug.trim() === '' ? (linkedMember.slug ?? '') : prev.slug,
          }));
        }
        
        try {
          const fullUser = await api.getUser(userId, token);
          setForm(prev => ({
            ...prev,
            name: prev.name.trim() === '' ? fullUser.name : prev.name,
            imageUrl: prev.imageUrl.trim() === '' ? (fullUser.avatar || '') : prev.imageUrl,
            linkedin: prev.linkedin.trim() === '' ? (fullUser.linkedinUrl || '') : prev.linkedin,
            github: prev.github.trim() === '' ? (fullUser.githubUrl || '') : prev.github,
            twitter: prev.twitter.trim() === '' ? (fullUser.twitterUrl || '') : prev.twitter,
            bio: prev.bio.trim() === '' ? (fullUser.bio || '') : prev.bio,
            website: prev.website.trim() === '' ? (fullUser.websiteUrl || '') : prev.website,
          }));
          setLinkedUserInfo(fullUser);
          setLinkingUserId(userId);
        } catch {
          // Linking succeeded; user-prefill data is optional and may fail independently.
        }
      }
      
      toast.success('Team member linked to user account');
      await loadTeam();
      setUserSearchQuery('');
      setUserSearchResults([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link user');
    } finally {
      setSaving(false);
    }
  };

  // Unlink team member from user
  const handleUnlinkUser = async (memberId: string) => {
    if (!token) return;
    try {
      setSaving(true);
      await api.linkTeamMemberToUser(memberId, null as unknown as string, token);
      toast.success('Team member unlinked from user account');
      clearLinkedUserState();
      setUnlinkTarget(null);
      await loadTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink user');
    } finally {
      setSaving(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-amber-900">Team Management</h1>
          <p className="text-gray-600">Manage club team members</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Member
        </Button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Add/Edit Member Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-amber-600" />
              {editingId ? 'Edit Team Member' : 'Add New Team Member'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="admin-team-name" className="text-sm font-medium">Name *</label>
                  <Input
                    id="admin-team-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Member name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-role" className="text-sm font-medium">Role/Position *</label>
                  <Input
                    id="admin-team-role"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="e.g., Technical Lead"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="admin-team-team" className="text-sm font-medium">Team *</label>
                  <select
                    id="admin-team-team"
                    value={form.team}
                    onChange={(e) => setForm({ ...form, team: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    required
                  >
                    <option value="Technical">Technical</option>
                    <option value="Management">Management</option>
                    <option value="Content">Content</option>
                    <option value="Design">Design</option>
                    <option value="Admin">Admin</option>
                    <option value="DSA">DSA</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-order" className="text-sm font-medium">Display Order</label>
                  <Input
                    id="admin-team-order"
                    type="number"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="admin-team-image-url" className="text-sm font-medium">Profile Image URL</label>
                <Input
                  id="admin-team-image-url"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="Leave empty for auto-generated avatar"
                />
                <p className="text-xs text-gray-500">Leave empty to auto-generate an avatar or link user to copy their avatar</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <label htmlFor="admin-team-github" className="text-sm font-medium">GitHub Username</label>
                  <Input
                    id="admin-team-github"
                    value={form.github}
                    onChange={(e) => setForm({ ...form, github: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-linkedin" className="text-sm font-medium">LinkedIn Username</label>
                  <Input
                    id="admin-team-linkedin"
                    value={form.linkedin}
                    onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-twitter" className="text-sm font-medium">Twitter Username</label>
                  <Input
                    id="admin-team-twitter"
                    value={form.twitter}
                    onChange={(e) => setForm({ ...form, twitter: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-instagram" className="text-sm font-medium">Instagram Username</label>
                  <Input
                    id="admin-team-instagram"
                    value={form.instagram}
                    onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                    placeholder="username"
                  />
                </div>
              </div>

              {/* User Linking Section */}
              <div className="space-y-2 p-4 rounded-lg border border-amber-200 bg-amber-50/50">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Link to User Account
                </p>
                {linkingUserId ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white border border-amber-200">
                    <div className="h-8 w-8 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                      <img
                        src={linkedUserInfo?.avatar || '/fallback-avatar.svg'}
                        alt={linkedUserInfo?.name || 'Linked User'}
                        className="w-full h-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = '/fallback-avatar.svg';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{linkedUserInfo?.name || 'Linked User'}</p>
                      {linkedUserInfo?.email && (
                        <p className="text-xs text-gray-500 truncate">{linkedUserInfo.email}</p>
                      )}
                    </div>
                      <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (editingId) {
                          setUnlinkTarget({
                            memberId: editingId,
                            userName: linkedUserInfo?.name || form.name || 'this user',
                          });
                          return;
                        }
                        clearLinkedUserState();
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Unlink className="h-4 w-4 mr-1" />
                      Unlink
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search users by name or email..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {searchingUsers && (
                      <p className="text-xs text-gray-500">Searching...</p>
                    )}
                    {userSearchResults.length > 0 && (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {userSearchResults.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={async () => {
                              if (editingId) {
                                handleLinkUser(editingId, user.id);
                              } else {
                                // For new members, store the selection locally and fill form inputs
                                setLinkingUserId(user.id);
                                setLinkedUserInfo(user);
                                setUserSearchQuery('');
                                setUserSearchResults([]);
                                
                                try {
                                  if (!token) return;
                                  const fullUser = await api.getUser(user.id, token);
                                  setForm(prev => ({
                                    ...prev,
                                    name: prev.name.trim() === '' ? fullUser.name : prev.name,
                                    imageUrl: prev.imageUrl.trim() === '' ? (fullUser.avatar || '') : prev.imageUrl,
                                    linkedin: prev.linkedin.trim() === '' ? (fullUser.linkedinUrl || '') : prev.linkedin,
                                    github: prev.github.trim() === '' ? (fullUser.githubUrl || '') : prev.github,
                                    twitter: prev.twitter.trim() === '' ? (fullUser.twitterUrl || '') : prev.twitter,
                                    bio: prev.bio.trim() === '' ? (fullUser.bio || '') : prev.bio,
                                    website: prev.website.trim() === '' ? (fullUser.websiteUrl || '') : prev.website,
                                  }));
                                } catch {
                                  setError('Failed to fetch linked user details');
                                }
                              }
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-amber-100 transition-colors text-left"
                          >
                            <div className="h-8 w-8 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                              <img
                                src={user.avatar || '/fallback-avatar.svg'}
                                alt={user.name}
                                className="w-full h-full object-cover"
                                onError={(event) => {
                                  event.currentTarget.src = '/fallback-avatar.svg';
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{user.name}</p>
                              <p className="text-xs text-gray-500 truncate">{user.email}</p>
                            </div>
                            <Link2 className="h-4 w-4 text-amber-600" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500">Link this team member to a registered user account for profile sync and edit permissions</p>
              </div>

              {/* Profile Content Section */}
              <div className="space-y-4 p-4 rounded-lg border border-gray-200 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Profile Content (Optional)</p>
                  <Badge variant="secondary">Rich Text/Markdown</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="admin-team-slug" className="text-sm font-medium text-gray-600">URL Slug</label>
                    <Input
                      id="admin-team-slug"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      placeholder="Auto-generated from name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="admin-team-website" className="text-sm font-medium text-gray-600">Website</label>
                    <Input
                      id="admin-team-website"
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-bio" className="text-sm font-medium text-gray-600">Bio</label>
                  <Textarea
                    id="admin-team-bio"
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="A short bio about this team member..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-vision" className="text-sm font-medium text-gray-600">Vision</label>
                  <Textarea
                    id="admin-team-vision"
                    value={form.vision}
                    onChange={(e) => setForm({ ...form, vision: e.target.value })}
                    placeholder="Personal or professional vision statement..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-story" className="text-sm font-medium text-gray-600">Story</label>
                  <Textarea
                    id="admin-team-story"
                    value={form.story}
                    onChange={(e) => setForm({ ...form, story: e.target.value })}
                    placeholder="Background, journey, how they joined..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-expertise" className="text-sm font-medium text-gray-600">Expertise</label>
                  <Textarea
                    id="admin-team-expertise"
                    value={form.expertise}
                    onChange={(e) => setForm({ ...form, expertise: e.target.value })}
                    placeholder="Skills, technologies, areas of focus..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-team-achievements" className="text-sm font-medium text-gray-600">Achievements</label>
                  <Textarea
                    id="admin-team-achievements"
                    value={form.achievements}
                    onChange={(e) => setForm({ ...form, achievements: e.target.value })}
                    placeholder="Notable accomplishments..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? 'Update Member' : 'Add Member'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Team List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600" />
            Team Members
          </CardTitle>
          <CardDescription>{members.length} team members</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No team members yet.</p>
              <p className="text-sm mt-1">Add your first team member above!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {members.map((member, index) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 rounded-lg border border-amber-200 bg-amber-50/50"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-amber-200 flex-shrink-0 relative">
                        <img 
                          src={member.imageUrl || '/fallback-avatar.svg'} 
                          alt={member.name} 
                          className="w-full h-full object-cover" 
                          onError={(event) => {
                            event.currentTarget.src = '/fallback-avatar.svg';
                          }}
                        />
                        {member.userId && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                            <Link2 className="h-2 w-2 text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-amber-900">{member.name}</p>
                        <p className="text-sm text-gray-600">{member.role}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="secondary">{member.team}</Badge>
                          {member.slug && (
                            <a
                              href={`/team/${member.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-amber-600 hover:underline"
                            >
                              View Profile
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(member)}
                        className="text-amber-600 hover:text-amber-800 hover:bg-amber-100"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMemberToDelete(member)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(memberToDelete)} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToDelete
                ? `This will remove ${memberToDelete.name} from the team page and linked profile content.`
                : 'This team member will be removed from the public team listing.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (memberToDelete) {
                  void handleDelete(memberToDelete.id);
                }
              }}
            >
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(unlinkTarget)} onOpenChange={(open) => !open && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink user account?</AlertDialogTitle>
            <AlertDialogDescription>
              {unlinkTarget
                ? `${unlinkTarget.userName} will no longer stay synced with this team profile.`
                : 'This user account will be unlinked from the team profile.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (unlinkTarget) {
                  void handleUnlinkUser(unlinkTarget.memberId);
                }
              }}
            >
              Unlink Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
