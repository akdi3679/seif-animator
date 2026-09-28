'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import DOMPurify from 'isomorphic-dompurify';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
const TABS = ['terms', 'privacy', 'conditions'] as const;

export default function TermsPageClient() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('terms');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'terms');
  const { data, loading, error, retry, isRetrying } = usePublicGETSWR<any>('/terms');
const router = useRouter();
const pathname = usePathname();
  // Sync tab with URL param changes
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.includes(tab as any)) setActiveTab(tab);
  }, [searchParams]);

  if (loading) return <LoadingSpinner />;
  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;

  const getContent = (tab: string) => {
    const key = `${tab}_${locale}`;
    return data?.[key] || '';
  };

  const tabLabels = {
    terms: t('tab_terms'),
    privacy: t('tab_privacy'),
    conditions: t('tab_conditions'),
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-16">
      <ScrollReveal>
        <h1 className="text-4xl md:text-5xl font-black mb-8 text-dark">{t('title')}</h1>
        <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
          {TABS.map(tab => (
  <button
    key={tab}
    onClick={() => {
      setActiveTab(tab);
      const params = new URLSearchParams();
      params.set('tab', tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }}
              className={`px-4 py-2 font-medium text-sm whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
        <div className="bg-cream rounded-[40px] p-8 md:p-12 shadow-sm border border-primary/20">
          {getContent(activeTab) ? (
           <div
  className="
    [&_h2]:text-3xl [&_h2]:font-black [&_h2]:text-dark [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:border-l-8 [&_h2]:border-secondary [&_h2]:pl-6 [&_h2]:py-2
    [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:text-primary [&_h3]:mt-6 [&_h3]:mb-3
    [&_p]:leading-relaxed [&_p]:mb-6 [&_p]:text-gray-600
    [&_img]:rounded-3xl [&_img]:my-8 [&_img]:mx-auto [&_img]:max-w-full [&_img]:shadow-lg
    [&_a]:text-primary [&_a]:font-bold [&_a]:no-underline hover:[&_a]:underline
    [&_ul]:my-6 [&_ul]:list-none [&_ul]:pl-0
    [&_li]:relative [&_li]:pl-8 [&_li]:mb-3
    [&_li]:before:content-['✦'] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-secondary [&_li]:before:text-xl
  "
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(getContent(activeTab)) }}
/>
          ) : (
            <p className="text-gray-500">{t('empty')}</p>
          )}
        </div>
      </ScrollReveal>
    </div>
  );
}