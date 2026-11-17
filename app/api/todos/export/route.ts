import { NextResponse } from 'next/server';
import { todosToCsv } from '@/lib/csv';
import { todoDB } from '@/lib/db';
import { buildExport } from '@/lib/export';
import { badRequest, requireUser } from '@/lib/http';
import { nowIso, singaporeToday } from '@/lib/timezone';

export async function GET(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const format = new URL(request.url).searchParams.get('format') ?? 'json';
  const todos = todoDB.list(auth.session.userId);
  const date = singaporeToday();
  if (format === 'csv') {
    return new NextResponse(todosToCsv(todos), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="todos-${date}.csv"`,
      },
    });
  }
  if (format !== 'json') return badRequest('Format must be json or csv');
  return new NextResponse(JSON.stringify(buildExport(todos, nowIso())), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="todos-${date}.json"`,
    },
  });
}
