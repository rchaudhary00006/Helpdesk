import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'hd_session';

/**
 * Cheap edge gate: only checks the cookie exists. The API verifies the JWT on every request,
 * and the client clears invalid cookies on 401, so this can't loop.
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const isLogin = req.nextUrl.pathname === '/login';

  if (!hasSession && !isLogin) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (hasSession && isLogin) return NextResponse.redirect(new URL('/tickets', req.url));
  return NextResponse.next();
}

export const config = {
  // Skip API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
