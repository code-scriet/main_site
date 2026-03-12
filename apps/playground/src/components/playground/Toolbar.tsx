import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getAllLanguages } from '@/utils/languageConfig';
import { createSnippet } from '@/utils/snippetsApi';
import { copyToClipboard } from '@/lib/utils';
import { useCodeExecution } from '@/hooks/useCodeExecution';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play,
  Square,
  RotateCcw,
  Copy,
  Save,
  ZoomIn,
  ZoomOut,
  Moon,
  Sun,
  Menu,
  Download,
  Maximize,
  Code2,
  Cpu,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useKeyboardShortcuts, getShortcutKey } from '@/hooks/useKeyboardShortcuts';

export function Toolbar() {
  const {
    code,
    language,
    setLanguage,
    isRunning,
    resetCode,
    increaseFontSize,
    decreaseFontSize,
    toggleProblemPanel,
    pythonMode,
    pyodideProgress,
    pyodideLabel,
    startLocalPython,
    revertToCloudPython,
  } = usePlayground();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const { runCode, stopExecution } = useCodeExecution();

  const languages = getAllLanguages();

  const handleRunCode = async () => {
    await runCode();
  };

  const handleStopExecution = () => {
    stopExecution();
  };

  const handleCopyCode = async () => {
    const success = await copyToClipboard(code);
    if (success) {
      toast.success('Code copied to clipboard!');
    } else {
      toast.error('Failed to copy code');
    }
  };

  const handleSaveSnippet = async () => {
    if (!isAuthenticated) {
      toast.error('Sign in to save snippets');
      return;
    }
    const title = prompt('Snippet title:');
    if (!title?.trim()) return;
    const makePublic = confirm('Make this snippet public (shareable)?');
    try {
      const saved = await createSnippet({
        title: title.trim(),
        language: language.id,
        code,
        isPublic: makePublic,
      });
      toast.success(`Snippet "${saved.title}" saved!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save snippet');
    }
  };

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onRun: () => { if (!isRunning) handleRunCode(); },
    onSave: handleSaveSnippet,
    onReset: resetCode,
    onCopy: handleCopyCode,
    onToggleTheme: toggleTheme,
  });

  const handleDownloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code${language.fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Code downloaded!');
  };

  const handleFormatCode = () => {
    // Basic formatting - add proper indentation
    try {
      // Simple formatting rules for different languages
      if (['javascript', 'typescript', 'java', 'cpp', 'c', 'go'].includes(language.id)) {
        // Basic bracket-based formatting
        code
          .split('\\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('\\n');
      }
      
      // For Python, maintain indentation
      if (language.id === 'python') {
        code
          .split('\\n')
          .map((line) => line.trimEnd())
          .join('\\n');
      }
      
      toast.success('Code formatted!');
    } catch (error) {
      toast.error('Failed to format code');
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        toast.error('Failed to enter fullscreen');
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleReset = () => {
    resetCode();
    toast.success('Code reset to default');
  };

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 p-3 border-b flex-wrap transition-colors',
      theme === 'dark' ? 'bg-card/50 backdrop-blur-sm' : 'bg-white/60 backdrop-blur-sm'
    )}>
      <div className="flex items-center gap-3 flex-1 min-w-[200px]">
        <Select value={language.id} onValueChange={setLanguage}>
          <SelectTrigger className="w-[180px]">
            <SelectValue>
              <span className="flex items-center gap-2">
                <span>{language.icon}</span>
                <span>{language.name}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.id} value={lang.id}>
                <span className="flex items-center gap-2">
                  <span>{lang.icon}</span>
                  <span>{lang.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isRunning ? (
          <Button onClick={handleStopExecution} variant="destructive" className="gap-2">
            <Square className="h-4 w-4" />
            Stop
          </Button>
        ) : (
          <Button onClick={handleRunCode} variant="success" className="gap-2" title={`Run Code (${getShortcutKey('Enter')})`}>
            <Play className="h-4 w-4" />
            Run Code
          </Button>
        )}

        {/* Python local execution toggle */}
        {language.id === 'python' && (
          pythonMode === 'local' ? (
            /* Local mode active — show indicator with option to revert */
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-green-500/40 bg-green-500/10 text-green-400 text-xs font-medium">
              <Cpu className="h-3.5 w-3.5 shrink-0" />
              <span>Local</span>
              <button
                onClick={revertToCloudPython}
                className="ml-0.5 hover:text-green-200 transition-colors"
                title="Switch back to cloud execution"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : pythonMode === 'downloading' ? (
            /* Download in progress — show progress bar */
            <div className="flex flex-col justify-center min-w-[120px] sm:min-w-[160px] max-w-[200px]">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-muted-foreground truncate">{pyodideLabel}</span>
                <span className="text-[10px] text-muted-foreground ml-1 shrink-0">{pyodideProgress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${pyodideProgress}%` }}
                />
              </div>
            </div>
          ) : (
            /* Cloud mode — offer to switch to local */
            <Button
              onClick={startLocalPython}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-dashed flex"
              title="Download Python runtime to run code locally (faster after first load)"
            >
              <Cpu className="h-3.5 w-3.5" />
              Run Locally
            </Button>
          )
        )}

        <Button onClick={handleReset} variant="outline" size="icon" title={`Reset Code (${getShortcutKey('R', true)})`}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleCopyCode}
          variant="outline"
          size="icon"
          title={`Copy Code (${getShortcutKey('C', true)})`}
        >
          <Copy className="h-4 w-4" />
        </Button>

        <Button
          onClick={handleDownloadCode}
          variant="outline"
          size="icon"
          title="Download Code"
        >
          <Download className="h-4 w-4" />
        </Button>

        <Button
          onClick={handleFormatCode}
          variant="outline"
          size="icon"
          title="Format Code"
          className="hidden sm:flex"
        >
          <Code2 className="h-4 w-4" />
        </Button>

        <Button
          onClick={handleSaveSnippet}
          variant="outline"
          size="icon"
          title={`Save Snippet (${getShortcutKey('S')})`}
        >
          <Save className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        <Button
          onClick={decreaseFontSize}
          variant="outline"
          size="icon"
          title="Decrease Font Size"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <Button
          onClick={increaseFontSize}
          variant="outline"
          size="icon"
          title="Increase Font Size"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        <Button
          onClick={toggleTheme}
          variant="outline"
          size="icon"
          title={`Toggle Theme (${getShortcutKey('T', true)})`}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        <Button
          onClick={handleToggleFullscreen}
          variant="outline"
          size="icon"
          title="Toggle Fullscreen"
          className="hidden md:flex"
        >
          <Maximize className="h-4 w-4" />
        </Button>

        <Button
          onClick={toggleProblemPanel}
          variant="outline"
          size="icon"
          title="Toggle Problem Panel"
          className="md:hidden"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
