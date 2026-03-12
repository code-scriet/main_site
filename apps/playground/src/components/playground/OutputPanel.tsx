import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Trash2, Terminal, AlertCircle, CheckCircle2, Loader2,
  ChevronUp, ChevronDown, History, Clock, Play, Cloud,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getExecutionHistory,
  getExecutionStats,
  getSessionBootstrap,
  getSessionPreflight,
  type ExecutionHistoryItem,
  type ExecutionStats,
} from '@/utils/snippetsApi';
import { getLanguageById } from '@/utils/languageConfig';
import { CLIENT_SUPPORTED_LANGUAGES } from '@/engines/types';

type Tab = 'output' | 'history';

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
    setCode,
    setLanguage,
    inputPrompt,
    inputResolverRef,
  } = usePlayground();
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();

  const isWebLanguage = language.id === 'web';
  const isCloudOnly = !CLIENT_SUPPORTED_LANGUAGES.has(language.id);
  const isDark = theme === 'dark';
  const [stdinCollapsed, setStdinCollapsed] = useState(false);

  // Auto-expand stdin when switching to a cloud-only language (C/C++/Java)
  useEffect(() => {
    if (isCloudOnly) setStdinCollapsed(false);
  }, [isCloudOnly]);
  const [activeTab, setActiveTab] = useState<Tab>('output');
  const [interactiveInput, setInteractiveInput] = useState('');
  const inputFieldRef = useRef<HTMLInputElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output when new content arrives or input prompt appears
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [output, inputPrompt]);

  // Auto-focus the interactive input field
  useEffect(() => {
    if (inputPrompt !== null) {
      setTimeout(() => inputFieldRef.current?.focus(), 50);
    }
  }, [inputPrompt]);

  const submitInteractiveInput = useCallback(() => {
    if (inputResolverRef.current) {
      inputResolverRef.current(interactiveInput);
      setInteractiveInput('');
    }
  }, [interactiveInput, inputResolverRef]);

  // History & stats state
  const [history, setHistory] = useState<ExecutionHistoryItem[]>([]);
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refreshStats = useCallback(async () => {
    if (!isAuthenticated) {
      setStats(null);
      return;
    }
    try {
      const s = await getExecutionStats();
      setStats(s);
    } catch {
      setStats({ languageStats: [], todayCount: 0, dailyLimit: 100 });
    }
  }, [isAuthenticated]);

  const refreshHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    setHistoryLoading(true);
    try {
      const [h, s] = await Promise.all([getExecutionHistory(), getExecutionStats()]);
      setHistory(h);
      setStats(s);
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  }, [isAuthenticated]);

  // Refresh when switching to history tab or after executing
  useEffect(() => {
    if (activeTab === 'history') refreshHistory();
  }, [activeTab, refreshHistory]);

  // Initial stats load (counter visible without requiring a run)
  useEffect(() => {
    if (!isAuthenticated) {
      setStats(null);
      setHistory([]);
      return;
    }

    (async () => {
      try {
        const data = await getSessionBootstrap();
        setHistory(data.history);
        setStats(data.stats);
      } catch {
        refreshStats();
      }
    })();
  }, [isAuthenticated, refreshStats]);

  // Update stats counter optimistically after each run completes
  // (avoids a redundant network round-trip — preflight cache already tracks count)
  useEffect(() => {
    if (!isRunning && isAuthenticated && stats) {
      // Sync from locally-decremented preflight cache
      getSessionPreflight(language.id).then((pf) => {
        setStats((prev) => prev ? { ...prev, todayCount: pf.todayCount, dailyLimit: pf.dailyLimit } : prev);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, isAuthenticated]);

  const loadHistoryItem = (item: ExecutionHistoryItem) => {
    try {
      const lang = getLanguageById(item.language);
      if (lang.id !== language.id) setLanguage(item.language);
      // Small timeout to let language switch apply boilerplate, then override
      setTimeout(() => setCode(item.code), 50);
      setActiveTab('output');
    } catch { /* ignore */ }
  };

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
            <span>Custom Input (stdin){isCloudOnly && <span className="text-xs text-muted-foreground ml-2 font-normal">— required for {language.name} input</span>}</span>
            {stdinCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          {!stdinCollapsed && (
            <div className="px-4 pb-3">
              {isCloudOnly && (
                <p className="text-xs text-muted-foreground mb-2">
                  {language.name} runs on a remote server — provide all input upfront (one value per line).
                </p>
              )}
              <Textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder={isCloudOnly
                  ? `Enter all input values, one per line (e.g. for scanf/cin)...`
                  : 'Enter input for your program...'}
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

      {/* Output / History Section */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Tab header */}
        <div className={cn(
          'flex items-center justify-between px-2 py-1.5 border-b transition-colors',
          isDark ? 'bg-card/30' : 'bg-secondary/40'
        )}>
          <div className="flex items-center gap-1">
            {isWebLanguage ? (
              <span className="text-sm font-medium px-2">Preview</span>
            ) : (
              <>
                {/* Output tab */}
                <button
                  onClick={() => setActiveTab('output')}
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors',
                    activeTab === 'output'
                      ? isDark ? 'bg-primary/15 text-primary' : 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Output
                  {executionTime && activeTab === 'output' && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono',
                      isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700'
                    )}>
                      {executionTime}
                    </span>
                  )}
                </button>

                {/* History tab */}
                <button
                  onClick={() => setActiveTab('history')}
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors',
                    activeTab === 'history'
                      ? isDark ? 'bg-primary/15 text-primary' : 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Daily limit counter */}
            {stats && (
              <span className={cn(
                'text-[11px] font-mono px-2 py-0.5 rounded-md',
                stats.todayCount >= stats.dailyLimit
                  ? 'bg-red-500/10 text-red-400'
                  : isDark ? 'bg-muted/50 text-muted-foreground' : 'bg-muted text-muted-foreground'
              )}>
                <Cloud className="h-3 w-3 inline mr-1 -mt-0.5" />
                {stats.todayCount}/{stats.dailyLimit}
              </span>
            )}

            {!isWebLanguage && activeTab === 'output' && (
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
        </div>

        {/* Tab body */}
        {activeTab === 'output' ? (
          <div className="flex-1 overflow-auto p-4 font-mono text-sm terminal-output animate-fade-in">
            {isRunning && !output && inputPrompt === null ? (
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
                    <div className="flex items-start gap-2" style={{ 
                      color: error.startsWith('Warning:') 
                        ? 'hsl(var(--terminal-warning))' 
                        : 'hsl(var(--terminal-error))' 
                    }}>
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold mb-1">
                          {error.startsWith('Warning:') ? 'Warning:' : 'Error:'}
                        </div>
                        <pre className="whitespace-pre-wrap text-[13px] leading-relaxed">
                          {error.startsWith('Warning:') ? error.slice(9) : error}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {output && (
                  <div>
                    {!error && !isRunning && (
                      <div className="flex items-center gap-2 mb-2" style={{ color: 'hsl(var(--terminal-success))' }}>
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="font-semibold">Output:</span>
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap text-[13px] leading-relaxed">{output}</pre>
                  </div>
                )}

                {/* Interactive input prompt */}
                {inputPrompt !== null && isRunning && (
                  <div className="mt-1">
                    <div className="flex items-center gap-0">
                      <span className="text-primary font-bold select-none">&gt;&nbsp;</span>
                      <input
                        ref={inputFieldRef}
                        type="text"
                        value={interactiveInput}
                        onChange={(e) => setInteractiveInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submitInteractiveInput();
                          }
                        }}
                        className={cn(
                          'flex-1 bg-transparent outline-none font-mono text-sm caret-primary',
                          'border-b border-primary/40 focus:border-primary pb-0.5',
                          isDark ? 'text-foreground' : 'text-foreground'
                        )}
                        placeholder="Type input and press Enter..."
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                )}

                <div ref={outputEndRef} />

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
        ) : (
          /* History tab */
          <div className="flex-1 overflow-auto animate-fade-in">
            {!isAuthenticated ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 text-muted-foreground">
                <History className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Sign in to view execution history</p>
              </div>
            ) : historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 text-muted-foreground">
                <History className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No execution history yet</p>
                <p className="text-xs mt-1 opacity-60">Run some code to see it here</p>
              </div>
            ) : (
              <div className="divide-y">
                {history.map((item) => {
                  const lang = (() => { try { return getLanguageById(item.language); } catch { return null; } })();
                  const firstLine = item.code?.split('\n').find((l) => l.trim()) || '(empty)';
                  const isError = String(item.status).toUpperCase() === 'ERROR';
                  return (
                    <button
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors group',
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{lang?.icon || '📄'}</span>
                          <span className="text-xs font-medium">{lang?.name || item.language}</span>
                          {isError ? (
                            <AlertCircle className="h-3 w-3 text-red-400" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {item.durationMs > 0 && (
                            <span className="font-mono">{item.durationMs}ms</span>
                          )}
                          <span><Clock className="h-3 w-3 inline mr-0.5" />{timeAgo(item.executedAt)}</span>
                          <Play className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                        </div>
                      </div>
                      <pre className={cn(
                        'text-[11px] truncate font-mono',
                        isDark ? 'text-muted-foreground' : 'text-muted-foreground/80'
                      )}>
                        {firstLine}
                      </pre>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
