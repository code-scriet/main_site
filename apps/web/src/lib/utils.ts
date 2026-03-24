import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getWebAppOrigin(): string {
  const configuredOrigin = (import.meta.env.VITE_PUBLIC_WEB_ORIGIN as string | undefined)?.trim();
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, '');
  }

  // In browser runtime, always trust the current web origin.
  // This prevents leaking backend/API hosts (for example in quiz QR/join links).
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (apiUrl) {
    try {
      const parsedApiUrl = new URL(apiUrl);
      const isLocalApi = parsedApiUrl.hostname === 'localhost' || parsedApiUrl.hostname === '127.0.0.1';
      if (isLocalApi) {
        return 'http://localhost:5173';
      }
    } catch {
      // Ignore invalid env value and continue to browser origin fallback.
    }
  }

  return 'https://codescriet.dev';
}

export function getApiBaseUrl(): string {
  const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configuredApiUrl) {
    return configuredApiUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const { protocol, hostname } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalHost) {
      return 'http://localhost:5001/api';
    }
    return `${protocol}//${hostname}:5001/api`;
  }

  return 'http://localhost:5001/api';
}
