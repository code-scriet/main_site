import Editor, { type Monaco } from '@monaco-editor/react';
import { useCallback } from 'react';
import { emmetHTML, emmetCSS } from 'emmet-monaco-es';
import { usePlayground } from '@/context/PlaygroundContext';
import { useTheme } from '@/context/ThemeContext';
import { Loader2 } from 'lucide-react';

export function CodeEditor() {
  const { code, setCode, language, fontSize } = usePlayground();
  const { editorTheme } = useTheme();

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
    }
  };

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    emmetHTML(monaco);
    emmetCSS(monaco);
  }, []);

  return (
    <div className="w-full h-full code-editor-container">
      <Editor
        height="100%"
        language={language.monacoId}
        value={code}
        onChange={handleEditorChange}
        beforeMount={handleBeforeMount}
        theme={editorTheme}
        options={{
          fontSize,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          lineNumbers: 'on',
          folding: true,
          renderWhitespace: 'selection',
          bracketPairColorization: {
            enabled: true,
          },
          tabCompletion: 'on',
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          suggest: {
            snippetsPreventQuickSuggestions: false,
            showSnippets: true,
            showWords: true,
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      />
    </div>
  );
}
