'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/navigation';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScrollReveal } from '@/components/shared/ScrollReveal';

interface Service {
  id: string;
  title_fr: string;
  title_ar: string;
  image_url?: string | null;
  link_url?: string | null;
  order_index?: number;
}

const VISIBLE_SLIDES = 3; // can be 3/2/1 based on breakpoints later

export function ServicesSection() {
  const locale = useLocale();
  const t = useTranslations('services');
  const { data: services, error } = usePublicGETSWR<Service[]>('/services');

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    slidesToScroll: 1,                // move by one card
    containScroll: 'trimSnaps',       // no empty space on edges
    breakpoints: {
      '(max-width: 768px)': { slidesToScroll: 1 },
    },
  });

  const [prevBtnEnabled, setPrevBtnEnabled] = useState(false);
  const [nextBtnEnabled, setNextBtnEnabled] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setPrevBtnEnabled(emblaApi.canScrollPrev());
    setNextBtnEnabled(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  if (error || !services || services.length === 0) return null;

  const sorted = [...services].sort((a, b) => (a.order_index ?? 99) - (b.order_index ?? 99));
  const showArrows = sorted.length > VISIBLE_SLIDES;

  return (
    <section className="py-24 max-w-[100vw] bg-cream relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-8 relative">
        {/* Vertical “See all” link */}
        <Link
          href="/services"
          className="hidden md:block absolute right-0 top-32 vertical-text text-gray-400 font-bold text-sm tracking-widest hover:text-primary transition-colors z-10"
        >
          {t('viewAll')} ↗
        </Link>

        {/* Header */}
        <ScrollReveal>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-4">
          <h2 className="text-5xl md:text-6xl font-black text-dark">{t('title')}</h2>
          <p className="text-gray-400 max-w-xs text-sm">{t('subtitle')}</p>
        </div>
</ScrollReveal>

        {/* Embla carousel */}
<ScrollReveal delay={0.15}>

        <div className="relative">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-6 ml-0">
              {sorted.map((service) => {
                const title = locale === 'fr' ? service.title_fr : service.title_ar;
                return (
                  <div
                    key={service.id}
                    // Each card takes exactly (100% - (visible-1)*gap) / visible
                    // For 3 visible: calc((100% - 48px) / 3), for 2 visible: calc((100% - 24px) / 2), etc.
                className={`overflow-visible py-2 ${
  sorted.length >= VISIBLE_SLIDES
    ? 'flex-[0_0_calc((100%-48px)/3)]'
    : sorted.length === 2
    ? 'flex-[0_0_calc((100%-24px)/2)]'
    : 'flex-[0_0_100%]'
}`}
                  >
                    <ServiceCard service={service} title={title} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation arrows */}
          {showArrows && (
            <>
              <button
                type="button"
                onClick={scrollPrev}
                disabled={!prevBtnEnabled}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-50 hover:bg-gray-100 disabled:opacity-30 transition pointer-events-auto"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={scrollNext}
                disabled={!nextBtnEnabled}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-50 hover:bg-gray-100 disabled:opacity-30 transition pointer-events-auto"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Low‑opacity dot indicators */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-50">
                {scrollSnaps.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => emblaApi?.scrollTo(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === selectedIndex ? 'bg-primary/60 scale-125' : 'bg-gray-300/50 hover:bg-gray-400/70'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        </ScrollReveal>

      </div>
    </section>
  );
}

/* ── Card Sub‑Component (unchanged) ── */
function ServiceCard({ service, title }: { service: Service; title: string }) {
  const href = `/services?highlight=${service.id}`;
  const [imgError, setImgError] = useState(false);

  return (
    <div className="group relative w-full rounded-[40px] overflow-hidden shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl z-10">
      <div className="absolute inset-0 -z-10">
        {service.image_url && !imgError ? (
          <Image src={service.image_url} alt={title} fill className="object-cover" unoptimized onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white/70 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative p-8 flex flex-col justify-between h-full min-h-[380px]">
        <h3 className="text-2xl font-bold leading-tight text-dark group-hover:text-white transition-colors">
          {title}
        </h3>
        <Link
          href={href}
          className="absolute bottom-4 left-4 w-12 h-12 bg-secondary border-4 !border-white rounded-full flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 shadow-lg"
        >
          <ArrowUpRight className="w-5 h-5 text-white" />
        </Link>
      </div>
    </div>
  );
}