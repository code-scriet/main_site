import * as React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  delta?: string | null;
  deltaTone?: 'success' | 'danger' | 'neutral';
  icon?: React.ReactNode;
  sparkline?: React.ReactNode;
  className?: string;
}

export function StatTile({
  label,
  value,
  suffix,
  delta,
  deltaTone = 'success',
  icon,
  sparkline,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] bg-[var(--bg-raised)] border border-[var(--border-subtle)] shadow-[var(--shadow-sm)] p-4 group',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--ds-text-3)]">{label}</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-[26px] font-semibold tabular-nums text-[var(--ds-text-1)] leading-none">{value}</span>
            {suffix && <span className="text-[12px] text-[var(--ds-text-3)]">{suffix}</span>}
          </div>
          {delta && (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium tabular-nums',
                deltaTone === 'success' && 'text-[var(--success)]',
                deltaTone === 'danger' && 'text-[var(--danger)]',
                deltaTone === 'neutral' && 'text-[var(--ds-text-3)]',
              )}
            >
              {deltaTone === 'danger' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
              {delta}
            </div>
          )}
        </div>
        {icon && (
          <div className="size-8 rounded-[8px] bg-[var(--surface-soft)] text-[var(--ds-text-3)] flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      {sparkline}
    </div>
  );
}
