import { NextResponse } from 'next/server';
import { todoDB } from '@/lib/db';
import { requireUser } from '@/lib/http';

export async function GET() {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ notifications: todoDB.listNotifications(auth.session.userId) });
}
