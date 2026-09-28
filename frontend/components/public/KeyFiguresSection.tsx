'use client';

import { useState, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { useGoals } from '@/components/providers/GoalsProvider';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useCountUp } from '@/lib/hooks/useCountUp';

const CARDS_PER_SLIDE = 4;

function AnimatedNumber({ display, start }: { display: string; start: boolean }) {
  const match = display.match(/([\d.,]+)(.*)/);
  const numeric = match ? parseFloat(match[1].replace(/,/g, '')) : 0;
  const suffix = match?.[2] ?? '';
  const counted = useCountUp(numeric, 1500, start);
  return <>{counted.toLocaleString()}{suffix}</>;
}

export function KeyFiguresSection() {
  const locale = useLocale();
  const t = useTranslations('keyFigures');
  const { figures, isLoading, error } = useGoals();
  const { name: siteName } = useSiteData();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [clickedIndex, setClickedIndex] = useState<number | null>(null);
  const [sectionMounted, setSectionMounted] = useState(false);
const [prevBtnEnabled, setPrevBtnEnabled] = useState(false);
const [nextBtnEnabled, setNextBtnEnabled] = useState(false);
  useEffect(() => { setSectionMounted(true); }, []);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    slidesToScroll: 1,
    containScroll: 'trimSnaps',
    breakpoints: { '(max-width: 768px)': { slidesToScroll: 1 } },
  });

  const [selectedSlide, setSelectedSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

 
useEffect(() => {
  if (!emblaApi) return;
  const onSelect = () => {
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setSelectedSlide(emblaApi.selectedScrollSnap()); // remove selectedSlide if unused
    setPrevBtnEnabled(emblaApi.canScrollPrev());
    setNextBtnEnabled(emblaApi.canScrollNext());
    setSlideCount(emblaApi.scrollSnapList().length); // ← move here so it updates on reInit
  };
  emblaApi.on('select', onSelect);
  emblaApi.on('reInit', onSelect);
  onSelect(); // initial call
  return () => {
    emblaApi.off('select', onSelect);
    emblaApi.off('reInit', onSelect);
  };
}, [emblaApi]);
  if (isLoading || error || !figures || figures.length === 0) return null;

  const slides = [];
  for (let i = 0; i < figures.length; i += CARDS_PER_SLIDE) slides.push(figures.slice(i, i + CARDS_PER_SLIDE));

  const activeFigure = activeIndex !== null ? figures[activeIndex] : null;

  const handleCardClick = (index: number) => {
    setActiveIndex(index);
    setClickedIndex(index);
    setTimeout(() => setClickedIndex(null), 700);
  };

  const renderIcon = (iconName: string, active: boolean) => {
    const Icon = (LucideIcons as any)[iconName];
    if (!Icon) return null;
    return <Icon className={`w-8 h-8 mb-3 ${active ? 'text-white' : 'text-primary'}`} />;
  };

  return (
    <section className="relative py-24 overflow-hidden bg-cream">
      {/* Background digit watermark – on the full section, bottom, fully visible */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none select-none">
        <div className="text-[16rem] font-black text-primary/[0.05] leading-none translate-y-10">
          {activeFigure
            ? <AnimatedNumber display={activeFigure.value} start={sectionMounted} />
            : siteName}
        </div>
      </div>

      {/* Gradient sweep – slightly more contrast orange */}
      <div
        className={`absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-secondary/20 via-primary/5 to-transparent transition-transform duration-1000 ease-out ${
          clickedIndex !== null ? 'scale-105' : 'scale-100'
        }`}
      />

      {/* Brand arcs decoration */}
      <div className="absolute right-0 top-0 w-96 h-96 opacity-[0.03] pointer-events-none">
        <div className="logo-arc-container scale-[10] translate-x-20 -translate-y-20">
          <div className="arc-left" />
          <div className="arc-right" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left panel */}
          <div className="relative min-h-[400px] flex flex-col justify-center">
            <ScrollReveal>
              <div className="space-y-6">
                <h2 className="text-5xl md:text-6xl font-black text-dark">
                  {activeFigure
                    ? (locale === 'fr' ? activeFigure.name_fr : activeFigure.name_ar)
                    : t('title')}
                </h2>
                <p className="text-gray-500 text-lg max-w-md">
                  {activeFigure
                    ? (locale === 'fr' ? activeFigure.description_fr : activeFigure.description_ar) || ''
                    : t('subtitle')}
                </p>
                {activeFigure && (
                  <div className="text-6xl font-black text-primary">
                    <AnimatedNumber display={activeFigure.value} start={sectionMounted} />
                  </div>
                )}
              </div>
            </ScrollReveal>
          </div>

          {/* Right panel – carousel with padding for hover scale */}
          <ScrollReveal direction="right" className="py-4">
            <div className="relative">
              <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex">
                  {slides.map((slide, sIdx) => (
                    <div key={sIdx} className="flex-[0_0_100%] grid grid-cols-2 gap-4 px-4 py-2">
                      {slide.map((fig) => {
                        const figIdx = figures.indexOf(fig);
                        const isActive = figIdx === activeIndex;
                        const name = locale === 'fr' ? fig.name_fr : fig.name_ar;
                        const isUrl = fig.icon_url?.startsWith('http');
                        return (
                          <button
                            key={fig.id}
                            onClick={() => handleCardClick(figIdx)}
                            className={`relative p-5 rounded-[30px] text-left transition-all duration-300 hover:scale-[1.03] ${
                              isActive
                                ? 'bg-primary text-white shadow-xl scale-[0.98]'
                                : 'bg-white border border-gray-200 shadow-sm hover:border-primary/50 hover:shadow-md'
                            }`}
                          >
                            {fig.icon_url && !isUrl && renderIcon(fig.icon_url, isActive)}
                            {fig.icon_url && isUrl && (
                              <img src={fig.icon_url} alt="" className={`w-8 h-8 mb-3 ${isActive ? 'brightness-0 invert' : ''}`} />
                            )}
                            <h4 className="text-base font-semibold mb-1">{name}</h4>
                            <p className={`text-2xl font-black ${isActive ? 'text-white' : 'text-primary'}`}>
                              <AnimatedNumber display={fig.value} start={sectionMounted} />
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              {slides.length > 1 && (
                <>
                 <button
  onClick={() => emblaApi?.scrollPrev()}
  className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-10 hover:bg-gray-100 transition ${
    prevBtnEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-30 pointer-events-none'
  }`}
  aria-label="Previous"
>
  <ChevronLeft className="w-5 h-5" />
</button>
<button
  onClick={() => emblaApi?.scrollNext()}
  className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-10 hover:bg-gray-100 transition ${
    nextBtnEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-30 pointer-events-none'
  }`}
  aria-label="Next"
>
  <ChevronRight className="w-5 h-5" />
</button>
                  {/* Subtle indicators */}
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                    {Array.from({ length: slideCount }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => emblaApi?.scrollTo(idx)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          idx === selectedSlide ? 'bg-primary/60 scale-125' : 'bg-gray-300/50 hover:bg-gray-400/70'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}