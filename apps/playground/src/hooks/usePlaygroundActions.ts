import { useCallback } from 'react';
import { toast } from 'sonner';
import { usePlayground } from '@/context/PlaygroundContext';
import { useAuth } from '@/context/AuthContext';
import { useCodeExecution } from '@/hooks/useCodeExecution';
import { useDailyQuota } from '@/hooks/useDailyQuota';
import { useEditorHistoryContext } from '@/hooks/useEditorHistory';
import { createSnippet } from '@/utils/snippetsApi';
import { copyToClipboard } from '@/lib/utils';

export interface PlaygroundActions {
  runCode: () => Promise<void>;
  stopExecution: () => void;
  saveSnippet: () => Promise<void>;
  copyCode: () => Promise<void>;
  downloadCode: () => void;
  resetCode: () => void;
  toggleFullscreen: () => void;
  /** True when the buffer still matches the language's boilerplate (reset is a no-op). */
  atStarter: boolean;
  /** Run is blocked (quota spent, or an execution is already in flight). */
  runDisabled: boolean;
  isRunning: boolean;
  quotaExhausted: boolean;
}

/**
 * The free-playground toolbar actions, in one place so the desktop `Toolbar`
 * and the mobile action bar drive exactly the same behaviour instead of two
 * copies that can drift.
 *
 * Deliberately does NOT register keyboard shortcuts — the owner (PlaygroundPage)
 * registers them once, so a second consumer of this hook can't double-fire Run.
 */
export function usePlaygroundActions(): PlaygroundActions {
  const { code, language, clearOutput, isRunning } = usePlayground();
  const { isAuthenticated } = useAuth();
  const { runCode: execute, stopExecution } = useCodeExecution();
  const { quotaExhausted, pendingResetRequest } = useDailyQuota();
  const { reset } = useEditorHistoryContext();

  const runCode = useCallback(async () => {
    if (quotaExhausted) {
      toast.error(pendingResetRequest ? 'Reset request is waiting for admin approval' : 'Daily playground limit reached');
      return;
    }
    window.dispatchEvent(new Event('playground:run'));
    await execute();
  }, [execute, pendingResetRequest, quotaExhausted]);

  const saveSnippet = useCallback(async () => {
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
      toast.success(`Snippet "${saved.title}" saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save snippet');
    }
  }, [code, isAuthenticated, language.id]);

  const copyCode = useCallback(async () => {
    const success = await copyToClipboard(code);
    if (success) toast.success('Code copied');
    else toast.error('Failed to copy code');
  }, [code]);

  const downloadCode = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `code${language.fileExtension}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('Code downloaded');
  }, [code, language.fileExtension]);

  const atStarter = code === language.boilerplate;

  const resetCode = useCallback(() => {
    // The disabled state already guards the buttons; the keyboard shortcut can
    // still fire, so guard here too.
    if (code === language.boilerplate) return;
    if (!confirm('Reset your code to the starter template? You can undo this with Ctrl/Cmd+Z.')) return;
    // Undoable reset via Monaco's edit stack (not setValue), so Ctrl/Cmd+Z
    // restores the user's code immediately afterwards.
    reset(language.boilerplate);
    clearOutput();
    toast.success('Code reset');
  }, [clearOutput, code, language.boilerplate, reset]);

  const toggleFullscreen = useCallback(() => {
    // iOS Safari has no Element.requestFullscreen — fail with a hint instead of
    // throwing on an undefined method.
    if (typeof document.documentElement.requestFullscreen !== 'function') {
      toast.error('Fullscreen is not supported by this browser');
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => toast.error('Failed to enter fullscreen'));
      return;
    }
    document.exitFullscreen().catch(() => toast.error('Failed to exit fullscreen'));
  }, []);

  return {
    runCode,
    stopExecution,
    saveSnippet,
    copyCode,
    downloadCode,
    resetCode,
    toggleFullscreen,
    atStarter,
    runDisabled: quotaExhausted || isRunning,
    isRunning,
    quotaExhausted,
  };
}
