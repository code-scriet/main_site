import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Loader2, AlertCircle, Plus, Trash2, UserPlus, Edit2, X, Check, Link2, Unlink, Search } from 'lucide-react';
import { api, type TeamMember } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export default function AdminTeam() {
  const { token } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null);
  const [linkedUserInfo, setLinkedUserInfo] = useState<UserSearchResult | null>(null);
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
  useEffect(() => {
    loadTeam();
  }, []);

  const loadTeam = async () => {
    try {
      setLoading(true);
      const data = await api.getTeam();
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };

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
    if (member.userId && (member as any).user) {
      setLinkedUserInfo((member as any).user);
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
      setError('Authentication required');
      return;
    }
    
    if (!form.name.trim() || !form.role.trim() || !form.team.trim()) {
      setError('Name, role, and team are required');
      return;
    }

    // Generate avatar URL if not provided
    const imageUrl = form.imageUrl.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(form.name)}`;

    try {
      setSaving(true);
      setError(null);
      
      const data = {
        name: form.name.trim(),
        role: form.role.trim(),
        team: form.team,
        imageUrl,
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
        setSuccess('Team member updated successfully');
      } else {
        await api.createTeamMember(data, token);
        setSuccess('Team member added successfully');
      }
      
      resetForm();
      await loadTeam();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save member');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) {
      setError('Authentication required');
      return;
    }
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    
    try {
      await api.deleteTeamMember(id, token);
      setSuccess('Team member removed');
      await loadTeam();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete member');
    }
  };

  // Search users for linking
  const searchUsers = async (query: string) => {
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
  };

  // Debounced user search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (userSearchQuery.length >= 2) {
        searchUsers(userSearchQuery);
      } else {
        setUserSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearchQuery, token]);

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
          const fullUser = await api.getUser(userId, token) as any;
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
        } catch (e) {}
      }
      
      setSuccess('Team member linked to user account');
      await loadTeam();
      setUserSearchQuery('');
      setUserSearchResults([]);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link user');
    } finally {
      setSaving(false);
    }
  };

  // Unlink team member from user
  const handleUnlinkUser = async (memberId: string) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to unlink this user?')) return;
    try {
      setSaving(true);
      await api.linkTeamMemberToUser(memberId, null as unknown as string, token);
      setSuccess('Team member unlinked from user account');
      await loadTeam();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink user');
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

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700"
        >
          <Check className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{success}</p>
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
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Member name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role/Position *</label>
                  <Input
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="e.g., Technical Lead"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Team *</label>
                  <select
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
                  <label className="text-sm font-medium">Display Order</label>
                  <Input
                    type="number"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Profile Image URL</label>
                <Input
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="Leave empty for auto-generated avatar"
                />
                <p className="text-xs text-gray-500">Leave empty to auto-generate an avatar or link user to copy their avatar</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">GitHub Username</label>
                  <Input
                    value={form.github}
                    onChange={(e) => setForm({ ...form, github: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">LinkedIn Username</label>
                  <Input
                    value={form.linkedin}
                    onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Twitter Username</label>
                  <Input
                    value={form.twitter}
                    onChange={(e) => setForm({ ...form, twitter: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Instagram Username</label>
                  <Input
                    value={form.instagram}
                    onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                    placeholder="username"
                  />
                </div>
              </div>

              {/* User Linking Section */}
              <div className="space-y-2 p-4 rounded-lg border border-amber-200 bg-amber-50/50">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Link to User Account
                </label>
                {linkingUserId ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white border border-amber-200">
                    <div className="h-8 w-8 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                      <img
                        src={linkedUserInfo?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${linkedUserInfo?.name || 'U'}`}
                        alt={linkedUserInfo?.name || 'Linked User'}
                        className="w-full h-full object-cover"
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
                          handleUnlinkUser(editingId);
                        }
                        
                        // Clear form fields that match the linked user exactly
                        if (linkedUserInfo) {
                          const u = linkedUserInfo as any;
                          setForm(prev => ({
                            ...prev,
                            name: prev.name === u.name ? '' : prev.name,
                            imageUrl: prev.imageUrl === (u.avatar || '') ? '' : prev.imageUrl,
                            linkedin: prev.linkedin === (u.linkedinUrl || '') ? '' : prev.linkedin,
                            github: prev.github === (u.githubUrl || '') ? '' : prev.github,
                            twitter: prev.twitter === (u.twitterUrl || '') ? '' : prev.twitter,
                            bio: prev.bio === (u.bio || '') ? '' : prev.bio,
                            website: prev.website === (u.websiteUrl || '') ? '' : prev.website,
                          }));
                        }

                        setLinkingUserId(null);
                        setLinkedUserInfo(null);
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
                                  const fullUser = await api.getUser(user.id, token) as any;
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
                                } catch (err) {
                                  console.error("Failed to fetch full user info", err);
                                }
                              }
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-amber-100 transition-colors text-left"
                          >
                            <div className="h-8 w-8 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                              <img
                                src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`}
                                alt={user.name}
                                className="w-full h-full object-cover"
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
                  <label className="text-sm font-medium">Profile Content (Optional)</label>
                  <Badge variant="secondary">Rich Text/Markdown</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-600">URL Slug</label>
                    <Input
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      placeholder="Auto-generated from name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-600">Website</label>
                    <Input
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Bio</label>
                  <Textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="A short bio about this team member..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Vision</label>
                  <Textarea
                    value={form.vision}
                    onChange={(e) => setForm({ ...form, vision: e.target.value })}
                    placeholder="Personal or professional vision statement..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Story</label>
                  <Textarea
                    value={form.story}
                    onChange={(e) => setForm({ ...form, story: e.target.value })}
                    placeholder="Background, journey, how they joined..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Expertise</label>
                  <Textarea
                    value={form.expertise}
                    onChange={(e) => setForm({ ...form, expertise: e.target.value })}
                    placeholder="Skills, technologies, areas of focus..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Achievements</label>
                  <Textarea
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
                          src={member.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`} 
                          alt={member.name} 
                          className="w-full h-full object-cover" 
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
                        onClick={() => handleDelete(member.id)}
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
    </div>
  );
}
