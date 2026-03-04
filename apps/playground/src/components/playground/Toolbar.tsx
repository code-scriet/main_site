import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { getAllLanguages } from '@/utils/languageConfig';
import { executeCode, formatOutput, calculateExecutionTime } from '@/utils/pistonApi';
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

export function Toolbar() {
  const {
    code,
    language,
    setLanguage,
    stdin,
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

  const languages = getAllLanguages();

  const handleRunCode = async () => {
    // Validate code
    const validation = validateCode(code);
    if (!validation.valid) {
      toast.error(validation.message || 'Invalid code');
      return;
    }

    // Handle web (HTML/CSS/JS) separately
    if (language.id === 'web') {
      setOutput('');
      setError('');
      toast.success('Web preview updated!');
      return;
    }

    setIsRunning(true);
    setOutput('');
    setError('');
    const startTime = Date.now();

    try {
      const result = await executeCode({
        language: language.id,
        version: language.version,
        files: [{ content: code }],
        stdin: stdin || undefined,
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
        toast.error('Code execution failed');
      } else {
        setOutput(output || 'Program executed successfully with no output');
        toast.success(`Executed in ${executionTime}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setError(`Execution error: ${message}`);
      toast.error('Failed to execute code');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyCode = async () => {
    const success = await copyToClipboard(code);
    if (success) {
      toast.success('Code copied to clipboard!');
    } else {
      toast.error('Failed to copy code');
    }
  };

  const handleSaveSnippet = () => {
    // TODO: Implement save snippet functionality
    toast.info('Save snippet feature coming soon!');
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
    <div className="flex items-center justify-between gap-3 p-3 border-b bg-card/50 backdrop-blur-sm flex-wrap">
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

        <Button onClick={handleRunCode} variant="success" className="gap-2">
          <Play className="h-4 w-4" />
          Run Code
        </Button>

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
