import { getTranslations } from 'next-intl/server';
import ContactPageClient from './ContactPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default function ContactPage() {
  return <ContactPageClient />;
}