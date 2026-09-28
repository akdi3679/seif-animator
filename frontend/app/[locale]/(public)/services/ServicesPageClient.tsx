'use client';

import { useState, useEffect } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { RetryableError } from '@/components/shared/RetryableError';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { X, Sparkles } from 'lucide-react';
import { useSiteData } from '@/components/providers/SiteDataProvider';

interface Service {
  id: string;
  title_fr: string;
  title_ar: string;
  description_fr: string;
  description_ar: string;
  image_url?: string;
  icon_url?: string;
}

export default function ServicesPageClient() {
  const t = useTranslations('services');
  const locale = useLocale();
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const { data: services, loading, error, retry } = usePublicGETSWR<Service[]>('/services');
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const { name: siteName } = useSiteData();

  // Auto‑select service if ?highlight= is present
  useEffect(() => {
    if (highlightId && services) {
      const service = services.find((s) => s.id === highlightId);
      if (service) setSelectedService(service);
    }
  }, [highlightId, services]);


// After the existing scroll effect:
useEffect(() => {
  if (highlightId && services) {
    const exists = services.some(s => s.id === highlightId);
    if (!exists) {
      // Remove the invalid highlight from the URL
      const params = new URLSearchParams(window.location.search);
      params.delete('highlight');
      const newUrl = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }
}, [highlightId, services]);
  // Standard patterns
  if (loading) return <LoadingSpinner />;
  if (error) return <RetryableError error={error} onRetry={retry} />;
  if (!services || services.length === 0)
    return <p className="text-center py-16">{t('empty')}</p>;

  const isRTL = locale === 'ar';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 sm:py-16">
      <ScrollReveal>
        <h1 className="text-5xl md:text-7xl font-black text-center mb-4">
          {t('pageTitle')}
        </h1>
        <p className="text-gray-600 text-xl text-center max-w-3xl mx-auto mb-12">
          {t('pageSubtitle')}
        </p>
      </ScrollReveal>

      {/* Two‑panel layout when a service is selected */}
     {selectedService ? (
  <div
    className={`relative flex flex-col lg:flex-row gap-8 ${
      isRTL ? 'lg:flex-row-reverse' : ''
    }`}
  >
    {/* Cards side – collapsed grid */}
    <div className="lg:w-[45%] grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
      {services.map((service) => (
        <div
          key={service.id}
          id={`service-${service.id}`}
          onClick={() => setSelectedService(service)}
          className={`group bg-white rounded-2xl p-4 border shadow-sm transition-all duration-300 cursor-pointer ${
            service.id === selectedService.id
              ? 'border-primary ring-2 ring-primary/30'
              : 'border-gray-200 hover:border-primary/50'
          }`}
        >
          <div className="aspect-video rounded-xl overflow-hidden mb-3 relative bg-gray-100">
            {service.image_url ? (
              <Image
                src={service.image_url}
                alt={locale === 'fr' ? service.title_fr : service.title_ar}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                {service.icon_url && (
                  <Image src={service.icon_url} alt="" width={36} height={36} />
                )}
              </div>
            )}
          </div>
          <h3 className="text-lg font-bold text-dark group-hover:text-primary transition-colors line-clamp-2">
            {locale === 'fr' ? service.title_fr : service.title_ar}
          </h3>
        </div>
      ))}
    </div>

    {/* Detail panel + shared site‑name watermark behind both columns */}
    <div className="lg:w-[55%] relative">
      {/* Full‑width site‑name watermark – spans behind both columns, bottom aligned */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none select-none z-0">
        <div className="text-[12rem] md:text-[16rem] font-black text-primary/[0.05] leading-none translate-y-10">
          {siteName}
        </div>
      </div>

      {/* Highlight panel */}
      <div className="relative rounded-[40px] shadow-2xl min-h-[500px] bg-white overflow-hidden">
        {/* Image area with white gradient overlay (bottom 60% of the panel) */}
        <div className="absolute bottom-0 left-0 right-0 h-3/5 overflow-hidden rounded-b-[40px]">
          {selectedService.image_url ? (
            <Image
              src={selectedService.image_url}
              alt={
                locale === 'fr'
                  ? selectedService.title_fr
                  : selectedService.title_ar
              }
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 to-secondary/30" />
          )}
          {/* White gradient at the top of the image – fades into white background */}
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white/70 to-transparent" />
        </div>

        {/* Content – title & description on top */}
        <ScrollReveal>
          <div className="relative z-10 p-8 pt-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 rounded-full px-4 py-1 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">
                {locale === 'fr' ? 'Service' : 'خدمة'}
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-dark mb-4 leading-tight">
              {locale === 'fr'
                ? selectedService.title_fr
                : selectedService.title_ar}
            </h2>
            <p className="text-gray-600 leading-relaxed max-w-xl">
              {locale === 'fr'
                ? selectedService.description_fr
                : selectedService.description_ar}
            </p>
          </div>
        </ScrollReveal>

        {/* Close button */}
        <button
          onClick={() => setSelectedService(null)}
          className="absolute top-4 right-4 z-20 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
) : (
        /* Full‑width cards grid (no selection) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service) => (
            <div
              key={service.id}
              id={`service-${service.id}`}
              onClick={() => setSelectedService(service)}
              className="group bg-white rounded-[40px] p-8 border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer hover:scale-[1.02]"
            >
              <div className="aspect-video rounded-3xl overflow-hidden mb-6 relative bg-gray-100">
                {service.image_url ? (
                  <Image
                    src={service.image_url}
                    alt={locale === 'fr' ? service.title_fr : service.title_ar}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    {service.icon_url && (
                      <Image src={service.icon_url} alt="" width={48} height={48} />
                    )}
                  </div>
                )}
              </div>
              <h3 className="text-2xl font-bold mb-2 text-dark group-hover:text-primary transition-colors">
                {locale === 'fr' ? service.title_fr : service.title_ar}
              </h3>
              <p className="text-gray-500 line-clamp-3">
                {locale === 'fr' ? service.description_fr : service.description_ar}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 