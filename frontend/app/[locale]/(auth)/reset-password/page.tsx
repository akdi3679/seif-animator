import { getTranslations } from 'next-intl/server';
import ResetPasswordPageClient from './ResetPasswordPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.resetPassword' });
  return { title: t('title') };
}

export default function ResetPasswordPage() {
  return <ResetPasswordPageClient />;
}