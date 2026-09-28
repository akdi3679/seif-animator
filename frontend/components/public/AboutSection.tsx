'use client';

import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Link } from '@/navigation';
import { useSiteData } from '@/components/providers/SiteDataProvider';

interface AboutSummary {
  summary_fr: string;
  summary_ar: string;
}

export function AboutSection() {
  const t = useTranslations('about');
  const locale = useLocale();
  const { data, loading } = usePublicGETSWR<AboutSummary>('/about/summary');
  const { name } = useSiteData();

  if (loading) return <LoadingSpinner />;
  if (!data) return null;

  const summary = locale === 'fr' ? data.summary_fr : data.summary_ar;
  if (!summary) return null;

  return (
    <section className="py-16 bg-cream">
      <div className="max-w-7xl mx-auto px-8">
        <ScrollReveal>
          <div className="relative bg-white rounded-[60px] p-8 md:p-12 text-center shadow-sm border-2 border-primary/20 overflow-hidden group">
            {/* ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
                Decorative site name – two layers
               ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾ */}
            {/* Blurred version – fades out on hover */}
            <div
              className="absolute -bottom-8 -right-8 text-[6rem] font-black text-primary/20 blur-md select-none pointer-events-none transition-opacity duration-500 group-hover:opacity-0"
              style={{ lineHeight: 1 }}
            >
              {name}
            </div>
            {/* Clear version – fades in on hover */}
            <div
              className="absolute -bottom-8 -right-8 text-[6rem] font-black text-primary/50 select-none pointer-events-none transition-opacity duration-500 opacity-0 group-hover:opacity-400"
              style={{ lineHeight: 1 }}
            >
              {name}
            </div>

            <h2 className="relative text-4xl md:text-5xl font-black text-dark mb-4 z-10">
              {t('title')}
            </h2>
            <p className="relative text-gray-600 text-lg max-w-2xl mx-auto mb-8 leading-relaxed z-10">
              {summary}
            </p>
            <Link href="/about" className="relative z-10">
              <Button className="rounded-full px-10 py-6 text-lg font-bold bg-secondary hover:bg-secondary/90 text-white shadow-lg transition-transform hover:scale-105">
                {t('learnMore')}
              </Button>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}