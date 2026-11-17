import { expect, test } from '@playwright/test';
import { addSubtask, createTodo, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
  await createTodo(page, { title: 'Pack bag' });
});

test('tracks progress and turns the bar green at 100%', async ({ page }) => {
  const todo = page.locator('[data-title="Pack bag"]');
  await expect(todo.getByTestId('subtask-progress')).toHaveCount(0);
  await addSubtask(page, 'Pack bag', 'Charger');
  await addSubtask(page, 'Pack bag', 'Passport');
  await expect(todo.getByTestId('subtask-progress')).toContainText('0/2 subtasks');
  await expect(todo.getByTestId('progress-bar')).toHaveAttribute('data-complete', 'false');
  await todo.getByTestId('subtask-item').filter({ hasText: 'Charger' }).getByTestId('toggle-subtask').click();
  await expect(todo.getByTestId('subtask-progress')).toContainText('1/2 subtasks');
  await todo.getByTestId('subtask-item').filter({ hasText: 'Passport' }).getByTestId('toggle-subtask').click();
  await expect(todo.getByTestId('progress-bar')).toHaveAttribute('data-complete', 'true');
  await expect(todo.getByTestId('subtask-progress')).toContainText('2/2 subtasks');
});

test('deletes a subtask without removing the rest', async ({ page }) => {
  await addSubtask(page, 'Pack bag', 'Charger');
  await addSubtask(page, 'Pack bag', 'Passport');
  const todo = page.locator('[data-title="Pack bag"]');
  await todo.getByTestId('subtask-item').filter({ hasText: 'Charger' }).getByTestId('delete-subtask').click();
  await expect(todo.getByTestId('subtask-item')).toHaveCount(1);
  await expect(todo.getByTestId('subtask-progress')).toContainText('0/1 subtasks');
});
