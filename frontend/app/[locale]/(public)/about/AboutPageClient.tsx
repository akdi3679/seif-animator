'use client';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import DOMPurify from 'isomorphic-dompurify';
import Image from 'next/image';
import { usePublicGETSWR } from '@/lib/api/hooks';

interface AboutData {
  content_fr: string;
  content_ar: string;
  image_url?: string;
}

export default function AboutPageClient() {
  const locale = useLocale();
  const t = useTranslations('about');
  const { data, loading, error, retry, isRetrying } = usePublicGETSWR<AboutData>('/about');

  if (loading) return <LoadingSpinner />;
  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;

  const content = locale === 'fr' ? data?.content_fr : data?.content_ar;
  const imageUrl = data?.image_url;

  const safeContent = content ? DOMPurify.sanitize(content) : '';

  return (
    <div className="max-w-4xl mx-auto px-8 py-16">
      <ScrollReveal>
        <h1 className="text-4xl md:text-5xl font-black mb-8 text-dark">{t('title')}</h1>

        {/* Optional image */}
        {imageUrl && (
          <div className="relative w-full h-64 md:h-96 rounded-3xl overflow-hidden shadow-lg mb-8">
            <Image src={imageUrl} alt={t('title')} fill className="object-cover" />
          </div>
        )}

        {/* Full rich-text content */}
        {safeContent ? (
          <div className="bg-cream rounded-[40px] p-8 md:p-12 shadow-sm border border-primary/20">
            <div
              className="
                about-content
                [&_h2]:text-3xl [&_h2]:font-black [&_h2]:text-dark [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:border-l-8 [&_h2]:border-secondary [&_h2]:pl-6 [&_h2]:py-2
                [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:text-primary [&_h3]:mt-6 [&_h3]:mb-3
                [&_p]:leading-relaxed [&_p]:mb-6 [&_p]:text-gray-600
                [&_img]:rounded-3xl [&_img]:my-8 [&_img]:mx-auto [&_img]:max-w-full [&_img]:shadow-lg
                [&_a]:text-primary [&_a]:font-bold [&_a]:no-underline hover:[&_a]:underline
                [&_ul]:my-6 [&_ul]:list-none [&_ul]:pl-0
                [&_li]:relative [&_li]:pl-8 [&_li]:mb-3
                [&_li]:before:content-['✦'] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-secondary [&_li]:before:text-xl
              "
              dangerouslySetInnerHTML={{ __html: safeContent }}
            />
          </div>
        ) : (
          <div className="text-gray-500 text-center py-20">{t('emptyTitle')}</div>
        )}
      </ScrollReveal>
    </div>
  );
}