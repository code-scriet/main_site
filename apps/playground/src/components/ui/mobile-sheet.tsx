import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Required: it is both the visible heading and the dialog's accessible name
   * (`aria-label`). Optional would let a caller ship a dialog that announces
   * nothing to a screen reader, and every call site has a natural title anyway.
   */
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Body scroll lock, ref-counted across every open sheet.
 *
 * A per-instance `previousOverflow` snapshot breaks as soon as two sheets
 * overlap — which happens for real in the contest arena, where an admin
 * clarification auto-opens a second sheet over the problem picker. The inner
 * sheet would capture `'hidden'` as the "previous" value and restore it on
 * close, leaving the page permanently unscrollable. One module-level counter
 * plus one saved value means only the last sheet out restores, and it restores
 * what the page actually had before any sheet opened.
 */
let scrollLockDepth = 0;
let scrollLockPrevious = '';

function acquireScrollLock() {
  if (scrollLockDepth === 0) {
    scrollLockPrevious = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockDepth += 1;
}

function releaseScrollLock() {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth === 0) {
    document.body.style.overflow = scrollLockPrevious;
  }
}

/**
 * Minimal portal-based sheet for the mobile layouts (problem picker, nav menu,
 * solve-session meta). Hand-rolled rather than pulling in another Radix
 * surface: it needs to be light, and the playground already ships enough JS.
 *
 * Behaviour: click/tap outside and Escape close it, body scroll is locked while
 * open, focus moves into the sheet and returns to the trigger on close, and
 * content is capped at 85% of the *dynamic* viewport height so it is never
 * taller than the visible area on a phone.
 */
export function MobileSheet({ open, onClose, title, children, className }: MobileSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref so the effect below can depend only on `open` — call sites
  // pass an inline arrow, so depending on `onClose` would tear down and re-run
  // the whole effect on every parent render (the arena re-renders once a second
  // from its countdown, which would churn the listener and the scroll lock).
  const onCloseRef = useRef(onClose);
  // Refreshed in an effect rather than during render — a ref write in the
  // render body is not safe under concurrent rendering (and React's lint rule
  // says so). This runs after every commit, so the ref is never stale by the
  // time a keydown or cleanup can read it.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Captured now: by cleanup time `panelRef.current` may already have been
    // nulled by React, and this node is the one whose focus we care about.
    const panel = panelRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };

    acquireScrollLock();
    window.addEventListener('keydown', onKey);
    // Move focus into the dialog: `aria-modal` tells assistive tech the rest of
    // the page is inert, so leaving focus on the trigger behind the scrim would
    // announce nothing and let Tab walk the covered page.
    panel?.focus();

    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
      // Return focus to whatever opened the sheet — otherwise a keyboard or
      // screen-reader user is dumped on <body> and has to tab from the top.
      //
      // The condition is "focus was orphaned", NOT "focus is still inside the
      // panel": this is a passive-effect cleanup, so React has already detached
      // the panel and the browser has moved focus to <body> by the time we run.
      // Checking containment here would never match. Requiring an orphaned
      // focus still avoids yanking focus away if something else claimed it.
      const active = document.activeElement;
      const orphaned = !active || active === document.body || !active.isConnected;
      if (orphaned && previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end bg-zinc-950/50 backdrop-blur-[2px]"
      // Pointer events, not mouse events: touch browsers only synthesise
      // mousedown as a compatibility event, and it is suppressed outright when
      // something upstream has preventDefault'd the touch sequence — which
      // would leave outside-tap-to-dismiss silently broken on exactly the
      // devices this sheet exists for. `pointerdown` covers touch, pen and
      // mouse uniformly, and still fires on press rather than release, so a
      // drag that began inside the sheet can't dismiss it.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'max-h-sheet flex w-full flex-col overflow-hidden rounded-t-2xl bg-warmwhite pb-safe shadow-2xl outline-none animate-fade-in dark:bg-inknight',
          className,
        )}
      >
        <div className="relative flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
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
