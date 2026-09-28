// app/[locale]/(public)/booking/page.tsx
import { getTranslations } from 'next-intl/server';
import BookingPageClient from './BookingPageClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking' });

  return {
    title: t('title'),
    description: t('subtitle'),
  };
}

export default function BookingPage() {
  return <BookingPageClient />;
}