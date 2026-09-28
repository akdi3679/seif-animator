'use client';

import Script from 'next/script';
import { useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';

export function SociableKITReviews() {
  const t = useTranslations('reviews');
/* Override SociableKIT carousel padding 
.sk-ww-google-reviews .sk-carousel {
  padding: 0 !important;
}*/
  return (
    <>
      <Script
        src="https://widgets.sociablekit.com/google-reviews/widget.js"
        strategy="lazyOnload"
        defer
      />

      <section className="py-16 bg-[#FEFAF1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <ScrollReveal>
            <div className="text-center mb-8">
              <h2 className="text-4xl md:text-5xl font-black mb-4 text-[#1E1E1E]">
                {t('title')}
              </h2>
              <p className="text-gray-500 text-lg">{t('subtitle')}</p>
            </div>
          </ScrollReveal>

          {/* SociableKIT Google Reviews Widget */}

<div className="group perspective-[800px]">
  <div className="transition-transform duration-500 group-hover:rotateX-2">
<div
  className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-auto reviews-scroll-container"
  style={{
    maskImage:
      'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
  }}
>  <div
    className="sk-ww-google-reviews"
    data-embed-id="25674398"
    style={{ width: '100%', maxHeight: '400px' }}
  />
</div>
        </div>
        </div>
</div>
      </section>
    </>
  );
}