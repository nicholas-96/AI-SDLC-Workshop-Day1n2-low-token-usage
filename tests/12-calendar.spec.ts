import { expect, test } from '@playwright/test';
import { createTodo, currentMonthLabel, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
});

test('renders a full month and falls back on a bad query', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByTestId('month-label')).toHaveText(currentMonthLabel());
  const count = await page.getByTestId('calendar-cell').count();
  expect(count === 35 || count === 42).toBeTruthy();
  expect(count % 7).toBe(0);
  await page.goto('/calendar?month=2026-13');
  await expect(page.getByTestId('month-label')).toHaveText(currentMonthLabel());
  await page.goto('/calendar?month=2026-08');
  await expect(page.getByTestId('month-label')).toHaveText('August 2026');
  await expect(page.getByText('National Day', { exact: true })).toBeVisible();
  await page.getByTestId('calendar-next').click();
  await expect(page.getByTestId('month-label')).toHaveText('September 2026');
});

test('places a todo on its due date and opens the day', async ({ page }) => {
  await createTodo(page, { title: 'August plan', dueDate: '2027-08-09T11:00', priority: 'high' });
  await createTodo(page, { title: 'Extra 1', dueDate: '2027-08-09T12:00' });
  await createTodo(page, { title: 'Extra 2', dueDate: '2027-08-09T13:00' });
  await createTodo(page, { title: 'Extra 3', dueDate: '2027-08-09T14:00' });
  await page.goto('/calendar?month=2027-08');
  const cell = page.locator('[data-testid="calendar-cell"][data-date="2027-08-09"]');
  await expect(cell).toContainText('August plan');
  await expect(cell.getByTestId('overflow-count')).toHaveText('+1');
  await expect(cell.getByText('National Day', { exact: true })).toBeVisible();
  await cell.click();
  await expect(page.getByTestId('day-modal')).toContainText('August plan');
  await expect(page.getByTestId('day-modal')).toContainText('National Day');
  await page.getByTestId('close-day-modal').click();
  await expect(page.getByTestId('day-modal')).toHaveCount(0);
});
