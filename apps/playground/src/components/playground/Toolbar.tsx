import { useEffect } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  Copy,
  Cpu,
  Download,
  Maximize,
  Menu,
  Minus,
  Moon,
  Play,
  Plus,
  Save,
  Square,
  Sun,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { getShortcutKey } from '@/hooks/useKeyboardShortcuts';
import { useEditorHistoryContext } from '@/hooks/useEditorHistory';
import type { PlaygroundActions } from '@/hooks/usePlaygroundActions';
import { getAllLanguages } from '@/utils/languageConfig';
import { Button } from '@/components/ui/button';
import { EditorHistoryControls } from '@/components/playground/EditorHistoryControls';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  /** Shared with the mobile action bar so both drive identical behaviour. */
  actions: PlaygroundActions;
  problemMode?: boolean;
  onExitProblem?: () => void;
  onOpenPractice?: () => void;
}

export function Toolbar({ actions, problemMode = false, onExitProblem, onOpenPractice }: ToolbarProps) {
  const {
    language,
    setLanguage,
    increaseFontSize,
    decreaseFontSize,
    toggleProblemPanel,
    pythonMode,
    pyodideProgress,
    pyodideLabel,
    pyodideError,
    startLocalPython,
    revertToCloudPython,
  } = usePlayground();
  const { theme, toggleTheme } = useTheme();
  const { canUndo, canRedo, undo, redo } = useEditorHistoryContext();

  const languages = getAllLanguages();

  useEffect(() => {
    if (pyodideError) {
      toast.error(`Python local runtime failed: ${pyodideError}`, { duration: 6000 });
    }
  }, [pyodideError]);

  if (problemMode) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-zinc-200 bg-warmwhite px-3 dark:border-zinc-800 dark:bg-inknight">
        <div className="flex items-center gap-2">
          {onExitProblem && (
            <Button onClick={onExitProblem} variant="ghost" size="sm" className="h-9 gap-2 text-zinc-600 dark:text-zinc-300">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          {onOpenPractice && (
            <Button onClick={onOpenPractice} variant="ghost" size="sm" className="h-9 gap-2 text-zinc-600 dark:text-zinc-300">
              <BookOpenCheck className="h-4 w-4" />
              Practice
            </Button>
          )}
        </div>
        <div className="hidden text-[11px] text-zinc-500 dark:text-zinc-400 sm:block">Run and submit controls live in the solver footer.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-zinc-200 bg-warmwhite px-3 dark:border-zinc-800 dark:bg-inknight">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void actions.runCode()}
          disabled={actions.runDisabled}
          title={actions.quotaExhausted ? 'Daily limit reached' : `Run (${getShortcutKey('Enter')})`}
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium transition',
            actions.runDisabled
              ? 'cursor-not-allowed bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:ring-zinc-800'
              : 'bg-amber-400 text-amber-950 shadow-[inset_0_-1px_0_rgba(0,0,0,0.18),0_0_0_1px_rgba(251,191,36,0.45)] hover:bg-amber-300',
          )}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Run
          <kbd className="hidden rounded bg-amber-950/10 px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘↵</kbd>
        </button>

        <Button onClick={actions.stopExecution} disabled={!actions.isRunning} variant="outline" size="sm" className="h-8 gap-2 border-zinc-200 dark:border-zinc-800">
          <Square className="h-3.5 w-3.5" />
          Stop
        </Button>

        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800" />

        <select
          value={language.id}
          onChange={(event) => setLanguage(event.target.value)}
          className="h-8 max-w-[150px] rounded border border-zinc-200 bg-transparent px-2 text-xs font-medium text-zinc-700 outline-none dark:border-zinc-800 dark:text-zinc-200"
          aria-label="Language"
        >
          {languages.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </select>

        {language.id === 'python' && (
          pythonMode === 'local' ? (
            <span className="inline-flex h-8 items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-2 text-xs font-medium text-emerald-500">
              <Cpu className="h-3.5 w-3.5" />
              Local
              <button type="button" onClick={revertToCloudPython} className="hover:text-emerald-300" title="Switch Python back to cloud">
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : pythonMode === 'downloading' ? (
            <span className="hidden min-w-[132px] text-[10px] text-zinc-500 sm:block">
              {pyodideLabel} · {pyodideProgress}%
              <span className="mt-1 block h-1 rounded bg-zinc-200 dark:bg-zinc-800">
                <span className="block h-full rounded bg-amber-400" style={{ width: `${pyodideProgress}%` }} />
              </span>
            </span>
          ) : (
            <Button onClick={startLocalPython} variant="outline" size="sm" className="hidden h-8 gap-1.5 border-dashed text-xs sm:inline-flex">
              <Cpu className="h-3.5 w-3.5" />
              Local Python
            </Button>
          )
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <EditorHistoryControls
          variant="ghost"
          canUndo={canUndo}
          canRedo={canRedo}
          canReset={!actions.atStarter}
          onUndo={undo}
          onRedo={redo}
          onReset={actions.resetCode}
        />

        <div className="mx-1 hidden h-6 w-px bg-zinc-200 sm:block dark:bg-zinc-800" />

        {[
          { label: 'Copy', icon: Copy, onClick: () => void actions.copyCode() },
          { label: 'Save', icon: Save, onClick: () => void actions.saveSnippet() },
          { label: 'Download', icon: Download, onClick: actions.downloadCode },
        ].map((item) => (
          <Button
            key={item.label}
            onClick={item.onClick}
            variant="ghost"
            size="sm"
            title={item.label}
            className="h-8 px-2 text-xs text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <item.icon className="h-3.5 w-3.5" />
            <span className="hidden lg:ml-1.5 lg:inline">{item.label}</span>
          </Button>
        ))}

        <div className="mx-1 hidden h-6 w-px bg-zinc-200 sm:block dark:bg-zinc-800" />

        <Button onClick={decreaseFontSize} variant="ghost" size="icon" title="Decrease font size" className="hidden h-8 w-8 sm:inline-flex">
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button onClick={increaseFontSize} variant="ghost" size="icon" title="Increase font size" className="hidden h-8 w-8 sm:inline-flex">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button onClick={toggleTheme} variant="ghost" size="icon" title={`Toggle theme (${getShortcutKey('T', true)})`} className="h-8 w-8">
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
        <Button onClick={actions.toggleFullscreen} variant="ghost" size="icon" title="Fullscreen" className="hidden h-8 w-8 md:inline-flex">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
        <Button onClick={toggleProblemPanel} variant="ghost" size="icon" title="Toggle problem panel" className="h-8 w-8 md:hidden">
          <Menu className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
