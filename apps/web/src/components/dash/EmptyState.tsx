import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, body, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && (
        <div className="size-10 rounded-full bg-[var(--surface-soft)] text-[var(--ds-text-3)] flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <div className="text-[15px] font-medium text-[var(--ds-text-1)]">{title}</div>
      {body && <div className="text-[13px] text-[var(--ds-text-3)] mt-1.5 max-w-[320px]">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
