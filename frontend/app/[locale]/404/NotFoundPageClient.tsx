'use client';

import { useEffect } from 'react';
import { Link, useRouter, usePathname } from '@/navigation';
import { useTranslations } from 'next-intl';

export default function NotFoundPageClient() {
  const t = useTranslations('notFound');
  const router = useRouter();
  const pathname = usePathname();

  // Ensure the URL reflects the 404 route
  useEffect(() => {
    if (pathname !== '/404') {
      router.replace('/404', { scroll: false });
    }
  }, [pathname, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <div className="text-center px-4">
        <h1 className="text-9xl font-black text-dark mb-4">404</h1>
        <h2 className="text-3xl font-bold text-dark mb-6">{t('title')}</h2>
        <p className="text-gray-600 mb-8 max-w-md">{t('description')}</p>
        <Link
          href="/"
          className="inline-block bg-primary text-white px-8 py-4 rounded-2xl font-bold hover:bg-primary/80 transition-colors"
        >
          {t('returnHome')}
        </Link>
      </div>
    </div>
  );
}