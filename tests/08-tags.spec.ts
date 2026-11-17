import { expect, test } from '@playwright/test';
import { createTag, createTodo, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
});

test('creates a tag, attaches it, and edits the name everywhere', async ({ page }) => {
  await createTag(page, 'Work', '#22c55e');
  await createTodo(page, { title: 'Draft brief' });
  await page.locator('[data-title="Draft brief"]').getByTestId('attach-tag').selectOption({ label: 'Work' });
  await expect(page.locator('[data-title="Draft brief"]').getByTestId('tag-chip')).toContainText('Work');
  await page.getByTestId('manage-tags-button').click();
  await page.getByTestId('tag-list').getByTestId('tag-edit').click();
  await page.getByTestId('tag-list').locator('input').first().fill('Office');
  await page.getByTestId('tag-save').click();
  await page.getByTestId('close-tags-button').click();
  await expect(page.locator('[data-title="Draft brief"]').getByTestId('tag-chip')).toContainText('Office');
});

test('detaches a tag without deleting it', async ({ page }) => {
  await createTag(page, 'Home');
  await createTodo(page, { title: 'Water plants' });
  await page.locator('[data-title="Water plants"]').getByTestId('attach-tag').selectOption({ label: 'Home' });
  await page.locator('[data-title="Water plants"]').getByTestId('detach-tag').click();
  await expect(page.locator('[data-title="Water plants"]').getByTestId('tag-chip')).toHaveCount(0);
  await page.getByTestId('manage-tags-button').click();
  await expect(page.getByTestId('tag-list')).toContainText('Home');
});
