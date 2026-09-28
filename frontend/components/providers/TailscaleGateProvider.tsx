'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const TailscaleContext = createContext<{ healthy: boolean }>({ healthy: true });
export const useTailscaleHealth = () => useContext(TailscaleContext);

export function TailscaleGateProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [healthy, setHealthy] = useState(true);
  const checkedRef = useRef(false);

  const isProtectedPage =
    pathname?.startsWith('/admin') ||
    pathname?.includes('/login') ||
    pathname?.includes('/forgot-password') ||
    pathname?.includes('/reset-password') ||
    pathname?.includes('/verify-2fa');

  useEffect(() => {
    if (!isProtectedPage) return;

    const checkTailscale = async () => {
      try {
        const res = await fetch('/api/admin/health', { credentials: 'omit' });
        const ok = res.ok;
        setHealthy(ok);
        if (!ok) router.replace('/404');
      } catch {
        setHealthy(false);
        router.replace('/404');
      }
    };

    // Fetch only on the very first mount (strict‑mode guard)
    if (!checkedRef.current) {
      checkedRef.current = true;
      checkTailscale();
    }

    // Periodic recheck
    const interval = setInterval(checkTailscale, 2 * 60 * 1000);
    const onFocus = () => { if (document.visibilityState === 'visible') checkTailscale(); };
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isProtectedPage, pathname, router]);

  return (
    <TailscaleContext.Provider value={{ healthy }}>
      {children}
    </TailscaleContext.Provider>
  );
}