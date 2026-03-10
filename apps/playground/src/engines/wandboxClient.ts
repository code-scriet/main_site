// ---------------------------------------------------------------------------
// Cloud Execution Client — Frontend-side caller for Tier 2
// ---------------------------------------------------------------------------
// Sends code to the backend proxy at /api/execute which forwards it through
// a Cloudflare Worker to the upstream compiler. Nothing about the upstream
// provider is ever exposed in DevTools or error messages.
// ---------------------------------------------------------------------------

import type { ExecutionResult, CloudExecutionRequest } from './types';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';
const CLOUD_TIMEOUT = 15_000; // 15 seconds (matches server timeout)

function isExpiredJwt(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || '')) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now() + 10_000;
  } catch {
    return false;
  }
}

function getAuthHeaders(): HeadersInit {
  const cookieMatch = document.cookie
    .split('; ')
    .find((row) => row.startsWith('scriet_session='));
  const token = cookieMatch
    ? decodeURIComponent(cookieMatch.split('=').slice(1).join('='))
    : (sessionStorage.getItem('pg_token') || localStorage.getItem('token'));

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && !isExpiredJwt(token)) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function executeViaCloud(
  request: CloudExecutionRequest,
  signal?: AbortSignal,
): Promise<ExecutionResult> {
  const controller = new AbortController();

  // Wire up external abort signal
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  // Hard timeout
  const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT);

  try {
    const response = await fetch(`${BACKEND_URL}/api/execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        language: request.language,
        code: request.code,
        stdin: request.stdin || '',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `Cloud execution failed: HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        const text = await response.text();
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          throw new Error(
            `Backend returned HTML instead of JSON.\n` +
            `Is the execution server running on ${BACKEND_URL}?`
          );
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Cloud execution failed');
    }

    return result.data as ExecutionResult;
  } finally {
    clearTimeout(timer);
  }
}
