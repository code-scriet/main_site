// Centralized role badge styling so the list and detail surfaces stay coherent.
import type { LucideIcon } from 'lucide-react';
import { Crown, Shield, UserCheck, User as UserIcon, Sparkles } from 'lucide-react';

export interface RoleBadgeStyle {
  label: string;
  icon: LucideIcon;
  className: string;
}

export const roleBadge: Record<string, RoleBadgeStyle> = {
  USER: {
    label: 'User',
    icon: UserIcon,
    className: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-800',
  },
  MEMBER: {
    label: 'Member',
    icon: UserCheck,
    className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:ring-blue-900',
  },
  CORE_MEMBER: {
    label: 'Core Member',
    icon: Shield,
    className: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-900',
  },
  ADMIN: {
    label: 'Admin',
    icon: Sparkles,
    className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-200 dark:ring-violet-900',
  },
  PRESIDENT: {
    label: 'President',
    icon: Crown,
    className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-900',
  },
  NETWORK: {
    label: 'Network',
    icon: UserIcon,
    className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:ring-sky-900',
  },
};

export const getRoleBadge = (role: string): RoleBadgeStyle =>
  roleBadge[role] ?? roleBadge.USER;

export function relativeTime(iso?: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (Number.isNaN(d)) return 'never';
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
