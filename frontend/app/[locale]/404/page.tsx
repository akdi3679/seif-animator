
import { getTranslations } from 'next-intl/server';
import NotFoundPageClient from './NotFoundPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'notFound' });
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default function NotFoundPage() {
  return <NotFoundPageClient />;
}