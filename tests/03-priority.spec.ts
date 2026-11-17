import { expect, test } from '@playwright/test';
import { createTodo, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
});

test('defaults to medium and sorts high before low', async ({ page }) => {
  await createTodo(page, { title: 'Low task', priority: 'low' });
  await expect(page.locator('[data-title="Low task"]').getByTestId('priority-badge')).toHaveAttribute('data-priority', 'low');
  await createTodo(page, { title: 'Plain task' });
  await expect(page.locator('[data-title="Plain task"]').getByTestId('priority-badge')).toHaveAttribute('data-priority', 'medium');
  await createTodo(page, { title: 'High task', priority: 'high' });
  const titles = page.getByTestId('section-pending').locator('[data-testid="todo-item"]');
  await expect(titles.nth(0)).toHaveAttribute('data-title', 'High task');
  await expect(titles.nth(1)).toHaveAttribute('data-priority', 'medium');
  await expect(titles.nth(2)).toHaveAttribute('data-title', 'Low task');
});
