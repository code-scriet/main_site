import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'ghost' | 'soft' | 'border';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  size?: number;
  variant?: Variant;
  active?: boolean;
}

const variants: Record<Variant, string> = {
  ghost: 'hover:bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:text-[var(--ds-text-1)]',
  soft: 'bg-[var(--surface-soft)] text-[var(--ds-text-1)] hover:bg-[var(--bg-sunken)]',
  border:
    'border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--ds-text-2)] hover:text-[var(--ds-text-1)] hover:border-[var(--border-strong)]',
};

export const IconButton = React.forwardRef<HTMLButtonElement, Props>(function IconButton(
  { icon, label, size = 32, variant = 'ghost', active, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-[8px] transition-colors duration-[120ms]',
        variants[variant],
        active && 'bg-[var(--surface-soft)] text-[var(--ds-text-1)]',
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      {icon}
    </button>
  );
});
