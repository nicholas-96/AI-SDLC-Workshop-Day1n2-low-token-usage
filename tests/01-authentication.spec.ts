import { expect, test } from '@playwright/test';
import { login, register, uniqueUsername } from './helpers';

test('redirects anonymous visitors to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/login$/);
});

test('rejects anonymous API calls', async ({ request }) => {
  const response = await request.get('/api/todos');
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: 'Not authenticated' });
});

test('registers, logs out, and logs in with the same passkey', async ({ page }) => {
  const username = await register(page);
  await page.goto('/login');
  await expect(page.getByTestId('current-user')).toHaveText(username);
  await page.getByTestId('logout-button').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await login(page, username);
});

test('rejects a duplicate username', async ({ page }) => {
  const username = uniqueUsername();
  await register(page, username);
  await page.getByTestId('logout-button').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('register-button').click();
  await expect(page.getByTestId('auth-error')).toContainText('already registered');
});
