// frontend/lib/api/client.ts
import { ApiError, UnauthorizedError, RateLimitError, ServerOverloadError } from './types';

export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:4001';
function getCurrentLocale(): string {
  if (typeof window === 'undefined') return 'fr';

  // 1. Try the pathname (works for /fr/login, /fr/admin, etc.)
  const parts = window.location.pathname.split('/');
  if (parts[1] && ['fr', 'ar'].includes(parts[1])) return parts[1];

  // 2. Read the permanent app_locale cookie (set by SessionProvider)
  try {
    const match = document.cookie.match(/(?:^|;\s*)app_locale=([^;]+)/);
    if (match && ['fr', 'ar'].includes(match[1])) return match[1];
  } catch {}

  // 3. Fallback to the next‑intl cookie (set by middleware)
  try {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (match && ['fr', 'ar'].includes(match[1])) return match[1];
  } catch {}

  // 4. Last fallback
  return 'fr';
}
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true';


// Cross‑tab lock – prevents two browser tabs both calling /refresh at once.
const REFRESH_LOCK_KEY = '__auth_refresh_lock__';
const REFRESH_LOCK_TTL_MS = 30000;
// ── In‑memory access token (never stored in cookies / localStorage) ──
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}
function acquireCrossTabRefreshLock(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(REFRESH_LOCK_KEY);
    if (raw) {
      const existing = JSON.parse(raw);
      if (existing.expiresAt > now) return false;
    }
    window.localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ expiresAt: now + REFRESH_LOCK_TTL_MS }));
    return true;
  } catch {
    return true;
  }
}

function releaseCrossTabRefreshLock(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REFRESH_LOCK_KEY);
  } catch {}
}
// Poll the lock until it's released (or we time out). The previous version
// returned `true` after a fixed 1.2s wait without actually refreshing —
// but cookies are per-tab, so the second tab's cookies were never updated
// by the first tab's refresh. We have to wait for the first tab to
// release the lock, then do our OWN refresh.
async function waitForCrossTabLockRelease(maxWaitMs: number): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const raw = window.localStorage.getItem(REFRESH_LOCK_KEY);
      if (!raw) return true;
      const existing = JSON.parse(raw);
      if (!existing.expiresAt || existing.expiresAt <= Date.now()) return true;
    } catch {
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}
// Real implementations of the callbacks that performRefresh() expects
function onTokenRefreshed(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-refreshed', { detail: { at: Date.now() } }));
  }
}

function onTokenRefreshFailed(error: Error): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-refresh-failed', {
      detail: { message: error.message, transient: error instanceof ServerOverloadError },
    }));
  }
}

// ── Atomic single-flight refresh ────────────────────────────────
// One promise, synchronous assignment. Eliminates the race where
// concurrent callers could each pass the lock check and fire
// their own HTTP request with the same old cookie.

let pendingRefreshPromise: Promise<string | null> | null = null;

export async function performRefresh(): Promise<string | null> {
  // Synchronous check + assignment — atomic from JS single-threaded model.
  // If a refresh is already in flight, share it. No new HTTP request.
  if (pendingRefreshPromise) return pendingRefreshPromise;

  const promise = (async (): Promise<string | null> => {
    // Cross-tab lock — acquired INSIDE the single promise so concurrent
    // multi-tab callers either share this one (if pendingRefreshPromise
    // is already set) or wait for this tab's lock release.
    if (!acquireCrossTabRefreshLock()) {
      const released = await waitForCrossTabLockRelease(8000);
      if (!released) {
        console.warn('[performRefresh] cross-tab lock held too long, abandoning');
        return null;
      }
      if (!acquireCrossTabRefreshLock()) {
        const released2 = await waitForCrossTabLockRelease(8000);
        if (!released2 || !acquireCrossTabRefreshLock()) {
          console.warn('[performRefresh] cross-tab lock held too long (2nd try), abandoning');
          return null;
        }
      }
    }

    try {
      let lastTransientError: Error | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const csrf = getCsrfTokenFromCookie();
          const headers: Record<string, string> = {
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          };
          if (typeof window !== 'undefined') {
            headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
          }

          // 30s per-attempt timeout — fails fast into the retry loop.
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000);
          let res: Response;
          try {
            res = await fetch('/api/admin/auth/refresh', {
              method: 'POST',
              credentials: 'include',
              headers,
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (DEBUG) console.log('[performRefresh] attempt', attempt, 'status', res.status);

          if (res.ok) {
            const data = await res.json();
            const newAccessToken = (data.accessToken as string) ?? null;
            if (newAccessToken) {
              setAccessToken(newAccessToken); // fail-safe: in-memory token always in sync
            }
            if (DEBUG) console.log('[performRefresh] success, new accessToken received');
            onTokenRefreshed();
            return newAccessToken;
          }

          // Hard auth failure — session is dead, no retry.
          if (res.status === 401 || res.status === 400 || res.status === 403) {
            const error = new UnauthorizedError('Session expired');
            onTokenRefreshFailed(error);
            clearAuthCookies();
            redirectToLogin('session_expired');
            throw error;
          }

          // Transient error — retry with backoff.
          lastTransientError = new ServerOverloadError(
            'Refresh endpoint temporarily unavailable',
            parseInt(res.headers.get('Retry-After') || '5', 10)
          );
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
        } catch (err) {
          if (err instanceof UnauthorizedError) throw err;
          lastTransientError = err as Error;
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
        }
      }

      // All 3 attempts exhausted with transient failures.
      onTokenRefreshFailed(lastTransientError!);
      throw lastTransientError;
    } finally {
      releaseCrossTabRefreshLock();
    }
  })();

  // Assign synchronously BEFORE any outer await.
  // This is the atomic single-flight guarantee.
  pendingRefreshPromise = promise;
  try {
    return await promise;
  } finally {
    // Clear after the promise resolves/rejects so the next call gets a fresh one.
    pendingRefreshPromise = null;
  }
}

function redirectToLogin(reason: string) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.includes('/login')) return;
  const locale = getCurrentLocale();
  window.location.href = `/${locale}/login?reason=${reason}`;
}

function clearAuthCookies() {
  setAccessToken(null); // clear in-memory access token
  // HttpOnly refreshToken cookie is cleared by the backend's Set-Cookie
  // header in the 401/refresh response. document.cookie cannot touch
  // HttpOnly cookies — that line would be a silent no-op.
  // Frontend can only clear non-HttpOnly cookies:
  document.cookie = `token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax`;
  document.cookie = `csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=strict`;
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ----------------------------------------------------------------------
// Core request function
// ----------------------------------------------------------------------
async function request<T>(baseUrl: string, endpoint: string, options?: RequestInit, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (typeof window !== 'undefined') {
    headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  const csrfToken = getCsrfTokenFromCookie();
  if (csrfToken && options?.method && !['GET', 'HEAD'].includes(options.method)) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  headers['X-Request-Timestamp'] = new Date().toISOString();

  const url = `${baseUrl}${endpoint}`;
  let response: Response;
  const isFormData = options?.body instanceof FormData;
  if (isFormData) {
    delete headers['Content-Type'];
  }
    // 30s per-request timeout — defense-in-depth against hung backend.
  // AbortController aborts the fetch if the response doesn't arrive in time.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    if (fetchError?.name === 'AbortError') {
      throw new ApiError('Request timed out', 'TIMEOUT', 0);
    }
    const isConnectionRefused =
      fetchError?.message?.includes('ERR_CONNECTION_REFUSED') ||
      (fetchError?.name === 'TypeError' &&
        fetchError?.message === 'Failed to fetch' &&
        typeof navigator !== 'undefined' &&
        navigator.onLine);

    if (isConnectionRefused) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('backend-down'));
      }
      throw new ApiError('Service temporarily unavailable', 'BACKEND_DOWN', 0);
    }
    throw fetchError;
  }

  const AUTH_ENDPOINTS_NO_REFRESH = [
    '/auth/login',
    '/auth/verify-2fa',
    '/auth/resend-2fa',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/resend-reset-code',
    '/auth/reset-session-info',
    '/auth/2fa-session-info',
    '/auth/refresh',
    '/auth/status',
  ];

  if (response.status === 401 && retry) {
    if (AUTH_ENDPOINTS_NO_REFRESH.some(e => endpoint.includes(e))) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || 'Unauthorized', 'UNAUTHORIZED', 401);
    }

                       try {
      const newAccessToken = await performRefresh();
      if (newAccessToken) {
        // performRefresh() already set the in-memory access token (defensive).
        // Read CSRF from the cookie (which the browser will have processed
        // by the time we run, per Fetch spec).
        const freshCsrf = getCsrfTokenFromCookie();
        const retryHeaders: Record<string, string> = {
          ...(options?.headers as Record<string, string>),
          Authorization: `Bearer ${newAccessToken}`,
        };
        if (freshCsrf && options?.method && !['GET', 'HEAD'].includes(options.method)) {
          retryHeaders['X-CSRF-Token'] = freshCsrf;
        }
        const retryOptions: RequestInit = { ...options, headers: retryHeaders };
        return await request<T>(baseUrl, endpoint, retryOptions, false);
      }
      // performRefresh returned null — session is dead.
      // Don't fall through; treat the same as a hard 401.
      setAccessToken(null);
      throw new UnauthorizedError('Session expired');
    } catch (error) {
      if (error instanceof UnauthorizedError) {
       setAccessToken(null);
        throw error;
      }
      throw error;
    }
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new ApiError('Invalid response', 'INVALID_RESPONSE', response.status);
  }

  const data = await response.json();

   if (!response.ok) {
    if (response.status === 503) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('backend-overload'));
      const retryAfter = response.headers.get('Retry-After') || '30';
      throw new ServerOverloadError('Server under high load', parseInt(retryAfter));
    }
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
      if (
        options?.method && ['GET', 'HEAD'].includes(options.method) &&
        baseUrl === PUBLIC_API_URL
      ) {
        window.dispatchEvent(new CustomEvent('backend-rate-limit'));
      }
      throw new RateLimitError(data.error || 'Rate limit exceeded', retryAfter);
    }
        // 403 on a non-GET with a stale CSRF (e.g. another tab refreshed) — retry once with a fresh token.
    if (response.status === 403 && !AUTH_ENDPOINTS_NO_REFRESH.some(e => endpoint.includes(e))) {
      try {
        const newAccessToken = await performRefresh();
        if (newAccessToken) {
          // performRefresh() already set the in-memory access token.
          const freshCsrf = getCsrfTokenFromCookie();
          const retryHeaders: Record<string, string> = {
            ...(options?.headers as Record<string, string>),
            Authorization: `Bearer ${newAccessToken}`,
          };
          if (freshCsrf && options?.method && !['GET', 'HEAD'].includes(options.method)) {
            retryHeaders['X-CSRF-Token'] = freshCsrf;
          }
          const retryOptions: RequestInit = { ...options, headers: retryHeaders };
          return await request<T>(baseUrl, endpoint, retryOptions, false);
        }
        // performRefresh returned null — treat as session expired.
        setAccessToken(null);
        throw new UnauthorizedError('Session expired');
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          // already cleared+redirected above; just rethrow
          throw error;
        }
        // fall through to throw the original 403
      }
    }
    throw new ApiError(data.error || 'Request failed', data.code, response.status);
  }

  return data as T;
}

// ----------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------
export async function publicAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  return request<T>(PUBLIC_API_URL, `/api/public${endpoint}`, options);
}

// ----------------------------------------------------------------------
// Admin API (relative path – goes through Next.js proxy)
// ----------------------------------------------------------------------
export async function adminAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  return request<T>('', `/api/admin${endpoint}`, options);
}

// ----------------------------------------------------------------------
// Session status
// ----------------------------------------------------------------------
export async function getSessionStatus() {
  try {
    const data = await adminAPI<{ user: any }>('/auth/status');
    return data.user;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------
// Login
// ----------------------------------------------------------------------
export async function login(email: string, password: string, geo?: any) {
  const data = await adminAPI<any>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, geo }),
  });
  if (data.requires2FA) {
    return { requires2FA: true, sessionId: data.sessionId };
  }
  if (data.accessToken) {
    setAccessToken(data.accessToken);   // store in memory for all subsequent API calls
  }
  return data;
}

// ----------------------------------------------------------------------
// Verify 2FA
// ----------------------------------------------------------------------
export async function verify2FA(sessionId: string, code: string) {
  const data = await adminAPI<any>('/auth/verify-2fa', {
    method: 'POST',
    body: JSON.stringify({ sessionId, code }),
  });
  if (data.accessToken) {
    setAccessToken(data.accessToken);   // store in memory for all subsequent API calls
  }
  return data;
}
// ----------------------------------------------------------------------
// Resend 2FA code
// ----------------------------------------------------------------------
export async function resend2FA(sessionId: string) {
  return await adminAPI<any>('/auth/resend-2fa', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

// ----------------------------------------------------------------------
// Resend password reset code
// ----------------------------------------------------------------------
export async function resendResetCode(email: string) {
  return await adminAPI<any>('/auth/resend-reset-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ----------------------------------------------------------------------
// Logout
// ----------------------------------------------------------------------


export async function logout() {
  try {
    await adminAPI('/auth/logout', { method: 'POST' });
  } finally {
    const locale = getCurrentLocale();
    window.location.href = `/${locale}/login`;
  }
}