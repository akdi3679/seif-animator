'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/navigation';
import { Link } from '@/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminAPI, resendResetCode } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';


export default function ResetPasswordPage() {
  const t = useTranslations('auth.resetPassword');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(900);
  const [codeTimeLeft, setCodeTimeLeft] = useState(300);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [codeExpired, setCodeExpired] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const savedEmail = sessionStorage.getItem('resetEmail');
    if (!savedEmail) {
      router.push('/forgot-password');
      return;
    }
    setEmail(savedEmail);

    const fetchTimes = async () => {
      try {
        const data = await adminAPI<{ sessionRemaining: number; codeRemaining: number }>(
          `/auth/reset-session-info?email=${encodeURIComponent(savedEmail)}`
        );
        setSessionTimeLeft(data.sessionRemaining);
        setCodeTimeLeft(data.codeRemaining);
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          setSessionExpired(true);
          toast.error(t('sessionExpired'));
          setTimeout(() => router.push('/forgot-password'), 2000);
        } else {
          toast.error(t('error'));
        }
      } finally {
        setInitialLoading(false);
      }
    };
    fetchTimes();
  }, [router, t]);

  useEffect(() => {
    if (sessionTimeLeft <= 0) {
      setSessionExpired(true);
      router.push('/forgot-password?reason=session_expired');
      return;
    }
    const timer = setInterval(() => setSessionTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [sessionTimeLeft, router]);

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
  if (newPassword !== confirmPassword) {
    setError(t('passwordMismatch'));
    return;
  }
  if (code.length !== 6) {
    setError(t('codeRequired'));
    return;
  }
  setError('');
  setLoading(true);
  try {
    await adminAPI('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });
    setSuccess(true);
    sessionStorage.removeItem('resetEmail');
  } catch (err: any) {
    if (err.status === 410) {
      router.push('/forgot-password?reason=session_expired');
    } else if (err.status === 429) {
  toast.error(t('tooManyAttempts'));
  setTimeout(() => router.push('/forgot-password'), 2000);
}  else if (err.status === 400) {
      setError(t('invalidCode'));
    } else {
      setError(t('error'));
    }
  } finally {
    setLoading(false);
  }
};

  const handleResend = async () => {
    setResendLoading(true);
    setError('');
    try {
      await resendResetCode(email);
      toast.success(t('newCodeSent'));
      setCodeTimeLeft(300);
      setCodeExpired(false);
      const data = await adminAPI<{ sessionRemaining: number; codeRemaining: number }>(
        `/auth/reset-session-info?email=${encodeURIComponent(email)}`
      );
      setSessionTimeLeft(data.sessionRemaining);
    } catch (err: any) {
  if (err.status === 410) {
    router.push('/forgot-password?reason=session_expired');
  } else if (err.status === 429) {
    toast.error(t('tooManyAttempts'));
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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border-2 border-green-200 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 rounded-full p-3">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">{t('success')}</h2>
          <p className="text-gray-600 mb-6">{t('successMessage')}</p>
          <Link href="/login">
            <Button className="w-full py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90">
              {t('goToLogin')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (sessionExpired) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border-2 border-purple-200">
        <h1 className="text-3xl font-black mb-2 text-center">{t('title')}</h1>
        <p className="text-gray-500 text-center mb-8">{t('subtitle')}</p>

        <div className="text-center mb-4 space-y-1">
          <p className="text-sm text-gray-400">{t('sessionExpiresIn')}: {formatTime(sessionTimeLeft)}</p>
          {!codeExpired && (
            <p className="text-sm text-gray-400">{t('codeExpiresIn', { time: formatTime(codeTimeLeft) })}</p>
          )}
        </div>

        {!codeExpired ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input type="email" value={email} disabled className="rounded-xl bg-gray-50" />
           <Input
  type="text"
  inputMode="numeric"
  pattern="\d{6}"
  value={code}
  onChange={(e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
  }}
  placeholder="000000"
  maxLength={6}
  required
  className="rounded-xl text-center text-2xl tracking-widest"
/>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('newPassword')}
              required
              className="rounded-xl"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('confirmPassword')}
              required
              className="rounded-xl"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
<Button
  type="submit"
  disabled={loading || code.length !== 6}
  className="w-full py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90"
>
  {loading ? t('resetting') : t('reset')}
</Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-gray-600">{t('codeExpired')}</p>
            <Button onClick={handleResend} disabled={resendLoading} className="w-full py-4 text-base font-semibold rounded-2xl bg-primary hover:bg-primary/90">
              {resendLoading ? t('sending') : t('resend')}
            </Button>
          </div>
        )}

        <div className="mt-4 text-center">
          <Button variant="link" onClick={() => router.push('/forgot-password')} className="text-primary">
            {t('backToRequest')}
          </Button>
        </div>
      </div>
    </div>
  );
}