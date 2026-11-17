import { reminderLabel } from './constants';
import type { Todo } from './types';

export const CSV_HEADERS = ['ID', 'Title', 'Completed', 'Due Date', 'Priority', 'Recurring', 'Pattern', 'Reminder'] as const;

function csvEscape(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function todosToCsv(todos: Todo[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const todo of todos) {
    const cells = [
      String(todo.id),
      todo.title,
      todo.completed ? 'true' : 'false',
      todo.due_date ?? '',
      todo.priority,
      todo.is_recurring ? 'true' : 'false',
      todo.recurrence_pattern ?? '',
      todo.reminder_minutes == null ? '' : reminderLabel(todo.reminder_minutes),
    ];
    lines.push(cells.map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}
