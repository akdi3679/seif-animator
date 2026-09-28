'use client';

import { useState, useEffect } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { cn } from '@/lib/utils';
import { useSiteData } from '@/components/providers/SiteDataProvider';

interface WhyChooseUsTab {
  id: string;
  title_fr: string;
  title_ar: string;
  description_fr: string;
  description_ar: string;
}

export function WhyChooseUsSection() {
  const locale = useLocale();
  const t = useTranslations('whyChooseUs');
  const { data: tabs, error, isLoading } = usePublicGETSWR<WhyChooseUsTab[]>('/why-choose-us');
  const { name: siteName } = useSiteData();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [sectionMounted, setSectionMounted] = useState(false);

  useEffect(() => { setSectionMounted(true); }, []);

  // Auto‑select the first tab when data arrives
  useEffect(() => {
    if (tabs && tabs.length > 0) {
      setActiveIndex(0);
    }
  }, [tabs]);

  if (isLoading || error || !tabs || tabs.length === 0) return null;

  const activeTab = activeIndex !== null ? tabs[activeIndex] : null;

  return (
    <section className="relative py-24 overflow-hidden bg-gradient-to-b from-white to-cream">
      {/* Background watermark – site name */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none select-none">
        <div className="text-[16rem] font-black text-primary/[0.05] leading-none translate-y-10">
          {activeTab ? (locale === 'fr' ? activeTab.title_fr : activeTab.title_ar) : siteName}
        </div>
      </div>

      {/* Clean gradient sweep */}
      <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-secondary/10 via-primary/5 to-transparent transition-transform duration-1000 ease-out" />

      <div className="max-w-7xl mx-auto px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left panel – section title + tab buttons */}
          <div className="relative min-h-[400px] flex flex-col justify-center">
            <ScrollReveal>
              <div className="space-y-6">
                <h2 className="text-5xl md:text-6xl font-black text-dark">
                  {t('title')}
                </h2>
              </div>
            </ScrollReveal>

            {/* Tab buttons */}
            <div className="flex flex-wrap gap-4 mt-8">
              {tabs.map((tab, idx) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    'px-8 py-3 rounded-full font-bold text-lg transition-all duration-300 shadow-md',
                    activeIndex === idx
                      ? (idx % 2 === 0 ? 'bg-primary text-white' : 'bg-secondary text-white')
                      : 'bg-white text-dark border border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {locale === 'fr' ? tab.title_fr : tab.title_ar}
                </button>
              ))}
            </div>
          </div>

          {/* Right panel – active description */}
          <ScrollReveal direction="right" className="py-4">
            <div className="relative min-h-[300px] flex items-center">
              {activeTab ? (
                <div className="space-y-4 p-8 bg-white rounded-[40px] shadow-lg border border-gray-100 transition-all duration-500">
                  <h3 className="text-3xl font-black text-dark">
                    {locale === 'fr' ? activeTab.title_fr : activeTab.title_ar}
                  </h3>
                  <p className="text-gray-600 text-lg leading-relaxed">
                    {locale === 'fr' ? activeTab.description_fr : activeTab.description_ar}
                  </p>
                </div>
              ) : (
                <div className="p-8 text-center w-full text-gray-400">
                  <p className="text-lg">{t('selectTab')}</p>
                </div>
              )}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}