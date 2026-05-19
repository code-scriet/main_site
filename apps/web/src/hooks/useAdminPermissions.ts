// Mirror of the server-side permission matrix from apps/api/src/routes/users.ts.
// The server is the source of truth; this hook only hides buttons that would 401
// or 403 if the user clicked them.
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';

export interface AdminTargetUser {
  id: string;
  email: string;
  role: string;
}

export interface AdminPermissions {
  isActor: boolean;
  isPresidentOrSuperAdmin: boolean;
  isSuperAdmin: boolean;
  /** Can read deep detail and basic profile. */
  canView: boolean;
  /** Can perform read-only operations against this target. */
  canActOnTarget: boolean;
  /** Can change role on this target. */
  canChangeRole: boolean;
  /** Can block, force-logout, password-reset, or soft-delete. */
  canMutate: boolean;
  /** Can change role on ADMIN/PRESIDENT accounts. */
  canChangePrivilegedRole: boolean;
  /** Can hard delete. */
  canHardDelete: boolean;
  /** Can soft-delete this specific target (respects ADMIN/PRESIDENT shield). */
  canSoftDelete: boolean;
  /** Can restore this user. */
  canRestore: boolean;
}

export function useAdminPermissions(target?: AdminTargetUser | null): AdminPermissions {
  const { user: actor } = useAuth();
  return useMemo(() => {
    const a = actor;
    const isActor = !!(a && target && a.id === target.id);
    const isSuperAdmin = !!a?.isSuperAdmin;
    const isPresident = a?.role === 'PRESIDENT';
    const isAdmin = a?.role === 'ADMIN' || isPresident;
    const isPresidentOrSuperAdmin = isPresident || isSuperAdmin;
    const targetIsPrivileged = target?.role === 'ADMIN' || target?.role === 'PRESIDENT';

    const canView = !!a && (isAdmin || isSuperAdmin) && !isActor;
    const canActOnTarget = canView;
    const canChangeRole = canView && (!targetIsPrivileged || isSuperAdmin);
    const canMutateBase = canView && isPresidentOrSuperAdmin;
    const canMutate = canMutateBase && (!targetIsPrivileged || isSuperAdmin);
    const canChangePrivilegedRole = canChangeRole && isSuperAdmin && targetIsPrivileged;
    const canHardDelete = canMutate && isSuperAdmin;
    const canSoftDelete = canMutate;
    const canRestore = canView && isSuperAdmin;

    return {
      isActor,
      isPresidentOrSuperAdmin,
      isSuperAdmin,
      canView,
      canActOnTarget,
      canChangeRole,
      canMutate,
      canChangePrivilegedRole,
      canHardDelete,
      canSoftDelete,
      canRestore,
    };
  }, [actor, target]);
}
