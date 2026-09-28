import { getTranslations } from 'next-intl/server';
import LoginPageClient from './LoginPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.login' });
  return { title: t('title') };
}

export default function LoginPage() {
  return <LoginPageClient />;
}