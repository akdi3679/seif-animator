'use client';
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { adminAPI } from '@/lib/api/client';

interface LockScreenContextType {
  isEnabled: boolean;
  toggle: (code?: string) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
}

const LockScreenContext = createContext<LockScreenContextType>({
  isEnabled: true,
  toggle: async () => ({ success: false }),
  isLoading: true,
});

export function useLockScreen() {
  return useContext(LockScreenContext);
}

// 1. Initialize synchronously from localStorage to prevent UI flash
const getInitialLockState = (): boolean => {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('lock_enabled');
    if (local !== null) return local === 'true';
  }
  return true; // Default to true if nothing is stored yet
};

export function LockScreenProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabled] = useState<boolean>(getInitialLockState);
  const [isLoading, setIsLoading] = useState(true);
  const hasFetched = useRef(false);

  // 2. Fetch authoritative state from backend on mount
  useEffect(() => {
    const fetchState = async () => {
      try {
        const data = await adminAPI<{ lockEnabled: boolean }>('/settings/lock');
        setIsEnabled(data.lockEnabled);
        localStorage.setItem('lock_enabled', data.lockEnabled.toString());
      } catch {
        // Fallback to initial state (already from localStorage)
      } finally {
        setIsLoading(false);
        hasFetched.current = true;
      }
    };

    if (!hasFetched.current) {
      fetchState();
    }
  }, []);

  // 3. Handle toggle logic: Enable = No code, Disable = Code required
  const toggle = useCallback(async (code?: string): Promise<{ success: boolean; error?: string }> => {
    if (isEnabled) {
      // Currently ENABLED -> We want to DISABLE it (Requires code)
      if (!code) return { success: false, error: 'Code required' };
      try {
        await adminAPI('/settings/lock', {
          method: 'PUT',
          body: JSON.stringify({ lockEnabled: false, secretCode: code }),
        });
        setIsEnabled(false);
        localStorage.setItem('lock_enabled', 'false'); // Sync localStorage immediately
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Invalid code' };
      }
    } else {
      // Currently DISABLED -> We want to ENABLE it (No code needed)
      try {
        await adminAPI('/settings/lock', {
          method: 'PUT',
          body: JSON.stringify({ lockEnabled: true }),
        });
        setIsEnabled(true);
        localStorage.setItem('lock_enabled', 'true'); // Sync localStorage immediately
        return { success: true };
      } catch (err: any) {
        return { success: false, error: 'Failed to enable lock' };
      }
    }
  }, [isEnabled]);

  return (
    <LockScreenContext.Provider value={{ isEnabled, toggle, isLoading }}>
      {children}
    </LockScreenContext.Provider>
  );
}