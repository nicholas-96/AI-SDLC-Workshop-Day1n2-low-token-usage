import { expect, test } from '@playwright/test';
import { createTodo, futureDateTimeLocal, register } from './helpers';

test('reminder control follows the due date and fires inside the window', async ({ page }) => {
  await page.addInitScript(() => {
    const notes: { title: string }[] = [];
    (window as unknown as { __notes: { title: string }[] }).__notes = notes;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission() {
        return Promise.resolve('granted');
      }
      constructor(title: string) {
        notes.push({ title });
      }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
  });
  await register(page);
  await expect(page.getByTestId('todo-reminder-select')).toBeDisabled();
  const due = futureDateTimeLocal(10);
  await page.getByTestId('todo-due-input').fill(due);
  await expect(page.getByTestId('todo-reminder-select')).toBeEnabled();
  await createTodo(page, { title: 'Leave soon', dueDate: due, reminder: '15' });
  await expect(page.locator('[data-title="Leave soon"]').getByTestId('reminder-badge')).toContainText('15m');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __notes?: { title: string }[] }).__notes?.some((note) => note.title === 'Leave soon'));
  await expect.poll(async () => {
    const response = await page.request.get('/api/notifications/check');
    return response.json();
  }).toEqual({ notifications: [] });
});
