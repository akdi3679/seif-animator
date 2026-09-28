'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Cookies from 'js-cookie';
import { Button } from '@/components/ui/button';
import { Cookie } from 'lucide-react';
import { usePathname } from '@/navigation';
import { useFloatingPanels } from './FloatingPanelProvider';

type ConsentStatus = 'accepted' | 'refused' | 'pending';

interface CookieConsentContextType {
  consent: ConsentStatus;
  accept: () => void;
  refuse: () => void;
  showBanner: () => void; // manually trigger banner
  requestConsent: () => Promise<void>; // when adding to cart and refused
}

const CookieConsentContext = createContext<CookieConsentContextType>({
  consent: 'pending',
  accept: () => {},
  refuse: () => {},
  showBanner: () => {},
  requestConsent: async () => {},
});

export function useCookieConsent() {
  return useContext(CookieConsentContext);
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentStatus>('pending');
  const [bannerVisible, setBannerVisible] = useState(false);
  const [showBannerManually, setShowBannerManually] = useState(false);
  const t = useTranslations('cookieConsent');
const pathname = usePathname();
const { activePanel, panelTimestamps } = useFloatingPanels();
const [canShowBanner, setCanShowBanner] = useState(false);


const isStorePage = pathname.startsWith('/store');

 useEffect(() => {
  if (!isStorePage) {
    setCanShowBanner(false);
    return;
  }

  const now = Date.now();
  const recentPanel = (activePanel !== null) || 
    (panelTimestamps.booking && now - panelTimestamps.booking < 2 * 60 * 1000) ||
    (panelTimestamps.events && now - panelTimestamps.events < 2 * 60 * 1000);

  if (!recentPanel) {
    const timer = setTimeout(() => setCanShowBanner(true), 3000);
    return () => clearTimeout(timer);
  } else {
    setCanShowBanner(false);
  }
}, [isStorePage, activePanel, panelTimestamps]);

// Keep the float button visible when cookies are refused
useEffect(() => {
  if (consent === 'refused' && isStorePage) {  // add isStorePage check
    setShowBannerManually(true);
  }
}, [consent, isStorePage]);
// In the mount effect, only set bannerVisible after canShowBanner becomes true
useEffect(() => {
  if (!canShowBanner) return;
  const saved = Cookies.get('cookie_consent');
  if (saved === 'accepted') {
    setConsent('accepted');
  } else if (saved === 'refused') {
    setConsent('refused');
  } else {
    setBannerVisible(true);
  }
}, [canShowBanner]);
  const accept = useCallback(() => {
    Cookies.set('cookie_consent', 'accepted', { expires: 365 });
    setConsent('accepted');
    setBannerVisible(false);
    setShowBannerManually(false);
  }, []);

  const refuse = useCallback(() => {
    Cookies.set('cookie_consent', 'refused', { expires: 365 });
    setConsent('refused');
    setBannerVisible(false);
    setShowBannerManually(false);
  }, []);

  const showBanner = useCallback(() => {
    setBannerVisible(true);
    setShowBannerManually(true);
  }, []);

  const requestConsent = useCallback(async () => {
    if (consent === 'accepted') return;
    showBanner();
    // We could return a promise that resolves when the user decides, but for simplicity we just show banner and let the add-to-cart function proceed with sessionStorage if refused.
  }, [consent, showBanner]);

  // Floating button to reopen consent (visible only when refused)
  return (
  <CookieConsentContext.Provider value={{ consent, accept, refuse, showBanner, requestConsent }}>
    {children}

    {/* Banner */}
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-out ${
        bannerVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-white/90 backdrop-blur-lg border-t border-gray-200/60 shadow-2xl px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-600 leading-relaxed text-center sm:text-left">
            {t('message')}
          </p>
          <div className="flex gap-3 flex-shrink-0">
            <Button onClick={refuse} variant="outline" size="sm" className="rounded-full px-5 text-sm">
              {t('refuse')}
            </Button>
            <Button onClick={accept} size="sm" className="rounded-full px-5 text-sm">
              {t('accept')}
            </Button>
          </div>
        </div>
      </div>
    </div>

    {/* Float button – only when refused */}
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
        consent === 'refused' && showBannerManually && isStorePage 
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <button
        onClick={showBanner}
        className="w-12 h-12 bg-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 hover:scale-105 transition-all"
        aria-label={t('cookie_consent')}
      >
        <Cookie className="w-5 h-5" />
      </button>
    </div>
  </CookieConsentContext.Provider>
);}