import { expect, test } from '@playwright/test';
import { createTodo, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
});

test('creates, completes, and deletes a todo', async ({ page }) => {
  await createTodo(page, { title: 'Write spec' });
  await expect(page.getByTestId('section-pending').locator('[data-title="Write spec"]')).toBeVisible();
  await page.locator('[data-title="Write spec"]').getByTestId('toggle-complete').click();
  await expect(page.getByTestId('section-completed').locator('[data-title="Write spec"]')).toBeVisible();
  await expect(page.getByTestId('section-pending').locator('[data-title="Write spec"]')).toHaveCount(0);
  await page.locator('[data-title="Write spec"]').getByTestId('delete-todo').click();
  await expect(page.locator('[data-title="Write spec"]')).toHaveCount(0);
});

test('rejects an empty title', async ({ page }) => {
  await page.getByTestId('add-todo-button').click();
  await expect(page.getByTestId('form-error')).toHaveText('Title is required');
  await expect(page.getByTestId('todo-item')).toHaveCount(0);
});

test('sorts equal priority by newest created time', async ({ page }) => {
  await createTodo(page, { title: 'Older task' });
  await createTodo(page, { title: 'Newer task' });
  await expect(page.getByTestId('section-pending').locator('[data-testid="todo-item"]').first()).toHaveAttribute('data-title', 'Newer task');
});
