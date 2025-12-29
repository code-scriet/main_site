import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { User } from '@/lib/api';
import { Users, Loader2, AlertCircle, Shield, UserCheck, Crown } from 'lucide-react';
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
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-amber-200 bg-amber-50/50 gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-amber-700 font-bold">
                            {user.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-amber-900">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={roleColors[user.role as keyof typeof roleColors] || 'secondary'}>
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
