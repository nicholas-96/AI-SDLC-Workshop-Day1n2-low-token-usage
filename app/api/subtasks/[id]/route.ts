import { NextResponse } from 'next/server';
import { subtaskDB, todoDB } from '@/lib/db';
import { badRequest, parseId, readJson, requireUser } from '@/lib/http';
import { subtaskUpdateSchema, zodMessage } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const parsed = subtaskUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));
  const subtask = subtaskDB.update(id, auth.session.userId, parsed.data);
  if (!subtask) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  const todo = todoDB.findForUser(subtask.todo_id, auth.session.userId);
  return NextResponse.json({ subtask, todo });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const todoId = subtaskDB.remove(id, auth.session.userId);
  if (todoId == null) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  const todo = todoDB.findForUser(todoId, auth.session.userId);
  return NextResponse.json({ ok: true, todo });
}
