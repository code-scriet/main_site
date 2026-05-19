import * as React from 'react';
import { cn } from '@/lib/utils';

export const KBD = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(function KBD(
  { className, children, ...rest },
  ref,
) {
  return (
    <kbd
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5',
        'text-[11px] font-medium font-mono tabular-nums',
        'border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--ds-text-2)]',
        'rounded-[5px] shadow-[0_1px_0_var(--border-default)]',
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
});
