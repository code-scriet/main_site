import { useState } from 'react';
import {
  BookOpenCheck,
  Copy,
  Cpu,
  Download,
  MoreHorizontal,
  Moon,
  Play,
  RotateCcw,
  Save,
  Search,
  Square,
  Sun,
  Type,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import type { PlaygroundActions } from '@/hooks/usePlaygroundActions';
import { TOUCH_MIN_FONT_SIZE } from '@/lib/monacoEditor';
import { getAllLanguages } from '@/utils/languageConfig';
import { MobileSheet } from '@/components/ui/mobile-sheet';
import { cn } from '@/lib/utils';

export interface MobileActionBarProps {
  actions: PlaygroundActions;
  onOpenPractice?: () => void;
}

/**
 * The bottom action bar for the phone layout: language picker, the primary Run
 * button, Stop, and an overflow sheet for everything the desktop toolbar shows
 * across its two rows.
 *
 * It replaces the desktop `Toolbar` on small screens rather than trying to
 * squeeze it — the toolbar's 12 controls do not fit a 360px row at a tappable
 * size, and Run being reachable with a thumb matters more than parity.
 */
export function MobileActionBar({ actions, onOpenPractice }: MobileActionBarProps) {
  const {
    language,
    setLanguage,
    fontSize,
    increaseFontSize,
    decreaseFontSize,
    pythonMode,
    pyodideProgress,
    pyodideLabel,
    startLocalPython,
    revertToCloudPython,
  } = usePlayground();
  const { theme, toggleTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const languages = getAllLanguages();

  const close = () => setMoreOpen(false);
  const runAndClose = (fn: () => void | Promise<void>) => {
    close();
    void fn();
  };

  const sheetItem =
    'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-zinc-700 active:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:active:bg-zinc-800';

  return (
    <>
      <div className="shrink-0 border-t border-zinc-200 bg-warmwhite px-2 pb-safe pt-2 dark:border-zinc-800 dark:bg-inknight">
        <div className="flex items-center gap-2 pb-2">
          <select
            value={language.id}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label="Language"
            className="h-12 w-[7.5rem] shrink-0 rounded-lg border border-zinc-300 bg-white px-2 font-medium text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {languages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void actions.runCode()}
            disabled={actions.runDisabled}
            className={cn(
              'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg text-[15px] font-semibold transition active:scale-[0.98]',
              actions.runDisabled
                ? 'cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
                : 'bg-amber-400 text-amber-950 shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)]',
            )}
          >
            <Play className="h-5 w-5 fill-current" />
            {actions.quotaExhausted ? 'Limit reached' : actions.isRunning ? 'Running…' : 'Run'}
          </button>

          {actions.isRunning && (
            <button
              type="button"
              onClick={actions.stopExecution}
              aria-label="Stop execution"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <Square className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More actions"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      <MobileSheet open={moreOpen} onClose={close} title="Actions">
        <div className="p-2">
          <div className="mb-1 flex items-center gap-2 px-3 py-2">
            <Type className="h-4 w-4 text-zinc-500" />
            <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">Editor font size</span>
            {/* Disabled at the touch floor the editor enforces, so it can't
                look broken while state changes with no visible effect. */}
            <button
              type="button"
              onClick={decreaseFontSize}
              disabled={fontSize <= TOUCH_MIN_FONT_SIZE}
              aria-label="Decrease font size"
              className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-lg font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              −
            </button>
            <button
              type="button"
              onClick={increaseFontSize}
              aria-label="Increase font size"
              className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-lg font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              +
            </button>
          </div>

          <button type="button" className={sheetItem} onClick={() => runAndClose(actions.copyCode)}>
            <Copy className="h-4 w-4 text-zinc-500" />
            Copy code
          </button>
          <button type="button" className={sheetItem} onClick={() => runAndClose(actions.saveSnippet)}>
            <Save className="h-4 w-4 text-zinc-500" />
            Save as snippet
          </button>
          <button type="button" className={sheetItem} onClick={() => runAndClose(actions.downloadCode)}>
            <Download className="h-4 w-4 text-zinc-500" />
            Download file
          </button>
          <button
            type="button"
            className={sheetItem}
            disabled={actions.atStarter}
            onClick={() => runAndClose(actions.resetCode)}
          >
            <RotateCcw className="h-4 w-4 text-zinc-500" />
            Reset to starter code
          </button>

          <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />

          {language.id === 'python' && (
            pythonMode === 'local' ? (
              <button type="button" className={sheetItem} onClick={() => runAndClose(revertToCloudPython)}>
                <Cpu className="h-4 w-4 text-emerald-500" />
                Python runs locally — switch back to cloud
              </button>
            ) : pythonMode === 'downloading' ? (
              <div className="px-3 py-3 text-sm text-zinc-500">
                {pyodideLabel} · {pyodideProgress}%
                <span className="mt-1.5 block h-1 rounded bg-zinc-200 dark:bg-zinc-800">
                  <span className="block h-full rounded bg-amber-400" style={{ width: `${pyodideProgress}%` }} />
                </span>
              </div>
            ) : (
              <button type="button" className={sheetItem} onClick={() => runAndClose(startLocalPython)}>
                <Cpu className="h-4 w-4 text-zinc-500" />
                Run Python locally (downloads runtime)
              </button>
            )
          )}

          {onOpenPractice && (
            <button type="button" className={sheetItem} onClick={() => runAndClose(onOpenPractice)}>
              <BookOpenCheck className="h-4 w-4 text-zinc-500" />
              Practice problems
            </button>
          )}
          <Link to="/snippets" onClick={close} className={sheetItem}>
            <Save className="h-4 w-4 text-zinc-500" />
            My snippets
          </Link>
          <button
            type="button"
            className={sheetItem}
            onClick={() => runAndClose(() => { window.dispatchEvent(new Event('playground:command-palette')); })}
          >
            <Search className="h-4 w-4 text-zinc-500" />
            Search commands
          </button>
          <button type="button" className={sheetItem} onClick={() => runAndClose(toggleTheme)}>
            {theme === 'dark' ? <Sun className="h-4 w-4 text-zinc-500" /> : <Moon className="h-4 w-4 text-zinc-500" />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </MobileSheet>
    </>
  );
}

export default MobileActionBar;
