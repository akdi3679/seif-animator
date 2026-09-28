'use client';

import { useState } from 'react';
import { useRouter } from '@/navigation';
import { Link } from '@/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminAPI } from '@/lib/api/client';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await adminAPI('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      sessionStorage.setItem('resetEmail', email);
      setSubmitted(true);
    } catch (err: any) {
  if (err.status === 429) {
    setError(t('tooManyAttempts'));
  } else {
    setError(t('error'));
  }
} finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl text-center">
          <h2 className="text-2xl font-bold mb-4">{t('checkEmail')}</h2>
          <p className="text-gray-600 mb-6">
            {t.rich('message', {
              email,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <Button onClick={() => router.push('/reset-password')} className="w-full">
            {t('continue')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border-2 border-purple-200">
        <h1 className="text-3xl font-black mb-2 text-center">{t('title')}</h1>
        <p className="text-gray-500 text-center mb-8">{t('subtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email')}
            required
            className="rounded-xl"
          />

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="w-full py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90"
          >
            {loading ? t('sending') : t('send')}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          <Link href="/login" className="text-primary hover:underline">
            {t('backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}