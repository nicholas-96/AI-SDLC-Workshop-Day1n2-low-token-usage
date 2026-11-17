import { NextResponse } from 'next/server';
import { tagDB, todoDB } from '@/lib/db';
import { badRequest, parseId, readJson, requireUser } from '@/lib/http';
import { tagLinkSchema, zodMessage } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

async function readTagId(request: Request): Promise<{ tagId: number } | { error: string }> {
  const parsed = tagLinkSchema.safeParse(await readJson(request));
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  return { tagId: parsed.data.tag_id };
}

export async function POST(request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const todoId = parseId(rawId);
  if (todoId == null) return badRequest('Invalid id');
  const body = await readTagId(request);
  if ('error' in body) return badRequest(body.error);
  const attached = tagDB.attach(todoId, auth.session.userId, body.tagId);
  if (!attached) return NextResponse.json({ error: 'Todo or tag not found' }, { status: 404 });
  return NextResponse.json({ todo: todoDB.findForUser(todoId, auth.session.userId) });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const todoId = parseId(rawId);
  if (todoId == null) return badRequest('Invalid id');
  const body = await readTagId(request);
  if ('error' in body) return badRequest(body.error);
  const detached = tagDB.detach(todoId, auth.session.userId, body.tagId);
  if (!detached) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json({ todo: todoDB.findForUser(todoId, auth.session.userId) });
}
