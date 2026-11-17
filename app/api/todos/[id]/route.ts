import { NextResponse } from 'next/server';
import { todoDB } from '@/lib/db';
import { badRequest, parseId, readJson, requireUser } from '@/lib/http';
import { normalizeDueDate, updateTodoSchema, validateTodoRules, zodMessage } from '@/lib/validation';
import { normalizeStoredDateTime } from '@/lib/timezone';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const todo = todoDB.findForUser(id, auth.session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json({ todo });
}

export async function PUT(request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const existing = todoDB.findForUser(id, auth.session.userId);
  if (!existing) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const parsed = updateTodoSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));

  let dueDate = existing.due_date;
  let dueDateChanged = false;
  if (parsed.data.due_date !== undefined) {
    try {
      dueDate = normalizeDueDate(parsed.data.due_date);
    } catch {
      return badRequest('Invalid due date');
    }
    dueDateChanged = dueDate !== existing.due_date;
  }

  let lastNotificationSent = parsed.data.last_notification_sent;
  if (lastNotificationSent) {
    try {
      lastNotificationSent = normalizeStoredDateTime(lastNotificationSent);
    } catch {
      return badRequest('Invalid notification timestamp');
    }
  }

  const isRecurring = parsed.data.is_recurring ?? existing.is_recurring;
  const rulesError = validateTodoRules(
    {
      due_date: dueDate,
      is_recurring: isRecurring,
      recurrence_pattern: parsed.data.recurrence_pattern !== undefined ? parsed.data.recurrence_pattern : existing.recurrence_pattern,
      reminder_minutes: parsed.data.reminder_minutes !== undefined ? parsed.data.reminder_minutes : existing.reminder_minutes,
    },
    dueDateChanged,
  );
  if (rulesError) return badRequest(rulesError);

  const updated = todoDB.update(id, auth.session.userId, {
    ...parsed.data,
    due_date: parsed.data.due_date !== undefined ? dueDate : undefined,
    recurrence_pattern: isRecurring
      ? parsed.data.recurrence_pattern !== undefined
        ? parsed.data.recurrence_pattern
        : existing.recurrence_pattern
      : parsed.data.is_recurring === false
        ? null
        : parsed.data.recurrence_pattern,
    last_notification_sent: lastNotificationSent,
  });
  if (!updated) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const removed = todoDB.remove(id, auth.session.userId);
  if (!removed) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
