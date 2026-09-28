import { getFeatureFlags } from '@/lib/getFeatureFlags';
import { getTranslations } from 'next-intl/server';
import ProductDetailClient from './ProductDetailClient';
import NotFoundPageClient from '@/app/[locale]/404/NotFoundPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale } = await params;
  const flags = await getFeatureFlags();
  const namespace = flags['products'] === false ? 'notFound' : 'productDetail';
  const t = await getTranslations({ locale, namespace });
  return {
    title: t('title'),
    description: flags['products'] === false ? t('description') : '',
  };
}

export default async function ProductDetailPage() {
  const flags = await getFeatureFlags();
  if (flags['products'] === false) return <NotFoundPageClient />;
  return <ProductDetailClient />;
}