'use client';

import { useState, useRef ,  useEffect, useCallback } from 'react';
import { Link, usePathname , useRouter  } from '@/navigation';
import { useTranslations , useLocale } from 'next-intl';
import { Menu, X, ShoppingCart, Home, Calendar, ShoppingBag, Mail, User ,  Info, Puzzle , Image  } from 'lucide-react';
import { useScrollDirection } from '@/lib/hooks/useScrollDirection';
import { cn } from '@/lib/utils';
import { useCart } from '@/components/providers/CartProvider';
import { usePublicGETSWR } from '@/lib/api/hooks';
import EventTicker from './EventTicker';
import FeatureGate from '@/components/shared/FeatureGate';
import { SiteLogo } from './SiteLogo';
import { useTailscaleCheck } from '@/lib/hooks/useTailscaleCheck';
import { Globe, Check } from 'lucide-react';
import { useFeatureFlags } from '@/components/providers/FeatureFlagsProvider';

export function Navbar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations('navigation');
  const pathname = usePathname();
  const { isVisible } = useScrollDirection();
  const { totalItems, openCart } = useCart();
const locale = useLocale();
const router = useRouter();


const [langOpen, setLangOpen] = useState(false);
const langRef = useRef<HTMLDivElement>(null);

const flags = useFeatureFlags(); 

  const allNavItems = [
    { href: '/about',    icon: Info,          labelKey: 'about' },
    { href: '/services', icon: Puzzle,      labelKey: 'services' },
    { href: '/gallery',  icon: Image,   labelKey: 'gallery' },
    { href: '/store',    icon: ShoppingBag,   labelKey: 'store',    flag: 'products' },
    { href: '/contact',  icon: Mail,          labelKey: 'contact' },
    { href: '/booking',  icon: Calendar,      labelKey: 'booking' },
  ];

   const isFeatureEnabled = (name?: string) => !name || (flags ? flags[name] !== false : true);
  const navItems = allNavItems.filter(item => isFeatureEnabled(item.flag));
const otherLocale = locale === 'fr' ? 'ar' : 'fr';


  const { allowed: showProfile } = useTailscaleCheck();

  // ----- Smart ticker visibility -----
  const [isAtTop, setIsAtTop] = useState(true);
  const [fixedTickerVisible, setFixedTickerVisible] = useState(true);   // user prefs at top
  const [movementTickerVisible, setMovementTickerVisible] = useState(false); // user prefs while scrolling

  // Detect whether we are at the top of the page
  useEffect(() => {
    const handleScroll = () => {
      setIsAtTop(window.scrollY < 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // When we leave the top (transition from true -> false), reset movement ticker to hidden
  useEffect(() => {
    if (!isAtTop) {
      setMovementTickerVisible(false);
    }
  }, [isAtTop]);



useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);

const locales = [
  { code: 'fr', label: t('languageFr') },
  { code: 'ar', label: t('languageAr') },
];
  // Decides which value to pass to EventTicker
  const tickerVisible = isAtTop ? fixedTickerVisible : movementTickerVisible;

  // Toggle handler – updates the relevant state based on isAtTop
  const handleTickerToggle = useCallback(() => {
    if (isAtTop) {
      setFixedTickerVisible(prev => !prev);
    } else {
      setMovementTickerVisible(prev => !prev);
    }
  }, [isAtTop]);

  return (
    <div className="fixed top-0 left-0 right-0 z-40">
      {/* Entire bar (ticker + nav) slides up/down together */}
      <div className={cn("transition-transform duration-300", isVisible ? "translate-y-0" : "-translate-y-full")}>
        <FeatureGate flag="events">
          <EventTicker visible={tickerVisible} onToggle={handleTickerToggle} />
        </FeatureGate>

        <nav className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
            {/* Logo – full height */}
            <div className="self-stretch flex items-center">
              <SiteLogo />
            </div>

            {/* Desktop links */}
            <div className="hidden lg:flex items-center gap-8">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname === item.href ? "text-primary font-bold" : "text-gray-600"
                )}>
                  {t(item.labelKey)}
                </Link>
              ))}
            </div>

            {/* Right icons */}
            <div className="flex items-center gap-2">
            {/* Language dropdown */}
<div ref={langRef} className="relative">
  <button
    onClick={() => setLangOpen(!langOpen)}
    className="p-2 rounded-full hover:bg-gray-100 transition"
    aria-label={t('switchLang')}
  >
    <Globe className="w-5 h-5 text-gray-600" />
  </button>

  {langOpen && (
    <div className="absolute right-0 top-full mt-2 w-40 bg-white/80 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 py-1 z-50">
      {locales.map((loc) => (
        <button
          key={loc.code}
          onClick={() => {
            router.replace(pathname, { locale: loc.code });
            setLangOpen(false);
          }}
          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-gray-100 transition ${
            locale === loc.code ? 'text-primary' : 'text-gray-600'
          }`}
        >
          {loc.label}
          {locale === loc.code && <Check className="w-4 h-4 text-primary" />}
        </button>
      ))}
    </div>
  )}
</div>
              <button onClick={openCart} className="relative p-2 touch-target">
                <ShoppingCart className="w-6 h-6 text-dark hover:text-primary transition" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {totalItems}
                  </span>
                )}
              </button>

              {showProfile && (
                <Link href="/login" className="p-2 touch-target">
                  <User className="w-6 h-6 text-dark hover:text-primary transition" />
                </Link>
              )}

              <button onClick={() => setSidebarOpen(true)} className="p-2 touch-target lg:hidden">
                <Menu className="w-6 h-6 text-dark" />
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-64 bg-white shadow-xl p-6">
            <div className="flex justify-between items-center mb-8">
              <span className="font-black text-xl text-dark">Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="p-2 touch-target"><X className="w-6 h-6" /></button>
            </div>
            <nav className="space-y-4">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-medium transition-colors",
                    pathname === item.href ? "bg-primary/10 text-primary" : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {t(item.labelKey)}
                </Link>
              ))}
              <button onClick={() => { openCart(); setSidebarOpen(false); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-medium text-gray-700 hover:bg-gray-100 w-full"
              >
                <ShoppingCart className="w-5 h-5" />
                {t('cart')} ({totalItems})
              </button>
              {showProfile && (
                <Link href="/login" className="flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-medium text-gray-700 hover:bg-gray-100">
                  <User className="w-5 h-5" />
                  {t('profile')}
                </Link>
              )}
              {/* Language switcher for mobile */}
<button
  onClick={() => { router.replace(pathname, { locale: otherLocale }); setSidebarOpen(false); }}
  className="flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-medium text-gray-700 hover:bg-gray-100 w-full transition-colors"
>
  <Globe className="w-5 h-5" />
  {locale === 'fr' ? t('languageAr') : t('languageFr')}
</button>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}