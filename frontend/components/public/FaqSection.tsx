'use client';

import { useState, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FaqItem {
  id: string;
  question_fr: string;
  question_ar: string;
  answer_fr: string;
  answer_ar: string;
}

const ITEMS_PER_SLIDE = 3;

export function FaqSection() {
  const locale = useLocale();
  const t = useTranslations('faq');
  const { data: faqs, error, isLoading } = usePublicGETSWR<FaqItem[]>('/faq');
  const [openId, setOpenId] = useState<string | null>(null);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    slidesToScroll: 1,
    containScroll: 'trimSnaps',
    breakpoints: { '(max-width: 768px)': { slidesToScroll: 1 } },
  });

  const [prevEnabled, setPrevEnabled] = useState(false);
  const [nextEnabled, setNextEnabled] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [slides, setSlides] = useState<FaqItem[][]>([]);

  // Group into slides
  useEffect(() => {
    if (!faqs) return;
    const grouped = [];
    for (let i = 0; i < faqs.length; i += ITEMS_PER_SLIDE) {
      grouped.push(faqs.slice(i, i + ITEMS_PER_SLIDE));
    }
    setSlides(grouped);
  }, [faqs]);

  // Wire Embla events
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setSelectedSlide(emblaApi.selectedScrollSnap());
      setPrevEnabled(emblaApi.canScrollPrev());
      setNextEnabled(emblaApi.canScrollNext());
    };
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi]);

  const toggle = (id: string) => setOpenId(prev => (prev === id ? null : id));

  if (isLoading || error || !faqs || faqs.length === 0) return null;

  return (
    <section className="relative py-20 bg-cream overflow-hidden">
      {/* Background pattern – larger, bolder ? icons that shift when a question opens */}
      <div
        className={cn(
          'absolute inset-0 opacity-[0.08] pointer-events-none select-none transition-transform duration-700 ease-out',
          openId ? 'translate-y-2' : 'translate-y-0'
        )}
        aria-hidden="true"
      >
        <div className="grid grid-cols-6 grid-rows-5 gap-8 w-full h-full p-6">
          {Array.from({ length: 30 }).map((_, i) => (
            <span
              key={i}
              className="flex items-center justify-center font-black"
              style={{
                fontSize: '3.5rem',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 900,
                color: '#C184FB',
              }}
            >
              ?
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 relative z-10">
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl font-black text-dark text-center mb-14">
            {t('title')}
          </h2>
        </ScrollReveal>

        <div className="relative">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-4">
              {slides.map((slide, slideIdx) => (
                <div key={slideIdx} className="flex-[0_0_100%] space-y-4">
                  {slide.map((item) => {
                    const isOpen = openId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md"
                      >
                        <button
                          onClick={() => toggle(item.id)}
                          className="w-full flex justify-between items-center px-6 py-5 text-left font-semibold text-dark hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-lg md:text-xl pr-4">
                            {locale === 'fr' ? item.question_fr : item.question_ar}
                          </span>
                          <ChevronDown
                            className={cn(
                              'w-6 h-6 text-gray-400 flex-shrink-0 transition-transform duration-300',
                              isOpen && 'rotate-180'
                            )}
                          />
                        </button>
                        <div
                          className={cn(
                            'p-3 overflow-hidden transition-all duration-300',
                            isOpen ? 'pb-6 max-h-96' : 'max-h-0 p-0' 
                          )}
                        >
                          <p className="text-gray-600 leading-relaxed text-base">
                            {locale === 'fr' ? item.answer_fr : item.answer_ar}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Arrows & dots */}
          {slides.length > 1 && (
            <>
              <button
                onClick={() => emblaApi?.scrollPrev()}
                disabled={!prevEnabled}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-10 hover:bg-gray-100 disabled:opacity-30 transition pointer-events-auto"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => emblaApi?.scrollNext()}
                disabled={!nextEnabled}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-10 hover:bg-gray-100 disabled:opacity-30 transition pointer-events-auto"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div className="flex justify-center mt-8 gap-2">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => emblaApi?.scrollTo(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === selectedSlide
                        ? 'bg-primary/60 scale-125'
                        : 'bg-gray-300/50 hover:bg-gray-400/70'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}