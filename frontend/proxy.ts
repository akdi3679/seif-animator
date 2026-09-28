import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';

const locales = ['fr', 'ar'];
const defaultLocale = 'fr';
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localeDetection: true,
  localePrefix: 'always',
});

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip API and static asset routes
  if (pathname.includes('/api') || pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js)$/)) {
    return NextResponse.next();
  }

  const isAuthPage =
    pathname.includes('/login') ||
    pathname.includes('/forgot-password') ||
    pathname.includes('/reset-password') ||
    pathname.includes('/verify-2fa');

  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');

  // ── Auth pages (e.g. /fr/login) ────────────────────────────────────
  // If the user has a refresh cookie, they have a live session.
  // Redirect to the admin dashboard at the SERVER level so the auth
  // page never renders — zero flash of the login form.
  //
  // We check `refreshToken` (HttpOnly) not `token` because in the
  // new auth model the access token lives in JS memory only, not in
  // cookies. The refresh cookie is the only server-visible signal.
  if (isAuthPage) {
    const refreshToken = request.cookies.get('refreshToken');
    if (refreshToken) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    // No refresh cookie → let the auth page render immediately,
    // no spinner, no client-side check.
    return NextResponse.next();
  }

  // ── Admin pages (/admin/...) ──────────────────────────────────────
  // Hard redirect to login ONLY when there's no plausible path to a
  // valid session (neither token nor refreshToken). If a refresh cookie
  // exists, the access token is probably just expired — let the page
  // load and let SessionProvider recover it client-side via /auth/refresh.
  if (isAdminPage) {
    const token = request.cookies.get('token');
    const refreshToken = request.cookies.get('refreshToken');

    if (!token && !refreshToken) {
      const originalUrl = request.nextUrl.pathname + request.nextUrl.search;
      const loginUrl = new URL(`/${defaultLocale}/login`, request.url);
      loginUrl.searchParams.set('redirect', originalUrl);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // All other routes – let next-intl handle (locale detection, etc.)
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};