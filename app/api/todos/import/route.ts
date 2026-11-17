import { NextResponse } from 'next/server';
import { todoDB } from '@/lib/db';
import { badRequest, readJson, requireUser } from '@/lib/http';
import { importSchema, normalizeDueDate, validateTodoRules, zodMessage } from '@/lib/validation';

export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const parsed = importSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));

  const items = [];
  for (const item of parsed.data.todos) {
    let dueDate: string | null;
    try {
      dueDate = normalizeDueDate(item.due_date);
    } catch {
      return badRequest('Invalid due date');
    }
    const rulesError = validateTodoRules(
      {
        due_date: dueDate,
        is_recurring: item.is_recurring,
        recurrence_pattern: item.recurrence_pattern,
        reminder_minutes: item.reminder_minutes,
      },
      false,
    );
    if (rulesError) return badRequest(rulesError);
    items.push({ ...item, due_date: dueDate });
  }

  const todos = todoDB.importAll(auth.session.userId, items);
  return NextResponse.json({ imported: todos.length, todos });
}
