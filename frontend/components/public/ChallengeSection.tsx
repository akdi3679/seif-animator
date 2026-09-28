'use client';

import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';

interface ChallengeData {
  id: string;
  title_fr: string;
  title_ar: string;
  html_code: string;
}

export function ChallengeSection() {
  const locale = useLocale();
  const t = useTranslations('challenge');
  const { data, error, isLoading } = usePublicGETSWR<ChallengeData>('/challenge');

  if (isLoading || error || !data || !data.html_code) return null;

  const isUrl = data.html_code.trim().startsWith('http');

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-black text-dark">
              {locale === 'fr' ? data.title_fr : data.title_ar}
            </h2>
          </div>
        </ScrollReveal>
        <div className="rounded-[40px] overflow-hidden shadow-lg border border-gray-200">
          <iframe
            src={isUrl ? data.html_code : undefined}
            srcDoc={!isUrl ? data.html_code : undefined}
            className="w-full h-[600px] border-0"
            style={{ overflow: 'hidden' }}
            scrolling="no"
            sandbox="allow-scripts allow-same-origin allow-popups"
            title={locale === 'fr' ? data.title_fr : data.title_ar}
          />
        </div>
      </div>
    </section>
  );
}