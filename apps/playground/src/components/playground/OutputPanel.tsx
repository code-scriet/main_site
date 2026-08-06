import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Trash2, Terminal, AlertCircle, CheckCircle2, Loader2,
  ChevronUp, ChevronDown, History, Clock, Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

type Tab = 'output' | 'history' | 'tests';

export interface OutputPanelProps {
  /**
   * Phone layout moves stdin to its own pane (a collapsible block inside an
   * already-short output area is unusable on a 360px screen), so it is hidden
   * here and rendered by `StdinPanel` instead.
   */
  showStdin?: boolean;
}

/**
 * Standalone stdin editor. Shared by the desktop OutputPanel (collapsible) and
 * the phone layout's dedicated "Input" pane.
 */
function StdinBody({ fill }: { fill: boolean }) {
  const { stdin, setStdin, language } = usePlayground();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isCloudOnly = !CLIENT_SUPPORTED_LANGUAGES.has(language.id);

  return (
    <div className={cn('px-4 pb-3', fill && 'flex min-h-0 flex-1 flex-col pt-3')}>
      {isCloudOnly && (
        <p className="mb-2 text-xs text-muted-foreground">
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
          'resize-none font-mono text-sm',
          fill ? 'min-h-0 flex-1' : 'min-h-[70px]',
          isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white',
        )}
      />
    </div>
  );
}

/**
 * The phone layout's dedicated "Input" pane: stdin filling the pane, no
 * collapsible chrome (the pane rail already owns show/hide).
 */
export function StdinPanel() {
  const { theme } = useTheme();
  return (
    <div className={cn('flex h-full flex-col transition-colors', theme === 'dark' ? 'bg-inknight' : 'bg-warmwhite')}>
      <StdinBody fill />
    </div>
  );
}

/**
 * Desktop: a collapsible stdin block docked under the output.
 *
 * Kept separate from `StdinPanel` rather than sharing an `alwaysOpen` flag —
 * the flag made the collapse state and its auto-expand effect dead weight that
 * still re-rendered on every language change, and forked the classNames in
 * three places for two layouts that share only the textarea.
 */
function CollapsibleStdin() {
  const { language } = usePlayground();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isCloudOnly = !CLIENT_SUPPORTED_LANGUAGES.has(language.id);
  const [collapsed, setCollapsed] = useState(true);

  // Auto-expand when switching to a cloud-only language (C/C++/Java), where all
  // input must be supplied upfront.
  useEffect(() => {
    if (isCloudOnly) setCollapsed(false);
  }, [isCloudOnly]);

  return (
    <div className={cn('order-last border-t transition-colors', isDark ? 'bg-inknight' : 'bg-warmwhite')}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex min-h-[2.75rem] w-full items-center justify-between px-4 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        <span>
          {collapsed ? '+ Add input (stdin)   ⌘I' : 'Input (stdin)'}
          {isCloudOnly && <span className="ml-2 font-normal">required for {language.name} input</span>}
        </span>
        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
      {!collapsed && <StdinBody fill={false} />}
    </div>
  );
}

export function OutputPanel({ showStdin = true }: OutputPanelProps = {}) {
  const {
    output,
    error,
    isRunning,
    statusMessage,
    executionTime,
    executionTier,
    clearOutput,
    language,
    setCode,
    setLanguage,
    inputPrompt,
    inputResolverRef,
  } = usePlayground();
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();

  const commandPreamble = useMemo(() => {
    const runner = (() => {
      switch (language.id) {
        case 'python': return executionTier === 'client' ? `python main.py · pyodide` : `python main.py · cloud`;
        case 'javascript': return `node main.js · web worker`;
        case 'typescript': return `ts-node main.ts · web worker`;
        case 'cpp': return `g++ -O2 -std=c++17 main.cpp · cloud`;
        case 'c': return `gcc -O2 main.c · cloud`;
        case 'java': return `javac Main.java · cloud`;
        case 'web': return `preview · iframe`;
        default: return `${language.id}${language.fileExtension ?? ''}`;
      }
    })();
    return `› ${runner}`;
  }, [language.id, language.fileExtension, executionTier]);

  const isWarning = Boolean(error?.startsWith('Warning:'));
  const failed = Boolean(error) && !isWarning;
  const hasRunOutput = Boolean(output || error);
  const exitLine = useMemo(() => {
    if (!hasRunOutput || isRunning) return null;
    const time = executionTime || '—';
    return failed
      ? `› process exited with code 1 in ${time}`
      : `› process exited with code 0 in ${time}`;
  }, [hasRunOutput, isRunning, failed, executionTime]);

  const isWebLanguage = language.id === 'web';
  const isDark = theme === 'dark';
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
      {!isWebLanguage && showStdin && <CollapsibleStdin />}

      {/* Output / History Section */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Tab header */}
        <div className={cn(
          'flex items-center justify-between px-3 py-2 border-b transition-colors',
          isDark ? 'bg-inknight border-zinc-800' : 'bg-warmwhite border-zinc-200'
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
                    'relative flex min-h-[2.25rem] items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    activeTab === 'output'
                      ? 'text-amber-500 after:absolute after:-bottom-2 after:left-3 after:right-3 after:h-0.5 after:bg-amber-400'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  )}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Output
                </button>

                {/* History tab */}
                <button
                  onClick={() => setActiveTab('history')}
                  className={cn(
                    'relative flex min-h-[2.25rem] items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    activeTab === 'history'
                      ? 'text-amber-500 after:absolute after:-bottom-2 after:left-3 after:right-3 after:h-0.5 after:bg-amber-400'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                  {history.length > 0 && (
                    <span className="rounded bg-zinc-200 px-1.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {history.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('tests')}
                  className={cn(
                    'relative flex min-h-[2.25rem] items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    activeTab === 'tests'
                      ? 'text-amber-500 after:absolute after:-bottom-2 after:left-3 after:right-3 after:h-0.5 after:bg-amber-400'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Tests
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
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
          <div className="flex-1 overflow-auto p-4 font-mono text-[12.5px] leading-relaxed terminal-output animate-fade-in">
            {isWebLanguage ? (
              <WebPreview />
            ) : isRunning && !output && !error && inputPrompt === null ? (
              <>
                <p className="text-zinc-500 dark:text-zinc-400">{commandPreamble}</p>
                <div className="mt-2 flex items-center gap-2 text-amber-600 dark:text-amber-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{statusMessage || 'Executing code…'}</span>
                </div>
              </>
            ) : !hasRunOutput && !isRunning && inputPrompt === null ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12"
                   style={{ color: 'hsl(var(--terminal-muted))' }}>
                <Terminal className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Click <strong>Run</strong> to execute. Output appears here.</p>
                <p className="text-xs mt-1 opacity-60">
                  {language.name} • {language.tiers.includes('client') ? 'Runs locally in browser' : 'Runs on cloud'}
                </p>
              </div>
            ) : (
              <>
                <p className="text-zinc-500 dark:text-zinc-400">{commandPreamble}</p>

                {output && (
                  <pre className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{output}</pre>
                )}

                {isWarning && (
                  <pre className="mt-2 whitespace-pre-wrap text-amber-600 dark:text-amber-300">
                    <span className="font-semibold">warning: </span>{error?.slice(9)}
                  </pre>
                )}

                {failed && (
                  <pre className="mt-2 whitespace-pre-wrap text-red-600 dark:text-red-400">{error}</pre>
                )}

                {/* Interactive input prompt — inline, like a real terminal */}
                {inputPrompt !== null && isRunning && (
                  <div className="mt-2 flex items-center gap-1">
                    <span className="select-none text-amber-600 dark:text-amber-300">›</span>
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
                        'flex-1 bg-transparent outline-none font-mono text-[12.5px] caret-amber-500',
                        'border-b border-amber-500/30 focus:border-amber-500 pb-0.5',
                        'text-zinc-800 dark:text-zinc-100'
                      )}
                      placeholder="Type input and press Enter…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                )}

                {exitLine && (
                  <p className={cn(
                    'mt-3',
                    failed ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400',
                  )}>
                    {exitLine}
                  </p>
                )}

                <div ref={outputEndRef} />
              </>
            )}
          </div>
        ) : activeTab === 'history' ? (
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
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-zinc-500 dark:text-zinc-400">
            <CheckCircle2 className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Open a problem to use the test runner</p>
            <p className="mt-1 max-w-sm text-xs">
              Tests are wired to QOTD and practice problems. Open one from the
              <span className="font-mono"> ?qotd=today </span>
              link or the Practice button on the language rail.
            </p>
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
