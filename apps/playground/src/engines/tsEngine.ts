// ---------------------------------------------------------------------------
// TypeScript Client-Side Execution Engine
// ---------------------------------------------------------------------------
// 1. Transpiles TS → JS using the TypeScript compiler API loaded from CDN
// 2. Runs the resulting JS in a Web Worker sandbox (same as jsEngine)
// Zero server calls. Compiler is cached by the browser after first load.
// ---------------------------------------------------------------------------

import { executeJavaScript, type InteractiveCallbacks } from './jsEngine';
import type { ExecutionResult } from './types';

let tsModule: typeof import('typescript') | null = null;
let tsLoadPromise: Promise<typeof import('typescript')> | null = null;

/**
 * Load the TypeScript compiler from CDN (cached by browser after first load).
 * We use the global `ts` variable that the CDN script exposes.
 */
async function loadTypeScriptCompiler(): Promise<typeof import('typescript')> {
  if (tsModule) return tsModule;
  if (tsLoadPromise) return tsLoadPromise;

  tsLoadPromise = new Promise<typeof import('typescript')>((resolve, reject) => {
    // Check if already loaded via script tag
    if ((globalThis as Record<string, unknown>).ts) {
      tsModule = (globalThis as Record<string, unknown>).ts as typeof import('typescript');
      resolve(tsModule);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/typescript@5.6.2/lib/typescript.min.js';
    script.onload = () => {
      tsModule = (globalThis as Record<string, unknown>).ts as typeof import('typescript');
      if (!tsModule) {
        reject(new Error('TypeScript compiler loaded but `ts` global not found'));
        return;
      }
      resolve(tsModule);
    };
    script.onerror = () => {
      tsLoadPromise = null;
      reject(new Error('Failed to load TypeScript compiler from CDN'));
    };
    document.head.appendChild(script);
  });

  return tsLoadPromise;
}

export async function executeTypeScript(
  code: string,
  stdin?: string,
  signal?: AbortSignal,
  callbacks?: InteractiveCallbacks,
): Promise<ExecutionResult> {
  try {
    const ts = await loadTypeScriptCompiler();

    // Transpile TS to JS
    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.None,
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: false,
        sourceMap: false,
      },
      reportDiagnostics: true,
    });

    // Check for compilation errors
    const diagnostics = transpiled.diagnostics || [];
    const errors = diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d) => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        if (d.file && d.start !== undefined) {
          const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
          return `TS${d.code}: (${line + 1}:${character + 1}) ${message}`;
        }
        return `TS${d.code}: ${message}`;
      });

    if (errors.length > 0) {
      return {
        language: 'typescript',
        version: 'browser (tsc 5.6.2)',
        provider: 'client',
        run: {
          stdout: '',
          stderr: '',
          code: 1,
          signal: null,
          output: '',
        },
        compile: {
          stdout: '',
          stderr: errors.join('\n'),
          code: 1,
          signal: null,
          output: errors.join('\n'),
        },
      };
    }

    // Run the transpiled JS in a Web Worker
    const jsResult = await executeJavaScript(transpiled.outputText, stdin, signal, callbacks);

    return {
      ...jsResult,
      language: 'typescript',
      version: 'browser (tsc 5.6.2)',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      language: 'typescript',
      version: 'browser',
      provider: 'client',
      run: {
        stdout: '',
        stderr: `TypeScript engine error: ${message}`,
        code: 1,
        signal: null,
        output: '',
      },
    };
  }
}

/** Start loading the TS compiler from CDN so it's ready when needed */
export function preloadTypeScript(): void {
  loadTypeScriptCompiler().catch(() => {});
}

/** Returns true if the TS compiler has already been loaded */
export function isTypeScriptReady(): boolean {
  return tsModule !== null;
}
