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

export function getPlaygroundPublicUrl(path = '/'): string {
  return buildPlaygroundUrl(path).toString();
}

/**
 * Build a playground URL and append auth token in hash for one-time handoff.
 * Hash is consumed and removed by playground AuthContext on load.
 */
export function getPlaygroundLaunchUrl(path = '/'): string {
  const url = buildPlaygroundUrl(path);
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      url.hash = `token=${encodeURIComponent(token)}`;
    }
  }
  return url.toString();
}
