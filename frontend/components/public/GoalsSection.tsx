'use client';
import { useCallback, useEffect, useState } from 'react';

import useEmblaCarousel from 'embla-carousel-react';
import { useGoals } from '@/components/providers/GoalsProvider';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCountUp } from '@/lib/hooks/useCountUp';

const VISIBLE_SLIDES = 3;           // cards per view

function AnimatedNumber({ value, start }: { value: number; start: boolean }) {
  const counted = useCountUp(value, 1500, start);
  return <>{counted.toLocaleString()}</>;
}

export function GoalsSection() {
  const locale = useLocale();
  const t = useTranslations('goals');
  const { goals, isLoading, error } = useGoals();
  const { name: siteName } = useSiteData();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [clickedIndex, setClickedIndex] = useState<number | null>(null);
  const [sectionMounted, setSectionMounted] = useState(false);

  useEffect(() => { setSectionMounted(true); }, []);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    slidesToScroll: 1,
    containScroll: 'trimSnaps',
    breakpoints: { '(max-width: 768px)': { slidesToScroll: 1 } },
  });

  const [prevBtnEnabled, setPrevBtnEnabled] = useState(true);
  const [nextBtnEnabled, setNextBtnEnabled] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);



  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
      setPrevBtnEnabled(emblaApi.canScrollPrev());
      setNextBtnEnabled(emblaApi.canScrollNext());
    };
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi]);

  if (isLoading || error || !goals || goals.length === 0) return null;

  const activeGoal = activeIndex !== null ? goals[activeIndex] : null;
  const handleCardClick = (index: number) => {
    setActiveIndex(index);
    setClickedIndex(index);
    setTimeout(() => setClickedIndex(null), 700);
  };

  const calcProgress = (current: number, target: number) =>
    target > 0 ? Math.min((current / target) * 100, 100) : 0;

  const showArrows = goals.length > VISIBLE_SLIDES;

  return (
    <section className="relative py-24 max-w-[100vw]  overflow-hidden bg-gradient-to-b from-[#F8F4FF] to-cream">
      {/* Background digit watermark (full section bottom) */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none select-none">
        <div className="text-[16rem] font-black text-primary/[0.05] leading-none translate-y-10">
          {activeGoal
            ? <><AnimatedNumber value={activeGoal.current_value} start={sectionMounted} />{activeGoal.unit}</>
            : siteName}
        </div>
      </div>

      {/* Clean gradient sweep */}
      <div className={`absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-secondary/10 via-primary/5 to-transparent transition-transform duration-1000 ease-out ${clickedIndex !== null ? 'scale-105' : 'scale-100'}`} />

      {/* Subtle white stars */}
      <div className="absolute inset-0 opacity-40 pointer-events-none" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white"
            style={{ width: '2px', height: '2px', left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, animation: `twinkle ${2+Math.random()*2}s ease-in-out infinite`, animationDelay: `${Math.random()*2}s` }} />
        ))}
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left panel */}
          <div className="relative min-h-[400px] flex flex-col justify-center">
            <ScrollReveal>
              <div className="space-y-6 mr-0 ml-auto w-[85%]">
                <h2 className="text-5xl md:text-6xl font-black text-dark">
                  {activeGoal ? (locale === 'fr' ? activeGoal.title_fr : activeGoal.title_ar) : t('title')}
                </h2>
                <p className="text-gray-500 text-lg max-w-md">
                  {activeGoal
                    ? (locale === 'fr' ? `Objectif : ${activeGoal.target_value.toLocaleString()} ${activeGoal.unit || ''}` : `الهدف : ${activeGoal.target_value.toLocaleString()} ${activeGoal.unit || ''}`)
                    : t('subtitle')}
                </p>
                {activeGoal && (
                  <div className="text-6xl font-black text-primary">
                    <AnimatedNumber value={activeGoal.current_value} start={sectionMounted} />
                    {activeGoal.unit && <span className="text-2xl ml-2">{activeGoal.unit}</span>}
                  </div>
                )}
              </div>
            </ScrollReveal>
          </div>

          {/* Right panel – carousel with fixed‑width cards */}
          <ScrollReveal direction="right" className="py-4 mr-5">
            <div className="relative">
              <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex gap-4 ml-0 items-stretch">

                  {goals.map((goal) => {
                    const goalIdx = goals.indexOf(goal);
                    const isActive = goalIdx === activeIndex;
                    const title = locale === 'fr' ? goal.title_fr : goal.title_ar;
                    const progress = calcProgress(goal.current_value, goal.target_value);
                    const circumference = 2 * Math.PI * 45;
                    const offset = circumference - (progress / 100) * circumference;
                    return (
                      <div
                        key={goal.id}
                      className={`overflow-visible py-2 ${
  goals.length >= VISIBLE_SLIDES
    ? 'flex-[0_0_calc((100%-48px)/3)]'
    : goals.length === 2
    ? 'flex-[0_0_calc((100%-24px)/2)]'
    : 'flex-[0_0_100%]'
}`}>

                        <button
                          onClick={() => handleCardClick(goalIdx)}
                          className={`relative w-full flex-1 p-6 rounded-[40px] text-left transition-all duration-300 hover:scale-[1.03] ${
                            isActive
                              ? 'bg-primary text-white shadow-xl scale-[1.03]'
                              : 'bg-white border border-gray-200 shadow-sm hover:border-primary/50 hover:shadow-md'
                          }`}
                        >
                          <div className="relative w-28 h-28 mx-auto mb-4">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="6" />
                              <circle
                                cx="50" cy="50" r="45" fill="none"
                                stroke={isActive ? 'white' : 'url(#goalGrad)'}
                                strokeWidth="6"
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                              />
                              <defs>
                                <linearGradient id="goalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#C184FB" />
                                  <stop offset="100%" stopColor="#FFB23F" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-xl font-black">
                                <AnimatedNumber value={goal.current_value} start={sectionMounted} />
                              </span>
                              {goal.unit && <span className="text-xs text-gray-500">{goal.unit}</span>}
                            </div>
                          </div>
                          <h4 className="text-base font-semibold mb-1 text-center">{title}</h4>
                          <p className="text-xs text-center text-gray-400">
                            {t('target', { value: goal.target_value.toLocaleString() })}
                          </p>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {showArrows && (
                <>
                  <button
  onClick={scrollPrev}
  className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-50 hover:bg-gray-100 transition ${
    prevBtnEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-30 pointer-events-none'
  }`}
  aria-label="Previous"
>
  <ChevronLeft className="w-5 h-5" />
</button>
<button
  onClick={scrollNext}
  className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 bg-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-50 hover:bg-gray-100 transition ${
    nextBtnEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-30 pointer-events-none'
  }`}
  aria-label="Next"
>
  <ChevronRight className="w-5 h-5" />
</button>

                  {/* Low‑opacity dots */}
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-50">
                    {scrollSnaps.map((_, idx) => (
                      <button key={idx} onClick={() => emblaApi?.scrollTo(idx)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          idx === selectedIndex ? 'bg-primary/60 scale-125' : 'bg-gray-300/50 hover:bg-gray-400/70'
                        }`}
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