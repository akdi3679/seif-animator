import { getTranslations } from 'next-intl/server';
import MonitorClient from './MonitorClient';

export async function generateMetadata({ params: { locale } }) {
  const t = await getTranslations({ locale, namespace: 'admin.monitor' });
  return { title: t('seoTitle') };
}

export default function AdminMonitorPage() {
  return <MonitorClient />;
}