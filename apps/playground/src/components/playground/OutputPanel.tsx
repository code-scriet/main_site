import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Terminal, AlertCircle, CheckCircle2, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function OutputPanel() {
  const {
    stdin,
    setStdin,
    output,
    error,
    isRunning,
    executionTime,
    clearOutput,
    language,
  } = usePlayground();
  const { theme } = useTheme();

  const isWebLanguage = language.id === 'web';
  const isDark = theme === 'dark';
  const [stdinCollapsed, setStdinCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Input Section */}
      {!isWebLanguage && (
        <div className={cn(
          'border-b transition-colors',
          isDark ? 'bg-card/30' : 'bg-secondary/40'
        )}>
          <button
            onClick={() => setStdinCollapsed(!stdinCollapsed)}
            className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
          >
            <span>Custom Input (stdin)</span>
            {stdinCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          {!stdinCollapsed && (
            <div className="px-4 pb-3">
              <Textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="Enter input for your program..."
                className={cn(
                  'min-h-[70px] font-mono text-sm resize-none',
                  isDark
                    ? 'bg-background/50 border-border'
                    : 'bg-white border-border'
                )}
              />
            </div>
          )}
        </div>
      )}

      {/* Output Section */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Output header */}
        <div className={cn(
          'flex items-center justify-between px-4 py-2 border-b transition-colors',
          isDark ? 'bg-card/30' : 'bg-secondary/40'
        )}>
          <div className="flex items-center gap-2">
            {isWebLanguage ? (
              <span className="text-sm font-medium">Preview</span>
            ) : (
              <>
                <Terminal className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Output</span>
                {executionTime && (
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-md font-mono',
                    isDark
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-amber-100 text-amber-700'
                  )}>
                    {executionTime}
                  </span>
                )}
              </>
            )}
          </div>
          {!isWebLanguage && (
            <Button
              onClick={clearOutput}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Terminal body — theme-aware */}
        <div className="flex-1 overflow-auto p-4 font-mono text-sm terminal-output animate-fade-in">
          {isRunning ? (
            <div className="flex items-center gap-2" style={{ color: 'hsl(var(--terminal-warning))' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Executing code...</span>
            </div>
          ) : isWebLanguage ? (
            <WebPreview />
          ) : (
            <>
              {error && (
                <div className="mb-4">
                  <div className="flex items-start gap-2" style={{ color: 'hsl(var(--terminal-error))' }}>
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold mb-1">Error:</div>
                      <pre className="whitespace-pre-wrap text-[13px] leading-relaxed">{error}</pre>
                    </div>
                  </div>
                </div>
              )}

              {output && (
                <div>
                  {!error && (
                    <div className="flex items-center gap-2 mb-2" style={{ color: 'hsl(var(--terminal-success))' }}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-semibold">Output:</span>
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap text-[13px] leading-relaxed">{output}</pre>
                </div>
              )}

              {!isRunning && !output && !error && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12"
                     style={{ color: 'hsl(var(--terminal-muted))' }}>
                  <Terminal className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Click <strong>Run Code</strong> to see output here</p>
                  <p className="text-xs mt-1 opacity-60">
                    {language.name} • {language.tiers.includes('client') ? 'Runs locally in browser' : 'Runs on cloud'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WebPreview() {
  const { code } = usePlayground();

  return (
    <iframe
      srcDoc={code}
      className={cn(
        'w-full h-full bg-white rounded-md',
        'border-0 outline-none'
      )}
      sandbox="allow-scripts"
      title="Web Preview"
    />
  );
}
