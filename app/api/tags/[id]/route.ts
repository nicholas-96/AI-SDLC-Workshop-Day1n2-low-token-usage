import { NextResponse } from 'next/server';
import { tagDB } from '@/lib/db';
import { badRequest, parseId, readJson, requireUser } from '@/lib/http';
import { tagUpdateSchema, zodMessage } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const parsed = tagUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));
  if (parsed.data.name) {
    const existing = tagDB.findByNameCI(auth.session.userId, parsed.data.name);
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
    }
  }
  const tag = tagDB.update(id, auth.session.userId, parsed.data);
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  return NextResponse.json({ tag });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const removed = tagDB.remove(id, auth.session.userId);
  if (!removed) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
