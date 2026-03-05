import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getAllLanguages } from '@/utils/languageConfig';
import { executeCode, formatOutput, calculateExecutionTime } from '@/engines/ExecutionRouter';
import { createSnippet } from '@/utils/snippetsApi';
import { copyToClipboard, validateCode } from '@/lib/utils';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

export function Toolbar() {
  const {
    code,
    language,
    setLanguage,
    stdin,
    isRunning,
    setOutput,
    setError,
    setIsRunning,
    setExecutionTime,
    resetCode,
    increaseFontSize,
    decreaseFontSize,
    toggleProblemPanel,
  } = usePlayground();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const abortRef = useRef<AbortController | null>(null);

  const languages = getAllLanguages();

  const handleRunCode = async () => {
    const validation = validateCode(code);
    if (!validation.valid) {
      toast.error(validation.message || 'Invalid code');
      return;
    }

    if (language.id === 'web') {
      setOutput('');
      setError('');
      toast.success('Web preview updated!');
      return;
    }

    // Cancel any in-flight execution
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setOutput('');
    setError('');
    const startTime = Date.now();

    try {
      const result = await executeCode({
        language: language.id,
        code,
        stdin: stdin || undefined,
        signal: controller.signal,
      });

      const endTime = Date.now();
      const executionTime = calculateExecutionTime(startTime, endTime);
      setExecutionTime(executionTime);

      const { output, error, hasError } = formatOutput(result);

      if (hasError) {
        setError(error);
        if (output) {
          setOutput(output);
        }
        toast.error(error || 'Code execution failed');
      } else {
        setOutput(output || 'Program executed successfully with no output');
        const tierLabel = result.tier === 'client' ? '(local)' : '(cloud)';
        toast.success(`Executed in ${executionTime} ${tierLabel}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Execution cancelled') {
        setError('Execution cancelled by user.');
        toast.info('Execution stopped');
      } else {
        setError(`Execution error: ${message}`);
        toast.error('Failed to execute code');
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStopExecution = () => {
    abortRef.current?.abort();
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
          <Button onClick={handleRunCode} variant="success" className="gap-2">
            <Play className="h-4 w-4" />
            Run Code
          </Button>
        )}

        <Button onClick={handleReset} variant="outline" size="icon" title="Reset Code">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleCopyCode}
          variant="outline"
          size="icon"
          title="Copy Code"
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
          title="Save Snippet"
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
          title="Toggle Theme"
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
