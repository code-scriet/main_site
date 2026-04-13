import { getStoredAuthToken } from './authToken';

const BASE_PLAYGROUND_URL =
  import.meta.env.VITE_PLAYGROUND_URL ||
  (import.meta.env.DEV ? 'http://localhost:5174' : 'https://code.codescriet.dev');

function getBaseUrl(): string {
  return BASE_PLAYGROUND_URL.replace(/\/+$/, '');
}

function buildPlaygroundUrl(path = '/'): URL {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getBaseUrl()}/`);
}

function getWebApiOriginForHandoff(): string | null {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!apiBase) {
    return import.meta.env.DEV ? 'http://localhost:5001' : 'https://api.codescriet.dev';
  }
  try {
    const parsed = new URL(apiBase, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isPlaygroundOrigin(origin: string): boolean {
  if (origin === getBaseUrl()) return true;
  if (import.meta.env.DEV) {
    return origin === 'http://localhost:5174' || origin === 'http://127.0.0.1:5174';
  }
  return origin === 'https://code.codescriet.dev';
}

export function addPlaygroundAuthHandoff(url: URL): void {
  if (!isPlaygroundOrigin(url.origin) || typeof window === 'undefined') return;

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const token = getStoredAuthToken();
  if (token) {
    hashParams.set('token', token);
  }

  const apiOrigin = getWebApiOriginForHandoff();
  if (apiOrigin) {
    hashParams.set('api', apiOrigin);
  }

  url.hash = hashParams.toString();
}

export function getPlaygroundPublicUrl(path = '/'): string {
  return buildPlaygroundUrl(path).toString();
}

/**
 * Build a playground URL and append auth token in hash for one-time handoff.
 * Hash is consumed and removed by playground AuthContext on load.
 */
export function getPlaygroundLaunchUrl(path = '/'): string {
  const url = buildPlaygroundUrl(path);
  addPlaygroundAuthHandoff(url);
  return url.toString();
}
