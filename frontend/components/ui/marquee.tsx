'use client';

import { useRef, useEffect, useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MarqueeProps {
  children: ReactNode;
  speed?: number;           // pixels per second
  gap?: number;             // gap between items in pixels
  pauseOnHover?: boolean;
  reverse?: boolean;        // true for RTL (scroll right-to-left)
  className?: string;
}

export function Marquee({
  children,
  speed = 100,
  gap = 16,
  pauseOnHover = false,
  reverse = false,
  className,
}: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use a small delay to ensure DOM is fully painted
    const timer = setTimeout(() => {
      const track = container.querySelector('.marquee-track') as HTMLElement;
      if (track) {
        setContentWidth(track.scrollWidth);
        setIsReady(true);
      } else {
        // Fallback: if track not found, still render after a moment
        setIsReady(true);
      }
    }, 50);

    const handleResize = () => {
      const track = container.querySelector('.marquee-track') as HTMLElement;
      if (track) setContentWidth(track.scrollWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [children]);

  const duration = contentWidth > 0 ? contentWidth / speed : 10; // fallback duration

  const animationStyle = {
    '--duration': `${duration}s`,
    '--gap': `${gap}px`,
  } as React.CSSProperties;

  // Render a static hidden version for measurement while the real one is being set up
  if (!isReady) {
    return (
      <div ref={containerRef} className={cn('overflow-hidden', className)} style={{ visibility: 'hidden' }}>
        <div className="flex gap-[var(--gap)]">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('overflow-hidden', className)}
      style={animationStyle}
    >
      <div dir="ltr">
        <style>{`
          @keyframes marquee-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(calc(-100% - var(--gap))); }
          }
          .marquee-content {
            display: flex;
            gap: var(--gap);
            width: max-content;
            animation: marquee-scroll var(--duration) linear infinite;
            animation-direction: ${reverse ? 'reverse' : 'normal'};
          }
          .marquee-content.paused {
            animation-play-state: paused;
          }
          .marquee-track {
            display: flex;
            gap: var(--gap);
          }
        `}</style>

        <div
          className={cn(
            'marquee-content',
            pauseOnHover && 'hover:paused'
          )}
        >
          <div className="marquee-track">
            {children}
          </div>
          <div className="marquee-track">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}