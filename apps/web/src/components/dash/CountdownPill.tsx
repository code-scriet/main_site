import { cn } from '@/lib/utils';

interface Props {
  seconds: number;
  tone?: 'accent' | 'warning' | 'danger';
  className?: string;
}

export function CountdownPill({ seconds, tone = 'accent', className }: Props) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const txt = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[24px] px-2 font-mono tabular-nums text-[11.5px] font-medium rounded-[6px]',
        tone === 'accent' && 'bg-[var(--accent-subtle)] text-[var(--accent)]',
        tone === 'warning' && 'bg-[var(--warning-bg)] text-[var(--warning)]',
        tone === 'danger' && 'bg-[var(--danger-bg)] text-[var(--danger)]',
        className,
      )}
    >
      <span className="size-[6px] rounded-full bg-current live-dot" />
      {txt}
    </span>
  );
}
