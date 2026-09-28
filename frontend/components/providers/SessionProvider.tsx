'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminAPI, performRefresh, getAccessToken, setAccessToken } from '@/lib/api/client';
import { ServerOverloadError, UnauthorizedError } from '@/lib/api/types';
import { useTranslations, useLocale } from 'next-intl';
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true';
const log = (...args: any[]) => {
  if (DEBUG) {
    const time = new Date().toLocaleTimeString();
    console.log(`[Session] ${time} –`, ...args);
  }
};

interface User {
  id: string;
  email: string;
  role: 'ADMIN';
  fullName?: string;
}

interface SessionContextType {
  user: User | null;
  loading: boolean;
  refreshSession: () => Promise<boolean>;
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  loading: true,
  refreshSession: async () => false,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const refreshTimerRef = useRef<NodeJS.Timeout>();
  const firstMount = useRef(true);
  const [recoveryKey, setRecoveryKey] = useState(0);
  const locale = useLocale();
  const t = useTranslations('admin.session');
// Persist the current locale to a plain cookie so getCurrentLocale() always finds it.
useEffect(() => {
  if (typeof window === 'undefined') return;
  document.cookie = `app_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}, [locale]);
  const isAdminRoute = pathname?.startsWith('/admin') || pathname?.split('/')[2] === 'admin';
  const isAuthPage =
    pathname?.includes('/login') ||
    pathname?.includes('/verify-2fa') ||
    pathname?.includes('/forgot-password') ||
    pathname?.includes('/reset-password');

  // Single refresh function – no more duplicated singleton here.
  // Delegates entirely to performRefresh() which already has its own
  // module‑level isRefreshing/refreshPromise and cross‑tab lock.
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const token = await performRefresh();
      if (token) {
        setAccessToken(token);
        log('refresh succeeded');
        return true;
      }
      log('refresh failed (no token)');
      return false;
    } catch (error) {
      if (error instanceof ServerOverloadError) {
        log('refresh failed (transient)');
      } else {
        log('refresh failed (auth)');
      }
      return false;
    }
  }, []);

  const scheduleProactiveRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const success = await refreshSession();
        if (success) {
          scheduleProactiveRefresh();
        } else {
          log('proactive refresh failed, redirecting to login');
          if (isAdminRoute) router.push('/fr/login?reason=session_expired');
        }
      } catch (error) {
        if (error instanceof ServerOverloadError) {
          log('proactive refresh transient error, retrying in 30s');
          refreshTimerRef.current = setTimeout(() => scheduleProactiveRefresh(), 30000);
        }
      }
    }, 12 * 60 * 1000);
  }, [refreshSession, isAdminRoute, router]);

   useEffect(() => {
    // Public pages (e.g. marketing, error pages) – no auth needed, no spinner.
    if (!isAdminRoute && !isAuthPage) {
      setLoading(false);
      return;
    }

    // Auth pages (/login, /verify-2fa, /forgot-password, /reset-password) –
    // render immediately, no spinner. The user is here precisely because
    // they don't have a session. Silently check if a valid session
    // already exists (e.g. refresh cookie survived) and redirect to the
    // dashboard if so. No UI disruption either way.
       // Auth pages – the Next.js middleware (frontend/middleware.ts) already
    // redirected logged-in users to /admin/dashboard at the server level.
    // We just render the page here. No spinner, no /auth/status, no client
    // session check.
    if (isAuthPage) {
      setLoading(false);
      if (firstMount.current) firstMount.current = false;
      return;
    }

    // Protected admin routes – bootstrap session with a loading spinner.
    if (firstMount.current || !user) {
      firstMount.current = false;

      let cancelled = false;
      let retryCount = 0;
      const MAX_RETRIES = 5;

      const attemptRecovery = async () => {
        if (cancelled) return;

        try {
          const token = getAccessToken() || (await performRefresh().catch(() => null));
          if (token) {
            setAccessToken(token);
            const data = await adminAPI<{ user: User | null }>('/auth/status');
            if (cancelled) return;
            if (data.user) {
              setUser(data.user);
              setLoading(false);
              setServerUnavailable(false);
              if (isAdminRoute) scheduleProactiveRefresh();
              return;
            }
          }
        } catch (err) {
          if (err instanceof ServerOverloadError) {
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(attemptRecovery, Math.pow(2, retryCount) * 1000);
              return;
            }
            setServerUnavailable(true);
            setLoading(false);
            return;
          }
        }

        // No valid session – redirect to login.
        setLoading(false);
        if (isAdminRoute) {
         // const locale = pathname.split('/')[1];
          router.push(`/${locale}/login?reason=unauthorized`);
        }
      };

      setLoading(true);
      attemptRecovery();

      return () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        cancelled = true;
      };
    }
  }, [isAdminRoute, isAuthPage, router, scheduleProactiveRefresh, pathname, recoveryKey]);
  // Safety timeout – if still loading after 2 minutes, show error
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      setLoading(false);
      setServerUnavailable(true);
      log('session loading timeout after 2 minutes');
    }, 120000);
    return () => clearTimeout(timeout);
  }, [loading]);

  const handleManualRetry = () => {
    setServerUnavailable(false);
    setLoading(true);
    setRecoveryKey(k => k + 1);
  };

  // ── Loading spinner ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-cream z-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">{t('verifying')}</p>
        </div>
      </div>
    );
  }

  // ── Server unavailable (all retries exhausted) ─────────────────────
  if (serverUnavailable) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-cream z-50">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 mx-auto mb-6 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">{t('unreachable')}</h2>
          <p className="text-gray-500 mb-6 text-sm">
            {t('unreachableMessage')}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleManualRetry}
              className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition"
            >
              {t('retry')}
            </button>
            <button
              onClick={() => {
                clearAuthCookies();
                
                  router.push(`/${locale}/login`);
              }}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={{ user, loading, refreshSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

// Helper to clear cookies on manual logout from the "unreachable" screen
function clearAuthCookies() {
  setAccessToken(null);   // <-- ADD: clear in-memory token
  document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax';
  document.cookie = 'refreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax';
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=strict';
}