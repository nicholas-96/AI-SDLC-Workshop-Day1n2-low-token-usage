import { PRIORITY_RANK } from './constants';
import type { Todo } from './types';

export type SectionName = 'overdue' | 'pending' | 'completed';

export function compareTodos(a: Todo, b: Todo): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.due_date && b.due_date && a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1;
  }
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return b.id - a.id;
}

export function groupTodos(todos: Todo[], now: string): Record<SectionName, Todo[]> {
  const overdue = todos.filter((todo) => !todo.completed && todo.due_date != null && todo.due_date < now);
  const pending = todos.filter((todo) => !todo.completed && (todo.due_date == null || todo.due_date >= now));
  const completed = todos.filter((todo) => todo.completed);
  return {
    overdue: [...overdue].sort(compareTodos),
    pending: [...pending].sort(compareTodos),
    completed: [...completed].sort(compareTodos),
  };
}
