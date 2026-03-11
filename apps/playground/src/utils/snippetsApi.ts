const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';

function isExpiredJwt(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || '')) as { exp?: number };
    if (!payload.exp) return false;
    // Consider token expired if within 10 seconds of expiry.
    return payload.exp * 1000 <= Date.now() + 10_000;
  } catch {
    return false;
  }
}

function getAuthHeaders(): HeadersInit {
  // Token priority: sessionStorage pg_token (set by AuthContext after /auth/me)
  // then localStorage token (email/password logins on same origin).
  // The scriet_session cookie is httpOnly so JS can't read it, but the browser
  // sends it automatically via credentials: 'include'.
  const token = sessionStorage.getItem('pg_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && !isExpiredJwt(token)) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export interface Snippet {
  id: string;
  userId: string;
  userName: string;
  title: string;
  language: string;
  code: string;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

/** List current user's snippets */
export async function listSnippets(): Promise<Snippet[]> {
  const res = await fetch(`${BACKEND_URL}/api/snippets`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to list snippets');
  return data.data;
}

/** Save a new snippet */
export async function createSnippet(input: {
  title: string;
  language: string;
  code: string;
  isPublic?: boolean;
}): Promise<Snippet> {
  const res = await fetch(`${BACKEND_URL}/api/snippets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to save snippet');
  return data.data;
}

/** Update an existing snippet */
export async function updateSnippet(
  id: string,
  input: Partial<{ title: string; language: string; code: string; isPublic: boolean }>,
): Promise<Snippet> {
  const res = await fetch(`${BACKEND_URL}/api/snippets/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to update snippet');
  return data.data;
}

/** Delete a snippet */
export async function deleteSnippet(id: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/snippets/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to delete snippet');
}

/** Get a publicly shared snippet (no auth needed) */
export async function getSharedSnippet(shareToken: string): Promise<Snippet> {
  const res = await fetch(`${BACKEND_URL}/api/snippets/shared/${shareToken}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Snippet not found');
  return data.data;
}

/** Build the share URL for a snippet */
export function getShareUrl(shareToken: string): string {
  const base = import.meta.env.DEV ? 'http://localhost:5174' : 'https://code.codescriet.dev';
  return `${base}/s/${shareToken}`;
}

// ---------------------------------------------------------------------------
// Execution History & Stats
// ---------------------------------------------------------------------------

export interface ExecutionHistoryItem {
  id: string;
  language: string;
  code: string;
  output: string;
  durationMs: number;
  status: string;
  executedAt: string;
}

export interface LanguageStat {
  language: string;
  count: number;
}

export interface ExecutionStats {
  languageStats: LanguageStat[];
  todayCount: number;
  dailyLimit: number;
}

export interface SessionBootstrapData {
  history: ExecutionHistoryItem[];
  stats: ExecutionStats;
}

export interface SessionPreflight {
  allowed: boolean;
  metered?: boolean;
  todayCount: number;
  dailyLimit: number;
  remaining: number;
}

/** Fetch last 20 execution history entries (with code) */
export async function getExecutionHistory(): Promise<ExecutionHistoryItem[]> {
  const res = await fetch(`${BACKEND_URL}/api/executions/history`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await res.json();
  if (!data.success) return [];
  return data.data;
}

/** Fetch execution stats (language counters, daily usage) */
export async function getExecutionStats(): Promise<ExecutionStats> {
  const res = await fetch(`${BACKEND_URL}/api/executions/stats`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await res.json();
  if (!data.success) return { languageStats: [], todayCount: 0, dailyLimit: 100 };
  return data.data;
}

/** Session bootstrap: read history + limit once at session start */
export async function getSessionBootstrap(): Promise<SessionBootstrapData> {
  const res = await fetch(`${BACKEND_URL}/api/session/bootstrap`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await res.json();
  if (!data.success) {
    return {
      history: [],
      stats: { languageStats: [], todayCount: 0, dailyLimit: 100 },
    };
  }
  return data.data;
}

// Preflight cache — avoids a network round-trip on every execution
let _preflightCache: { data: SessionPreflight; ts: number; lang: string } | null = null;
const PREFLIGHT_TTL = 60_000; // 60 seconds

/** Check if the user can run one more execution in current session */
export async function getSessionPreflight(language?: string): Promise<SessionPreflight> {
  const lang = language || '';
  if (
    _preflightCache &&
    _preflightCache.lang === lang &&
    Date.now() - _preflightCache.ts < PREFLIGHT_TTL &&
    _preflightCache.data.remaining > 0
  ) {
    return _preflightCache.data;
  }

  const query = language ? `?language=${encodeURIComponent(language)}` : '';
  const res = await fetch(`${BACKEND_URL}/api/session/preflight${query}`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const data = await res.json();
  if (!data.success) {
    const fallback = { allowed: true, todayCount: 0, dailyLimit: 100, remaining: 100 };
    _preflightCache = { data: fallback, ts: Date.now(), lang };
    return fallback;
  }
  _preflightCache = { data: data.data, ts: Date.now(), lang };
  return data.data;
}

/** Decrement the locally cached preflight remaining count after an execution */
export function decrementPreflightCache(): void {
  if (_preflightCache) {
    _preflightCache.data.remaining = Math.max(0, _preflightCache.data.remaining - 1);
    _preflightCache.data.todayCount++;
  }
}

/** Record a client-side execution into the user's server-side session cache */
export async function recordClientExecution(input: {
  language: string;
  code: string;
  output: string;
  durationMs: number;
  status: 'SUCCESS' | 'ERROR';
}): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/session/record`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to record execution');
  }
}

/** Flush in-memory session usage/history to DB */
export async function endExecutionSession(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/session/end`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    // ignore unload/network errors
  }
}
