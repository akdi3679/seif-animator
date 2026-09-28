import { getFeatureFlags } from '@/lib/getFeatureFlags';
import { getTranslations } from 'next-intl/server';
import StorePageClient from './StorePageClient';
import NotFoundPageClient from '@/app/[locale]/404/NotFoundPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const flags = await getFeatureFlags();
  const namespace = flags['products'] === false ? 'notFound' : 'store';
  const t = await getTranslations({ locale, namespace });
  return { title: t('title') };
}

export default async function StorePage() {
  const flags = await getFeatureFlags();
  if (flags['products'] === false) return <NotFoundPageClient />;
  return <StorePageClient />;
}