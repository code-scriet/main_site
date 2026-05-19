import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string = string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function SegmentedTabs<T extends string = string>({ items, value, onChange, className }: Props<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center p-[3px] gap-[2px] bg-[var(--surface-soft)] rounded-[8px] border border-[var(--border-subtle)]',
        className,
      )}
    >
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            'px-3 h-7 text-[12.5px] font-medium rounded-[6px] transition-all whitespace-nowrap',
            value === it.value
              ? 'bg-[var(--bg-raised)] text-[var(--ds-text-1)] shadow-[var(--shadow-xs)]'
              : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
          )}
        >
          {it.label}
          {it.count != null && <span className="ml-1.5 text-[11px] tabular-nums opacity-60">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
