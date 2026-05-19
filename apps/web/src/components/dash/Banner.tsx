import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'accent';
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
}

const tones = {
  info:    'bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info)]',
  success: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]',
  warning: 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning)]',
  danger:  'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]',
  accent:  'bg-[var(--accent-subtle)] border-transparent text-[var(--accent)]',
};

export function Banner({ tone = 'info', icon, title, action, onDismiss, children, className, ...rest }: Props) {
  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-[10px] border', tones[tone], className)} {...rest}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div className="flex-1 min-w-0">
        {title && <div className="font-medium text-[13.5px] text-[var(--ds-text-1)] leading-tight">{title}</div>}
        {children && <div className="text-[12.5px] text-[var(--ds-text-2)] mt-1 leading-snug">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
