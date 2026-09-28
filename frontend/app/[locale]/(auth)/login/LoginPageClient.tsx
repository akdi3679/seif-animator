'use client';

import { useState, useEffect , useCallback , useRef } from 'react';

import { useRouter } from '@/navigation';
import { Link } from '@/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login } from '@/lib/api/client';
import { getCachedGeo } from '@/lib/hooks/useGeoLocation';
import { useSession } from '@/components/providers/SessionProvider';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useRouter as useBaseRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const baseRouter = useBaseRouter();
  const { user, loading } = useSession();
  const submittingRef = useRef(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/admin/dashboard';
  // Validate that redirect is a relative admin path to prevent open redirect attacks
  const reason = searchParams.get('reason'); 
  const safeRedirect =
    redirectTarget.startsWith('/admin') ? redirectTarget : '/admin/dashboard';

  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  useEffect(() => {
    if (user) baseRouter.push('/admin/dashboard');
  }, [user, baseRouter]);

  useEffect(() => {
    if (!user) {
      setPendingRedirect(safeRedirect);
    }
  }, [safeRedirect, user]);
useEffect(() => {
  if (reason === 'password_changed') {
    toast.error(t('auth.login.passwordChanged'));
  } else if (reason === 'session_expired') {
    toast.error(t('auth.login.sessionExpired'));
  } else if (reason === 'token_reuse') {
    toast.error(t('auth.login.tokenReuse'));
  }
}, [reason]);
 const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
      if (submittingRef.current) {
        console.log('[LOGIN] double submit blocked');
        return;
    }
    submittingRef.current = true;
    setError('');
    setSubmitting(true);

    try {
        const geo = await getCachedGeo();
            console.log('[LOGIN] geo fetched:', geo); 
        const result = await login(email, password, geo);

        if (result.requires2FA) {
            router.push(`/verify-2fa?sessionId=${result.sessionId}&redirect=${encodeURIComponent(safeRedirect)}`);
        } else {
            // No 2FA – navigate directly. Keep the button disabled until the redirect happens.
            baseRouter.push(pendingRedirect || safeRedirect);
        }
        // Do NOT set submitting to false – the redirect will unmount the component.
    } catch (err: any) {
  if (err.status >= 500 || err.code === 'BACKEND_DOWN' || err.message?.includes('Failed to fetch')) {
    setError(t('serverUnavailable'));   // new key: "Service temporairement indisponible"
  } else {
    setError(t('error'));               // "Email ou mot de passe incorrect"
  }
  setSubmitting(false);
  submittingRef.current = false;
}
};

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border-2 border-purple-200">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black mb-2">{t('title')}</h1>
          <p className="text-gray-500">{t('subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-xl"
              placeholder="admin@myshow.tn"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-xl"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90"
          >
            {submitting ? t('signingIn') : t('signIn')}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          <Link href="/forgot-password" className="text-primary hover:underline">
            {t('forgotPassword')}
          </Link>
        </p>
      </div>
    </div>
  );
}