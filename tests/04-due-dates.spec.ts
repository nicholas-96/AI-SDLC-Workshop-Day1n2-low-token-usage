import { expect, test } from '@playwright/test';
import { createTodo, forceDueDate, futureDateTimeLocal, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
});

test('accepts a future due date and rejects a past one', async ({ page }) => {
  const due = futureDateTimeLocal(120);
  await createTodo(page, { title: 'Future task', dueDate: due });
  await expect(page.locator('[data-title="Future task"]')).toHaveAttribute('data-due', `${due}:00`);
  await page.getByTestId('todo-title-input').fill('Past task');
  await page.getByTestId('todo-due-input').fill('2020-01-01T00:00');
  await page.getByTestId('add-todo-button').click();
  await expect(page.getByTestId('form-error')).toHaveText('Due date must be at least 1 minute from now');
  await expect(page.locator('[data-title="Past task"]')).toHaveCount(0);
});

test('shows a past due date in Overdue', async ({ page }) => {
  await createTodo(page, { title: 'Slip deadline', dueDate: futureDateTimeLocal(90) });
  forceDueDate('Slip deadline', '2020-01-01T00:00:00');
  await page.reload();
  await expect(page.getByTestId('section-overdue').locator('[data-title="Slip deadline"]')).toBeVisible();
  await expect(page.getByTestId('section-pending').locator('[data-title="Slip deadline"]')).toHaveCount(0);
});
