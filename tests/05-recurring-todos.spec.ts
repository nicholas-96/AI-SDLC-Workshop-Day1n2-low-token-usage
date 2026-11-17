import { expect, test } from '@playwright/test';
import { createTag, createTodo, register } from './helpers';

test.beforeEach(async ({ page }) => {
  await register(page);
});

test('requires a due date and schedules the next daily instance', async ({ page }) => {
  await page.getByTestId('todo-title-input').fill('Daily stand-up');
  await page.getByTestId('todo-recurring-checkbox').check();
  await page.getByTestId('todo-recurrence-select').selectOption('daily');
  await page.getByTestId('add-todo-button').click();
  await expect(page.getByTestId('form-error')).toHaveText('Recurring todos require a due date');

  await createTodo(page, { title: 'Daily stand-up', dueDate: '2027-06-15T10:00', recurring: 'daily', priority: 'high' });
  await page.locator('[data-title="Daily stand-up"]').getByTestId('toggle-complete').click();
  await expect(page.getByTestId('section-completed').locator('[data-title="Daily stand-up"]')).toBeVisible();
  await expect(page.getByTestId('section-pending').locator('[data-title="Daily stand-up"]')).toHaveAttribute('data-due', '2027-06-16T10:00:00');
  await expect(page.getByTestId('section-pending').locator('[data-title="Daily stand-up"]').getByTestId('priority-badge')).toHaveAttribute('data-priority', 'high');
});

test('clamps monthly and yearly overflow', async ({ page }) => {
  await createTodo(page, { title: 'Month end', dueDate: '2027-01-31T12:00', recurring: 'monthly' });
  await page.locator('[data-title="Month end"]').getByTestId('toggle-complete').click();
  await expect(page.getByTestId('section-pending').locator('[data-title="Month end"]')).toHaveAttribute('data-due', '2027-02-28T12:00:00');

  await createTodo(page, { title: 'Leap day', dueDate: '2028-02-29T09:00', recurring: 'yearly' });
  await page.locator('[data-title="Leap day"]').getByTestId('toggle-complete').click();
  await expect(page.getByTestId('section-pending').locator('[data-title="Leap day"]')).toHaveAttribute('data-due', '2029-02-28T09:00:00');
});

test('copies tags and reminder onto the next instance', async ({ page }) => {
  await createTag(page, 'Bills');
  await createTodo(page, { title: 'Pay rent', dueDate: '2027-06-15T10:00', recurring: 'weekly', reminder: '60' });
  await page.locator('[data-title="Pay rent"]').getByTestId('attach-tag').selectOption({ label: 'Bills' });
  await expect(page.locator('[data-title="Pay rent"]').getByTestId('tag-chip')).toHaveText(/Bills/);
  await page.locator('[data-title="Pay rent"]').getByTestId('toggle-complete').click();
  const next = page.getByTestId('section-pending').locator('[data-title="Pay rent"]');
  await expect(next).toHaveAttribute('data-due', '2027-06-22T10:00:00');
  await expect(next.getByTestId('tag-chip')).toHaveText(/Bills/);
  await expect(next.getByTestId('reminder-badge')).toContainText('1h');
  await expect(next.getByTestId('recurrence-badge')).toContainText('weekly');
});
