import { getTranslations } from 'next-intl/server';
import ServicesClient from './ServicesClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.services' });
  return { title: t('title') };
}

export default function AdminServicesPage() {
  return <ServicesClient />;
}