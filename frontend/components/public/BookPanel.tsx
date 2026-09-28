'use client';

import { useState, useEffect , useMemo  } from 'react';
import { useRouter } from '@/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { X, Calendar, User, MapPin, ArrowRight, Sparkles } from 'lucide-react';
import { useSiteImages } from '@/components/providers/SiteImagesProvider';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { useFloatingPanels } from '@/components/providers/FloatingPanelProvider';
import { useServiceTypes } from '@/components/providers/ServiceTypesProvider';
import { usePathname } from '@/navigation';


const COOLDOWN_HOURS = 1;
const STORAGE_KEY = 'book-panel-last-shown';

export default function BookPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('bookPanel');
  const { sortedServiceTypes, isLoading, error } = useServiceTypes();

  const { images } = useSiteImages();
  const bookingImg = images['booking'];
  const { setActivePanel, setPanelTimestamp } = useFloatingPanels();
const { name: siteName } = useSiteData();
 


  const [serviceType, setServiceType] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
const pathname = usePathname();

  useEffect(() => {
    const lastShown = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();
    if (!lastShown || now - parseInt(lastShown) > COOLDOWN_HOURS * 3600 * 1000) {
      setIsOpen(true);
      localStorage.setItem(STORAGE_KEY, now.toString());
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (serviceType) params.set('service', serviceType);
    if (name) params.set('name', name);
    if (location) params.set('location', location);
    router.push(`/booking?${params.toString()}`);
    setIsOpen(false);
setActivePanel(null);
  };

  // Silent fail – no data → no panel
  if (isLoading || error || !sortedServiceTypes || sortedServiceTypes.length === 0) return null;

  if (!isOpen) return null;

  const bookingAlt = locale === 'fr' ? (bookingImg?.alt_fr || '') : (bookingImg?.alt_ar || '');
if (pathname === '/booking') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Close button */}
        <button
          onClick={() => {
    setIsOpen(false);
    setActivePanel(null);
  }}
          className="absolute top-4 right-4 z-10 w-8 h-8  rounded-full flex items-center justify-center hover:bg-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Illustration side (hidden on small screens) */}
        <div className="hidden md:flex md:w-[45%] bg-gradient-to-br from-primary/5 to-secondary/5 items-center justify-center relative overflow-hidden min-h-[320px]">
          {bookingImg?.image_url ? (
            <img
              src={bookingImg.image_url}
              alt={bookingAlt}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full">{bookingImg?.fallbackElement}</div>
          )}
        </div>

        {/* Form side */}
        <div className="p-8 flex-1">
          <div className="text-center mb-6">
        
            <h3 className="text-2xl font-black text-dark">{t('title')}</h3>
         <p className={`text-lg mt-1 `}>
  <span
    style={{
      background: 'linear-gradient(90deg, #FFB23F 0%, #C184FB 50%, #FFB23F 100%)',
      backgroundSize: '200% auto',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      animation: 'liquid-flow 10s ease-in-out infinite',
      fontWeight: 600,
    }}
  >
    {t('encouragement')}
  </span>
</p>   
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('selectService')}
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/60" />
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary outline-none transition-colors appearance-none"
                  required
                >
                  <option value="">{t('selectService')}</option>
                  {sortedServiceTypes.map((s) => (
                    <option key={s.calcom_slug} value={s.calcom_slug}>
                      {locale === 'fr' ? s.name_fr : s.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('name')}
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/60" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary outline-none transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('location')}
              </label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/60" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('locationPlaceholder')}
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary outline-none transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              <span>{t('bookNow')}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}