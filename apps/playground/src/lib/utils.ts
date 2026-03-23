import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CODESCRIET_API_ORIGIN = 'https://api.codescriet.dev';
const CODESCRIET_MAIN_SITE_ORIGIN = 'https://codescriet.dev';

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

/**
 * Resolve the main API origin used for shared auth (/api/auth/me) and competition calls.
 * When running on *.codescriet.dev, force the API origin to api.codescriet.dev if an
 * off-domain env value is provided so browser cookie auth can work cross-subdomain.
 */
export function getMainApiOrigin(): string {
  const configured = parseOrigin(import.meta.env.VITE_MAIN_API_URL);
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (configured) {
    if (currentHostname && isCodescrietHost(currentHostname)) {
      const configuredHostname = new URL(configured).hostname.toLowerCase();
      if (!isCodescrietHost(configuredHostname)) {
        return CODESCRIET_API_ORIGIN;
      }
    }
    return configured;
  }

  if (currentHostname && isLocalHost(currentHostname)) {
    return 'http://localhost:5001';
  }

  return CODESCRIET_API_ORIGIN;
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

/**
 * Debounce function for auto-save and other delayed operations
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

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
