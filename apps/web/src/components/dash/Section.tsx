import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function Section({ eyebrow, title, description, action, className, children }: Props) {
  return (
    <section className={className}>
      <header className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">
              {eyebrow}
            </div>
          )}
          <h2 className="text-[19px] font-semibold tracking-tight mt-1 leading-none">{title}</h2>
          {description && <p className="text-[13px] text-[var(--ds-text-3)] mt-1.5 max-w-prose">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function SectionHead({ eyebrow, title, description, action, className }: Omit<Props, 'children'>) {
  return (
    <div className={cn('flex items-end justify-between gap-4 mb-4', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-medium mb-1">{eyebrow}</div>
        )}
        <h2 className="text-[18px] font-semibold tracking-tight text-[var(--ds-text-1)] leading-tight">{title}</h2>
        {description && <p className="text-[13px] text-[var(--ds-text-3)] mt-1 max-w-[60ch]">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Divider({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  return vertical ? (
    <span className={cn('inline-block w-px h-4 bg-[var(--border-default)]', className)} />
  ) : (
    <hr className={cn('border-0 h-px bg-[var(--border-subtle)]', className)} />
  );
}
