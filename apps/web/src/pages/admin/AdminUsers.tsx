import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { User } from '@/lib/api';
import { Users, Loader2, AlertCircle, Shield, UserCheck, Crown, Trash2, Phone, GraduationCap, CheckCircle, XCircle, Edit, X, Eye, Calendar, Github, Linkedin, Twitter, Globe, Mail, Download, Search } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useSocketEvent } from '@/context/SocketContext';
import { toast } from 'sonner';

// Course and branch options
const COURSES = ['BTech', 'BSC', 'BCA', 'MCA', 'MTech', 'MSC'] as const;
const BRANCH_OPTIONS: Record<string, string[]> = {
  'BTech': ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'CSE-AI', 'CSE-DS', 'AG'],
  'MTech': ['CSE', 'IT', 'ECE', 'EE', 'AG'],
  'BSC': ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Statistics'],
  'MSC': ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Statistics'],
  'BCA': ['General'],
  'MCA': ['General'],
};
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const;

const roleColors = {
  USER: 'secondary',
  MEMBER: 'success',
  CORE_MEMBER: 'warning',
  ADMIN: 'destructive',
  PRESIDENT: 'destructive',
} as const;

const roleIcons = {
  USER: UserCheck,
  MEMBER: UserCheck,
  CORE_MEMBER: Shield,
  ADMIN: Crown,
  PRESIDENT: Crown,
};

export default function AdminUsers() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    course: '',
    branch: '',
    year: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  // View profile modal state
  interface UserProfile {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
    bio?: string;
    phone?: string;
    course?: string;
    branch?: string;
    year?: string;
    profileCompleted?: boolean;
    oauthProvider?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
    createdAt?: string;
    _count?: { registrations: number; qotdSubmissions: number };
    registrations?: Array<{
      id: string;
      timestamp: string;
      event: {
        id: string;
        title: string;
        startDate: string;
        status: string;
        imageUrl?: string;
      };
    }>;
  }
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'USER' | 'MEMBER' | 'CORE_MEMBER' | 'ADMIN' | 'PRESIDENT'>('ALL');
  
  const isSuperAdmin = currentUser?.email === import.meta.env.VITE_SUPER_ADMIN_EMAIL;

  useEffect(() => {
    loadUsers();
  }, []);

  // Real-time updates via WebSocket
  useSocketEvent('user:created', () => {
    console.log('User created event received, refreshing...');
    toast.info('New user registered - refreshing list');
    loadUsers();
  });
  useSocketEvent('user:updated', () => {
    console.log('User updated event received, refreshing...');
    toast.info('User updated - refreshing list');
    loadUsers();
  });
  useSocketEvent('user:deleted', () => {
    console.log('User deleted event received, refreshing...');
    toast.info('User deleted - refreshing list');
    loadUsers();
  });

  const loadUsers = async () => {
    if (!token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await api.getUsers(token) as User[];
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!token) {
      setError('Authentication required');
      return;
    }
    try {
      setUpdatingId(userId);
      setError(null);
      await api.updateUserRole(userId, newRole, token);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string, userRole: string) => {
    // Prevent deleting admins
    if (userRole === 'ADMIN') {
      setError('Cannot delete admin accounts');
      return;
    }

    // Prevent self-deletion
    if (userId === currentUser?.id) {
      setError('Cannot delete your own account');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      return;
    }

    if (!token) {
      setError('Authentication required');
      return;
    }

    try {
      setDeletingId(userId);
      setError(null);
      await api.deleteUser(userId, token);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditUser = (user: User) => {
    // Check permissions
    if (user.role === 'ADMIN' && !isSuperAdmin) {
      setError('You cannot edit other admin profiles');
      return;
    }
    
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      phone: user.phone || '',
      course: user.course || '',
      branch: user.branch || '',
      year: user.year || '',
      password: '',
    });
  };

  const handleViewProfile = async (userId: string) => {
    if (!token) return;
    try {
      setLoadingProfile(true);
      const data = await api.getUser(userId, token) as UserProfile;
      setViewingUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!token || !editingUser) return;
    
    try {
      setSaving(true);
      setError(null);
      await api.updateUser(editingUser.id, editForm, token);
      await loadUsers();
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleExportUsers = async () => {
    if (!token) return;
    try {
      setExporting(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001/api'}/users/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code_scriet_users_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export users');
    } finally {
      setExporting(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        (user.phone || '').toLowerCase().includes(q) ||
        (user.course || '').toLowerCase().includes(q) ||
        (user.branch || '').toLowerCase().includes(q) ||
        (user.year || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const availableBranches = editForm.course ? (BRANCH_OPTIONS[editForm.course] || []) : [];

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">User Management</h1>
          <p className="text-gray-600">Manage user roles and permissions</p>
        </div>
        <Button onClick={handleExportUsers} disabled={exporting} className="bg-green-600 hover:bg-green-700">
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Export to Excel
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
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-500 p-3 rounded-lg">
              <UserCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">
                {users.filter(u => u.role === 'USER').length}
              </p>
              <p className="text-xs text-gray-500">Members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-orange-500 p-3 rounded-lg">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">
                {users.filter(u => u.role === 'CORE_MEMBER').length}
              </p>
              <p className="text-xs text-gray-500">Core Members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-red-500 p-3 rounded-lg">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">
                {users.filter(u => u.role === 'ADMIN').length}
              </p>
              <p className="text-xs text-gray-500">Admins</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'USER', 'MEMBER', 'CORE_MEMBER', 'ADMIN', 'PRESIDENT'] as const).map((role) => (
            <Button
              key={role}
              variant={roleFilter === role ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter(role)}
            >
              {role === 'ALL'
                ? 'All'
                : role === 'CORE_MEMBER'
                  ? 'Core Member'
                  : role.charAt(0) + role.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-600" />
            All Users
          </CardTitle>
          <CardDescription>
            Showing {filteredUsers.length} of {users.length} users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No users found {search && 'matching your search'}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user, index) => {
                const RoleIcon = roleIcons[user.role as keyof typeof roleIcons] || UserCheck;
                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 rounded-lg border border-amber-200 bg-amber-50/50"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="h-12 w-12 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-amber-700 font-bold text-lg">
                              {user.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-amber-900">{user.name}</p>
                            {user.profileCompleted ? (
                              <span title="Profile Completed">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </span>
                            ) : (
                              <span title="Profile Incomplete">
                                <XCircle className="h-4 w-4 text-red-500" />
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{user.email}</p>
                          
                          {/* Academic Details */}
                          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                            {user.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                <span>{user.phone}</span>
                              </div>
                            )}
                            {user.course && user.branch && user.year && (
                              <div className="flex items-center gap-1">
                                <GraduationCap className="h-3 w-3" />
                                <span>{user.course} - {user.branch} - {user.year}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <Badge variant={roleColors[user.role as keyof typeof roleColors] || 'secondary'} className="whitespace-nowrap">
                          <RoleIcon className="h-3 w-3 mr-1" />
                          {user.role}
                        </Badge>
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          disabled={updatingId === user.id}
                          className="h-9 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-50"
                        >
                          <option value="USER">User</option>
                          <option value="MEMBER">Member</option>
                          <option value="CORE_MEMBER">Core Member</option>
                          {isSuperAdmin && <option value="PRESIDENT">President</option>}
                          {isSuperAdmin && <option value="ADMIN">Admin</option>}
                        </select>
                        {updatingId === user.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                        )}
                        {/* View Profile button */}
                        {(user.role !== 'ADMIN' || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewProfile(user.id)}
                            className="h-9"
                            title="View Full Profile"
                          >
                            {loadingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                        {/* Edit button - visible based on permissions */}
                        {(user.role !== 'ADMIN' || isSuperAdmin) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                            className="h-9"
                            title="Edit User"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {user.role !== 'ADMIN' && user.id !== currentUser?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id, user.name, user.role)}
                            disabled={deletingId === user.id}
                            className="h-9"
                          >
                            {deletingId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setEditingUser(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Edit User Profile</h2>
                <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-phone">Phone Number</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-course">Course</Label>
                  <select
                    id="edit-course"
                    value={editForm.course}
                    onChange={(e) => setEditForm({ ...editForm, course: e.target.value, branch: '' })}
                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm"
                  >
                    <option value="">Select Course</option>
                    {COURSES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="edit-branch">Branch</Label>
                  <select
                    id="edit-branch"
                    value={editForm.branch}
                    onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                    disabled={!editForm.course}
                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm disabled:bg-gray-100"
                  >
                    <option value="">Select Branch</option>
                    {availableBranches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="edit-year">Year</Label>
                  <select
                    id="edit-year"
                    value={editForm.year}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm"
                  >
                    <option value="">Select Year</option>
                    {YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <Label htmlFor="edit-password">New Password (Optional)</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    value={editForm.password || ''}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Leave empty to keep current password"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Entering a value here will override the user's current password.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setEditingUser(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* View Profile Modal */}
        {viewingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setViewingUser(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Avatar */}
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 rounded-t-xl">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-full overflow-hidden bg-white/20 border-4 border-white/50 flex-shrink-0">
                    {viewingUser.avatar ? (
                      <img src={viewingUser.avatar} alt={viewingUser.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-bold text-3xl">
                        {viewingUser.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="text-white">
                    <h2 className="text-2xl font-bold">{viewingUser.name}</h2>
                    <p className="opacity-90 flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {viewingUser.email}
                    </p>
                    <Badge className="mt-2 bg-white/20 text-white border-white/30">
                      {viewingUser.role}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingUser(null)}
                    className="absolute top-4 right-4 text-white hover:bg-white/20"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                {/* Bio */}
                {viewingUser.bio && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bio</h3>
                    <p className="text-gray-700">{viewingUser.bio}</p>
                  </div>
                )}

                {/* Academic & Contact Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Academic Info</h3>
                    <div className="space-y-1 text-sm text-gray-700">
                      <p><span className="font-medium">Course:</span> {viewingUser.course || 'N/A'}</p>
                      <p><span className="font-medium">Branch:</span> {viewingUser.branch || 'N/A'}</p>
                      <p><span className="font-medium">Year:</span> {viewingUser.year || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Contact</h3>
                    <div className="space-y-1 text-sm text-gray-700">
                      <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> {viewingUser.phone || 'N/A'}</p>
                      <p><span className="font-medium">Joined:</span> {viewingUser.createdAt ? new Date(viewingUser.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}</p>
                      <p><span className="font-medium">Auth:</span> {viewingUser.oauthProvider || 'Email/Password'}</p>
                    </div>
                  </div>
                </div>

                {/* Social Links */}
                {(viewingUser.githubUrl || viewingUser.linkedinUrl || viewingUser.twitterUrl || viewingUser.websiteUrl) && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Social Links</h3>
                    <div className="flex flex-wrap gap-2">
                      {viewingUser.githubUrl && (
                        <a href={viewingUser.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full text-sm hover:bg-gray-200 transition">
                          <Github className="h-4 w-4" /> GitHub
                        </a>
                      )}
                      {viewingUser.linkedinUrl && (
                        <a href={viewingUser.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 rounded-full text-sm text-blue-700 hover:bg-blue-200 transition">
                          <Linkedin className="h-4 w-4" /> LinkedIn
                        </a>
                      )}
                      {viewingUser.twitterUrl && (
                        <a href={viewingUser.twitterUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-sky-100 rounded-full text-sm text-sky-700 hover:bg-sky-200 transition">
                          <Twitter className="h-4 w-4" /> Twitter
                        </a>
                      )}
                      {viewingUser.websiteUrl && (
                        <a href={viewingUser.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-green-100 rounded-full text-sm text-green-700 hover:bg-green-200 transition">
                          <Globe className="h-4 w-4" /> Website
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-amber-50 p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-amber-600">{viewingUser._count?.registrations || 0}</p>
                    <p className="text-sm text-gray-600">Events Registered</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-blue-600">{viewingUser._count?.qotdSubmissions || 0}</p>
                    <p className="text-sm text-gray-600">QOTD Submissions</p>
                  </div>
                </div>

                {/* Event Registrations */}
                {viewingUser.registrations && viewingUser.registrations.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Event Registrations</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {viewingUser.registrations.map(reg => (
                        <div key={reg.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className="h-10 w-10 rounded bg-amber-200 flex-shrink-0 overflow-hidden">
                            {reg.event.imageUrl ? (
                              <img src={reg.event.imageUrl} alt={reg.event.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Calendar className="h-5 w-5 text-amber-600" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{reg.event.title}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(reg.event.startDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} • 
                              <Badge variant={reg.event.status === 'PAST' ? 'secondary' : reg.event.status === 'ONGOING' ? 'warning' : 'default'} className="ml-1 text-xs">
                                {reg.event.status}
                              </Badge>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
