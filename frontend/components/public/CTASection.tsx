// frontend/components/public/CTASection.tsx
'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { ScrollReveal } from '@/components/shared/ScrollReveal'

export function CTASection() {
  const t = useTranslations('home.cta')
  const params = useParams()
  const locale = params.locale as string

  return (
    <ScrollReveal delay={0.3}>

  <section className="relative py-24 py-24  -mb-35  z-1  pb-0 bg-gradient-to-r from-primary to-secondary">
  <div className="max-w-4xl mx-auto px-8 text-center text-white"> 
   <ScrollReveal>
          <h2 className="text-5xl md:text-6xl font-black mb-6">{t('title')}</h2>
        </ScrollReveal>
        
        <ScrollReveal delay={0.2}>
          <p className="text-xl mb-12 opacity-90 max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/${locale}/booking`}
              className="inline-flex items-center justify-center gap-2 bg-white text-primary px-8 py-4 rounded-2xl font-bold hover:bg-gray-100 transition-all hover:scale-105"
            >
              {t('bookNow')}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="inline-flex items-center justify-center gap-2 bg-transparent border-2 border-white text-white px-8 py-4 rounded-2xl font-bold hover:bg-white/10 transition-all hover:scale-105"
            >
              {t('contactUs')}
            </Link>
          </div>
        </ScrollReveal>
            </div>

   <div className="h-60" />
  </section>
</ScrollReveal>

  )
}