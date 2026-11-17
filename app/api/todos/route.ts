import { NextResponse } from 'next/server';
import { todoDB } from '@/lib/db';
import { badRequest, readJson, requireUser } from '@/lib/http';
import { createTodoSchema, defaultPriority, normalizeDueDate, validateTodoRules, zodMessage } from '@/lib/validation';

export async function GET() {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ todos: todoDB.list(auth.session.userId) });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const parsed = createTodoSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));

  let dueDate: string | null;
  try {
    dueDate = normalizeDueDate(parsed.data.due_date);
  } catch {
    return badRequest('Invalid due date');
  }

  const rulesError = validateTodoRules(
    {
      due_date: dueDate,
      is_recurring: parsed.data.is_recurring ?? false,
      recurrence_pattern: parsed.data.recurrence_pattern ?? null,
      reminder_minutes: parsed.data.reminder_minutes ?? null,
    },
    dueDate != null,
  );
  if (rulesError) return badRequest(rulesError);

  try {
    const todo = todoDB.create({
      userId: auth.session.userId,
      title: parsed.data.title,
      due_date: dueDate,
      priority: defaultPriority(parsed.data.priority),
      is_recurring: parsed.data.is_recurring ?? false,
      recurrence_pattern: parsed.data.is_recurring ? parsed.data.recurrence_pattern ?? null : null,
      reminder_minutes: parsed.data.reminder_minutes ?? null,
      tagIds: parsed.data.tag_ids,
    });
    return NextResponse.json({ todo }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unknown tag') return badRequest('Unknown tag');
    return NextResponse.json({ error: 'Could not create todo' }, { status: 500 });
  }
}
