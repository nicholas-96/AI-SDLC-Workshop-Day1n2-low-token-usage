import { NextResponse } from 'next/server';
import { templateDB } from '@/lib/db';
import { badRequest, parseId, requireUser } from '@/lib/http';

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const todo = templateDB.use(id, auth.session.userId);
  if (!todo) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json({ todo }, { status: 201 });
}
