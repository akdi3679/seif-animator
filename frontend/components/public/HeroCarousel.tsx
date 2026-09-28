'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { useSiteImages } from '@/components/providers/SiteImagesProvider';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
interface Slide {
  id: string;
  image_url: string;
  title_fr: string;
  title_ar: string;
  show_floating_buttons: boolean;
}

export function HeroCarousel() {
  const locale = useLocale();
  const t = useTranslations('home');
  const { images } = useSiteImages();

const hero1 = images['hero_fallback_1'];
const hero2 = images['hero_fallback_2'];

const { data: slides, error, isLoading } = usePublicGETSWR<Slide[]>('/hero');
const { name, slogans } = useSiteData();
// slogans is an array, e.g. ["Choisi par les parents", "Adoré par les enfants"]
// we display them as a single paragraph, separated by a bullet or new line
const fullSlogan = slogans.join(' • ');
// fallback for missing keys
const titlePrefix = t('fallback.titlePrefix') || 'Explore a World of';
const titleSuffix = t('fallback.titleSuffix') || 'After School';
const exploreText = t('fallback.exploreMore') || 'Explore More';


  // Embla setup (unchanged)
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'center' },
    [Autoplay({ delay: 5000, stopOnInteraction: false })]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
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

  // ⏳ Loading state
  if (isLoading || (!slides && !error)) {
  return <LoadingSpinner />;
}


  // ⚠️ Fallback hero – only when there's an error or no slides
 if (error || !slides || slides.length === 0) {    return (
<section className="relative bg-cream min-h-[90vh] flex flex-col justify-between">      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-secondary/10 rounded-full blur-3xl animate-float-delayed" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-8 w-full grid grid-cols-12 gap-8 pt-12 pb-24 h-full items-center">
        {/* LEFT COLUMN */}
        <div className="col-span-12 lg:col-span-7">
          <ScrollReveal>

          <h1 className="text-6xl md:text-7xl lg:text-[85px] font-black leading-[1] tracking-tighter mb-8 relative z-10">
            {titlePrefix}{' '}
            <span className="fun-badge">{name}</span>{' '}
            {titleSuffix}
          </h1>

          <p className="text-gray-500 max-w-sm leading-relaxed mb-8">
            {fullSlogan ? `${fullSlogan}. ${t('fallbackSubtitle')}` : t('fallbackSubtitle')}
          </p>

          {/* Three circles moved here */}
        <div className="flex -space-x-3 mb-10 opacity-60">
  <div className="w-10 h-10 border-4 !border-[#FFB23F] rounded-full" />
  <div className="w-10 h-10 border-4 !border-[#C184FB] rounded-full" />
  <div className="w-10 h-10 border-4 !border-[#FFB23F] rounded-full" />
</div>
</ScrollReveal>

        </div>

        {/* RIGHT COLUMN – images + button */}
        <div className="col-span-12 lg:col-span-5 relative mt-10 lg:mt-0">
          {/* Swimming kid */}
<div className="hero-img-swim w-full aspect-[4/5] overflow-hidden relative z-0 shadow-xl">
{hero1?.image_url ? (
    <Image src={hero1.image_url} alt={locale === 'fr' ? hero1.alt_fr : hero1.alt_ar} fill className="object-cover" priority />
  ) : (
    <div className="absolute inset-0">{hero1?.fallbackElement}</div>
  )}
</div>

{/* Chess kid */}
<div className="hero-img-chess absolute -bottom-10 -left-20 w-64 h-64 overflow-hidden z-10 shadow-xl">
 {hero2?.image_url ? (
    <Image src={hero2.image_url} alt={locale === 'fr' ? hero2.alt_fr : hero2.alt_ar} fill className="object-cover" />
  ) : (
    <div className="absolute inset-0">{hero2?.fallbackElement}</div>
  )}
</div>

          {/* Explore button – pushed 140px left */}
          <div className="absolute bottom-0 left-0 z-0 -translate-x-[180px]">
            <Link href="/about">
              <Button className="bg-dark text-white px-10 py-4 rounded-2xl font-bold hover:bg-dark/80">
                {exploreText}
              </Button>
            </Link>
          </div>

          <div className="absolute top-10 right-0 text-green-400 text-6xl opacity-50">✦</div>
        </div>
      </div>

      {/* Bottom CTAs */}
      <div
        className={`absolute bottom-8 flex gap-4 z-20 ${
          locale === 'ar' ? 'right-8' : 'left-8'
        }`}
      >
        <Link href="/booking">
          <Button className="rounded-full px-8 py-6 text-lg font-bold bg-secondary hover:bg-secondary/90 shadow-xl">
            {t('bookNow')}
          </Button>
        </Link>
        <Link href="/contact">
          <Button variant="outline" className="rounded-full px-8 py-6 text-lg font-bold bg-white/90 backdrop-blur shadow-xl border-0">
            {t('contactUs')}
          </Button>
        </Link>
      </div>
    </section>
  );
}

  const firstSlideShowsButtons = slides[0]?.show_floating_buttons ?? false;

  return (
    <div className="relative h-[90vh] overflow-hidden" ref={emblaRef}>
      <div className="flex h-full">
        {slides.map((slide) => (
          <div key={slide.id} className="flex-[0_0_100%] relative h-full">
            <Image
              src={slide.image_url}
              alt={locale === 'fr' ? slide.title_fr : slide.title_ar}
              fill
              className="object-cover"
              priority
            />
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button
            onClick={scrollPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-10 h-10 drop-shadow-lg" />
          </button>
          <button
            onClick={scrollNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="w-10 h-10 drop-shadow-lg" />
          </button>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {scrollSnaps.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollTo(index)}
                className={`w-3 h-3 rounded-full transition-all ${
                  index === selectedIndex
                    ? 'bg-white scale-125'
                    : 'bg-white/50 hover:bg-white/80'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {firstSlideShowsButtons && (
        <div
          className={cn(
            'absolute bottom-8 flex gap-4',
            locale === 'ar' ? 'right-8' : 'left-8'
          )}
        >
          <Link href="/#booking">
            <Button className="rounded-full px-8 py-6 text-lg font-bold bg-[#FFB23F] hover:bg-[#e69e2e] shadow-lg">
              {t('bookNow')}
            </Button>
          </Link>
          <Link href="/#contact">
            <Button
              variant="outline"
              className="rounded-full px-8 py-6 text-lg font-bold bg-white/90 backdrop-blur shadow-lg"
            >
              {t('contactUs')}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}