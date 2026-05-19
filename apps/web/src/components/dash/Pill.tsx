import * as React from 'react';
import { cn } from '@/lib/utils';

export type PillTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'user'
  | 'network'
  | 'member'
  | 'core'
  | 'admin'
  | 'president';

export type PillSize = 'xs' | 'sm' | 'md';

const toneClass: Record<PillTone, string> = {
  neutral:   'bg-[var(--surface-soft)] text-[var(--ds-text-2)] border-[var(--border-default)]',
  accent:    'bg-[var(--accent-subtle)] text-[var(--accent)] border-transparent',
  success:   'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
  warning:   'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
  danger:    'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]',
  info:      'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
  user:      'bg-[var(--role-user-bg)] text-[var(--role-user-fg)] border-transparent',
  network:   'bg-[var(--role-network-bg)] text-[var(--role-network-fg)] border-transparent',
  member:    'bg-[var(--role-member-bg)] text-[var(--role-member-fg)] border-transparent',
  core:      'bg-[var(--role-core-bg)] text-[var(--role-core-fg)] border-transparent',
  admin:     'bg-[var(--role-admin-bg)] text-[var(--role-admin-fg)] border-transparent',
  president: 'bg-[var(--role-prez-bg)] text-[var(--role-prez-fg)] border-transparent',
};

const sizeClass: Record<PillSize, string> = {
  xs: 'h-[18px] px-1.5 text-[10.5px] gap-1 rounded-[5px]',
  sm: 'h-[22px] px-2 text-[11.5px] gap-1.5 rounded-[6px]',
  md: 'h-[26px] px-2.5 text-[12.5px] gap-1.5 rounded-[7px]',
};

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  size?: PillSize;
  dot?: boolean;
  icon?: React.ReactNode;
}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { tone = 'neutral', size = 'sm', dot, icon, children, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center font-medium border whitespace-nowrap',
        sizeClass[size],
        toneClass[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className="size-[6px] rounded-full bg-current opacity-90" />}
      {icon}
      {children}
    </span>
  );
});

export function roleTone(role: string): PillTone {
  switch (role) {
    case 'USER': return 'user';
    case 'NETWORK': return 'network';
    case 'MEMBER': return 'member';
    case 'CORE_MEMBER': return 'core';
    case 'ADMIN': return 'admin';
    case 'PRESIDENT': return 'president';
    default: return 'neutral';
  }
}
