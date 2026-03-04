import { usePlayground } from '@/context/PlaygroundContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Terminal, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const isWebLanguage = language.id === 'web';

  return (
    <div className="flex flex-col h-full">
      {/* Input Section */}
      {!isWebLanguage && (
        <div className="border-b p-4 bg-card/30">
          <label className="text-sm font-medium mb-2 block">
            Custom Input (stdin)
          </label>
          <Textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="Enter input for your program..."
            className="min-h-[80px] font-mono text-sm resize-none"
          />
        </div>
      )}

      {/* Output Section */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card/30">
          <div className="flex items-center gap-2">
            {isWebLanguage ? (
              <span className="text-sm font-medium">Preview</span>
            ) : (
              <>
                <Terminal className="h-4 w-4" />
                <span className="text-sm font-medium">Output</span>
                {executionTime && (
                  <span className="text-xs text-muted-foreground">
                    ({executionTime})
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
              className="h-7 px-2"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 bg-black/90 text-white font-mono text-sm terminal-output">
          {isRunning ? (
            <div className="flex items-center gap-2 text-yellow-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Executing code...</span>
            </div>
          ) : isWebLanguage ? (
            <WebPreview />
          ) : (
            <>
              {error && (
                <div className="mb-4">
                  <div className="flex items-start gap-2 text-red-400">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold mb-1">Error:</div>
                      <pre className="whitespace-pre-wrap">{error}</pre>
                    </div>
                  </div>
                </div>
              )}

              {output && (
                <div>
                  {!error && (
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-semibold">Output:</span>
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap">{output}</pre>
                </div>
              )}

              {!isRunning && !output && !error && (
                <div className="text-muted-foreground italic">
                  Click "Run Code" to see output here...
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
