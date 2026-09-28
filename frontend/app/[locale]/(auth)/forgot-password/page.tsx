import { getTranslations } from 'next-intl/server';
import ForgotPasswordPageClient from './ForgotPasswordPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.forgotPassword' });
  return { title: t('title') };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}