import { getTranslations } from 'next-intl/server';
import GalleryPageClient from './GalleryPageClient';

export async function generateMetadata({ params: { locale } }) {
  const t = await getTranslations({ locale, namespace: 'admin.gallery' });
  return { title: t('seoTitle') };
}

export default function GalleryAdminPage() {
  return <GalleryPageClient />;
}