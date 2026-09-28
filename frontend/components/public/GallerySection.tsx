'use client';

import { useMemo } from 'react';
import { RowsPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/rows.css';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ArrowRight } from 'lucide-react';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { Link } from '@/navigation';

interface GalleryItem {
  id: string;
  title_fr: string;
  title_ar: string;
  media_url: string;
  is_gif: boolean;
}

/* ── Deterministic aspect ratios – guarantees varied shapes ── */
const ASPECTS = [
  { width: 4, height: 5 },  // tall
  { width: 1, height: 1 },  // square
  { width: 3, height: 2 },  // wide
  { width: 2, height: 3 },  // portrait
  { width: 16, height: 9 }, // cinematic
];

export function GallerySection() {
  const t = useTranslations('gallery');
  const locale = useLocale();
  const { name: siteName } = useSiteData();
  
// In GallerySection.tsx, change the endpoint to:
const { data, loading, error } = usePublicGETSWR<{ items: GalleryItem[] }>(
  '/gallery/items?category=all&limit=6'
);
  // Assign correct aspect ratios, stable per mount
  const photos = useMemo(() => {
    if (!data?.items) return [];
    return data.items.map((item, idx) => {
      const aspect = ASPECTS[idx % ASPECTS.length];
      return {
        key: item.id,
        src: item.media_url,
        width: aspect.width * 120,   // higher base → larger size, less images per row
        height: aspect.height * 120,
        alt: locale === 'fr' ? item.title_fr : item.title_ar,
        title: locale === 'fr' ? item.title_fr : item.title_ar,
      };
    });
  }, [data, locale]);

  if (loading) return <LoadingSpinner />;
  if (error || !data || data.items.length === 0) return null;

  return (
    <section className="relative py-16 overflow-hidden" style={{ background: 'linear-gradient(135deg, #FDE8EC 0%, #FDF2E0 50%, #FDE8EC 100%)' }}>
      {/* Instagram‑like warm gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f9d5e5]/40 via-[#fce1b6]/30 to-[#d4a5f5]/20" />

      {/* Watermark */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none select-none">
        <div className="text-[12rem] md:text-[16rem] font-black text-primary/[0.05] leading-none translate-y-8">
          {siteName}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 relative z-10">
        <ScrollReveal>
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="text-4xl md:text-5xl font-black text-dark">{t('title')}</h2>
              <p className="text-gray-500 mt-2">{t('subtitle')}</p>
            </div>
            <Link
              href="/gallery"
              className="hidden md:flex items-center gap-2 text-primary font-bold hover:underline"
            >
              {t('viewAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </ScrollReveal>

        {/* Smart masonry – higher targetRowHeight forces 2 rows at most */}
        <RowsPhotoAlbum
          photos={photos}
          targetRowHeight={350}
          spacing={12}
          render={{
            extras: (_, { photo }) => (
              <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-end p-3 rounded-[16px] overflow-hidden">
                <span className="text-white text-xs font-medium leading-tight">
                  {photo.title}
                </span>
              </div>
            ),
          }}
          componentsProps={{
            container: { className: 'space-y-3' },
            image: { className: 'rounded-[16px] shadow-sm hover:shadow-lg transition-shadow' },
          }}
        />

        {/* Mobile view all */}
        <div className="mt-6 text-center md:hidden">
          <Link href="/gallery" className="text-primary font-bold hover:underline">
            {t('viewAll')}
          </Link>
        </div>
      </div>
    </section>
  );
}