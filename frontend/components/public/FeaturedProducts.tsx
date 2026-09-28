'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/navigation';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { formatTND } from '@/lib/utils/currency';
import { useFeatureFlags } from '@/components/providers/FeatureFlagsProvider';

interface Product {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  price: number;
  discount_percentage: number | null;
  show_original_price: boolean;
  image_url: string | null;
  is_limited: boolean;
}
function getStaticGifUrl(url: string) {
  // Replace .gif with .jpg and add Cloudinary first‑frame transformation
  return url.replace(/\.gif$/i, '.jpg') + '?pg_1,f_jpg,q_auto';
}

function isGif(url: string) {
  return /\.gif$/i.test(url);
}
// How many whole cards are visible per breakpoint
// xs (<640px): 1, sm (640–767px): 2, md (768–1023px): 3, lg (1024px+): 4
const VISIBLE = {
  lg: 4,
  md: 3,
  sm: 2,
  xs: 1,
} as const;
function FeaturedCard({ product, locale, t }: any) {
  const [hover, setHover] = useState(false);
  const name = locale === 'fr' ? product.name_fr : product.name_ar;
  const isGifImage = product.image_url && isGif(product.image_url);

  return (
    <ScrollReveal>
      <Link
        href={`/store/product/${product.slug || product.id}`}
        className="group block bg-white rounded-[40px] shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer"
      >
        <div
          className="aspect-square bg-gray-100 relative overflow-hidden"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {product.image_url ? (
            <img
              src={
                isGifImage
                  ? hover
                    ? product.image_url
                    : getStaticGifUrl(product.image_url)
                  : product.image_url
              }
              alt={name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 text-gray-400 text-5xl font-black">
              {name.charAt(0)}
            </div>
          )}
          {product.discount_percentage && product.discount_percentage > 0 && (
            <span className="absolute top-3 left-3 bg-secondary text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
              -{product.discount_percentage}%
            </span>
          )}
          {product.is_limited && (
            <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">
              {t('limited')}
            </span>
          )}
         {/* <button
            onClick={(e) => {
              e.stopPropagation();
              addItem({
                id: product.id,
                name,
                price: product.price,
                image_url: product.image_url || '',
                quantity: 1,
              });
            }}
            className="absolute bottom-3 right-3 w-10 h-10 bg-white/90 rounded-full shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-white"
            aria-label={t('addToCart')}
          >
            <ShoppingCart className="w-5 h-5" />
          </button> */}
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-dark truncate group-hover:text-primary transition-colors">
            {name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-black text-dark">
  {formatTND(Math.round(product.price * (1 - (product.discount_percentage || 0) / 100)))}
</span>
{product.show_original_price && product.discount_percentage > 0 && (
  <span className="text-sm text-gray-400 line-through">
    {formatTND(product.price)}
  </span>
)}
          </div>
        </div>
      </Link>
    </ScrollReveal>
  );
}
export function FeaturedProducts() {
  const t = useTranslations('store');
  const locale = useLocale();
    const flags = useFeatureFlags();  

  const { data, loading, error } = usePublicGETSWR<{ products: Product[] }>(
    '/products?sort=newest&limit=4'
  );
  // Track viewport to decide visible count & whether to show arrows
  const [visibleCount, setVisibleCount] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1024) setVisibleCount(4);
      else if (w >= 768) setVisibleCount(3);
      else if (w >= 640) setVisibleCount(2);
      else setVisibleCount(1);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    slidesToScroll: 1,
    containScroll: 'trimSnaps',
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
  if (flags['products'] === false) return null;

  if (loading) return <LoadingSpinner />;
  if (error || !data || data.products.length === 0) return null;

  const products = data.products;
  const showArrows = products.length > visibleCount;

  // Gap between cards is always 24px (gap-6).
  // Card width = (100% - (visibleCount - 1) * 24px) / visibleCount
  // We express this as a CSS calc so Embla gets the exact pixel width.
  // Replace the cardFlex line:
const effectiveVisible = Math.min(products.length, visibleCount);
const cardFlex = `0 0 calc((100% - ${(effectiveVisible - 1) * 24}px) / ${effectiveVisible})`;
  return (
    <section className="py-20 bg-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <ScrollReveal>
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-4xl md:text-5xl font-black text-dark">
                {t('featuredTitle')}
              </h2>
              <p className="text-gray-500 mt-2">{t('featuredSubtitle')}</p>
            </div>
            <Link href="/store">
              <button className="hidden md:inline-flex items-center gap-2 text-primary font-bold hover:text-primary/80">
                {t('viewAll')} <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </ScrollReveal>

        <div className="relative">
          <div className="overflow-hidden" ref={emblaRef}>
            {/* gap-6 = 24px, must match the calc above */}
            <div className="flex gap-6">
            {products.map((product) => (
  <FeaturedCard key={product.id} product={product} locale={locale} t={t} />
))}
            </div>
          </div>

          {/* Navigation arrows — identical to services section */}
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

              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-50">
                {scrollSnaps.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => emblaApi?.scrollTo(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === selectedIndex
                        ? 'bg-primary/60 scale-125'
                        : 'bg-gray-300/50 hover:bg-gray-400/70'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Link href="/store" className="text-primary font-bold hover:underline">
            {t('viewAll')}
          </Link>
        </div>
      </div>
    </section>
  );
}