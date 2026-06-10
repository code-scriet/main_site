import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { editor, IDisposable } from 'monaco-editor';

/**
 * Monaco models expose `canUndo()` / `canRedo()` at runtime, but they are not
 * part of the public `ITextModel` typings. We narrow to this shape when reading
 * them so the button disabled states stay accurate without a global `any`.
 */
type ModelWithHistory = editor.ITextModel & {
  canUndo?: () => boolean;
  canRedo?: () => boolean;
};

export interface EditorHistory {
  /** Pass to `<Editor onMount={...} />` to wire history tracking to the instance. */
  handleMount: (instance: editor.IStandaloneCodeEditor) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /**
   * Replace the whole document with `starter` through an undoable edit, so the
   * user can press Ctrl/Cmd+Z immediately afterwards to get their code back.
   * Never uses `setValue()` (which would wipe the undo stack).
   */
  reset: (starter: string) => void;
}

/**
 * Shared editor-history controller for the Monaco editors (Playground + QOTD).
 *
 * Undo/redo go through Monaco's built-in history via `editor.trigger`, and the
 * disabled states are read from `model.canUndo()` / `model.canRedo()` on every
 * content/model change. Keeping this in one hook means both surfaces share the
 * exact same behavior instead of re-implementing it.
 */
export function useEditorHistory(): EditorHistory {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const refresh = useCallback(() => {
    const model = editorRef.current?.getModel() as ModelWithHistory | null | undefined;
    setCanUndo(Boolean(model?.canUndo?.()));
    setCanRedo(Boolean(model?.canRedo?.()));
  }, []);

  const disposeListeners = useCallback(() => {
    for (const disposable of disposablesRef.current) disposable.dispose();
    disposablesRef.current = [];
  }, []);

  const handleMount = useCallback(
    (instance: editor.IStandaloneCodeEditor) => {
      // A remount hands us a fresh instance — tear down the listeners wired to the
      // previous one first, otherwise they leak and `refresh` fires once per stale
      // listener on every edit.
      disposeListeners();
      editorRef.current = instance;
      refresh();
      // Content edits and model swaps (language/question switches via the `path`
      // prop) both change what undo/redo can do — re-read after each. Track the
      // disposables so they can be torn down on remount/unmount.
      disposablesRef.current.push(
        instance.onDidChangeModelContent(refresh),
        instance.onDidChangeModel(refresh),
      );
    },
    [disposeListeners, refresh],
  );

  // Dispose listeners when the hook unmounts so they never outlive the editor.
  useEffect(() => disposeListeners, [disposeListeners]);

  const undo = useCallback(() => {
    const instance = editorRef.current;
    if (!instance) return;
    instance.focus();
    instance.trigger('editor-history', 'undo', null);
    refresh();
  }, [refresh]);

  const redo = useCallback(() => {
    const instance = editorRef.current;
    if (!instance) return;
    instance.focus();
    instance.trigger('editor-history', 'redo', null);
    refresh();
  }, [refresh]);

  const reset = useCallback(
    (starter: string) => {
      const instance = editorRef.current;
      const model = instance?.getModel();
      if (!instance || !model) return;
      // pushUndoStop boundaries make the whole replacement a single undo step.
      instance.pushUndoStop();
      instance.executeEdits('editor-history-reset', [
        { range: model.getFullModelRange(), text: starter },
      ]);
      instance.pushUndoStop();
      instance.focus();
      refresh();
    },
    [refresh],
  );

  // Stable identity (the callbacks are already memoized) so context consumers
  // don't re-render — and dependents like QOTD's reset shortcut don't re-subscribe
  // — on every parent render. Only the canUndo/canRedo state flips the reference.
  return useMemo(
    () => ({ handleMount, canUndo, canRedo, undo, redo, reset }),
    [handleMount, canUndo, canRedo, undo, redo, reset],
  );
}

/**
 * Bridges the single editor instance from the Playground's `CodeEditor` to its
 * sibling `Toolbar` (they live in different components). QOTD doesn't need this
 * — its editor and controls share one component, so it calls `useEditorHistory`
 * directly.
 */
const EditorHistoryContext = createContext<EditorHistory | null>(null);

export const EditorHistoryProvider = EditorHistoryContext.Provider;

export function useEditorHistoryContext(): EditorHistory {
  const ctx = useContext(EditorHistoryContext);
  if (!ctx) {
    throw new Error('useEditorHistoryContext must be used within an EditorHistoryProvider');
  }
  return ctx;
}
