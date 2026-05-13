// Auth domain methods. Imported by the lib/api barrel; do not import this
// file directly — use `import { api } from '@/lib/api'` instead.

import { request, requestEnvelope } from './_internal';
import type { AuthProviders, User } from '../api';

export const authApi = {
  getProviders: () => request<AuthProviders>('/auth/providers'),
  getMe: (token: string) => request<User>('/auth/me', { token }),
  getMeWithToken: async (token?: string | null) => {
    const response = await requestEnvelope<User>('/auth/me', token ? { token } : {});
    return {
      user: response.data ?? null,
      token: typeof response.token === 'string' ? response.token : undefined,
    };
  },
  devLogin: (email: string, name?: string) =>
    request<{ token: string; user: User }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    }),
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  exchangeAuthCode: (code: string) =>
    request<{ token: string; intent?: string; network_type?: 'professional' | 'alumni' }>('/auth/exchange-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
} as const;
