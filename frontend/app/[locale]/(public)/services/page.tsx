import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import ServicesPageClient from './ServicesPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'services' });
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-cream"><div className="w-14 h-14 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}>
      <ServicesPageClient />
    </Suspense>
  );
}