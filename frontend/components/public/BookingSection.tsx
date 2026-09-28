'use client';

import { useState , useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { Calendar, User, MapPin, ChevronRight } from 'lucide-react';
import { useRouter } from '@/navigation';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useSiteImages } from '@/components/providers/SiteImagesProvider';
import Image from 'next/image';
import ShinyText from '@/components/shared/ShinyText';
import { useServiceTypes } from '@/components/providers/ServiceTypesProvider';


export function BookingSection() {
  const t = useTranslations('bookingSection');
  const locale = useLocale();
  const router = useRouter();
  const [serviceType, setServiceType] = useState('');
  const [name, setName] = useState('');
const { sortedServiceTypes, isLoading, error } = useServiceTypes();

  const [location, setLocation] = useState('');
  const { images } = useSiteImages();
const bookingImg = images['booking'];
const bookingAlt = locale === 'fr' ? bookingImg?.alt_fr : bookingImg?.alt_ar;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (serviceType) params.set('service', serviceType);
    if (name) params.set('name', name);
    if (location) params.set('location', location);
    router.push(`/booking?${params.toString()}`);
  };

 if (isLoading) return <LoadingSpinner />;
if (error || sortedServiceTypes.length === 0) return null;
  return (
    <ScrollReveal>

    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-8">
        <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-[60px] p-8 md:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Illustration side */}
         {bookingImg?.image_url ? (
  <img src={bookingImg.image_url} alt={bookingAlt} className="max-h-80 object-contain" />
) : (
  <div className="max-h-80 aspect-square">{bookingImg?.fallbackElement}</div>
)}

            {/* Form side */}
            <div>
              <div className="text-center lg:text-left mb-8">
                <h2 className="text-4xl md:text-5xl font-black text-dark mb-3">
  {t('title')}
</h2>

<ShinyText
  text={t('aspiration')}
  color="#C184FB"
  shineColor="#ffffff"
  speed={3}
  spread={120}
  direction="left"
  className="text-xl md:text-2xl font-semibold mb-6 max-w-md leading-relaxed"
/>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">{t('service')}</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full p-4 rounded-2xl border border-gray-200 bg-white"
                    required
                  >
                    <option value="">{t('selectService')}</option>
                    {sortedServiceTypes?.map((s: any) => (
                      <option key={s.id} value={s.calcom_slug}>
                        {locale === 'fr' ? s.name_fr : s.name_ar}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-2 text-gray-700">{t('name')}</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('namePlaceholder')}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 bg-white"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-2 text-gray-700">{t('location')}</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={t('locationPlaceholder')}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 bg-white"
                        required
                      />
                    </div>
                  </div>
                </div>
                <Button type="submit" className="w-full md:w-auto px-10 py-5 text-lg font-bold rounded-2xl bg-secondary hover:bg-secondary/90 text-white shadow-lg">
                  <Calendar className="w-5 h-5 mr-2" /> {t('button')}
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  </ScrollReveal>

  )
}