import { getTranslations } from 'next-intl/server';
import DataCentreClient from './/DataCentreClient';

export async function generateMetadata({ params: { locale } }) {
  const t = await getTranslations({ locale, namespace: 'admin.data' });
  return { title: t('seoTitle') };
}

export default function AdminDataPage() {
  return <DataCentreClient />;
}