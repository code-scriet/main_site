import { useState } from 'react';
import { ChevronRight, CornerDownLeft, Indent, Outdent, Redo2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileKeyBarProps {
  /** Types a literal at the cursor (goes through Monaco's `type` command). */
  onInsert: (text: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * No live editor to type into (Monaco still loading, or disposed). The keys
   * grey out instead of silently swallowing taps.
   */
  disabled?: boolean;
  className?: string;
}

/** Symbols a phone keyboard hides behind a layout switch (or two). */
const PRIMARY_KEYS = ['{', '}', '(', ')', '[', ']', '<', '>', '"', "'", ';', ':', '=', '+', '-', '*', '/'];
const SECONDARY_KEYS = ['%', '&', '|', '!', '?', '#', '_', '$', '@', '^', '~', '\\', '`', ',', '.'];

/**
 * The row of coding keys that sits directly above the mobile action bar.
 *
 * Focus handling is the whole trick: every key calls `preventDefault()` on
 * `mousedown` (which touch browsers synthesise after a tap that didn't scroll).
 * That stops the button taking focus, so the editor keeps it and the soft
 * keyboard never closes/reopens between taps. `preventDefault` is deliberately
 * NOT on `pointerdown`/`touchstart` — that would also cancel the horizontal
 * scroll gesture on this very rail.
 */
export function MobileKeyBar({
  onInsert,
  onIndent,
  onOutdent,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  disabled = false,
  className,
}: MobileKeyBarProps) {
  const [expanded, setExpanded] = useState(false);

  const keyClass =
    'inline-flex h-9 min-w-[2.25rem] shrink-0 select-none items-center justify-center rounded-md border border-zinc-200 bg-white px-2 font-mono text-[15px] leading-none text-zinc-700 shadow-sm active:scale-95 active:bg-amber-400/20 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';

  const keep = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div
      className={cn(
        'flex h-12 items-center gap-1.5 overflow-x-auto border-t border-zinc-200 bg-zinc-100/90 px-2 no-scrollbar dark:border-zinc-800 dark:bg-zinc-900/90',
        className,
      )}
      // A tap here must never blur the editor (see component doc).
      onMouseDown={keep}
    >
      <button type="button" tabIndex={-1} onMouseDown={keep} onClick={onOutdent} disabled={disabled} className={keyClass} aria-label="Outdent">
        <Outdent className="h-4 w-4" />
      </button>
      <button type="button" tabIndex={-1} onMouseDown={keep} onClick={onIndent} disabled={disabled} className={keyClass} aria-label="Indent">
        <Indent className="h-4 w-4" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={keep}
        onClick={() => onInsert('\n')}
        disabled={disabled}
        className={keyClass}
        aria-label="New line"
      >
        <CornerDownLeft className="h-4 w-4" />
      </button>

      <span className="h-6 w-px shrink-0 bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />

      {(expanded ? [...PRIMARY_KEYS, ...SECONDARY_KEYS] : PRIMARY_KEYS).map((key) => (
        <button
          key={key}
          type="button"
          tabIndex={-1}
          onMouseDown={keep}
          onClick={() => onInsert(key)}
          disabled={disabled}
          className={keyClass}
          aria-label={`Insert ${key}`}
        >
          {key}
        </button>
      ))}

      <button
        type="button"
        tabIndex={-1}
        onMouseDown={keep}
        onClick={() => setExpanded((open) => !open)}
        className={cn(keyClass, 'px-1.5 text-zinc-500')}
        aria-label={expanded ? 'Fewer symbols' : 'More symbols'}
        aria-expanded={expanded}
      >
        <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
      </button>

      <span className="h-6 w-px shrink-0 bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />

      <button
        type="button"
        tabIndex={-1}
        onMouseDown={keep}
        onClick={onUndo}
        disabled={disabled || !canUndo}
        className={keyClass}
        aria-label="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={keep}
        onClick={onRedo}
        disabled={disabled || !canRedo}
        className={keyClass}
        aria-label="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default MobileKeyBar;
