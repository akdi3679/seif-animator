import { getTranslations } from 'next-intl/server';
import ErrorPageClient from './ErrorPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'error' });
  return {
    title: t('title'),
    description: t('message'),
  };
}

export default function ErrorPage() {
  return <ErrorPageClient />;
}