import { getTranslations } from 'next-intl/server';
import AboutAdminClient from './AboutAdminClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.about' });
  return { title: t('title') };
}

export default function AboutAdminPage() {
  return <AboutAdminClient />;
}