'use client';

import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { useSiteImages } from '@/components/providers/SiteImagesProvider';
import { useTranslations, useLocale } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';

export function MiddleSection() {
  const t = useTranslations('home.middleSection');
  const { name } = useSiteData();
  const { images } = useSiteImages();
  const locale = useLocale();

  
 const img1 = images['middle_1'];
const img2 = images['middle_2'];
const img3 = images['middle_3'];
const purple = images['middle_purple_bg'];

  if (!img1 || !img2 || !img3) return null; // silent fail

  return (
    <section className="relative py-32 overflow-hidden">
      <div className="watermark-text">{name}</div>
      <ScrollReveal>

      <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 items-center gap-12 lg:gap-20">
        <div>
          <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight text-dark">{t('title')}</h2>
          <p className="text-gray-500 mb-10 max-w-md leading-relaxed">{t('description')}</p>
          <div className="bg-[#F0E6FA] border-l-8 border-primary p-6 rounded-r-2xl max-w-sm">
            <p className="text-primary font-bold uppercase tracking-widest text-xs mb-1">{t('badgeLabel')}</p>
            <p className="font-semibold text-dark">{t('badgeText')}</p>
          </div>
        </div>
        <div className="flex justify-center">
          <div className="quadrant-circle">
            {/* Top‑left */}
            <div className="relative overflow-hidden">
{img1?.image_url ? (
    <Image src={img1.image_url} alt={locale === 'fr' ? img1.alt_fr : img1.alt_ar} fill className="object-cover" />
  ) : (
    <div className="absolute inset-0">{img1?.fallbackElement}</div>
  )}
           </div>

            {/* Top‑right – now dynamic purple background with toys */}
           
<div className="relative overflow-hidden bg-[#C184FB]">
 {purple?.image_url ? (
    <Image src={purple.image_url} alt={locale === 'fr' ? purple.alt_fr : purple.alt_ar} fill className="object-cover" />
  ) : (
    <div className="absolute inset-0">{purple?.fallbackElement}</div>
  )}
  
</div>
            {/* Bottom‑left */}
            <div className="relative overflow-hidden">
{img2?.image_url ? (
    <Image src={img2.image_url} alt={locale === 'fr' ? img2.alt_fr : img2.alt_ar} fill className="object-cover" />
  ) : (
    <div className="absolute inset-0">{img2?.fallbackElement}</div>
  )}
              </div>

            {/* Bottom‑right */}
            <div className="relative overflow-hidden">
{img3?.image_url ? (
    <Image src={img3.image_url} alt={locale === 'fr' ? img3.alt_fr : img3.alt_ar} fill className="object-cover" />
  ) : (
    <div className="absolute inset-0">{img3?.fallbackElement}</div>
  )}
              </div>

            <div className="center-x-btn">
              <Sparkles className="w-6 h-6 text-primary" strokeWidth={3} />
            </div>
          </div>
        </div>
      </div>
      </ScrollReveal>

    </section>
  );
}