import { NextResponse } from 'next/server';
import { holidayDB } from '@/lib/db';
import { requireUser } from '@/lib/http';

export async function GET() {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ holidays: holidayDB.list() });
}
