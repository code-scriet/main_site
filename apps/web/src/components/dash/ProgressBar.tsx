import { cn } from '@/lib/utils';

interface Props {
  value: number;
  max?: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  label?: string;
  showLabel?: boolean;
  className?: string;
}

const colors = {
  accent: 'bg-[var(--accent)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger: 'bg-[var(--danger)]',
};

export function ProgressBar({ value, max = 100, tone = 'accent', label, showLabel, className }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={className}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5 text-[11.5px] tabular-nums text-[var(--ds-text-3)]">
          <span>{label}</span>
          <span>
            <span className="text-[var(--ds-text-1)] font-medium">{value}</span>/{max}
          </span>
        </div>
      )}
      <div className="h-[6px] w-full rounded-full bg-[var(--surface-soft)] overflow-hidden">
        <div className={cn('h-full rounded-full transition-[width] duration-300', colors[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
