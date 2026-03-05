import { useEffect, useCallback } from 'react';

interface KeyboardShortcutHandlers {
  onRun?: () => void;
  onSave?: () => void;
  onReset?: () => void;
  onCopy?: () => void;
  onToggleTheme?: () => void;
}

/**
 * Hook to handle keyboard shortcuts for the playground:
 * - Ctrl/Cmd + Enter: Run code
 * - Ctrl/Cmd + S: Save snippet
 * - Ctrl/Cmd + Shift + R: Reset code
 * - Ctrl/Cmd + Shift + C: Copy code
 * - Ctrl/Cmd + Shift + T: Toggle theme
 */
export function useKeyboardShortcuts({
  onRun,
  onSave,
  onReset,
  onCopy,
  onToggleTheme,
}: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      
      if (!isMod) return;
      
      // Ctrl/Cmd + Enter → Run code
      if (e.key === 'Enter' && onRun) {
        e.preventDefault();
        onRun();
        return;
      }
      
      // Ctrl/Cmd + S → Save snippet
      if (e.key === 's' && !e.shiftKey && onSave) {
        e.preventDefault();
        onSave();
        return;
      }
      
      // Ctrl/Cmd + Shift + R → Reset code
      if (e.key === 'r' && e.shiftKey && onReset) {
        e.preventDefault();
        onReset();
        return;
      }
      
      // Ctrl/Cmd + Shift + C → Copy code
      if (e.key === 'c' && e.shiftKey && onCopy) {
        e.preventDefault();
        onCopy();
        return;
      }
      
      // Ctrl/Cmd + Shift + T → Toggle theme
      if (e.key === 't' && e.shiftKey && onToggleTheme) {
        e.preventDefault();
        onToggleTheme();
        return;
      }
    },
    [onRun, onSave, onReset, onCopy, onToggleTheme]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/** Get keyboard shortcut display text based on platform */
export function getShortcutKey(key: string, withShift = false): string {
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl';
  const shift = withShift ? '⇧' : '';
  return `${mod}${shift}${key}`;
}
