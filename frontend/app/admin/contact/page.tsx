import { getTranslations } from 'next-intl/server';
import ContactClient from './ContactClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.contact' });
  return { title: t('title') };
}

export default function ContactPage() {
  return <ContactClient />;
}