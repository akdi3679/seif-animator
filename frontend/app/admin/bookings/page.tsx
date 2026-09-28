import { getTranslations } from 'next-intl/server';
import BookingsClient from './BookingsClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.bookings' });
  return { title: t('title') };
}

export default function AdminBookingsPage() {
  return <BookingsClient />;
}