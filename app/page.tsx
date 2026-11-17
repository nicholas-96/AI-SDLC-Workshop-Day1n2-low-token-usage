'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PRIORITY_BADGE_CLASS, PRIORITY_LABEL, REMINDER_OPTIONS, reminderLabel } from '@/lib/constants';
import { applyFilters, EMPTY_FILTERS, FILTER_PRESET_KEY, type FilterPreset, type FilterState } from '@/lib/filters';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { groupTodos } from '@/lib/todo-sort';
import { isDueDateFarEnough, nowIso } from '@/lib/timezone';
import type { Priority, RecurrencePattern, Subtask, Tag, Template, Todo } from '@/lib/types';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

function readPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(FILTER_PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FilterPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function templateSubtasks(template: Template): { title: string; position: number }[] {
  if (!template.subtasks_json) return [];
  try {
    const parsed = JSON.parse(template.subtasks_json) as { title: string; position: number }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function HomePage() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(nowIso);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const [completion, setCompletion] = useState<FilterState['completion']>('all');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const [titleInput, setTitleInput] = useState('');
  const [dueInput, setDueInput] = useState('');
  const [priorityInput, setPriorityInput] = useState<Priority>('medium');
  const [recurring, setRecurring] = useState(false);
  const [patternInput, setPatternInput] = useState<RecurrencePattern>('daily');
  const [reminderInput, setReminderInput] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  useNotifications(true);

  const load = useCallback(async () => {
    const [todoData, tagData, templateData, me] = await Promise.all([
      api<{ todos: Todo[] }>('/api/todos'),
      api<{ tags: Tag[] }>('/api/tags'),
      api<{ templates: Template[] }>('/api/templates'),
      api<{ user: { username: string } }>('/api/auth/me'),
    ]);
    setTodos(todoData.todos);
    setTags(tagData.tags);
    setTemplates(templateData.templates);
    setUsername(me.user.username);
  }, []);

  useEffect(() => {
    // Fetch the signed-in user's data and restore presets after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client load from the API and localStorage
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
    setPresets(readPresets());
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(nowIso()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const filters: FilterState = {
    search: debouncedSearch,
    priority: priorityFilter,
    tagId: tagFilter,
    completion,
    dueDateFrom,
    dueDateTo,
  };
  const grouped = groupTodos(applyFilters(todos, filters), now);

  function persistPresets(next: FilterPreset[]) {
    localStorage.setItem(FILTER_PRESET_KEY, JSON.stringify(next));
    setPresets(next);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function addTodo(event: FormEvent) {
    event.preventDefault();
    setError('');
    const title = titleInput.trim();
    if (!title) {
      setError('Title is required');
      return;
    }
    const due = dueInput ? (dueInput.length === 16 ? `${dueInput}:00` : dueInput) : null;
    if (recurring && !due) {
      setError('Recurring todos require a due date');
      return;
    }
    if (due && !isDueDateFarEnough(due)) {
      setError('Due date must be at least 1 minute from now');
      return;
    }
    if (reminderInput && !due) {
      setError('Reminders require a due date');
      return;
    }
    setTitleInput('');
    setDueInput('');
    setRecurring(false);
    setReminderInput('');
    setSelectedTagIds([]);
    setPriorityInput('medium');
    const tempId = -Date.now();
    const optimistic: Todo = {
      id: tempId,
      user_id: 0,
      title,
      completed: false,
      due_date: due,
      priority: priorityInput,
      is_recurring: recurring,
      recurrence_pattern: recurring ? patternInput : null,
      reminder_minutes: reminderInput ? Number(reminderInput) : null,
      last_notification_sent: null,
      created_at: nowIso(),
      updated_at: null,
      subtasks: [],
      tags: tags.filter((tag) => selectedTagIds.includes(tag.id)),
    };
    setTodos((current) => [optimistic, ...current]);
    try {
      const data = await api<{ todo: Todo }>('/api/todos', {
        method: 'POST',
        body: JSON.stringify({
          title,
          due_date: due,
          priority: priorityInput,
          is_recurring: recurring,
          recurrence_pattern: recurring ? patternInput : null,
          reminder_minutes: reminderInput ? Number(reminderInput) : null,
          tag_ids: selectedTagIds,
        }),
      });
      setTodos((current) => current.map((todo) => (todo.id === tempId ? data.todo : todo)));
    } catch (err) {
      setTodos((current) => current.filter((todo) => todo.id !== tempId));
      setError(err instanceof Error ? err.message : 'Could not create todo');
    }
  }

  async function toggleComplete(todo: Todo) {
    setError('');
    setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, completed: !item.completed } : item)));
    try {
      const data = await api<{ todo: Todo; nextTodo: Todo | null }>(`/api/todos/${todo.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !todo.completed }),
      });
      setTodos((current) => {
        const replaced = current.map((item) => (item.id === data.todo.id ? data.todo : item));
        if (data.nextTodo && !replaced.some((item) => item.id === data.nextTodo?.id)) return [...replaced, data.nextTodo];
        return replaced;
      });
    } catch (err) {
      await load();
      setError(err instanceof Error ? err.message : 'Could not update todo');
    }
  }

  async function deleteTodo(todo: Todo) {
    setError('');
    setTodos((current) => current.filter((item) => item.id !== todo.id));
    try {
      await api(`/api/todos/${todo.id}`, { method: 'DELETE' });
    } catch (err) {
      await load();
      setError(err instanceof Error ? err.message : 'Could not delete todo');
    }
  }

  async function addSubtask(todo: Todo, title: string) {
    const data = await api<{ todo: Todo }>(`/api/todos/${todo.id}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    setTodos((current) => current.map((item) => (item.id === todo.id ? data.todo : item)));
  }

  async function toggleSubtask(subtask: Subtask) {
    const data = await api<{ todo: Todo }>(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: !subtask.completed }),
    });
    setTodos((current) => current.map((item) => (item.id === data.todo.id ? data.todo : item)));
  }

  async function deleteSubtask(subtask: Subtask) {
    const data = await api<{ todo: Todo }>(`/api/subtasks/${subtask.id}`, { method: 'DELETE' });
    setTodos((current) => current.map((item) => (item.id === data.todo.id ? data.todo : item)));
  }

  async function attachTag(todo: Todo, tagId: number) {
    const data = await api<{ todo: Todo }>(`/api/todos/${todo.id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_id: tagId }),
    });
    setTodos((current) => current.map((item) => (item.id === todo.id ? data.todo : item)));
  }

  async function detachTag(todo: Todo, tagId: number) {
    const data = await api<{ todo: Todo }>(`/api/todos/${todo.id}/tags`, {
      method: 'DELETE',
      body: JSON.stringify({ tag_id: tagId }),
    });
    setTodos((current) => current.map((item) => (item.id === todo.id ? data.todo : item)));
  }

  async function downloadExport(format: 'json' | 'csv') {
    const response = await fetch(`/api/todos/export?format=${format}`);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || 'Export failed');
    }
    const blob = await response.blob();
    const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = match?.[1] ?? `todos.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    setError('');
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setError('Import file must be JSON');
      return;
    }
    try {
      await api('/api/todos/import', { method: 'POST', body: JSON.stringify(payload) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    const next: FilterPreset = {
      id: crypto.randomUUID(),
      name,
      filters: { ...filters, search: searchInput },
      createdAt: nowIso(),
    };
    persistPresets([...presets, next]);
    setPresetName('');
  }

  function applyPreset(preset: FilterPreset) {
    setSearchInput(preset.filters.search);
    setPriorityFilter(preset.filters.priority);
    setTagFilter(preset.filters.tagId);
    setCompletion(preset.filters.completion);
    setDueDateFrom(preset.filters.dueDateFrom);
    setDueDateTo(preset.filters.dueDateTo);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Todos</h1>
          <p data-testid="current-user" className="text-sm text-zinc-600 dark:text-zinc-400">{username}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link data-testid="calendar-link" href="/calendar" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Calendar</Link>
          <button type="button" data-testid="manage-tags-button" onClick={() => setTagsOpen(true)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Manage tags</button>
          <button type="button" data-testid="templates-button" onClick={() => setTemplatesOpen(true)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Templates</button>
          <button type="button" data-testid="export-json" onClick={() => void downloadExport('json')} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Export JSON</button>
          <button type="button" data-testid="export-csv" onClick={() => void downloadExport('csv')} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Export CSV</button>
          <label className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            Import
            <input data-testid="import-file" type="file" accept="application/json" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = '';
            }} />
          </label>
          <button type="button" data-testid="logout-button" onClick={() => void logout()} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Log out</button>
        </div>
      </header>

      <form onSubmit={(event) => void addTodo(event)} className="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
        <label className="text-sm font-medium md:col-span-2">
          Title
          <input data-testid="todo-title-input" value={titleInput} onChange={(event) => setTitleInput(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="text-sm font-medium">
          Due
          <input data-testid="todo-due-input" type="datetime-local" value={dueInput} onChange={(event) => setDueInput(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="text-sm font-medium">
          Priority
          <select data-testid="todo-priority-select" value={priorityInput} onChange={(event) => setPriorityInput(event.target.value as Priority)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input data-testid="todo-recurring-checkbox" type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
          Recurring
        </label>
        {recurring ? (
          <label className="text-sm font-medium">
            Pattern
            <select data-testid="todo-recurrence-select" value={patternInput} onChange={(event) => setPatternInput(event.target.value as RecurrencePattern)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
              <option value="yearly">yearly</option>
            </select>
          </label>
        ) : null}
        <label className="text-sm font-medium">
          Reminder
          <select data-testid="todo-reminder-select" disabled={!dueInput} value={reminderInput} onChange={(event) => setReminderInput(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950">
            <option value="">No reminder</option>
            {REMINDER_OPTIONS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
          </select>
        </label>
        {tags.length > 0 ? (
          <fieldset className="flex flex-wrap gap-3 text-sm md:col-span-2">
            <legend className="font-medium">Tags</legend>
            {tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid="new-todo-tag"
                  checked={selectedTagIds.includes(tag.id)}
                  onChange={(event) => {
                    setSelectedTagIds((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id));
                  }}
                />
                {tag.name}
              </label>
            ))}
          </fieldset>
        ) : null}
        {error ? <p data-testid="form-error" className="text-sm text-red-700 md:col-span-2 dark:text-red-300" role="alert">{error}</p> : null}
        <button type="submit" data-testid="add-todo-button" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white md:col-span-2 dark:bg-zinc-100 dark:text-zinc-900">Add todo</button>
      </form>

      <section className="mt-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-3">
        <label className="text-sm font-medium md:col-span-3">
          Search
          <input data-testid="search-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="text-sm font-medium">
          Priority
          <select data-testid="filter-priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | '')} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Tag
          <select data-testid="filter-tag" value={tagFilter ?? ''} onChange={(event) => setTagFilter(event.target.value ? Number(event.target.value) : null)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <option value="">Any</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Status
          <select data-testid="filter-completion" value={completion} onChange={(event) => setCompletion(event.target.value as FilterState['completion'])} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          From
          <input data-testid="filter-from" type="date" value={dueDateFrom} onChange={(event) => setDueDateFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="text-sm font-medium">
          To
          <input data-testid="filter-to" type="date" value={dueDateTo} onChange={(event) => setDueDateTo(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <div className="flex items-end gap-2">
          <input data-testid="preset-name-input" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
          <button type="button" data-testid="save-preset-button" onClick={savePreset} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Save</button>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-3">
          {presets.map((preset) => (
            <span key={preset.id} data-testid="preset-item" className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700">
              <button type="button" onClick={() => applyPreset(preset)}>{preset.name}</button>
              <button type="button" aria-label={`Delete preset ${preset.name}`} onClick={() => persistPresets(presets.filter((item) => item.id !== preset.id))}>×</button>
            </span>
          ))}
        </div>
        <button type="button" className="text-left text-sm text-zinc-600 underline dark:text-zinc-400" onClick={() => {
          setSearchInput('');
          setPriorityFilter(EMPTY_FILTERS.priority);
          setTagFilter(EMPTY_FILTERS.tagId);
          setCompletion(EMPTY_FILTERS.completion);
          setDueDateFrom('');
          setDueDateTo('');
        }}>Clear filters</button>
      </section>

      <div className="mt-6 space-y-6">
        {(['overdue', 'pending', 'completed'] as const).map((section) => (
          <section key={section} data-testid={`section-${section}`}>
            <h2 className="text-lg font-semibold capitalize">{section} ({grouped[section].length})</h2>
            <div className="mt-2 space-y-3">
              {grouped[section].map((todo) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  tags={tags}
                  onToggle={() => void toggleComplete(todo)}
                  onDelete={() => void deleteTodo(todo)}
                  onAddSubtask={(title) => addSubtask(todo, title)}
                  onToggleSubtask={(subtask) => void toggleSubtask(subtask)}
                  onDeleteSubtask={(subtask) => void deleteSubtask(subtask)}
                  onAttach={(tagId) => void attachTag(todo, tagId)}
                  onDetach={(tagId) => void detachTag(todo, tagId)}
                />
              ))}
            </div>
          </section>
        ))}
        {todos.length === 0 ? <p data-testid="empty-state" className="text-sm text-zinc-500">No todos yet</p> : null}
      </div>

      {tagsOpen ? (
        <TagModal
          tags={tags}
          onClose={() => setTagsOpen(false)}
          onChange={async () => { await load(); }}
        />
      ) : null}
      {templatesOpen ? (
        <TemplateModal
          templates={templates}
          onClose={() => setTemplatesOpen(false)}
          onChange={async () => { await load(); }}
        />
      ) : null}
    </main>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span data-testid="priority-badge" data-priority={priority} className={`inline-flex rounded px-2 py-0.5 text-sm font-semibold ${PRIORITY_BADGE_CLASS[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

function Progress({ subtasks }: { subtasks: Subtask[] }) {
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((subtask) => subtask.completed).length;
  const percent = Math.round((done / subtasks.length) * 100);
  const complete = percent === 100;
  return (
    <div data-testid="subtask-progress" className="mt-2">
      <div className="h-2 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
        <div data-testid="progress-bar" data-complete={complete ? 'true' : 'false'} className={complete ? 'h-2 bg-green-600' : 'h-2 bg-blue-600'} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{done}/{subtasks.length} subtasks</p>
    </div>
  );
}

function TodoCard({
  todo,
  tags,
  onToggle,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onAttach,
  onDetach,
}: {
  todo: Todo;
  tags: Tag[];
  onToggle: () => void;
  onDelete: () => void;
  onAddSubtask: (title: string) => Promise<void>;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
  onAttach: (tagId: number) => void;
  onDetach: (tagId: number) => void;
}) {
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const subtasks = todo.subtasks ?? [];
  const todoTags = todo.tags ?? [];
  return (
    <article data-testid="todo-item" data-id={todo.id} data-title={todo.title} data-due={todo.due_date ?? ''} data-priority={todo.priority} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start gap-3">
        <input data-testid="toggle-complete" type="checkbox" checked={todo.completed} onChange={onToggle} aria-label={`Complete ${todo.title}`} />
        <div className="min-w-0 flex-1">
          <h3 className={`font-medium ${todo.completed ? 'line-through opacity-70' : ''}`}>{todo.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <PriorityBadge priority={todo.priority} />
            {todo.is_recurring && todo.recurrence_pattern ? (
              <span data-testid="recurrence-badge" className="rounded bg-[#6b21a8] px-2 py-0.5 text-sm font-semibold text-white">🔄 {todo.recurrence_pattern}</span>
            ) : null}
            {todo.reminder_minutes != null ? (
              <span data-testid="reminder-badge" className="rounded bg-[#075985] px-2 py-0.5 text-sm font-semibold text-white">🔔 {reminderLabel(todo.reminder_minutes)}</span>
            ) : null}
            {todo.due_date ? <span className="text-sm text-zinc-600 dark:text-zinc-400">{todo.due_date.replace('T', ' ')}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {todoTags.map((tag) => (
              <span key={tag.id} data-testid="tag-chip" data-color={tag.color} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm text-black" style={{ backgroundColor: tag.color }}>
                {tag.name}
                <button type="button" data-testid="detach-tag" aria-label={`Remove tag ${tag.name}`} onClick={() => onDetach(tag.id)}>×</button>
              </span>
            ))}
          </div>
          <Progress subtasks={subtasks} />
          <ul className="mt-2 space-y-1">
            {subtasks.map((subtask) => (
              <li key={subtask.id} data-testid="subtask-item" className="flex items-center gap-2 text-sm">
                <input data-testid="toggle-subtask" type="checkbox" checked={subtask.completed} onChange={() => onToggleSubtask(subtask)} aria-label={`Complete subtask ${subtask.title}`} />
                <span className={subtask.completed ? 'line-through' : ''}>{subtask.title}</span>
                <button type="button" data-testid="delete-subtask" onClick={() => onDeleteSubtask(subtask)} className="text-zinc-500">Delete</button>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            const title = subtaskTitle.trim();
            if (!title) return;
            void onAddSubtask(title).then(() => setSubtaskTitle(''));
          }}>
            <input data-testid="subtask-input" value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Add subtask" className="flex-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <button type="submit" data-testid="add-subtask-button" className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700">Add</button>
          </form>
          {tags.length > 0 ? (
            <select data-testid="attach-tag" className="mt-2 rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950" value="" onChange={(event) => { if (event.target.value) onAttach(Number(event.target.value)); }}>
              <option value="">Add tag</option>
              {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          ) : null}
        </div>
        <button type="button" data-testid="delete-todo" onClick={onDelete} className="text-sm text-red-700 dark:text-red-300">Delete</button>
      </div>
    </article>
  );
}

function TagModal({ tags, onClose, onChange }: { tags: Tag[]; onClose: () => void; onChange: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('#3B82F6');
  const [error, setError] = useState('');

  async function createTag(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/tags', { method: 'POST', body: JSON.stringify({ name, color }) });
      setName('');
      setColor('#3B82F6');
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create tag');
    }
  }

  async function saveTag(id: number) {
    setError('');
    try {
      await api(`/api/tags/${id}`, { method: 'PUT', body: JSON.stringify({ name: editingName, color: editingColor }) });
      setEditingId(null);
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update tag');
    }
  }

  async function removeTag(id: number) {
    await api(`/api/tags/${id}`, { method: 'DELETE' });
    await onChange();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Manage tags">
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manage tags</h2>
          <button type="button" data-testid="close-tags-button" onClick={onClose}>Close</button>
        </div>
        <form onSubmit={(event) => void createTag(event)} className="mt-4 flex flex-wrap gap-2">
          <input data-testid="tag-name-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tag name" className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
          <input data-testid="tag-color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          <button type="submit" data-testid="tag-create-button" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Create</button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <ul data-testid="tag-list" className="mt-4 space-y-2">
          {tags.map((tag) => (
            <li key={tag.id} className="flex flex-wrap items-center gap-2">
              {editingId === tag.id ? (
                <>
                  <input value={editingName} onChange={(event) => setEditingName(event.target.value)} className="rounded border px-2 py-1 dark:bg-zinc-950" />
                  <input type="color" value={editingColor} onChange={(event) => setEditingColor(event.target.value)} />
                  <button type="button" data-testid="tag-save" onClick={() => void saveTag(tag.id)}>Save</button>
                </>
              ) : (
                <>
                  <span className="rounded-full px-2 py-0.5 text-sm text-black" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                  <button type="button" data-testid="tag-edit" onClick={() => { setEditingId(tag.id); setEditingName(tag.name); setEditingColor(tag.color); }}>Edit</button>
                  <button type="button" data-testid="tag-delete" onClick={() => void removeTag(tag.id)}>Delete</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TemplateModal({ templates, onClose, onChange }: { templates: Template[]; onClose: () => void; onChange: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [offset, setOffset] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [pattern, setPattern] = useState<RecurrencePattern>('weekly');
  const [reminder, setReminder] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtasks, setSubtasks] = useState<{ title: string; position: number }[]>([]);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          name,
          title_template: title,
          priority,
          due_date_offset_minutes: offset === '' ? null : Number(offset),
          is_recurring: recurring,
          recurrence_pattern: recurring ? pattern : null,
          reminder_minutes: reminder ? Number(reminder) : null,
          subtasks,
        }),
      });
      setName('');
      setTitle('');
      setOffset('');
      setRecurring(false);
      setReminder('');
      setSubtasks([]);
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save template');
    }
  }

  async function applyTemplate(id: number) {
    await api(`/api/templates/${id}/use`, { method: 'POST' });
    await onChange();
  }

  async function removeTemplate(id: number) {
    await api(`/api/templates/${id}`, { method: 'DELETE' });
    await onChange();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Templates">
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button type="button" data-testid="close-templates-button" onClick={onClose}>Close</button>
        </div>
        <form onSubmit={(event) => void save(event)} className="mt-4 grid gap-2">
          <input data-testid="template-name-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Template name" className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
          <input data-testid="template-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Todo title" className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
          <select data-testid="template-priority-select" value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input data-testid="template-offset-input" type="number" value={offset} onChange={(event) => setOffset(event.target.value)} placeholder="Due in minutes" className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
          <label className="flex items-center gap-2 text-sm">
            <input data-testid="template-recurring-checkbox" type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
            Recurring
          </label>
          {recurring ? (
            <select data-testid="template-recurrence-select" value={pattern} onChange={(event) => setPattern(event.target.value as RecurrencePattern)} className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
              <option value="yearly">yearly</option>
            </select>
          ) : null}
          <select data-testid="template-reminder-select" value={reminder} onChange={(event) => setReminder(event.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <option value="">No reminder</option>
            {REMINDER_OPTIONS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
          </select>
          <div className="flex gap-2">
            <input data-testid="template-subtask-input" value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Subtask" className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
            <button type="button" data-testid="template-add-subtask" onClick={() => {
              const nextTitle = subtaskTitle.trim();
              if (!nextTitle) return;
              setSubtasks((current) => [...current, { title: nextTitle, position: current.length }]);
              setSubtaskTitle('');
            }}>Add</button>
          </div>
          <ul>{subtasks.map((subtask) => <li key={`${subtask.position}-${subtask.title}`} className="text-sm">{subtask.title}</li>)}</ul>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button type="submit" data-testid="template-save-button" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Save template</button>
        </form>
        <ul className="mt-4 space-y-2">
          {templates.map((template) => (
            <li key={template.id} data-testid="template-item" className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="font-medium">{template.name}</p>
              <p className="text-sm text-zinc-600">{template.title_template}</p>
              <p className="text-xs text-zinc-500">{templateSubtasks(template).map((subtask) => subtask.title).join(', ')}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" data-testid="template-use" onClick={() => void applyTemplate(template.id)}>Use</button>
                <button type="button" data-testid="template-delete" onClick={() => void removeTemplate(template.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
