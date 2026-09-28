import { getTranslations } from 'next-intl/server';
import HomePageClient from './HomePageClient';

export async function generateMetadata({ params: { locale } }) {
  const t = await getTranslations({ locale, namespace: 'admin.home' });
  return { title: t('seoTitle') };
}

export default function AdminHomePage() {
  return <HomePageClient />;
}