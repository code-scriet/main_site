import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * CSS-only tooltip. No @radix-ui/react-tooltip dep — uses controlled hover/focus
 * state and absolute positioning. Sufficient for the admin surface; not a full
 * accessibility-grade replacement (no portal, no collision detection).
 */
interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const sideClass = {
    top: 'bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 translate-y-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 -translate-x-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 translate-x-1.5',
  }[side];

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-zinc-800/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 shadow-lg dark:border-zinc-700 dark:bg-zinc-800',
            sideClass,
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
