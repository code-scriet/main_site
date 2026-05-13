import { useEffect, useRef, useState } from 'react';
import { Bolt, Clock3, Cloud, Cpu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlayground } from '@/context/PlaygroundContext';
import { CLIENT_SUPPORTED_LANGUAGES } from '@/engines/types';
import { cn } from '@/lib/utils';
import { useDailyQuota } from '@/hooks/useDailyQuota';
import { RequestResetDialog } from './RequestResetDialog';

function relativeSince(ms: number | null): string {
  if (!ms) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function StatusStrip() {
  const { isAuthenticated } = useAuth();
  const { language, code, isRunning, executionTime, executionTier, statusMessage } = usePlayground();
  const { quota, pendingResetRequest, quotaExhausted, refetch } = useDailyQuota();
  const [resetOpen, setResetOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const lastCodeRef = useRef(code);

  useEffect(() => {
    if (code !== lastCodeRef.current) {
      lastCodeRef.current = code;
      setSavedAt(Date.now());
    }
  }, [code, language.id]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const local = executionTier === 'client' || CLIENT_SUPPORTED_LANGUAGES.has(language.id);
  const statusLabel = quotaExhausted
    ? 'Daily limit reached'
    : isRunning
      ? (statusMessage || 'Running')
      : `Ready · ${language.name} ${local ? 'runs locally' : 'runs in cloud'}`;
  const savedAgo = savedAt ? relativeSince(savedAt) : '';
  void tick;

  return (
    <>
      <div
        className={cn(
          'flex min-h-9 items-center justify-between gap-3 border-t px-3 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400',
          quotaExhausted
            ? 'hatch border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
            : 'border-zinc-200 bg-warmwhite dark:border-zinc-800 dark:bg-inknight',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full ring-2',
              quotaExhausted
                ? 'bg-red-500 ring-red-500/20'
                : isRunning
                  ? 'animate-pulse bg-amber-400 ring-amber-400/20'
                  : 'bg-emerald-400 ring-emerald-400/20',
            )}
          />
          <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">{statusLabel}</span>
          {savedAgo && !quotaExhausted && (
            <span className="hidden text-zinc-400 sm:inline">Saved locally · {savedAgo}</span>
          )}
          {quotaExhausted && (
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="shrink-0 font-medium underline underline-offset-4 hover:text-red-600 dark:hover:text-red-200"
            >
              {pendingResetRequest ? 'Request sent · waiting' : 'Ask admin to reset'}
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 px-2 font-mono text-[10px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            {local ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
            {local ? 'Local · CPU' : 'Cloud'}
          </span>
          <span className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 px-2 font-mono text-[10px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            <Clock3 className="h-3 w-3" />
            {executionTime || '-- ms'}
          </span>
          <span
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded border px-2 font-mono text-[10px]',
              quotaExhausted
                ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                : 'border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300',
            )}
          >
            <Bolt className="h-3 w-3" />
            {isAuthenticated ? `${quota.todayCount} / ${quota.dailyLimit}` : 'Sign in'}
          </span>
        </div>
      </div>
      <RequestResetDialog
        open={resetOpen}
        pendingRequest={pendingResetRequest}
        onOpenChange={setResetOpen}
        onSent={refetch}
      />
    </>
  );
}
