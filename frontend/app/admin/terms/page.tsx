import { getTranslations } from 'next-intl/server';
import TermsClient from './TermsClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.terms' });
  return { title: t('title') };
}

export default function TermsPage() {
  return <TermsClient />;
}