import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { getLanguageById, DEFAULT_LANGUAGE, type LanguageConfig } from '../utils/languageConfig';
import { debounce } from '../lib/utils';
// Pyodide, JS, and TS engines are preloaded in main.tsx

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  passed?: boolean;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  examples: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  constraints: string[];
  testCases: TestCase[];
}

interface PlaygroundState {
  code: string;
  language: LanguageConfig;
  stdin: string;
  output: string;
  error: string;
  isRunning: boolean;
  executionTime: string;
  fontSize: number;
  showProblemPanel: boolean;
  currentProblem: Problem | null;
  /** Which tier ran the last execution ('client' | 'cloud' | null) */
  executionTier: 'client' | 'cloud' | null;
  /** Status message shown during execution (e.g. "Loading Python runtime...") */
  statusMessage: string;
}

interface PlaygroundContextType extends PlaygroundState {
  setCode: (code: string) => void;
  setLanguage: (languageId: string) => void;
  setStdin: (stdin: string) => void;
  setOutput: (output: string) => void;
  setError: (error: string) => void;
  setIsRunning: (isRunning: boolean) => void;
  setExecutionTime: (time: string) => void;
  setExecutionTier: (tier: 'client' | 'cloud' | null) => void;
  setStatusMessage: (message: string) => void;
  resetCode: () => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  toggleProblemPanel: () => void;
  setCurrentProblem: (problem: Problem | null) => void;
  clearOutput: () => void;
  /** Non-null when the running program is waiting for user input */
  inputPrompt: string | null;
  setInputPrompt: (prompt: string | null) => void;
  /** Ref holding the resolve callback for the current input request */
  inputResolverRef: React.MutableRefObject<((value: string) => void) | null>;
}

const PlaygroundContext = createContext<PlaygroundContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'playground-state';
const AUTO_SAVE_DELAY = 2000; // 2 seconds

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const [inputPrompt, setInputPrompt] = useState<string | null>(null);
  const inputResolverRef = useRef<((value: string) => void) | null>(null);

  const [state, setState] = useState<PlaygroundState>(() => {
    // Load from localStorage
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          language: getLanguageById(parsed.languageId || DEFAULT_LANGUAGE),
          isRunning: false,
          output: '',
          error: '',
          executionTime: '',
          executionTier: null,
          statusMessage: '',
        };
      } catch (error) {
        console.error('Failed to parse saved state:', error);
      }
    }

    const defaultLanguage = getLanguageById(DEFAULT_LANGUAGE);
    return {
      code: defaultLanguage.boilerplate,
      language: defaultLanguage,
      stdin: '',
      output: '',
      error: '',
      isRunning: false,
      executionTime: '',
      fontSize: 14,
      showProblemPanel: false,
      currentProblem: null,
      executionTier: null,
      statusMessage: '',
    };
  });

  // Check for snippet loaded from Snippets page
  useEffect(() => {
    const raw = sessionStorage.getItem('load-snippet');
    if (raw) {
      sessionStorage.removeItem('load-snippet');
      try {
        const { language: langId, code } = JSON.parse(raw);
        if (langId && code) {
          const lang = getLanguageById(langId);
          setState((prev) => ({ ...prev, language: lang, code, output: '', error: '' }));
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Auto-save to localStorage
  const saveToLocalStorage = useCallback(
    debounce((stateToSave: PlaygroundState) => {
      try {
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({
            code: stateToSave.code,
            languageId: stateToSave.language.id,
            stdin: stateToSave.stdin,
            fontSize: stateToSave.fontSize,
          })
        );
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }
    }, AUTO_SAVE_DELAY),
    []
  );

  useEffect(() => {
    saveToLocalStorage(state);
  }, [state.code, state.language, state.stdin, state.fontSize, saveToLocalStorage]);

  // Engines are preloaded unconditionally in main.tsx

  const setCode = (code: string) => {
    setState((prev) => ({ ...prev, code }));
  };

  const setLanguage = (languageId: string) => {
    const newLanguage = getLanguageById(languageId);
    setState((prev) => ({
      ...prev,
      language: newLanguage,
      code: newLanguage.boilerplate,
      output: '',
      error: '',
    }));
  };

  const setStdin = (stdin: string) => {
    setState((prev) => ({ ...prev, stdin }));
  };

  const setOutput = (output: string) => {
    setState((prev) => ({ ...prev, output }));
  };

  const setError = (error: string) => {
    setState((prev) => ({ ...prev, error }));
  };

  const setIsRunning = (isRunning: boolean) => {
    setState((prev) => ({ ...prev, isRunning }));
  };

  const setExecutionTime = (executionTime: string) => {
    setState((prev) => ({ ...prev, executionTime }));
  };

  const setExecutionTier = (executionTier: 'client' | 'cloud' | null) => {
    setState((prev) => ({ ...prev, executionTier }));
  };

  const setStatusMessage = (statusMessage: string) => {
    setState((prev) => ({ ...prev, statusMessage }));
  };

  const resetCode = () => {
    setState((prev) => ({
      ...prev,
      code: prev.language.boilerplate,
      output: '',
      error: '',
      executionTime: '',
    }));
  };

  const increaseFontSize = () => {
    setState((prev) => ({
      ...prev,
      fontSize: Math.min(prev.fontSize + 2, 24),
    }));
  };

  const decreaseFontSize = () => {
    setState((prev) => ({
      ...prev,
      fontSize: Math.max(prev.fontSize - 2, 10),
    }));
  };

  const toggleProblemPanel = () => {
    setState((prev) => ({
      ...prev,
      showProblemPanel: !prev.showProblemPanel,
    }));
  };

  const setCurrentProblem = (problem: Problem | null) => {
    setState((prev) => ({
      ...prev,
      currentProblem: problem,
      showProblemPanel: problem !== null,
    }));
  };

  const clearOutput = () => {
    setState((prev) => ({
      ...prev,
      output: '',
      error: '',
      executionTime: '',
      executionTier: null,
      statusMessage: '',
    }));
  };

  const value: PlaygroundContextType = {
    ...state,
    setCode,
    setLanguage,
    setStdin,
    setOutput,
    setError,
    setIsRunning,
    setExecutionTime,
    setExecutionTier,
    setStatusMessage,
    resetCode,
    increaseFontSize,
    decreaseFontSize,
    toggleProblemPanel,
    setCurrentProblem,
    clearOutput,
    inputPrompt,
    setInputPrompt,
    inputResolverRef,
  };

  return (
    <PlaygroundContext.Provider value={value}>
      {children}
    </PlaygroundContext.Provider>
  );
}

export function usePlayground() {
  const context = useContext(PlaygroundContext);
  if (context === undefined) {
    throw new Error('usePlayground must be used within a PlaygroundProvider');
  }
  return context;
}
