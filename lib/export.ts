import type { Todo } from './types';

export function buildExport(todos: Todo[], exportedAt: string) {
  return {
    version: 1 as const,
    exported_at: exportedAt,
    todos: todos.map((todo) => ({
      title: todo.title,
      completed: todo.completed,
      due_date: todo.due_date,
      priority: todo.priority,
      is_recurring: todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes,
      subtasks: (todo.subtasks ?? []).map((subtask) => ({
        title: subtask.title,
        completed: subtask.completed,
        position: subtask.position,
      })),
      tags: (todo.tags ?? []).map((tag) => ({
        name: tag.name,
        color: tag.color,
      })),
    })),
  };
}
