import { getTranslations } from 'next-intl/server';
import Verify2FAPageClient from './Verify2FAPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.twoFactor' });
  return { title: t('title') };
}

export default function Verify2FAPage() {
  return <Verify2FAPageClient />;
}