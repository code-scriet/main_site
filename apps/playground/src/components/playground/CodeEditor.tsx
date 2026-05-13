import Editor from '@monaco-editor/react';
import { useEffect, useState } from 'react';
import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { BASE_MONACO_EDITOR_OPTIONS, registerMonacoEmmet } from '@/lib/monacoEditor';
import { Loader2 } from 'lucide-react';

const COACH_STORAGE_KEY = 'playground:coached';

export function CodeEditor() {
  const { code, setCode, language, fontSize } = usePlayground();
  const { editorTheme } = useTheme();
  const [showCoach, setShowCoach] = useState(() => localStorage.getItem(COACH_STORAGE_KEY) !== '1');

  const dismissCoach = () => {
    if (!showCoach) return;
    localStorage.setItem(COACH_STORAGE_KEY, '1');
    setShowCoach(false);
  };

  useEffect(() => {
    const onRun = () => {
      if (localStorage.getItem(COACH_STORAGE_KEY) === '1') return;
      localStorage.setItem(COACH_STORAGE_KEY, '1');
      setShowCoach(false);
    };
    window.addEventListener('playground:run', onRun);
    return () => window.removeEventListener('playground:run', onRun);
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      if (value !== code) dismissCoach();
      setCode(value);
    }
  };

  return (
    <div className="relative w-full h-full code-editor-container">
      {showCoach && (
        <div className="pointer-events-none absolute right-6 top-3 z-10 hidden max-w-[260px] text-right font-mono text-[12px] italic leading-5 text-zinc-600 dark:text-zinc-500 sm:block">
          <div>// First time? Press ⌘ + ↵ or click Run to execute.</div>
          <div>// This hint disappears once you start typing.</div>
        </div>
      )}
      <Editor
        height="100%"
        language={language.monacoId}
        value={code}
        onChange={handleEditorChange}
        beforeMount={registerMonacoEmmet}
        theme={editorTheme}
        options={{ ...BASE_MONACO_EDITOR_OPTIONS, fontSize }}
        loading={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      />
    </div>
  );
}
