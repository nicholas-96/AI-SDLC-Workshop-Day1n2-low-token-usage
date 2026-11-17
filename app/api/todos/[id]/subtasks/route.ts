import { NextResponse } from 'next/server';
import { subtaskDB, todoDB } from '@/lib/db';
import { badRequest, parseId, readJson, requireUser } from '@/lib/http';
import { subtaskCreateSchema, zodMessage } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const todoId = parseId(rawId);
  if (todoId == null) return badRequest('Invalid id');
  const parsed = subtaskCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));
  const subtask = subtaskDB.create(todoId, auth.session.userId, parsed.data.title);
  if (!subtask) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  const todo = todoDB.findForUser(todoId, auth.session.userId);
  return NextResponse.json({ subtask, todo }, { status: 201 });
}
