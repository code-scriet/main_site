import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { User } from '@/lib/api';
import { Users, Loader2, AlertCircle, Shield, UserCheck, Crown, Trash2, Phone, GraduationCap, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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
    </div>
  );
}
