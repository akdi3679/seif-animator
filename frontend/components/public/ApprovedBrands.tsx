'use client';

import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import Marquee from 'react-fast-marquee';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { ExternalLink } from 'lucide-react';
import { useSiteData } from '@/components/providers/SiteDataProvider';

interface Brand {
  id: string;
  name: string;
  logo_url: string;
  website_url: string | null;
  description_fr: string | null;
  description_ar: string | null;
}

function absoluteUrl(url: string | null) {
  if (!url) return '#';
  if (url.startsWith('http')) return url;
  return `https://${url}`;
}

/* ── Individual brand – local hover, no global state ── */
function BrandItem({
  brand,
  locale,
  t,
}: {
  brand: Brand;
  locale: string;
  t: any;
}) {
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (ref.current) {
      setRect(ref.current.getBoundingClientRect());
    }
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setRect(null);
  };

  return (
    <>
      <div
        ref={ref}
        className="relative overflow-visible"
        style={{ width: '160px', height: '80px' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Logo */}
        {brand.website_url ? (
          <a
            href={absoluteUrl(brand.website_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
          >
            <Image src={brand.logo_url} alt={brand.name || t('logoAlt')} fill className="object-contain" />
          </a>
        ) : (
          <div className="w-full h-full grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300">
            <Image src={brand.logo_url} alt={brand.name || t('logoAlt')} fill className="object-contain" />
          </div>
        )}
      </div>

      {/* Hover panel rendered in a portal – outside any mask/overflow */}
      {hovered && rect &&
        ReactDOM.createPortal(
          <div
            className="fixed bg-white shadow-lg rounded-xl px-4 py-3 text-center z-[9999] min-w-[160px] border border-gray-100 whitespace-nowrap"
            style={{
              top: rect.top - 90,
              left: rect.left + rect.width / 2,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="font-bold text-sm text-dark">
              {locale === 'fr' ? brand.name_fr : brand.name_ar}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {locale === 'fr' ? brand.description_fr : brand.description_ar}
            </p>
            {brand.website_url && (
              <a
                href={absoluteUrl(brand.website_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-primary text-xs font-medium hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {t('visitSite')}
              </a>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

export function ApprovedBrands() {
  const locale = useLocale();
  const t = useTranslations('brands');
  const { name: siteName } = useSiteData();
  const [isPaused, setIsPaused] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { data: brands, error } = usePublicGETSWR<Brand[]>('/brands');

  useEffect(() => { setMounted(true); }, []);

  if (error || !brands || brands.length === 0) return null;
  if (!mounted) return null;

  const isRTL = locale === 'ar';

  return (
    <section className="relative py-20 bg-white overflow-hidden">
      {/* Background gradient & watermark */}
      <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-secondary/10 via-primary/5 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none select-none">
        <div className="text-[16rem] font-black text-primary/[0.05] leading-none translate-y-10">
          {siteName}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-black text-dark mb-2">{t('title')}</h2>
            <p className="text-gray-500">{t('subtitle')}</p>
          </div>
        </ScrollReveal>

        {/* Fade container – uses CSS mask only on the logo track */}
        <div
          className="relative w-full"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div
            dir="ltr"
            style={{
              maskImage:
                'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)',
            }}
          >
            <Marquee
              direction={isRTL ? 'right' : 'left'}
              pauseOnHover={true}
              play={!isPaused}
              speed={40}
              gradient={false}
              autoFill={true}
            >
              <div style={{ marginRight: '48px', display: 'flex', gap: '48px' }}>
                {brands.map((brand, idx) => (
                  <BrandItem
                    key={`${brand.id}-${idx}`}
                    brand={brand}
                    locale={locale}
                    t={t}
                  />
                ))}
              </div>
            </Marquee>
          </div>
        </div>
      </div>
    </section>
  );
}