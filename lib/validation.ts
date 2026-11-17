import { z } from 'zod';
import { REMINDER_VALUES } from './constants';
import type { Priority, RecurrencePattern, ReminderMinutes } from './types';
import { isDueDateFarEnough, isValidStoredDateTime, normalizeStoredDateTime } from './timezone';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be 3–32 characters')
  .max(32, 'Username must be 3–32 characters')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, underscores, and hyphens');

const prioritySchema = z.enum(['high', 'medium', 'low']);
const patternSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
const reminderSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(120),
  z.literal(1440),
  z.literal(2880),
  z.literal(10080),
]);

export const createTodoSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  due_date: z.string().nullable().optional(),
  priority: prioritySchema.optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: patternSchema.nullable().optional(),
  reminder_minutes: reminderSchema.nullable().optional(),
  tag_ids: z.array(z.number().int().positive()).max(20).optional(),
});

export const updateTodoSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long').optional(),
  completed: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  priority: prioritySchema.optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: patternSchema.nullable().optional(),
  reminder_minutes: reminderSchema.nullable().optional(),
  last_notification_sent: z.string().nullable().optional(),
});

export const subtaskCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
});

export const subtaskUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long').optional(),
  completed: z.boolean().optional(),
});

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex value like #3B82F6');

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40, 'Name is too long'),
  color: colorSchema.optional(),
});

export const tagUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40, 'Name is too long').optional(),
  color: colorSchema.optional(),
});

export const tagLinkSchema = z.object({
  tag_id: z.number().int().positive(),
});

const templateSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  position: z.number().int().nonnegative(),
});

export const templateWriteSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(50).nullable().optional(),
  title_template: z.string().trim().min(1, 'Title is required').max(200),
  priority: prioritySchema.optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: patternSchema.nullable().optional(),
  reminder_minutes: reminderSchema.nullable().optional(),
  due_date_offset_minutes: z.number().int().nullable().optional(),
  subtasks: z.array(templateSubtaskSchema).max(50).optional(),
});

export const importSchema = z.object({
  version: z.literal(1),
  exported_at: z.string(),
  todos: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    completed: z.boolean(),
    due_date: z.string().nullable(),
    priority: prioritySchema,
    is_recurring: z.boolean(),
    recurrence_pattern: patternSchema.nullable(),
    reminder_minutes: reminderSchema.nullable(),
    subtasks: z.array(z.object({
      title: z.string().trim().min(1).max(200),
      completed: z.boolean(),
      position: z.number().int().nonnegative(),
    })).max(50),
    tags: z.array(z.object({
      name: z.string().trim().min(1).max(40),
      color: colorSchema,
    })).max(20),
  })).max(1000),
});

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request';
}

export interface TodoRules {
  due_date: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
}

export function normalizeDueDate(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  return normalizeStoredDateTime(value);
}

export function validateTodoRules(todo: TodoRules, dueDateChanged: boolean): string | null {
  if (todo.due_date && !isValidStoredDateTime(todo.due_date)) return 'Invalid due date';
  if (todo.is_recurring) {
    if (!todo.due_date) return 'Recurring todos require a due date';
    if (!todo.recurrence_pattern) return 'Recurring todos require a recurrence pattern';
  }
  if (todo.reminder_minutes != null) {
    if (!todo.due_date) return 'Reminders require a due date';
    if (!REMINDER_VALUES.includes(todo.reminder_minutes as ReminderMinutes)) return 'Invalid reminder';
  }
  if (dueDateChanged && todo.due_date && !isDueDateFarEnough(todo.due_date)) {
    return 'Due date must be at least 1 minute from now';
  }
  return null;
}

export function validateTemplateRules(input: {
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
}): string | null {
  if (input.is_recurring) {
    if (input.due_date_offset_minutes == null) return 'Recurring templates require a due date offset';
    if (!input.recurrence_pattern) return 'Recurring todos require a recurrence pattern';
  }
  if (input.reminder_minutes != null && input.due_date_offset_minutes == null) {
    return 'Reminders require a due date';
  }
  return null;
}

export function defaultPriority(priority: Priority | undefined): Priority {
  return priority ?? 'medium';
}
