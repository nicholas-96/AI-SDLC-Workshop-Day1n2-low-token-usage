import { expect, test } from '@playwright/test';
import { addSubtask, createTag, createTodo, futureDateTimeLocal, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
});

test('filters by search, priority, and subtask text', async ({ page }) => {
  await createTodo(page, { title: 'Alpha high', priority: 'high' });
  await createTodo(page, { title: 'Alpha low', priority: 'low' });
  await createTodo(page, { title: 'Parent errand' });
  await addSubtask(page, 'Parent errand', 'Buy milk');
  await page.getByTestId('search-input').fill('ALPHA');
  await expect(page.locator('[data-title="Alpha high"]')).toBeVisible();
  await expect(page.locator('[data-title="Alpha low"]')).toBeVisible();
  await expect(page.locator('[data-title="Parent errand"]')).toHaveCount(0);
  await page.getByTestId('filter-priority').selectOption('high');
  await expect(page.locator('[data-title="Alpha low"]')).toHaveCount(0);
  await expect(page.locator('[data-title="Alpha high"]')).toBeVisible();
  await page.getByTestId('search-input').fill('milk');
  await page.getByTestId('filter-priority').selectOption('');
  await expect(page.locator('[data-title="Parent errand"]')).toBeVisible();
  await expect(page.locator('[data-title="Alpha high"]')).toHaveCount(0);
});

test('filters by completion and due date, and stores presets', async ({ page }) => {
  const due = futureDateTimeLocal(24 * 60);
  await createTodo(page, { title: 'Dated task', dueDate: due });
  await createTodo(page, { title: 'Loose task' });
  await page.locator('[data-title="Loose task"]').getByTestId('toggle-complete').click();
  await page.getByTestId('filter-completion').selectOption('completed');
  await expect(page.locator('[data-title="Loose task"]')).toBeVisible();
  await expect(page.locator('[data-title="Dated task"]')).toHaveCount(0);
  await page.getByTestId('filter-completion').selectOption('all');
  await page.getByTestId('filter-from').fill(due.slice(0, 10));
  await page.getByTestId('filter-to').fill(due.slice(0, 10));
  await expect(page.locator('[data-title="Dated task"]')).toBeVisible();
  await expect(page.locator('[data-title="Loose task"]')).toHaveCount(0);
  await page.getByTestId('preset-name-input').fill('That day');
  await page.getByTestId('save-preset-button').click();
  const raw = await page.evaluate(() => localStorage.getItem('todo-app:filter-presets'));
  const presets = JSON.parse(raw ?? '[]') as { name: string; filters: { dueDateFrom: string }; createdAt: string }[];
  expect(presets[0]?.name).toBe('That day');
  expect(presets[0]?.filters.dueDateFrom).toBe(due.slice(0, 10));
  expect(presets[0]?.createdAt).toBeTruthy();
});

test('filters by tag', async ({ page }) => {
  await createTag(page, 'Focus');
  await createTodo(page, { title: 'Deep work' });
  await createTodo(page, { title: 'Chore' });
  await page.locator('[data-title="Deep work"]').getByTestId('attach-tag').selectOption({ label: 'Focus' });
  await page.getByTestId('filter-tag').selectOption({ label: 'Focus' });
  await expect(page.locator('[data-title="Deep work"]')).toBeVisible();
  await expect(page.locator('[data-title="Chore"]')).toHaveCount(0);
});
