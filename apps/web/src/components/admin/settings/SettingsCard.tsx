// SettingsCard — v2 wrapper used by every block on /admin/settings.
// Header: icon + title (left), "✓ Saved {relative}" indicator (right).
// Design source: screen-admin.jsx:639 SettingsCard.

import { type ReactNode, useEffect, useState } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DSCard } from '@/components/dash';

interface SettingsCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** When non-null, shows "✓ Saved {relative}" in the header. Bump on every successful save. */
  lastSavedAt?: number | null;
  /** Expand across both columns of the parent 2-col grid. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}

export function SettingsCard({
  title, description, icon: Icon, lastSavedAt, wide, className, children,
}: SettingsCardProps) {
  const label = useRelativeSavedLabel(lastSavedAt);

  return (
    <DSCard className={cn('flex flex-col gap-3', wide && 'lg:col-span-2', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-[15px] w-[15px] text-[var(--ds-text-3)] shrink-0" />}
          <h3 className="text-[14.5px] font-semibold text-[var(--ds-text-1)] truncate">{title}</h3>
        </div>
        <span
          className={cn(
            'text-[11px] text-[var(--ds-text-3)] inline-flex items-center gap-1 shrink-0',
            !label && 'opacity-60',
          )}
          aria-live="polite"
        >
          {label ? (
            <>
              <Check className="h-[10px] w-[10px] text-[var(--success)]" />
              <span>Saved {label}</span>
            </>
          ) : (
            <span>Auto-saves on change</span>
          )}
        </span>
      </div>
      {description && (
        <p className="text-[12px] text-[var(--ds-text-3)] -mt-1 leading-snug">{description}</p>
      )}
      <div className="h-px bg-[var(--border-subtle)]" />
      <div className="flex flex-col gap-3">{children}</div>
    </DSCard>
  );
}

// Lightweight relative-time label that re-renders every 30s so "Saved 1 min ago"
// updates without a heavy dep. Returns null when lastSavedAt is null/undefined.
function useRelativeSavedLabel(lastSavedAt: number | null | undefined): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);
  if (!lastSavedAt) return null;
  const diff = Math.max(0, Date.now() - lastSavedAt);
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
