'use client';

import { useTranslations } from 'next-intl';
import { Home, Calendar, ShoppingBag, Mail, Info, Hand, Image } from 'lucide-react';
import { Link, usePathname } from '@/navigation';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useEffect, useRef, useState, useCallback } from 'react';
import { LiquidGlassHighlight } from '@/components/ui/liquid-glass-highlight';
import { useFeatureFlags } from '@/components/providers/FeatureFlagsProvider';

const DEBUG = true;
const PADDING = 4;               // uniform spacing on all sides

export function FloatingNavbar() {
  const t = useTranslations('navigation');
  const pathname = usePathname();
 const flags = useFeatureFlags();   
  const allNavItems = [
    { href: '/', icon: Home, labelKey: 'home' },
    { href: '/about', icon: Info, labelKey: 'about' },
    { href: '/services', icon: Hand, labelKey: 'services' },
    { href: '/gallery', icon: Image, labelKey: 'gallery' },
    { href: '/store', icon: ShoppingBag, labelKey: 'store', flag: 'products' },
    { href: '/booking', icon: Calendar, labelKey: 'booking' },
    { href: '/contact', icon: Mail, labelKey: 'contact' },
  ];

  
  const isFeatureEnabled = (name?: string) => !name || (flags ? flags[name] !== false : true);
  const navItems = allNavItems.filter(item => isFeatureEnabled(item.flag));
  
  const containerRef = useRef<HTMLDivElement>(null);
  const navItemsRef = useRef(navItems);
  navItemsRef.current = navItems;

  const [bubble, setBubble] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [domReady, setDomReady] = useState(false);
  const prevIndexRef = useRef<number>(-1);
  const [stretch, setStretch] = useState<{ scaleX: number; origin: string }>({ scaleX: 1, origin: 'center' });
  const [dragActive, setDragActive] = useState(DEBUG);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ─── Debug active index (for manual clicks) ───
  const [debugActiveIdx, setDebugActiveIdx] = useState<number>(() => {
    const idx = navItems.findIndex(
      (item) => item.href === pathname || (item.href === '/' && pathname === '/')
    );
    return idx >= 0 ? idx : 0;
  });

  // ─── compute bubble (accepts optional index) ───
  const computeBubble = useCallback(
    (targetIndex?: number) => {
      const container = containerRef.current;
      if (!container) return undefined;
      const idx = targetIndex ?? (DEBUG ? debugActiveIdx : navItems.findIndex(
        (item) => item.href === pathname || (item.href === '/' && pathname === '/')
      ));
      if (idx < 0 || !navItems[idx]) return undefined;
      const els = container.querySelectorAll<HTMLElement>('.nav-item');
      const activeEl = els[idx];
      if (!activeEl) return undefined;

      const cRect = container.getBoundingClientRect();
      const iRect = activeEl.getBoundingClientRect();
      const padX = 22;
      const w = iRect.width + padX * 2;
      const h = cRect.height - PADDING * 2;       // uniform top & bottom spacing
      const top = PADDING;                         // fixed vertical position
      let left = iRect.left - cRect.left + iRect.width / 2 - w / 2;
      const maxLeft = cRect.width - PADDING - w;
      left = Math.max(PADDING, Math.min(maxLeft, left));

      setBubble({ left, top, width: w, height: h });
      return idx;
    },
    [pathname, navItems, debugActiveIdx, DEBUG]
  );

  // init
  useEffect(() => {
    requestAnimationFrame(() => {
      computeBubble();
      setDomReady(true);
    });
  }, []);

  // auto slide on route change (production)
  useEffect(() => {
    if (DEBUG) return;
    const newIdx = computeBubble();
    if (newIdx === undefined) return;
    const oldIdx = prevIndexRef.current;
    if (oldIdx !== -1 && oldIdx !== newIdx) {
      const origin = newIdx > oldIdx ? 'left' : 'right';
      setStretch({ scaleX: 1.15, origin });
      setTimeout(() => setStretch({ scaleX: 1, origin: 'center' }), 440);
    }
    prevIndexRef.current = newIdx;
  }, [pathname, computeBubble, DEBUG]);

  // resize / scroll
  useEffect(() => {
    const handler = () => computeBubble();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [computeBubble]);

  useEffect(() => () => clearTimeout(snapTimeoutRef.current), []);

  // ─── Click on a nav item (debug mode) ───
  const handleDebugClick = useCallback(
    (idx: number) => {
      const oldIdx = debugActiveIdx;
      setDebugActiveIdx(idx);
      computeBubble(idx);

      // stretch animation
      if (oldIdx !== idx) {
        const origin = idx > oldIdx ? 'left' : 'right';
        setStretch({ scaleX: 1.15, origin });
        setTimeout(() => setStretch({ scaleX: 1, origin: 'center' }), 440);
      }
      prevIndexRef.current = idx;
    },
    [debugActiveIdx, computeBubble]
  );

  // ─── Snap after drag ───
  const handleDragEnd = useCallback(
    (finalLeft: number) => {
      const container = containerRef.current;
      if (!container) return;
      const items = container.querySelectorAll<HTMLElement>('.nav-item');
      const pillW = bubble.width;
      const pillCenterX = finalLeft + pillW / 2;

      // find closest button
      let closestIdx = 0;
      let minDist = Infinity;
      items.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        const itemCenterX = rect.left - container.getBoundingClientRect().left + rect.width / 2;
        const dist = Math.abs(pillCenterX - itemCenterX);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      });

      // compute snap position
      const activeEl = items[closestIdx];
      const cRect = container.getBoundingClientRect();
      const iRect = activeEl.getBoundingClientRect();
      const padX = 22;
      const w = iRect.width + padX * 2;
      const h = cRect.height - PADDING * 2;
      const top = PADDING;
      let left = iRect.left - cRect.left + iRect.width / 2 - w / 2;
      const maxLeft = cRect.width - PADDING - w;
      left = Math.max(PADDING, Math.min(maxLeft, left));

      // update bubble (snap position)
      setBubble({ left, top, width: w, height: h });
      setDebugActiveIdx(closestIdx);

      // stretch
      const oldIdx = prevIndexRef.current;
      if (oldIdx !== closestIdx) {
        const origin = closestIdx > oldIdx ? 'left' : 'right';
        setStretch({ scaleX: 1.15, origin });
        setTimeout(() => setStretch({ scaleX: 1, origin: 'center' }), 440);
      }
      prevIndexRef.current = closestIdx;

      // disable dragging to enable smooth CSS transition
      setDragActive(false);

      // after transition, re‑enable dragging and sync dragPos
      snapTimeoutRef.current = setTimeout(() => {
        dragging.current = false;
        setDragPos({ left, top });
        setDragActive(true);
      }, 400);
    },
    [bubble.width, debugActiveIdx]
  );

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] md:hidden">
      <div
        ref={containerRef}
        className="flex items-center gap-6 px-5 h-[60px] rounded-full"
        style={{
          position: 'relative',
          overflow: 'visible',
          background: 'rgba(187,187,188,0.12)',
          backdropFilter: 'blur(16px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
          boxShadow: [
            'inset 0 0 0 1px rgba(255,255,255,0.10)',
            'inset 2px 3px 0px -2px rgba(255,255,255,0.90)',
            'inset -2px -2px 0px -2px rgba(255,255,255,0.80)',
            'inset -3px -8px 1px -6px rgba(255,255,255,0.60)',
            'inset -1px -1px 4px 0px rgba(0,0,0,0.12)',
            'inset 0px 3px 4px -2px rgba(0,0,0,0.20)',
            '0px 1px 5px 0px rgba(0,0,0,0.10)',
            '0px 6px 16px 0px rgba(0,0,0,0.08)',
          ].join(', '),
        }}
      >
        {navItems.map((item, idx) => {
          const isActive = DEBUG
            ? debugActiveIdx === idx
            : pathname === item.href || (item.href === '/' && pathname === '/');

          const linkProps = DEBUG
            ? {
                onClick: (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDebugClick(idx);
                },
                href: '#',
                role: 'button',
                'aria-disabled': true,
                style: { pointerEvents: 'auto' as const },
              }
            : { href: item.href };

          return (
            <Link
              key={item.href}
              className={`nav-item relative flex flex-col items-center justify-center cursor-pointer select-none z-10 transition-transform ${
                isActive ? 'scale-110' : 'hover:scale-105'
              }`}
              {...linkProps}
            >
              <item.icon
                className="w-5 h-5"
                style={{
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                  filter: isActive
                    ? 'drop-shadow(0 1px 4px rgba(0,0,0,0.65))'
                    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.40))',
                  transition: 'color 200ms, filter 200ms',
                }}
              />
              <span
                className="text-[10px] font-medium mt-0.5 max-w-[80px]"
                style={{
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.60)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.70)',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  display: 'block',
                }}
                title={t(item.labelKey)}
              >
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}

        {/* Glass highlight – now with proper snapping */}
        {domReady && bubble.width > 0 && (
          <LiquidGlassHighlight
            width={bubble.width}
            height={bubble.height}
            left={bubble.left}
            top={bubble.top}
            padding={PADDING}
            config={{ magnify: 2.2, saturation: 0.5 }}
            stretchScaleX={stretch.scaleX}
            stretchOrigin={stretch.origin}
            draggable={dragActive}
            onDragEnd={handleDragEnd}
          />
        )}
      </div>
    </div>
  );
}