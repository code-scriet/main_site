import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { emmetCSS, emmetHTML } from 'emmet-monaco-es';

export const BASE_MONACO_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
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
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  acceptSuggestionOnCommitCharacter: true,
  wordBasedSuggestions: 'currentDocument',
  snippetSuggestions: 'inline',
  suggestSelection: 'first',
  inlineSuggest: { enabled: true },
  suggest: {
    snippetsPreventQuickSuggestions: false,
    showSnippets: true,
    showWords: true,
    showKeywords: true,
    showFunctions: true,
    showClasses: true,
    showModules: true,
    showMethods: true,
    showVariables: true,
  },
};

/**
 * Touch/phone overrides layered on top of `BASE_MONACO_EDITOR_OPTIONS`.
 *
 * The goal is a usable editor on a ~360px viewport with a soft keyboard:
 *   - reclaim horizontal space (no folding gutter, no glyph margin, narrow
 *     line-number column, no overview ruler)
 *   - stop the soft keyboard fighting the editor: Enter must always insert a
 *     newline (never accept a suggestion) and Tab must always indent
 *   - remove hover/context-menu popups, which a long-press triggers constantly
 *   - grabbable scrollbars
 */
export const MOBILE_MONACO_OVERRIDES: editor.IStandaloneEditorConstructionOptions = {
  folding: false,
  glyphMargin: false,
  lineNumbersMinChars: 2,
  lineDecorationsWidth: 2,
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  stickyScroll: { enabled: false },
  contextmenu: false,
  hover: { enabled: false },
  parameterHints: { enabled: false },
  // Enter = newline, Tab = indent. Both are otherwise hijacked by the
  // suggestion widget, which is the single biggest phone-typing frustration.
  acceptSuggestionOnEnter: 'off',
  tabCompletion: 'off',
  scrollbar: {
    verticalScrollbarSize: 12,
    horizontalScrollbarSize: 12,
    useShadows: false,
  },
  padding: { top: 6, bottom: 24 },
  // A phone can't hover a scrollbar, so leave it always visible.
  scrollBeyondLastColumn: 2,
};

/**
 * The single place both editors resolve their options. Passing `touch` swaps in
 * the phone profile; desktop behaviour is byte-for-byte what it was before.
 */
export function getEditorOptions(opts: {
  touch: boolean;
  fontSize: number;
  readOnly?: boolean;
}): editor.IStandaloneEditorConstructionOptions {
  const { touch, fontSize, readOnly } = opts;
  return {
    ...BASE_MONACO_EDITOR_OPTIONS,
    ...(touch ? MOBILE_MONACO_OVERRIDES : {}),
    // 16px keeps iOS from zooming when the hidden input takes focus, and is
    // simply readable on a phone. Never shrink the user's chosen size.
    fontSize: touch ? Math.max(fontSize, 16) : fontSize,
    ...(readOnly === undefined ? {} : { readOnly }),
  };
}

type SnippetTemplate = {
  label: string;
  detail: string;
  insertText: string;
};

const LANGUAGE_KEYWORDS: Record<string, string[]> = {
  python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'import', 'from', 'return', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'global', 'nonlocal'],
  cpp: ['#include', 'using', 'namespace', 'std', 'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'class', 'struct', 'template', 'typename', 'public', 'private', 'protected', 'virtual', 'override', 'const', 'constexpr', 'auto', 'if', 'else', 'for', 'while', 'switch', 'case', 'return'],
  c: ['#include', 'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'struct', 'enum', 'typedef', 'static', 'const', 'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'sizeof'],
  java: ['class', 'interface', 'enum', 'public', 'private', 'protected', 'static', 'final', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'String', 'new', 'this', 'super', 'if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch', 'finally', 'return', 'import', 'package'],
  javascript: ['const', 'let', 'var', 'function', 'class', 'import', 'export', 'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'try', 'catch', 'finally', 'async', 'await', 'new'],
  typescript: ['const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum', 'implements', 'extends', 'import', 'export', 'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'try', 'catch', 'finally', 'async', 'await', 'new'],
  html: ['div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'h1', 'h2', 'h3', 'p', 'span', 'a', 'button', 'input', 'form', 'ul', 'li', 'img', 'script', 'style'],
  css: ['display', 'position', 'margin', 'padding', 'width', 'height', 'color', 'background', 'font-size', 'font-weight', 'grid', 'flex', 'justify-content', 'align-items', 'border', 'border-radius', 'box-shadow', 'transition'],
};

const LANGUAGE_SNIPPETS: Record<string, SnippetTemplate[]> = {
  python: [
    { label: 'if', detail: 'if statement', insertText: 'if ${1:condition}:\n    ${0:pass}' },
    { label: 'for', detail: 'for loop', insertText: 'for ${1:item} in ${2:iterable}:\n    ${0:pass}' },
    { label: 'def', detail: 'function', insertText: 'def ${1:function_name}(${2:args}):\n    ${0:pass}' },
  ],
  cpp: [
    { label: 'main', detail: 'main function', insertText: 'int main() {\n  ${0:return 0;}\n}' },
    { label: 'for', detail: 'for loop', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n  ${0}\n}' },
    { label: 'if', detail: 'if statement', insertText: 'if (${1:condition}) {\n  ${0}\n}' },
  ],
  c: [
    { label: 'main', detail: 'main function', insertText: 'int main(void) {\n  ${0:return 0;}\n}' },
    { label: 'for', detail: 'for loop', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n  ${0}\n}' },
    { label: 'if', detail: 'if statement', insertText: 'if (${1:condition}) {\n  ${0}\n}' },
  ],
  java: [
    { label: 'main', detail: 'main method', insertText: 'public static void main(String[] args) {\n  ${0}\n}' },
    { label: 'for', detail: 'for loop', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n  ${0}\n}' },
    { label: 'if', detail: 'if statement', insertText: 'if (${1:condition}) {\n  ${0}\n}' },
  ],
};

let enhancementsRegistered = false;

function registerFallbackCompletionProviders(monaco: Monaco) {
  const languageIds = new Set<string>([
    ...Object.keys(LANGUAGE_KEYWORDS),
    ...Object.keys(LANGUAGE_SNIPPETS),
  ]);

  for (const languageId of languageIds) {
    monaco.languages.registerCompletionItemProvider(languageId, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const snippetSuggestions = (LANGUAGE_SNIPPETS[languageId] ?? []).map((snippet, index) => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snippet.detail,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: `0${String(index).padStart(4, '0')}`,
        }));

        const keywordSuggestions = (LANGUAGE_KEYWORDS[languageId] ?? []).map((keyword, index) => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          detail: 'Keyword',
          range,
          sortText: `1${String(index).padStart(4, '0')}`,
        }));

        return {
          suggestions: [...snippetSuggestions, ...keywordSuggestions],
        };
      },
    });
  }
}

export function registerMonacoEmmet(monaco: Monaco) {
  if (enhancementsRegistered) return;
  emmetHTML(monaco);
  emmetCSS(monaco);
  registerFallbackCompletionProviders(monaco);
  enhancementsRegistered = true;
}
