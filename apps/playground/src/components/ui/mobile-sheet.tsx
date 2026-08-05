import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Which edge it slides from. Defaults to the bottom (thumb-reachable). */
  side?: 'bottom' | 'left';
  className?: string;
}

/**
 * Minimal portal-based sheet for the mobile layouts (problem picker, nav menu,
 * solve-session meta). Hand-rolled rather than pulling in another Radix
 * surface: it needs to be light, and the playground already ships enough JS.
 *
 * Behaviour: click-outside and Escape close it, body scroll is locked while
 * open, and content is capped at 85% of the *dynamic* viewport height so it is
 * never taller than the visible area on a phone.
 */
export function MobileSheet({ open, onClose, title, children, side = 'bottom', className }: MobileSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex bg-zinc-950/50 backdrop-blur-[2px]"
      // Only a press that both starts and ends on the scrim closes it, so a
      // drag that began inside the sheet can't dismiss it on release.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={side === 'bottom' ? { alignItems: 'flex-end' } : { alignItems: 'stretch' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'max-h-sheet flex w-full flex-col overflow-hidden bg-warmwhite shadow-2xl animate-fade-in dark:bg-inknight',
          side === 'bottom' ? 'rounded-t-2xl pb-safe' : 'h-full max-w-[19rem] rounded-r-2xl',
          className,
        )}
      >
        <div className="relative flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {side === 'bottom' && (
            <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
          )}
          <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default MobileSheet;
