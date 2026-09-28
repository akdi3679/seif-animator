'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { verify2FA, resend2FA, adminAPI } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useRouter as useBaseRouter } from 'next/navigation';


export default function Verify2FAPage() {
  const t = useTranslations('auth.twoFactor');
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const baseRouter = useBaseRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(900); // 15 min
  const [codeTimeLeft, setCodeTimeLeft] = useState(300); // 5 min
  const [sessionExpired, setSessionExpired] = useState(false);
  const [codeExpired, setCodeExpired] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
const redirectTarget = searchParams.get('redirect') || '/admin/dashboard';
const safeRedirect = redirectTarget.startsWith('/admin') ? redirectTarget : '/admin/dashboard';

  useEffect(() => {
    if (!sessionId) {
      router.push('/login');
      return;
    }

   const fetchTimes = async () => {
  try {
    const data = await adminAPI<{ sessionRemaining: number; codeRemaining: number }>(
      `/auth/2fa-session-info?sessionId=${sessionId}`
    );
    if (!data.sessionRemaining || !data.codeRemaining) {
      router.push('/login');
      return;
    }
    setSessionTimeLeft(data.sessionRemaining);
    setCodeTimeLeft(data.codeRemaining);
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) {
      setSessionExpired(true);
      toast.error(t('sessionExpired'));
      setTimeout(() => router.push('/login'), 2000);
    } else {
      toast.error(t('error'));
      router.push('/login'); // ← add this, don't leave user stuck
    }
  } finally {
    setInitialLoading(false);
  }
};
    fetchTimes();
  }, [sessionId, router, t]);

  // Session countdown
  useEffect(() => {
    if (sessionTimeLeft <= 0) {
      setSessionExpired(true);
      router.push('/login?reason=session_expired');
      return;
    }
    const timer = setInterval(() => setSessionTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [sessionTimeLeft, router]);

  // Code countdown
  useEffect(() => {
    if (codeTimeLeft <= 0) {
      setCodeExpired(true);
      return;
    }
    const timer = setInterval(() => setCodeTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [codeTimeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (sessionExpired || codeExpired) return;
  setError('');
  setLoading(true);
  try {
    
    await verify2FA(sessionId!, code);
baseRouter.push(safeRedirect);
  } catch (err: any) {
    if (err.status === 410) {
      router.push('/login?reason=session_expired');
    } else if (err.status === 429) {
  // Session is destroyed server-side, redirect immediately
  toast.error(t('tooManyAttempts'));
  setTimeout(() => router.push('/login'), 2000);
} else if (err.status === 400) {
      setError(t('invalidCode'));
    } else {
      setError(t('error'));
    }
  } finally {
    setLoading(false);
  }
};

  const handleResend = async () => {
    if (!sessionId) return;
    setResendLoading(true);
    setError('');
    try {
      await resend2FA(sessionId);
      toast.success(t('newCodeSent'));
      // Reset code timer
      setCodeTimeLeft(300);
      setCodeExpired(false);
      // Optionally re-fetch session time
      const data = await adminAPI<{ sessionRemaining: number; codeRemaining: number }>(
        `/auth/2fa-session-info?sessionId=${sessionId}`
      );
      setSessionTimeLeft(data.sessionRemaining);
    } catch (err: any) {
      if (err.status === 410) {
        router.push('/login?reason=session_expired');
      } else {
        toast.error(t('error'));
      }
    } finally {
      setResendLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (sessionExpired) {
    return null; // redirecting
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border-2 border-purple-200">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black mb-2">{t('title')}</h1>
          <p className="text-gray-500">{t('subtitle')}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm text-gray-400">
              {t('sessionExpiresIn')}: {formatTime(sessionTimeLeft)}
            </p>
            {!codeExpired && (
              <p className="text-sm text-gray-400">
                {t('codeExpiresIn', { time: formatTime(codeTimeLeft) })}
              </p>
            )}
          </div>
        </div>

        {!codeExpired ? (
          <form onSubmit={handleSubmit} className="space-y-6">
           <Input
  type="text"
  inputMode="numeric"
  pattern="\d{6}"
  value={code}
  onChange={(e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6); // digits only
    setCode(val);
  }}
  placeholder="000000"
  maxLength={6}
  className="text-center text-2xl tracking-widest rounded-xl"
  autoFocus
/>            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
            <Button
  type="submit"
  disabled={loading || code.length !== 6}
  className="w-full py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90"
>
  {loading ? t('verifying') : t('verify')}
</Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-gray-600">{t('codeExpired')}</p>
            <Button
              onClick={handleResend}
              disabled={resendLoading}
              className="w-full py-4 text-base font-semibold rounded-2xl bg-primary hover:bg-primary/90"
            >
              {resendLoading ? t('sending') : t('resend')}
            </Button>
          </div>
        )}
        <div className="mt-4 text-center">
          <Button
            variant="link"
            onClick={() => router.push('/login')}
            className="text-primary"
          >
            {t('backToLogin')}
          </Button>
        </div>
      </div>
    </div>
  );
}