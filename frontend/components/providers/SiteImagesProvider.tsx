'use client';

import { createContext, useContext, ReactNode } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useTranslations } from 'next-intl';
import {
  Star, Heart, Flower2, Baby, Palette, Sailboat, ToyBrick, Compass,
} from 'lucide-react';

/* ── cute kid‑friendly icon set ── */
const cuteIcons = [Star, Heart, Flower2, Baby, Palette, Sailboat, ToyBrick, Compass];

interface SiteImage {
  name: string;
  image_url: string | null;
  alt_fr: string;
  alt_ar: string;
  /** If image_url is null, use this React element */
  fallbackElement?: ReactNode;
}

interface SiteImagesContextType {
  images: Record<string, SiteImage>;
  isLoading: boolean;
  error: any;
}

// ── generate a Lucide‑filled background card ──
function FakeImage({
  bg,
  iconColor,
  size = '100%',
}: {
  bg: string;
  iconColor: string;
  size?: string;
}) {
  const rows = 5;
  const cols = 5;

  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        alignItems: 'center',
        justifyItems: 'center',
        borderRadius: 12,
        overflow: 'hidden',
        opacity: 0.9,
      }}
    >
      {Array.from({ length: rows * cols }).map((_, i) => {
        const Icon = cuteIcons[i % cuteIcons.length];
        return (
          <Icon
            key={i}
            size={14}
            color={iconColor}
            strokeWidth={2}
            style={{ opacity: 0.65 }}
          />
        );
      })}
    </div>
  );
}

const allNames = [
  'booking', 'middle_1', 'middle_2', 'middle_3',
  'middle_purple_bg', 'hero_fallback_1', 'hero_fallback_2',
];

const palette: Record<string, { bg: string; icon: string }> = {
  booking:            { bg: '#FFB23F', icon: '#FEFAF1' },
  middle_1:           { bg: '#C184FB', icon: '#FEFAF1' },
  middle_2:           { bg: '#FEFAF1', icon: '#C184FB' },
  middle_3:           { bg: '#FFB23F', icon: '#FEFAF1' },
  middle_purple_bg:   { bg: '#C184FB', icon: '#FEFAF1' },
  hero_fallback_1:    { bg: '#1E1E1E', icon: '#FEFAF1' },
  hero_fallback_2:    { bg: '#1E1E1E', icon: '#FEFAF1' },
  default:            { bg: '#FEFAF1', icon: '#C184FB' },
};

const SiteImagesContext = createContext<SiteImagesContextType | null>(null);

export function useSiteImages() {
  const ctx = useContext(SiteImagesContext);
  if (!ctx) throw new Error('useSiteImages must be used within SiteImagesProvider');
  return ctx;
}

export function SiteImagesProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('siteImages');
  const { data, loading, error } = usePublicGETSWR<SiteImage[]>('/site-images', {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const images: Record<string, SiteImage> = {};

  if (data) {
    data.forEach((img) => {
      images[img.name] = img;
    });
  }

  allNames.forEach((name) => {
    const existing = images[name];
    if (!existing?.image_url) {
      const { bg, icon } = palette[name] ?? palette.default;
      images[name] = {
        name,
        image_url: null,
        alt_fr: t('fallbackAlt'),
        alt_ar: t('fallbackAlt'),
        fallbackElement: <FakeImage bg={bg} iconColor={icon} />,
      };
    }
  });

  return (
    <SiteImagesContext.Provider value={{ images, isLoading: loading, error }}>
      {children}
    </SiteImagesContext.Provider>
  );
}