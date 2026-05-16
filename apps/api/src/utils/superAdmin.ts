import type { AuthUser } from '../middleware/auth.js';

export function isSuperAdmin(user: AuthUser | { email?: string | null } | undefined | null): boolean {
  const target = user?.email;
  const env = process.env.SUPER_ADMIN_EMAIL;
  if (!target || !env) return false;
  return target === env;
}

export function isPresident(user: AuthUser | { role?: string | null } | undefined | null): boolean {
  return user?.role === 'PRESIDENT';
}

export function isPresidentOrSuperAdmin(user: AuthUser | undefined | null): boolean {
  return isPresident(user) || isSuperAdmin(user);
}
