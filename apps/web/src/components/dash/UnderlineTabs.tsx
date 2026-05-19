import * as React from 'react';
import { cn } from '@/lib/utils';

export interface UnderlineTabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface Props<T extends string = string> {
  items: UnderlineTabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function UnderlineTabs<T extends string = string>({ items, value, onChange, className }: Props<T>) {
  return (
    <div className={cn('flex items-end gap-1 border-b border-[var(--border-subtle)] overflow-x-auto no-scrollbar', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            'relative px-3 h-9 -mb-px text-[13px] font-medium border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-[120ms]',
            value === it.value
              ? 'border-[var(--accent)] text-[var(--ds-text-1)]'
              : 'border-transparent text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
          )}
        >
          {it.icon}
          {it.label}
          {it.count != null && (
            <span
              className={cn(
                'tabular-nums text-[11px] px-1.5 h-[18px] inline-flex items-center rounded-full',
                value === it.value
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'bg-[var(--surface-soft)] text-[var(--ds-text-3)]',
              )}
            >
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
