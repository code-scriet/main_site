import { test, expect } from '@playwright/test';

const apiBaseUrl = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:5001';

test.describe('API smoke', () => {
  test('ping endpoint responds with pong', async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/ping`);
    expect(response.ok()).toBeTruthy();
    await expect(response.text()).resolves.toBe('pong');
  });

  test('health endpoint is available', async ({ request }) => {
    const response = await request.get(`${apiBaseUrl}/health`);
    expect(response.ok()).toBeTruthy();
  });
});
