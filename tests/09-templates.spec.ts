import { expect, test } from '@playwright/test';
import { createTemplate, register } from './helpers';

test('using a template creates a todo with its subtasks', async ({ page }) => {
  await register(page);
  await createTemplate(page, { name: 'Travel', title: 'Pack for trip', offset: '180', subtask: 'Passport', priority: 'high' });
  await page.getByTestId('templates-button').click();
  await page.getByTestId('template-use').click();
  await page.getByTestId('close-templates-button').click();
  const todo = page.locator('[data-title="Pack for trip"]');
  await expect(todo).toBeVisible();
  await expect(todo.getByTestId('priority-badge')).toHaveAttribute('data-priority', 'high');
  await expect(todo.getByTestId('subtask-item')).toContainText('Passport');
  await expect(todo).not.toHaveAttribute('data-due', '');
  await page.getByTestId('templates-button').click();
  await page.getByTestId('template-delete').click();
  await page.getByTestId('close-templates-button').click();
  await expect(todo).toBeVisible();
});
