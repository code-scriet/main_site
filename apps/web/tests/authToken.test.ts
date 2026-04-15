import assert from 'node:assert/strict';
import test from 'node:test';
import { clearStoredAuthToken, getStoredAuthToken, storeAuthToken } from '../src/lib/authToken.ts';

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function setWindowStorage() {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();

  const globalWithWindow = globalThis as typeof globalThis & {
    window?: { sessionStorage: MemoryStorage; localStorage: MemoryStorage };
  };
  globalWithWindow.window = { sessionStorage, localStorage };
  return { sessionStorage, localStorage };
}

test('storeAuthToken persists token in both session and local storage', () => {
  const { sessionStorage, localStorage } = setWindowStorage();
  storeAuthToken('abc.123.token');

  assert.equal(sessionStorage.getItem('token'), 'abc.123.token');
  assert.equal(localStorage.getItem('token'), 'abc.123.token');
});

test('getStoredAuthToken prefers session storage value', () => {
  const { sessionStorage, localStorage } = setWindowStorage();
  sessionStorage.setItem('token', 'session-token');
  localStorage.setItem('token', 'local-token');

  assert.equal(getStoredAuthToken(), 'session-token');
});

test('getStoredAuthToken restores from local storage when session is empty', () => {
  const { sessionStorage, localStorage } = setWindowStorage();
  localStorage.setItem('token', 'local-token');

  assert.equal(getStoredAuthToken(), 'local-token');
  assert.equal(sessionStorage.getItem('token'), 'local-token');
});

test('clearStoredAuthToken removes token from both storages', () => {
  const { sessionStorage, localStorage } = setWindowStorage();
  sessionStorage.setItem('token', 'session-token');
  localStorage.setItem('token', 'local-token');

  clearStoredAuthToken();

  assert.equal(sessionStorage.getItem('token'), null);
  assert.equal(localStorage.getItem('token'), null);
});
