import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT || '5001';
const webPort = process.env.E2E_WEB_PORT || '5173';
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `npm run dev --workspace=apps/api`,
      url: `${apiBaseUrl}/ping`,
      timeout: 180 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: apiPort,
      },
    },
    {
      command: `npm run dev --workspace=apps/web -- --host 127.0.0.1 --port ${webPort}`,
      url: webBaseUrl,
      timeout: 180 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        VITE_API_URL: `${apiBaseUrl}/api`,
      },
    },
  ],
});
