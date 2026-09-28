'use client';
import { useState, useCallback , useEffect  } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useIdleTimer } from 'react-idle-timer';
import { adminAPI } from '@/lib/api/client';
import { useLockScreen } from '@/components/providers/LockScreenProvider';
import { useTranslations } from 'next-intl';

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

export function LockScreen() {
  const t = useTranslations('admin.lockScreen');
  const router = useRouter();

  const [isLocked, setIsLocked] = useState(false);
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState('');
const { isEnabled, isLoading } = useLockScreen();
const [loading, setLoading] = useState(false);

  // Restore lock state from sessionStorage
 useEffect(() => {
  const locked = sessionStorage.getItem('admin-locked') === 'true';
  setIsLocked(locked);
}, []);

  // Idle timer – only fire when lock is enabled
 useIdleTimer({
  timeout: LOCK_TIMEOUT,
  onIdle: () => {
    if (!isLoading && isEnabled) {
      sessionStorage.setItem('admin-locked', 'true');
      setIsLocked(true);
    }
  },
  events: ['mousemove', 'keydown', 'scroll', 'touchstart'],
  throttle: 500,
});
 const handleUnlock = useCallback(async () => {
  if (!code.trim()) {
    setError(t('error'));
    return;
  }
  setLoading(true);
  setError('');
  try {
    await adminAPI('/auth/verify-lock-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    sessionStorage.removeItem('admin-locked');
    setIsLocked(false);
    setCode('');
    setAttempts(0);
  } catch (err) {
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setError(`${t('error')} (${MAX_ATTEMPTS - newAttempts} ${t('attemptsLeft')})`);
    if (newAttempts >= MAX_ATTEMPTS) {
      await adminAPI('/auth/logout', { method: 'POST' });
      sessionStorage.clear();
      router.push('/login?reason=lock_failed');
    }
  } finally {
    setLoading(false);
  }
}, [code, attempts, router, t]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl">
      <div className="bg-white rounded-3xl p-12 max-w-md w-full shadow-2xl text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold mb-2">{t('title')}</h2>
        <p className="text-gray-600 mb-8">{t('subtitle')}</p>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          placeholder={t('placeholder')}
          className="w-full px-6 py-4 bg-gray-50 rounded-2xl text-center text-2xl font-bold tracking-widest mb-6"
          autoFocus
        />
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <div className="flex gap-4">
        <button
  onClick={handleUnlock}
  disabled={loading}
  className="flex-1 px-6 py-4 bg-primary hover:bg-primary/90 text-white rounded-2xl font-semibold transition-colors disabled:opacity-50"
>
  {loading ? (
    <>
      <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
      {t('verifying')}
    </>
  ) : (
    t('unlock')
  )}
</button>
          <button
            onClick={async () => {
              await adminAPI('/auth/logout', { method: 'POST' });
              sessionStorage.clear();
              router.push('/login');
            }}
            className="px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-semibold transition-colors"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </div>
  );
}