'use client';

import { useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

export default function ErrorPageClient() {
  const t = useTranslations('error');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-cream">
      <div className="text-center max-w-md">
        <Wrench className="w-24 h-24 text-gray-400 mb-8 mx-auto" />
        <h2 className="text-3xl font-bold mb-4 text-dark">{t('title')}</h2>
        <p className="text-gray-600 mb-8">{t('message')}</p>
      </div>
    </div>
  );
}