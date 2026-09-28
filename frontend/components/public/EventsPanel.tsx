'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { X, Info, Megaphone, Pause, Play } from 'lucide-react';
import { useEvents } from '@/components/providers/EventsProvider';
import { useFloatingPanels } from '@/components/providers/FloatingPanelProvider';
const COOLDOWN_MINUTES = 20;
const STORAGE_KEY = 'events-panel-last-shown';
const AUTO_SLIDE_INTERVAL = 5000;

// Button dimensions — must match exactly what the displacement SVG is built for
const BTN_W = 60;
const BTN_H = 60;
const BTN_R = 30;
const BORDER = 0.07;
const ALPHA = 0.93;
const LIGHTNESS = 50;
const BLUR_PX = 11;
const SCALE = -180;

/**
 * Builds the displacement map SVG data URI.
 *
 * This is the key insight from Jhey's codepen:
 * The feImage must contain an SVG whose dimensions EXACTLY match the element.
 * The SVG encodes directional gradients (red=horizontal, blue=vertical)
 * that tell the feDisplacementMap how to warp pixels in X and Y.
 * The center gray rect with blur "blocks" the distortion in the middle,
 * leaving only the edges/border distorted — creating the glass lens look.
 */
function buildDisplacementDataUri(w: number, h: number, r: number): string {
  const border = Math.min(w, h) * (BORDER * 0.5);
  const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="evR" x1="100%" y1="0%" x2="0%" y2="0%">
    <stop offset="0%" stop-color="#000"/>
    <stop offset="100%" stop-color="red"/>
  </linearGradient>
  <linearGradient id="evB" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#000"/>
    <stop offset="100%" stop-color="blue"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="${w}" height="${h}" fill="black"/>
<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#evR)"/>
<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#evB)" style="mix-blend-mode:difference"/>
<rect x="${border}" y="${border}" width="${w - border * 2}" height="${h - border * 2}" rx="${r}" fill="hsl(0 0% ${LIGHTNESS}% / ${ALPHA})" style="filter:blur(${BLUR_PX}px)"/>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function EventsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  // dataUri is built client-side only to avoid SSR mismatch
  const [dataUri, setDataUri] = useState('');
  const params = useParams();
  const locale = params.locale as string;
  const { eventsWithImages, isLoading, error } = useEvents();
const { activePanel, setActivePanel, panelTimestamps, setPanelTimestamp } = useFloatingPanels();
  const [btnVisible, setBtnVisible] = useState(false);   // <-- declared here

  // Build displacement map once on client
  useEffect(() => {
    setDataUri(buildDisplacementDataUri(BTN_W, BTN_H, BTN_R));
  }, []);

  // Cooldown: auto-open if enough time has passed
  useEffect(() => {
  if (eventsWithImages.length === 0) return;

  const lastShown = localStorage.getItem(STORAGE_KEY);
  const now = Date.now();
  const cooldownPassed = !lastShown || (now - parseInt(lastShown, 10)) > COOLDOWN_MINUTES * 60 * 1000;

  if (cooldownPassed) {
    // Always show the floating button
    setBtnVisible(true);

    // Only auto‑open if at least one event has auto_display
    const hasAutoEvent = eventsWithImages.some(ev => ev.auto_display !== false);
    if (hasAutoEvent && activePanel === null) {
      const t = setTimeout(() => {
        setIsOpen(true);
        setActivePanel('events');
        setPanelTimestamp('events');
        localStorage.setItem(STORAGE_KEY, now.toString());
      }, 800);
      return () => clearTimeout(t);
    }
  }
}, [eventsWithImages, activePanel, setActivePanel, setPanelTimestamp]);


  // Drag
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(false);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (e.buttons !== 1) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    const cx = Math.max(-100, Math.min(0, newX));
    const cy = Math.max(-100, Math.min(0, newY));
    if (Math.abs(newX) > 5 || Math.abs(newY) > 5) setIsDragging(true);
    setPosition({ x: cx, y: cy });
  }, []);

  const handleMouseUp = useCallback(() => {
    setPosition({ x: 0, y: 0 });
    setTimeout(() => setIsDragging(false), 300);
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

 const handleOpen = () => {
  setIsOpen(true);
  setActivePanel('events');
  setPanelTimestamp('events');
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
};

const handleClose = () => {
  setIsOpen(false);
  setActivePanel(null);
};

  const next = useCallback(() =>
    setCurrentIndex(p => (p + 1) % eventsWithImages.length),
    [eventsWithImages.length]);

  const prev = useCallback(() =>
    setCurrentIndex(p => (p - 1 + eventsWithImages.length) % eventsWithImages.length),
    [eventsWithImages.length]);

  useEffect(() => {
    if (!isOpen || eventsWithImages.length <= 1 || !autoPlay) return;
    const timer = setInterval(next, AUTO_SLIDE_INTERVAL);
    return () => clearInterval(timer);
  }, [isOpen, eventsWithImages.length, autoPlay, next]);

  const toggleAutoPlay = useCallback(() => setAutoPlay(p => !p), []);
  const manualNav = useCallback((cb: () => void) => { cb(); setAutoPlay(true); }, []);

  if (eventsWithImages.length === 0 || error || isLoading) return null;
if (eventsWithImages.length === 0) return null;
  // ── CLOSED: glass floating button ──────────────────────────────────────────
  if (!isOpen) {
    return (
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'fixed',
          bottom: '40px',
          right: '20px',
          width: `${BTN_W}px`,
          height: `${BTN_H}px`,
          zIndex: 1000,
          cursor: isDragging ? 'grabbing' : 'grab',
          borderRadius: `${BTN_R}px`,
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease',
        }}
      >
        {/*
          STRUCTURE copied exactly from Jhey's codepen:

          <div class="effect">           ← our outer div above
            <svg class="filter">        ← this SVG below, position:absolute
              <defs>
                <filter id="...">
                  <feImage href={dataUri} />   ← displacement map data URI
                  ... chromatic aberration filters ...
                </filter>
              </defs>
            </svg>
            <button>                    ← button below, backdrop-filter: url(#id)
          </div>

          Key rules:
          - SVG is position:absolute, width/height 100%, inset 0, opacity 0
          - Button uses backdrop-filter: url(#eventsBtnFilter) — distorts BEHIND it
          - dataUri is built to exactly match BTN_W x BTN_H with BTN_R radius
          - Filter ID "eventsBtnFilter" is unique (won't clash with layout.tsx)
        */}
        {dataUri && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              opacity: 0,
            }}
          >
            <defs>
              <filter id="eventsBtnFilter" colorInterpolationFilters="sRGB">
                <feImage
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  result="map"
                  href={dataUri}
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  xChannelSelector="R"
                  yChannelSelector="G"
                  scale={String(SCALE)}
                  result="dispRed"
                />
                <feColorMatrix
                  in="dispRed"
                  type="matrix"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="red"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  xChannelSelector="R"
                  yChannelSelector="G"
                  scale={String(SCALE + 10)}
                  result="dispGreen"
                />
                <feColorMatrix
                  in="dispGreen"
                  type="matrix"
                  values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="green"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  xChannelSelector="R"
                  yChannelSelector="G"
                  scale={String(SCALE + 20)}
                  result="dispBlue"
                />
                <feColorMatrix
                  in="dispBlue"
                  type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                  result="blue"
                />
                <feBlend in="red" in2="green" mode="screen" result="rg" />
                <feBlend in="rg" in2="blue" mode="screen" result="output" />
                <feGaussianBlur in="output" stdDeviation="0.2" />
              </filter>
            </defs>
          </svg>
        )}

        <button
          onClick={() => { if (!isDragging) handleOpen(); }}
          aria-label="Show events"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            padding: 0,
            margin: 0,
            backdropFilter: dataUri ? 'url(#eventsBtnFilter)' : 'blur(12px)',
            WebkitBackdropFilter: dataUri ? 'url(#eventsBtnFilter)' : 'blur(12px)',
            boxShadow: `
              0 0 2px 1px rgba(255,255,255,0.15) inset,
              0 0 10px 4px rgba(255,255,255,0.1) inset,
              0 4px 16px rgba(17,17,26,0.05),
              0 8px 24px rgba(17,17,26,0.05),
              0 16px 56px rgba(17,17,26,0.05)
            `,
          }}
        >
          <Megaphone
            style={{
              width: '28px',
              height: '28px',
              color: 'white',
              pointerEvents: 'none',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
            }}
          />
        </button>
      </div>
    );
  }

  // ── OPEN: fullscreen slideshow modal ────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full overflow-hidden relative shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-30 bg-white/80 rounded-full p-1 hover:bg-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowInfo(!showInfo)}
          className="absolute top-4 left-4 z-30 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition"
        >
          <Info className="w-4 h-4 text-gray-700" />
        </button>

        <div className="relative h-96 overflow-hidden pointer-events-none">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {eventsWithImages.map((evt, idx) => (
              <div key={idx} className="w-full flex-shrink-0 h-96">
                <img
                  src={evt.imageUrl!}
                  alt={evt.titleFr || evt.titleAr}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>

          <div
            className={`absolute bottom-0 left-0 right-0 bg-black/60 text-white backdrop-blur-sm transition-all duration-300 ${
              showInfo ? 'max-h-40 p-4 opacity-100' : 'max-h-0 p-0 opacity-0'
            }`}
          >
            <h3 className="text-lg font-bold">
              {locale === 'fr'
                ? eventsWithImages[currentIndex].titleFr
                : eventsWithImages[currentIndex].titleAr}
            </h3>
            {eventsWithImages[currentIndex].descriptionFr && (
              <p className="text-sm mt-1">
                {locale === 'fr'
                  ? eventsWithImages[currentIndex].descriptionFr
                  : eventsWithImages[currentIndex].descriptionAr}
              </p>
            )}
          </div>
        </div>

        {eventsWithImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); manualNav(prev); }}
              className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center z-30 pointer-events-auto group"
              aria-label="Previous slide"
            >
              <span className="block w-1 h-8 bg-white/40 group-hover:bg-white rounded-full transition-colors" />
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); manualNav(next); }}
              className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center z-30 pointer-events-auto group"
              aria-label="Next slide"
            >
              <span className="block w-1 h-8 bg-white/40 group-hover:bg-white rounded-full transition-colors" />
            </button>
          </>
        )}

        {eventsWithImages.length > 1 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); toggleAutoPlay(); }}
            className="absolute bottom-4 right-4 z-30 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition"
            aria-label={autoPlay ? 'Pause slideshow' : 'Play slideshow'}
          >
            {autoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        )}

        {eventsWithImages.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            {eventsWithImages.map((_, index) => (
              <button
                type="button"
                key={index}
                onClick={e => { e.stopPropagation(); manualNav(() => setCurrentIndex(index)); }}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}