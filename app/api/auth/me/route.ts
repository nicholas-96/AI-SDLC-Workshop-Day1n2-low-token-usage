import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/http';

export async function GET() {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ user: { id: auth.session.userId, username: auth.session.username } });
}
