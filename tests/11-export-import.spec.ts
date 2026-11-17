import fs from 'fs';
import { expect, test } from '@playwright/test';
import { createTag, createTodo, register } from './helpers';

test('exports JSON and CSV, then imports a duplicate with tag reuse', async ({ page }) => {
  await register(page);
  await createTag(page, 'Work', '#ff0000');
  await createTodo(page, { title: 'Buy milk, eggs' });
  await page.locator('[data-title="Buy milk, eggs"]').getByTestId('attach-tag').selectOption({ label: 'Work' });

  const jsonDownload = page.waitForEvent('download');
  await page.getByTestId('export-json').click();
  const jsonFile = await jsonDownload;
  expect(jsonFile.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(fs.readFileSync(await jsonFile.path(), 'utf8')) as {
    version: number;
    exported_at: string;
    todos: { title: string; id?: number; tags: { name: string; color: string }[]; subtasks: unknown[] }[];
  };
  expect(exported.version).toBe(1);
  expect(exported.exported_at).toBeTruthy();
  expect(exported.todos[0]?.id).toBeUndefined();
  expect(exported.todos[0]?.tags[0]?.name).toBe('Work');
  expect(exported.todos[0]?.subtasks).toEqual([]);

  const csvDownload = page.waitForEvent('download');
  await page.getByTestId('export-csv').click();
  const csvFile = await csvDownload;
  expect(csvFile.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = fs.readFileSync(await csvFile.path(), 'utf8');
  expect(csv.split('\n')[0]).toBe('ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder');
  expect(csv).toContain('"Buy milk, eggs"');

  const conflict = {
    version: 1,
    exported_at: exported.exported_at,
    todos: [{
      title: 'Imported task',
      completed: false,
      due_date: null,
      priority: 'low',
      is_recurring: false,
      recurrence_pattern: null,
      reminder_minutes: null,
      subtasks: [{ title: 'Follow up', completed: false, position: 0 }],
      tags: [{ name: 'work', color: '#00ff00' }],
    }],
  };
  await page.getByTestId('import-file').setInputFiles({
    name: 'todos.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(conflict)),
  });
  await expect(page.locator('[data-title="Imported task"]')).toBeVisible();
  await expect(page.locator('[data-title="Imported task"]').getByTestId('tag-chip')).toHaveAttribute('data-color', '#ff0000');
  await expect(page.locator('[data-title="Imported task"]').getByTestId('subtask-item')).toContainText('Follow up');
  await page.getByTestId('manage-tags-button').click();
  await expect(page.getByTestId('tag-list').getByText('Work', { exact: true })).toHaveCount(1);
  await page.getByTestId('close-tags-button').click();

  await page.getByTestId('import-file').setInputFiles({
    name: 'todos.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator('[data-title="Buy milk, eggs"]')).toHaveCount(2);
});
