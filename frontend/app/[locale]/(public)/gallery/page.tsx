import { getTranslations } from 'next-intl/server';
import GalleryPageClient from './GalleryPageClient';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gallery' });

  return {
    title: t('title'),
    description: t('description'),
  };
} 
export default function GalleryPage() {
  return (
      <GalleryPageClient />
  );
}

