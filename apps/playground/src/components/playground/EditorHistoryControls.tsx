import { Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

interface EditorHistoryControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  /** Reset is disabled when the editor already matches the starter. */
  canReset: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  /**
   * `ghost` matches the Playground toolbar's borderless buttons; `bordered`
   * matches the QOTD solver's bordered icon buttons. The behavior is identical
   * either way — only the chrome differs so each surface stays consistent.
   */
  variant?: 'ghost' | 'bordered';
}

/**
 * Undo / Redo / Reset cluster shared by the Playground and QOTD editors. The
 * history behavior lives in `useEditorHistory`; this component is purely the
 * buttons, so the two surfaces never duplicate the logic.
 */
export function EditorHistoryControls({
  canUndo,
  canRedo,
  canReset,
  onUndo,
  onRedo,
  onReset,
  variant = 'ghost',
}: EditorHistoryControlsProps) {
  const items = [
    {
      key: 'undo',
      label: 'Undo',
      icon: Undo2,
      onClick: onUndo,
      disabled: !canUndo,
      title: `Undo (${MOD}Z)`,
    },
    {
      key: 'redo',
      label: 'Redo',
      icon: Redo2,
      onClick: onRedo,
      disabled: !canRedo,
      title: `Redo (${MOD}⇧Z / ${MOD}Y)`,
    },
    {
      key: 'reset',
      label: 'Reset',
      icon: RotateCcw,
      onClick: onReset,
      disabled: !canReset,
      title: `Reset to starter code (${MOD}⇧R)`,
    },
  ];

  if (variant === 'bordered') {
    return (
      <>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            title={item.title}
            aria-label={item.label}
            className="rounded border border-zinc-200 bg-white p-2 text-zinc-600 transition hover:bg-zinc-50 hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-amber-400 dark:disabled:hover:bg-zinc-900 dark:disabled:hover:text-zinc-300"
          >
            <item.icon className="h-4 w-4" />
          </button>
        ))}
      </>
    );
  }

  return (
    <>
      {items.map((item) => (
        <Button
          key={item.key}
          onClick={item.onClick}
          disabled={item.disabled}
          variant="ghost"
          size="sm"
          title={item.title}
          aria-label={item.label}
          className={cn(
            'h-8 px-2 text-xs text-zinc-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <item.icon className="h-3.5 w-3.5" />
          <span className="hidden lg:ml-1.5 lg:inline">{item.label}</span>
        </Button>
      ))}
    </>
  );
}
