'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Marquee from 'react-fast-marquee';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useEvents } from '@/components/providers/EventsProvider';

interface EventTickerProps {
  visible: boolean;
  onToggle: () => void;
}

export default function EventTicker({ visible, onToggle }: EventTickerProps) {
  const params = useParams();
  const locale = params.locale as string;
  const [isPaused, setIsPaused] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { events } = useEvents();
  const isRTL = locale === 'ar';

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || events.length === 0) return null;

  return (
    <div className="relative w-full bg-[#F0E6FA] border-b border-primary/30">
      <div className={`overflow-hidden transition-all duration-300 ${visible ? 'max-h-10 py-1' : 'max-h-0 py-0'}`}>
        <div className="w-full overflow-hidden" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
          <div dir="ltr" className="w-full">
            <Marquee direction={isRTL ? 'right' : 'left'} pauseOnHover speed={50} gradient={false} autoFill>
              <div style={{ marginRight: '62px', display: 'flex' }}>
                {events.map((event: any) => (
                  <span key={event.id} style={{ marginRight: '10px' }} className="inline-flex items-center text-sm text-dark whitespace-nowrap">
                    <span className="font-semibold">{isRTL ? event.titleAr : event.titleFr}</span>
                    <span className="mx-2">•</span>
                    <span>{new Date(event.date).toLocaleDateString(locale)}</span>
                    <span className="mx-2">•</span>
                    <span>{event.location}</span>
                  </span>
                ))}
              </div>
            </Marquee>
          </div>
        </div>
      </div>
      <button
        onClick={onToggle}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:shadow-lg transition"
      >
        {visible ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
    </div>
  );
}