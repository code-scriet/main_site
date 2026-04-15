import { test, expect } from '@playwright/test';

test.describe('Web smoke', () => {
  test('public privacy route is reachable', async ({ page }) => {
    await page.goto('/privacy-policy');

    await expect(page).toHaveTitle(/Privacy Policy/i);
    await expect(page.getByRole('heading', { name: /^Privacy Policy$/i })).toBeVisible();
  });

  test('email sign-in form is accessible', async ({ page }) => {
    await page.goto('/signin');

    await page.getByRole('button', { name: /Sign in with Email/i }).click();

    await expect(page.getByLabel(/^Email$/i)).toBeVisible();
    await expect(page.getByLabel(/^Password$/i)).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
  });
});
