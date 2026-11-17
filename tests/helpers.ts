import { expect, type Page } from '@playwright/test';
import Database from 'better-sqlite3';

type Cdp = { send(method: string, params?: object): Promise<unknown> };

export function uniqueUsername(): string {
  return `user${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

export function futureDateTimeLocal(minutesAhead: number): string {
  const date = new Date(Date.now() + minutesAhead * 60_000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  return `${pick('year')}-${pick('month')}-${pick('day')}T${hour}:${pick('minute')}`;
}

export function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export async function installAuthenticator(page: Page): Promise<void> {
  const client = (await page.context().newCDPSession(page)) as unknown as Cdp;
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

export async function register(page: Page, username = uniqueUsername()): Promise<string> {
  await installAuthenticator(page);
  await page.goto('/login');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('register-button').click();
  await expect(page.getByTestId('current-user')).toHaveText(username);
  return username;
}

export async function login(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-button').click();
  await expect(page.getByTestId('current-user')).toHaveText(username);
}

export async function createTodo(page: Page, options: {
  title: string;
  dueDate?: string;
  priority?: 'high' | 'medium' | 'low';
  recurring?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  reminder?: string;
}): Promise<void> {
  await page.getByTestId('todo-title-input').fill(options.title);
  if (options.dueDate) await page.getByTestId('todo-due-input').fill(options.dueDate);
  if (options.priority) await page.getByTestId('todo-priority-select').selectOption(options.priority);
  if (options.recurring) {
    await page.getByTestId('todo-recurring-checkbox').check();
    await page.getByTestId('todo-recurrence-select').selectOption(options.recurring);
  }
  if (options.reminder) await page.getByTestId('todo-reminder-select').selectOption(options.reminder);
  await page.getByTestId('add-todo-button').click();
  const item = page.locator(`[data-testid="todo-item"][data-title="${options.title}"]`);
  await expect(item).toHaveAttribute('data-id', /^[1-9]\d*$/);
}

export async function createTag(page: Page, name: string, color = '#3B82F6'): Promise<void> {
  await page.getByTestId('manage-tags-button').click();
  await page.getByTestId('tag-name-input').fill(name);
  await page.getByTestId('tag-color-input').fill(color);
  await page.getByTestId('tag-create-button').click();
  await expect(page.getByTestId('tag-list').getByText(name, { exact: true })).toBeVisible();
  await page.getByTestId('close-tags-button').click();
}

export async function addSubtask(page: Page, todoTitle: string, subtaskTitle: string): Promise<void> {
  const todo = page.locator(`[data-testid="todo-item"][data-title="${todoTitle}"]`);
  await todo.getByTestId('subtask-input').fill(subtaskTitle);
  await todo.getByTestId('add-subtask-button').click();
  await expect(todo.getByTestId('subtask-item').filter({ hasText: subtaskTitle })).toBeVisible();
}

export async function createTemplate(page: Page, options: {
  name: string;
  title: string;
  offset?: string;
  subtask?: string;
  priority?: 'high' | 'medium' | 'low';
}): Promise<void> {
  await page.getByTestId('templates-button').click();
  await page.getByTestId('template-name-input').fill(options.name);
  await page.getByTestId('template-title-input').fill(options.title);
  if (options.priority) await page.getByTestId('template-priority-select').selectOption(options.priority);
  if (options.offset != null) await page.getByTestId('template-offset-input').fill(options.offset);
  if (options.subtask) {
    await page.getByTestId('template-subtask-input').fill(options.subtask);
    await page.getByTestId('template-add-subtask').click();
  }
  await page.getByTestId('template-save-button').click();
  await expect(page.getByTestId('template-item').filter({ hasText: options.name })).toBeVisible();
  await page.getByTestId('close-templates-button').click();
}

export function forceDueDate(title: string, dueDate: string): void {
  const db = new Database('todos.db');
  db.pragma('busy_timeout = 5000');
  db.prepare('UPDATE todos SET due_date = ? WHERE title = ?').run(dueDate, title);
  db.close();
}
