import { getTranslations } from 'next-intl/server';
import EventsClient from './EventsClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.events' });
  return { title: t('title') };
}

export default function EventsPage() {
  return <EventsClient />;
}