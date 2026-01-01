import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { User } from '@/lib/api';
import { Users, Loader2, AlertCircle, Shield, UserCheck, Crown, Trash2, Phone, GraduationCap, CheckCircle, XCircle, Edit, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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
  CORE_MEMBER: 'warning',
  ADMIN: 'destructive',
} as const;

const roleIcons = {
  USER: UserCheck,
  CORE_MEMBER: Shield,
  ADMIN: Crown,
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
  });
  const [saving, setSaving] = useState(false);
  
  const isSuperAdmin = currentUser?.email === import.meta.env.VITE_SUPER_ADMIN_EMAIL;

  useEffect(() => {
    loadUsers();
  }, []);

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
    });
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
      <div>
        <h1 className="text-2xl font-bold text-amber-900">User Management</h1>
        <p className="text-gray-600">Manage user roles and permissions</p>
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

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-600" />
            All Users
          </CardTitle>
          <CardDescription>{users.length} total users</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No users found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user, index) => {
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
                          <option value="CORE_MEMBER">Core Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        {updatingId === user.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                        )}
                        {/* Edit button - visible based on permissions */}
                        {(user.role !== 'ADMIN' || isSuperAdmin) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                            className="h-9"
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
      </AnimatePresence>
    </div>
  );
}
