import * as React from 'react';
import { cn } from '@/lib/utils';

export const MonoChip = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  function MonoChip({ className, children, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center h-[20px] px-1.5 text-[11px] tabular-nums',
          'bg-[var(--surface-soft)] text-[var(--ds-text-2)] border border-[var(--border-subtle)] rounded-[5px]',
          'font-mono',
          className,
        )}
        {...rest}
      >
        {children}
      </span>
    );
  },
);
