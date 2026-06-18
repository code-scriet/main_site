import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CODESCRIET_API_ORIGIN = 'https://api.codescriet.dev';
const CODESCRIET_MAIN_SITE_ORIGIN = 'https://codescriet.dev';
const MAIN_API_ORIGIN_STORAGE_KEY = 'pg_main_api_origin';

type MainApiJsonResult<T> = {
  apiOrigin: string;
  response: Response;
  payload: unknown;
  data: T;
};

function parseOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isCodescrietHost(hostname: string): boolean {
  return hostname === 'codescriet.dev' || hostname.endsWith('.codescriet.dev');
}

function getConfiguredMainApiOrigin(): string | null {
  return parseOrigin(import.meta.env.VITE_MAIN_API_URL);
}

function isAllowedMainApiOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (isLocalHost(hostname) || isCodescrietHost(hostname)) return true;

    const configured = getConfiguredMainApiOrigin();
    if (!configured) return false;
    return new URL(configured).hostname.toLowerCase() === hostname;
  } catch {
    return false;
  }
}

function getStoredMainApiOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = parseOrigin(sessionStorage.getItem(MAIN_API_ORIGIN_STORAGE_KEY) || undefined);
    if (!stored || !isAllowedMainApiOrigin(stored)) return null;
    return stored;
  } catch {
    return null;
  }
}

/**
 * Resolve the main API origin used for shared auth (/api/auth/me) and competition calls.
 * Prefer explicit runtime hints first, then fall back to the canonical domain.
 */
export function getMainApiOrigin(): string {
  return getMainApiCandidates()[0] || CODESCRIET_API_ORIGIN;
}

export function getMainApiCandidates(): string[] {
  const candidates: string[] = [];
  const push = (origin: string | null) => {
    if (!origin) return;
    if (!isAllowedMainApiOrigin(origin)) return;
    if (!candidates.includes(origin)) candidates.push(origin);
  };

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const onCodescrietHost = !!currentHostname && isCodescrietHost(currentHostname);

  push(getHashApiOverride());
  push(getStoredMainApiOrigin());
  push(getConfiguredMainApiOrigin());

  // Keep the canonical API as a fallback for existing cross-subdomain deployments.
  if (onCodescrietHost) {
    push(CODESCRIET_API_ORIGIN);
  }

  if (currentHostname && isLocalHost(currentHostname)) {
    push('http://localhost:5001');
  }

  if (candidates.length === 0) {
    push(CODESCRIET_API_ORIGIN);
  }

  return candidates;
}

export function rememberMainApiOrigin(origin: string): void {
  if (typeof window === 'undefined') return;
  const parsed = parseOrigin(origin);
  if (!parsed || !isAllowedMainApiOrigin(parsed)) return;
  try {
    sessionStorage.setItem(MAIN_API_ORIGIN_STORAGE_KEY, parsed);
  } catch {
    // no-op
  }
}

export async function requestMainApiJson<T>(path: string, init: RequestInit = {}): Promise<MainApiJsonResult<T>> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let lastNetworkError: Error | null = null;

  for (const apiOrigin of getMainApiCandidates()) {
    try {
      const response = await fetch(`${apiOrigin}${normalizedPath}`, init);
      rememberMainApiOrigin(apiOrigin);

      let payload: unknown = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        payload = await response.json().catch(() => null);
      } else {
        const text = await response.text().catch(() => '');
        payload = text.trim() ? text : null;
      }

      return {
        apiOrigin,
        response,
        payload,
        data: ((payload as { data?: T } | null)?.data ?? payload) as T,
      };
    } catch (error) {
      lastNetworkError = error instanceof Error ? error : new Error('Network request failed');
    }
  }

  throw lastNetworkError || new Error('Unable to reach the main API');
}

/**
 * Resolve the main web origin for sign-in redirects.
 */
export function getMainSiteOrigin(): string {
  const configured = parseOrigin(import.meta.env.VITE_MAIN_SITE_URL);
  if (configured) return configured;

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (currentHostname && isLocalHost(currentHostname)) {
    return 'http://localhost:5173';
  }

  return CODESCRIET_MAIN_SITE_ORIGIN;
}

function getHashApiOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const override = parseOrigin(params.get('api') || undefined);
    if (!override || !isAllowedMainApiOrigin(override)) return null;
    return override;
  } catch {
    return null;
  }
}

/**
 * Debounce function for auto-save and other delayed operations
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  // Browser timer handle (no NodeJS namespace in this Vite app).
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Generate a random ID
 */
export function generateId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Truncate text
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

/**
 * Check if code contains console.log (for JavaScript/TypeScript)
 */
export function hasConsoleLog(code: string): boolean {
  return /console\.(log|error|warn|info|debug)/g.test(code);
}

/**
 * Check if code contains print statement (for Python)
 */
export function hasPrintStatement(code: string): boolean {
  return /print\s*\(/g.test(code);
}

/**
 * Validate code is not empty
 */
export function validateCode(code: string): { valid: boolean; message?: string } {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, message: 'Code cannot be empty' };
  }
  if (trimmed.length < 5) {
    return { valid: false, message: 'Code is too short' };
  }
  return { valid: true };
}
