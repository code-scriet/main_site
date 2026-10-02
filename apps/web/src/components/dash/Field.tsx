import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  label: React.ReactNode;
  hint?: React.ReactNode;
  badge?: React.ReactNode;
  required?: boolean;
  /** Inline validation error rendered below the input (red). */
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, badge, required, error, className, children }: Props) {
  return (
    <label className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--ds-text-2)] inline-flex items-center gap-1.5">
          {label}
          {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
          {badge}
        </span>
        {hint && <span className="text-[11px] text-[var(--ds-text-3)]">{hint}</span>}
      </div>
      {children}
      {error && <span className="text-[11px] text-[var(--danger)]">{error}</span>}
    </label>
  );
}
