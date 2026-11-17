import type { Priority, Todo } from './types';

export interface FilterState {
  search: string;
  priority: Priority | '';
  tagId: number | null;
  completion: 'all' | 'active' | 'completed';
  dueDateFrom: string;
  dueDateTo: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  priority: '',
  tagId: null,
  completion: 'all',
  dueDateFrom: '',
  dueDateTo: '',
};

export const FILTER_PRESET_KEY = 'todo-app:filter-presets';

export function applyFilters(todos: Todo[], filters: FilterState): Todo[] {
  const search = filters.search.trim().toLowerCase();
  let result = todos;

  if (search) {
    result = result.filter((todo) => {
      if (todo.title.toLowerCase().includes(search)) return true;
      return (todo.subtasks ?? []).some((subtask) => subtask.title.toLowerCase().includes(search));
    });
  }

  if (filters.priority) {
    result = result.filter((todo) => todo.priority === filters.priority);
  }

  if (filters.tagId != null) {
    result = result.filter((todo) => (todo.tags ?? []).some((tag) => tag.id === filters.tagId));
  }

  if (filters.completion === 'active') {
    result = result.filter((todo) => !todo.completed);
  } else if (filters.completion === 'completed') {
    result = result.filter((todo) => todo.completed);
  }

  if (filters.dueDateFrom) {
    result = result.filter((todo) => todo.due_date != null && todo.due_date.slice(0, 10) >= filters.dueDateFrom);
  }

  if (filters.dueDateTo) {
    result = result.filter((todo) => todo.due_date != null && todo.due_date.slice(0, 10) <= filters.dueDateTo);
  }

  return result;
}
