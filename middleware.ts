import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromToken, SESSION_COOKIE } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;
  const { pathname } = request.nextUrl;

  if ((pathname === '/' || pathname === '/calendar' || pathname.startsWith('/calendar/')) && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/calendar', '/calendar/:path*'],
};
