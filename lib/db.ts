import Database from 'better-sqlite3';
import path from 'path';
import { HOLIDAYS } from './holidays';
import type {
  Authenticator,
  Holiday,
  ImportTodoInput,
  Priority,
  RecurrencePattern,
  Subtask,
  Tag,
  Template,
  TemplateSubtaskInput,
  Todo,
  User,
} from './types';
import { addMinutes, calculateNextDueDate, normalizeStoredDateTime, nowIso } from './timezone';

export type {
  Authenticator,
  Holiday,
  Priority,
  RecurrencePattern,
  ReminderMinutes,
  Session,
  Subtask,
  Tag,
  Template,
  Todo,
  User,
} from './types';

const globalForDb = globalThis as unknown as { todoDb?: Database.Database };

interface TodoRow {
  id: number;
  user_id: number;
  title: string;
  completed: number;
  due_date: string | null;
  priority: Priority;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
}

interface SubtaskRow {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
  created_at: string;
}

interface TagRow {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
  link_todo_id?: number;
}

interface TemplateRow {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
}

export interface NewTodo {
  userId: number;
  title: string;
  completed?: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
}

export interface TodoPatch {
  title?: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  last_notification_sent?: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  credential_public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  last_notification_sent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  title_template TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  due_date_offset_minutes INTEGER,
  subtasks_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
`;

function initDatabase(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  const migrations = [
    'ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT \'medium\'',
    'ALTER TABLE todos ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT',
    'ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER',
    'ALTER TABLE todos ADD COLUMN last_notification_sent TEXT',
  ];
  for (const statement of migrations) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists on databases created with the full schema.
    }
  }
  seedHolidayRows(db);
}

function seedHolidayRows(db: Database.Database): void {
  const insert = db.prepare('INSERT OR IGNORE INTO holidays (date, name, created_at) VALUES (?, ?, ?)');
  const now = nowIso();
  const write = db.transaction(() => {
    for (const holiday of HOLIDAYS) insert.run(holiday.date, holiday.name, now);
  });
  write();
}

export function getDb(): Database.Database {
  if (!globalForDb.todoDb) {
    const database = new Database(path.join(process.cwd(), 'todos.db'));
    initDatabase(database);
    globalForDb.todoDb = database;
  }
  return globalForDb.todoDb;
}

function asBool(value: number): boolean {
  return value === 1;
}

function mapUser(row: { id: number; username: string; created_at: string }): User {
  return row;
}

function mapAuthenticator(row: {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer | Uint8Array;
  counter: number | null;
  created_at: string;
}): Authenticator {
  const publicKey = Buffer.isBuffer(row.credential_public_key)
    ? row.credential_public_key
    : Buffer.from(row.credential_public_key);
  return {
    id: row.id,
    user_id: row.user_id,
    credential_id: row.credential_id,
    credential_public_key: publicKey,
    counter: row.counter ?? 0,
    created_at: row.created_at,
  };
}

function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    completed: asBool(row.completed),
    due_date: row.due_date,
    priority: row.priority,
    is_recurring: asBool(row.is_recurring),
    recurrence_pattern: row.recurrence_pattern,
    reminder_minutes: row.reminder_minutes ?? null,
    last_notification_sent: row.last_notification_sent,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    todo_id: row.todo_id,
    title: row.title,
    completed: asBool(row.completed),
    position: row.position,
    created_at: row.created_at,
  };
}

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
  };
}

function mapTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description,
    category: row.category,
    title_template: row.title_template,
    priority: row.priority,
    is_recurring: asBool(row.is_recurring),
    recurrence_pattern: row.recurrence_pattern,
    reminder_minutes: row.reminder_minutes ?? null,
    due_date_offset_minutes: row.due_date_offset_minutes,
    subtasks_json: row.subtasks_json,
    created_at: row.created_at,
  };
}

function attachRelations(todos: Todo[]): Todo[] {
  if (todos.length === 0) return [];
  const ids = todos.map((todo) => todo.id);
  const placeholders = ids.map(() => '?').join(', ');
  const subtaskRows = getDb()
    .prepare(`SELECT * FROM subtasks WHERE todo_id IN (${placeholders}) ORDER BY position ASC, id ASC`)
    .all(...ids) as SubtaskRow[];
  const tagRows = getDb()
    .prepare(
      `SELECT tags.*, todo_tags.todo_id AS link_todo_id
       FROM tags
       JOIN todo_tags ON todo_tags.tag_id = tags.id
       WHERE todo_tags.todo_id IN (${placeholders})
       ORDER BY tags.name COLLATE NOCASE ASC`,
    )
    .all(...ids) as TagRow[];
  return todos.map((todo) => ({
    ...todo,
    subtasks: subtaskRows.filter((row) => row.todo_id === todo.id).map(mapSubtask),
    tags: tagRows.filter((row) => row.link_todo_id === todo.id).map(mapTag),
  }));
}

function insertTodo(input: NewTodo): number {
  const now = nowIso();
  const result = getDb()
    .prepare(
      `INSERT INTO todos (
        user_id, title, completed, due_date, priority, is_recurring, recurrence_pattern,
        reminder_minutes, last_notification_sent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
    )
    .run(
      input.userId,
      input.title,
      input.completed ? 1 : 0,
      input.due_date,
      input.priority,
      input.is_recurring ? 1 : 0,
      input.recurrence_pattern,
      input.reminder_minutes,
      now,
    );
  return Number(result.lastInsertRowid);
}

function insertSubtask(todoId: number, title: string, completed: boolean, position: number): number {
  const result = getDb()
    .prepare('INSERT INTO subtasks (todo_id, title, completed, position, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(todoId, title, completed ? 1 : 0, position, nowIso());
  return Number(result.lastInsertRowid);
}

function nextPosition(todoId: number): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(position), -1) AS max_position FROM subtasks WHERE todo_id = ?')
    .get(todoId) as { max_position: number };
  return row.max_position + 1;
}

export const userDB = {
  findById(id: number): User | null {
    const row = getDb().prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id) as User | undefined;
    return row ? mapUser(row) : null;
  },
  findByUsername(username: string): User | null {
    const row = getDb().prepare('SELECT id, username, created_at FROM users WHERE username = ?').get(username) as User | undefined;
    return row ? mapUser(row) : null;
  },
  create(username: string): User {
    const result = getDb().prepare('INSERT INTO users (username, created_at) VALUES (?, ?)').run(username, nowIso());
    return this.findById(Number(result.lastInsertRowid))!;
  },
};

export const authenticatorDB = {
  findByUserId(userId: number): Authenticator[] {
    const rows = getDb().prepare('SELECT * FROM authenticators WHERE user_id = ?').all(userId) as Parameters<typeof mapAuthenticator>[0][];
    return rows.map(mapAuthenticator);
  },
  findByCredentialId(credentialId: string): Authenticator | null {
    const row = getDb().prepare('SELECT * FROM authenticators WHERE credential_id = ?').get(credentialId) as Parameters<typeof mapAuthenticator>[0] | undefined;
    return row ? mapAuthenticator(row) : null;
  },
  create(input: { userId: number; credentialId: string; publicKey: Uint8Array; counter: number }): Authenticator {
    const result = getDb()
      .prepare(
        'INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.userId, input.credentialId, Buffer.from(input.publicKey), input.counter ?? 0, nowIso());
    const created = this.findByCredentialId(input.credentialId);
    if (!created) throw new Error('Failed to store authenticator');
    void result;
    return created;
  },
  updateCounter(id: number, counter: number): void {
    getDb().prepare('UPDATE authenticators SET counter = ? WHERE id = ?').run(counter ?? 0, id);
  },
};

export const todoDB = {
  list(userId: number): Todo[] {
    const rows = getDb().prepare('SELECT * FROM todos WHERE user_id = ?').all(userId) as TodoRow[];
    return attachRelations(rows.map(mapTodo));
  },
  findForUser(id: number, userId: number): Todo | null {
    const row = getDb().prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, userId) as TodoRow | undefined;
    if (!row) return null;
    return attachRelations([mapTodo(row)])[0] ?? null;
  },
  create(input: NewTodo & { tagIds?: number[] }): Todo {
    const write = getDb().transaction(() => {
      const id = insertTodo(input);
      for (const tagId of input.tagIds ?? []) {
        const tag = getDb().prepare('SELECT id FROM tags WHERE id = ? AND user_id = ?').get(tagId, input.userId);
        if (!tag) throw new Error('Unknown tag');
        getDb().prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(id, tagId);
      }
      return id;
    });
    return this.findForUser(write(), input.userId)!;
  },
  update(id: number, userId: number, patch: TodoPatch): { todo: Todo; nextTodo: Todo | null } | null {
    const existing = this.findForUser(id, userId);
    if (!existing) return null;
    const merged: NewTodo & { last_notification_sent: string | null } = {
      userId,
      title: patch.title ?? existing.title,
      completed: patch.completed ?? existing.completed,
      due_date: patch.due_date !== undefined ? patch.due_date : existing.due_date,
      priority: patch.priority ?? existing.priority,
      is_recurring: patch.is_recurring ?? existing.is_recurring,
      recurrence_pattern: patch.recurrence_pattern !== undefined ? patch.recurrence_pattern : existing.recurrence_pattern,
      reminder_minutes: patch.reminder_minutes !== undefined ? patch.reminder_minutes : existing.reminder_minutes,
      last_notification_sent: patch.last_notification_sent !== undefined ? patch.last_notification_sent : existing.last_notification_sent,
    };
    const write = getDb().transaction(() => {
      getDb()
        .prepare(
          `UPDATE todos
           SET title = ?, completed = ?, due_date = ?, priority = ?, is_recurring = ?, recurrence_pattern = ?,
               reminder_minutes = ?, last_notification_sent = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .run(
          merged.title,
          merged.completed ? 1 : 0,
          merged.due_date,
          merged.priority,
          merged.is_recurring ? 1 : 0,
          merged.recurrence_pattern,
          merged.reminder_minutes,
          merged.last_notification_sent,
          nowIso(),
          id,
          userId,
        );
      let nextId: number | null = null;
      if (!existing.completed && merged.completed && merged.is_recurring && merged.due_date && merged.recurrence_pattern) {
        nextId = insertTodo({
          userId,
          title: merged.title,
          completed: false,
          due_date: calculateNextDueDate(merged.due_date, merged.recurrence_pattern),
          priority: merged.priority,
          is_recurring: true,
          recurrence_pattern: merged.recurrence_pattern,
          reminder_minutes: merged.reminder_minutes,
        });
        getDb()
          .prepare('INSERT INTO todo_tags (todo_id, tag_id) SELECT ?, tag_id FROM todo_tags WHERE todo_id = ?')
          .run(nextId, id);
      }
      return nextId;
    });
    const nextId = write();
    return {
      todo: this.findForUser(id, userId)!,
      nextTodo: nextId == null ? null : this.findForUser(nextId, userId),
    };
  },
  remove(id: number, userId: number): boolean {
    const result = getDb().prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId);
    return result.changes > 0;
  },
  importAll(userId: number, items: ImportTodoInput[]): Todo[] {
    const write = getDb().transaction(() => {
      const ids: number[] = [];
      for (const item of items) {
        const id = insertTodo({
          userId,
          title: item.title.trim(),
          completed: item.completed,
          due_date: item.due_date ? normalizeStoredDateTime(item.due_date) : null,
          priority: item.priority,
          is_recurring: item.is_recurring,
          recurrence_pattern: item.recurrence_pattern,
          reminder_minutes: item.reminder_minutes,
        });
        for (const subtask of item.subtasks) {
          insertSubtask(id, subtask.title.trim(), subtask.completed, subtask.position);
        }
        for (const tag of item.tags) {
          const existing = tagDB.findByNameCI(userId, tag.name);
          const tagId = existing ? existing.id : tagDB.create(userId, tag.name.trim(), tag.color).id;
          getDb().prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(id, tagId);
        }
        ids.push(id);
      }
      return ids;
    });
    return write().map((id) => this.findForUser(id, userId)!);
  },
  listNotifications(userId: number): { id: number; title: string; body: string; sent_at: string }[] {
    const now = nowIso();
    return this.list(userId).flatMap((todo) => {
      if (todo.completed || !todo.due_date || todo.reminder_minutes == null) return [];
      const windowStart = addMinutes(todo.due_date, -todo.reminder_minutes);
      if (now < windowStart || now > todo.due_date) return [];
      if (todo.last_notification_sent && todo.last_notification_sent >= windowStart) return [];
      return [{ id: todo.id, title: todo.title, body: `Due ${todo.due_date}`, sent_at: now }];
    });
  },
};

export const subtaskDB = {
  findForUser(id: number, userId: number): { subtask: Subtask; todoId: number } | null {
    const row = getDb()
      .prepare(
        `SELECT subtasks.* FROM subtasks
         JOIN todos ON todos.id = subtasks.todo_id
         WHERE subtasks.id = ? AND todos.user_id = ?`,
      )
      .get(id, userId) as SubtaskRow | undefined;
    return row ? { subtask: mapSubtask(row), todoId: row.todo_id } : null;
  },
  create(todoId: number, userId: number, title: string): Subtask | null {
    const todo = todoDB.findForUser(todoId, userId);
    if (!todo) return null;
    const id = insertSubtask(todoId, title, false, nextPosition(todoId));
    const created = this.findForUser(id, userId);
    return created?.subtask ?? null;
  },
  update(id: number, userId: number, patch: { title?: string; completed?: boolean }): Subtask | null {
    const existing = this.findForUser(id, userId);
    if (!existing) return null;
    getDb()
      .prepare('UPDATE subtasks SET title = ?, completed = ? WHERE id = ?')
      .run(patch.title ?? existing.subtask.title, (patch.completed ?? existing.subtask.completed) ? 1 : 0, id);
    return this.findForUser(id, userId)?.subtask ?? null;
  },
  remove(id: number, userId: number): number | null {
    const existing = this.findForUser(id, userId);
    if (!existing) return null;
    getDb().prepare('DELETE FROM subtasks WHERE id = ?').run(id);
    return existing.todoId;
  },
};

export const tagDB = {
  list(userId: number): Tag[] {
    const rows = getDb().prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC').all(userId) as TagRow[];
    return rows.map(mapTag);
  },
  findForUser(id: number, userId: number): Tag | null {
    const row = getDb().prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, userId) as TagRow | undefined;
    return row ? mapTag(row) : null;
  },
  findByNameCI(userId: number, name: string): Tag | null {
    const row = getDb()
      .prepare('SELECT * FROM tags WHERE user_id = ? AND lower(name) = lower(?)')
      .get(userId, name.trim()) as TagRow | undefined;
    return row ? mapTag(row) : null;
  },
  create(userId: number, name: string, color: string): Tag {
    const result = getDb()
      .prepare('INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, name.trim(), color, nowIso());
    return this.findForUser(Number(result.lastInsertRowid), userId)!;
  },
  update(id: number, userId: number, patch: { name?: string; color?: string }): Tag | null {
    const existing = this.findForUser(id, userId);
    if (!existing) return null;
    getDb()
      .prepare('UPDATE tags SET name = ?, color = ? WHERE id = ? AND user_id = ?')
      .run(patch.name ?? existing.name, patch.color ?? existing.color, id, userId);
    return this.findForUser(id, userId);
  },
  remove(id: number, userId: number): boolean {
    const result = getDb().prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId);
    return result.changes > 0;
  },
  attach(todoId: number, userId: number, tagId: number): boolean {
    const todo = todoDB.findForUser(todoId, userId);
    const tag = this.findForUser(tagId, userId);
    if (!todo || !tag) return false;
    getDb().prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todoId, tagId);
    return true;
  },
  detach(todoId: number, userId: number, tagId: number): boolean {
    const todo = todoDB.findForUser(todoId, userId);
    if (!todo) return false;
    getDb().prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?').run(todoId, tagId);
    return true;
  },
};

function serializeSubtasks(subtasks: TemplateSubtaskInput[] | undefined): string | null {
  if (!subtasks || subtasks.length === 0) return null;
  return JSON.stringify(subtasks.map((subtask) => ({ title: subtask.title.trim(), position: subtask.position })));
}

function parseTemplateSubtasks(value: string | null): TemplateSubtaskInput[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item, index) => {
    if (typeof item !== 'object' || item == null) return [];
    const record = item as { title?: unknown; position?: unknown };
    if (typeof record.title !== 'string' || record.title.trim() === '') return [];
    const position = typeof record.position === 'number' ? record.position : index;
    return [{ title: record.title.trim(), position }];
  });
}

export interface TemplateInput {
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks?: TemplateSubtaskInput[];
}

export const templateDB = {
  list(userId: number): Template[] {
    const rows = getDb().prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC').all(userId) as TemplateRow[];
    return rows.map(mapTemplate);
  },
  findForUser(id: number, userId: number): Template | null {
    const row = getDb().prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?').get(id, userId) as TemplateRow | undefined;
    return row ? mapTemplate(row) : null;
  },
  create(userId: number, input: TemplateInput): Template {
    const result = getDb()
      .prepare(
        `INSERT INTO templates (
          user_id, name, description, category, title_template, priority, is_recurring, recurrence_pattern,
          reminder_minutes, due_date_offset_minutes, subtasks_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        input.name.trim(),
        input.description,
        input.category,
        input.title_template.trim(),
        input.priority,
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern,
        input.reminder_minutes,
        input.due_date_offset_minutes,
        serializeSubtasks(input.subtasks),
        nowIso(),
      );
    return this.findForUser(Number(result.lastInsertRowid), userId)!;
  },
  update(id: number, userId: number, input: TemplateInput): Template | null {
    const existing = this.findForUser(id, userId);
    if (!existing) return null;
    getDb()
      .prepare(
        `UPDATE templates
         SET name = ?, description = ?, category = ?, title_template = ?, priority = ?, is_recurring = ?,
             recurrence_pattern = ?, reminder_minutes = ?, due_date_offset_minutes = ?, subtasks_json = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        input.name.trim(),
        input.description,
        input.category,
        input.title_template.trim(),
        input.priority,
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern,
        input.reminder_minutes,
        input.due_date_offset_minutes,
        serializeSubtasks(input.subtasks),
        id,
        userId,
      );
    return this.findForUser(id, userId);
  },
  remove(id: number, userId: number): boolean {
    const result = getDb().prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId);
    return result.changes > 0;
  },
  use(id: number, userId: number): Todo | null {
    const template = this.findForUser(id, userId);
    if (!template) return null;
    const dueDate = template.due_date_offset_minutes == null ? null : addMinutes(nowIso(), template.due_date_offset_minutes);
    const subtasks = parseTemplateSubtasks(template.subtasks_json);
    const write = getDb().transaction(() => {
      const todoId = insertTodo({
        userId,
        title: template.title_template,
        completed: false,
        due_date: dueDate,
        priority: template.priority,
        is_recurring: template.is_recurring,
        recurrence_pattern: template.recurrence_pattern,
        reminder_minutes: template.reminder_minutes,
      });
      for (const subtask of subtasks) insertSubtask(todoId, subtask.title, false, subtask.position);
      return todoId;
    });
    return todoDB.findForUser(write(), userId);
  },
};

export const holidayDB = {
  list(): Holiday[] {
    return getDb().prepare('SELECT id, date, name FROM holidays ORDER BY date ASC').all() as Holiday[];
  },
  seed(): number {
    seedHolidayRows(getDb());
    const row = getDb().prepare('SELECT COUNT(*) AS count FROM holidays').get() as { count: number };
    return row.count;
  },
};
