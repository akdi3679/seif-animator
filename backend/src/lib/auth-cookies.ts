import { Response } from 'express';

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

export function setRefreshAndCsrfCookies(
  res: Response,
  refreshToken: string,
  csrfToken: string,
  refreshTtlDays = 7
) {
  res.cookie('refreshToken', refreshToken, {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
  });
  res.cookie('csrf_token', csrfToken, CSRF_COOKIE_OPTIONS);
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
  res.clearCookie('csrf_token', CSRF_COOKIE_OPTIONS);
  // Also clear any old 'token' cookie from previous version
  res.clearCookie('token', { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
}

// Keep for compatibility with middleware that only clears access cookies
export function clearAccessCookies(res: Response) {
  res.clearCookie('token', { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
}