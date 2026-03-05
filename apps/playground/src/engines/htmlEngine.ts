// ---------------------------------------------------------------------------
// HTML/CSS/JS Client-Side Execution Engine — Sandboxed iframe
// ---------------------------------------------------------------------------
// For the "web" language, we render user HTML/CSS/JS directly in a sandboxed
// iframe. This is purely display-oriented (no stdout/stderr), but we still
// return an ExecutionResult for API consistency.
//
// The OutputPanel already has a WebPreview component that uses iframe srcDoc.
// This engine exists so the ExecutionRouter can treat "web" uniformly ‒ it
// always returns "success" since the iframe rendering is handled by the UI.
// ---------------------------------------------------------------------------

import type { ExecutionResult } from './types';

/**
 * "Execute" HTML/CSS/JS — always succeeds because the iframe renders it.
 * The actual rendering is done in OutputPanel's WebPreview component.
 */
export async function executeHtml(
  code: string,
  _stdin?: string,
  _signal?: AbortSignal,
): Promise<ExecutionResult> {
  // Basic validation
  if (!code.trim()) {
    return {
      language: 'web',
      version: 'browser',
      provider: 'client',
      run: {
        stdout: '',
        stderr: 'No HTML content to render.',
        code: 1,
        signal: null,
        output: '',
      },
    };
  }

  return {
    language: 'web',
    version: 'browser',
    provider: 'client',
    run: {
      stdout: 'Web preview rendered successfully.',
      stderr: '',
      code: 0,
      signal: null,
      output: 'Web preview rendered successfully.',
    },
  };
}
