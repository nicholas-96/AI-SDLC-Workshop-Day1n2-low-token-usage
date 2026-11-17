import { NextResponse } from 'next/server';
import { tagDB } from '@/lib/db';
import { badRequest, readJson, requireUser } from '@/lib/http';
import { tagCreateSchema, zodMessage } from '@/lib/validation';

export async function GET() {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ tags: tagDB.list(auth.session.userId) });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const parsed = tagCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));
  if (tagDB.findByNameCI(auth.session.userId, parsed.data.name)) {
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
  }
  const tag = tagDB.create(auth.session.userId, parsed.data.name, parsed.data.color ?? '#3B82F6');
  return NextResponse.json({ tag }, { status: 201 });
}
