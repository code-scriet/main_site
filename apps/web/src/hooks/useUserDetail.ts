import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { UserBlockFeature } from '@/lib/api';

const STALE = 1000 * 30;

export function useUserFull(userId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['admin-user-full', userId],
    queryFn: () => api.getUserFull(userId!, token!),
    enabled: !!userId && !!token,
    staleTime: STALE,
  });
}

export function useUserBlocks(userId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['admin-user-blocks', userId],
    queryFn: () => api.listUserBlocks(userId!, token!),
    enabled: !!userId && !!token,
    staleTime: STALE,
  });
}

export function useUserAudit(userId: string | null, as: 'actor' | 'target' = 'target') {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['admin-user-audit', userId, as],
    queryFn: () => api.getUserAudit(userId!, token!, { as }),
    enabled: !!userId && !!token,
    staleTime: STALE,
  });
}

export function useUserAdminActions(userId: string | null) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-user-full', userId] });
    qc.invalidateQueries({ queryKey: ['admin-user-blocks', userId] });
    qc.invalidateQueries({ queryKey: ['admin-users-list'] });
  };

  const resetStreak = useMutation({ mutationFn: () => api.resetCurrentStreak(userId!, token!), onSuccess: invalidate });
  const restoreStreak = useMutation({ mutationFn: () => api.restoreLongestStreak(userId!, token!), onSuccess: invalidate });
  const changeRole = useMutation({ mutationFn: (role: string) => api.updateUserRole(userId!, role, token!), onSuccess: invalidate });

  const block = useMutation({
    mutationFn: (data: { feature: UserBlockFeature; reason?: string | null; expiresAt?: string | null }) =>
      api.addUserBlock(userId!, data, token!),
    onSuccess: invalidate,
  });
  const unblock = useMutation({
    mutationFn: (feature: UserBlockFeature) => api.removeUserBlock(userId!, feature, token!),
    onSuccess: invalidate,
  });

  const forceLogout = useMutation({ mutationFn: () => api.forceLogoutUser(userId!, token!), onSuccess: invalidate });
  const sendReset = useMutation({ mutationFn: () => api.sendPasswordResetEmail(userId!, token!), onSuccess: invalidate });
  const softDelete = useMutation({ mutationFn: () => api.softDeleteUser(userId!, token!), onSuccess: invalidate });
  const hardDelete = useMutation({ mutationFn: () => api.hardDeleteUser(userId!, token!), onSuccess: invalidate });
  const restore = useMutation({ mutationFn: () => api.restoreUser(userId!, token!), onSuccess: invalidate });

  return { resetStreak, restoreStreak, changeRole, block, unblock, forceLogout, sendReset, softDelete, hardDelete, restore };
}
