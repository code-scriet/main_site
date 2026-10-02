// Internal helpers shared by every per-domain api module. Not part of the
// public surface — import from '@/lib/api' (the barrel) instead.

import { extractApiErrorMessage, extractFieldErrors } from '@/lib/error';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Custom error class for 401 responses to trigger auto-logout downstream.
export class UnauthorizedError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

// Error thrown for any non-OK response (other than 401). Carries the HTTP
// status and any server-side per-field validation errors so forms can render
// them inline next to the matching input (see extractFieldErrors). Existing
// `catch (e) { e.message }` call sites keep working since ApiError extends Error.
export class ApiError extends Error {
  readonly status?: number;
  readonly fieldErrors: Record<string, string>;

  constructor(
    message: string,
    options: { status?: number; fieldErrors?: Record<string, string> } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.fieldErrors = options.fieldErrors ?? {};
  }
}

// Single throw path for failed responses — keeps message extraction, 401
// auto-logout signalling, and field-error propagation consistent everywhere.
function throwResponseError(response: Response, errorData: unknown): never {
  const message = extractApiErrorMessage(errorData, `Request failed (${response.status})`);
  if (response.status === 401) {
    throw new UnauthorizedError(message);
  }
  throw new ApiError(message, {
    status: response.status,
    fieldErrors: extractFieldErrors(errorData),
  });
}

export interface RequestOptions extends RequestInit {
  token?: string;
}

export interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  token?: string;
  [key: string]: unknown;
}

async function readErrorPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => '');
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text.trim() };
  }
}

async function executeJsonRequest(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
  const { token, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const hasRequestBody =
    fetchOptions.body !== undefined &&
    fetchOptions.body !== null &&
    method !== 'GET' &&
    method !== 'HEAD';

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  const hasHeader = (name: string) =>
    Object.keys(headers).some((headerName) => headerName.toLowerCase() === name.toLowerCase());

  // Avoid forcing JSON content-type on GET/HEAD requests because that triggers CORS preflight.
  if (hasRequestBody && !hasHeader('Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }

  if (!hasHeader('Accept')) {
    headers.Accept = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const executeRequest = (requestHeaders: Record<string, string>) =>
    fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      credentials: 'include', // send & receive cookies for cross-origin session
      headers: requestHeaders,
    });

  const withoutAuthHeader = (requestHeaders: Record<string, string>) => {
    const sanitized = { ...requestHeaders };
    for (const headerName of Object.keys(sanitized)) {
      if (headerName.toLowerCase() === 'authorization') {
        delete sanitized[headerName];
      }
    }
    return sanitized;
  };

  let response = await executeRequest(headers);
  // If a stale local token triggers 401 but a fresh session cookie exists, retry once using cookie auth only.
  if (response.status === 401 && token) {
    response = await executeRequest(withoutAuthHeader(headers));
  }

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    throwResponseError(response, errorData);
  }

  return response.json();
}

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const json = await executeJsonRequest(endpoint, options) as ApiEnvelope<T>;
  // Extract data from the API response format { success: true, data: ... }
  return json.data !== undefined ? json.data : json as T;
}

export async function requestEnvelope<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  return executeJsonRequest(endpoint, options) as Promise<ApiEnvelope<T>>;
}

export async function requestForm<T>(endpoint: string, formData: FormData, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  const hasHeader = (name: string) =>
    Object.keys(headers).some((headerName) => headerName.toLowerCase() === name.toLowerCase());

  if (token && !hasHeader('Authorization')) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!hasHeader('Accept')) {
    headers.Accept = 'application/json';
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    method: fetchOptions.method ?? 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    throwResponseError(response, errorData);
  }

  const json = await response.json() as ApiEnvelope<T>;
  return json.data !== undefined ? json.data : json as T;
}

export async function requestBlob(endpoint: string, options: RequestOptions = {}): Promise<Blob> {
  const { token, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const hasRequestBody =
    fetchOptions.body !== undefined &&
    fetchOptions.body !== null &&
    method !== 'GET' &&
    method !== 'HEAD';

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  const hasHeader = (name: string) =>
    Object.keys(headers).some((headerName) => headerName.toLowerCase() === name.toLowerCase());

  if (hasRequestBody && !hasHeader('Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }

  if (!hasHeader('Accept')) {
    headers.Accept = 'application/octet-stream';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    throwResponseError(response, errorData);
  }

  return response.blob();
}
