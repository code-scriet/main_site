// Accepts any user-ish object that carries email/role (full AuthUser, or the
// trimmed selects we use in admin handlers). Keeps callers terse and avoids
// forcing a widened SELECT in every endpoint.
type UserLike = { email?: string | null; role?: string | null };

export function isSuperAdmin(user: UserLike | undefined | null): boolean {
  const target = user?.email;
  const env = process.env.SUPER_ADMIN_EMAIL;
  if (!target || !env) return false;
  return target === env;
}

export function isPresident(user: UserLike | undefined | null): boolean {
  return user?.role === 'PRESIDENT';
}

export function isPresidentOrSuperAdmin(user: UserLike | undefined | null): boolean {
  return isPresident(user) || isSuperAdmin(user);
}
