const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';

function getAuthHeaders(): HeadersInit {
  // Read token from cookie or localStorage
  const cookieMatch = document.cookie
    .split('; ')
    .find((row) => row.startsWith('scriet_session='));
  const token = cookieMatch
    ? decodeURIComponent(cookieMatch.split('=').slice(1).join('='))
    : localStorage.getItem('token');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
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
