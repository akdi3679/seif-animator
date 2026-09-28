import { getTranslations } from 'next-intl/server';
import WorkersFinanceClient from './WorkersFinanceClient';

export async function generateMetadata({ params: { locale } }) {
  const t = await getTranslations({ locale, namespace: 'admin.workers' });
  return { title: t('seoTitle') };
}

export default function WorkersFinancePage() {
  return <WorkersFinanceClient />;
}