'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';

const CustomGlobe = dynamic(() => import('./CustomGlobe').then(mod => mod.CustomGlobe), { ssr: false });

interface Location { lat: number; lon: number; city: string; country: string; visit_count: number; }
interface RecentVisitor { ip: string; country: string; city: string; visited_at: string; }
interface VisitorData { totalVisits: number; last24hVisits: number; locations?: Location[]; recentVisitors?: RecentVisitor[]; }

interface Props {
  data: VisitorData | undefined;
  loading: boolean;
  error: any;
  onRetry: () => void;
  isRetrying: boolean;
}

export function VisitorGlobe({ data, loading, error, onRetry, isRetrying }: Props) {
  const t = useTranslations('admin.dashboard');
  const [showAllVisitors, setShowAllVisitors] = useState(false);

  if (loading) return <LoadingSpinner />;
  if (error) return <RetryableError error={error} onRetry={onRetry} isRetrying={isRetrying} />;

  const locations = data?.locations || [];
  const recentVisitors = data?.recentVisitors || [];
  const displayedVisitors = showAllVisitors ? recentVisitors : recentVisitors.slice(0, 5);
const totalVisits = data?.totalVisits;
const last24hVisits = data?.last24hVisits;
const mostRecentLocation = data?.recentVisitors?.find(v => v.lat != null && v.lon != null);
const initialLat = mostRecentLocation?.lat;
const initialLon = mostRecentLocation?.lon;
  return (
   <div className="flex h-80 w-full rounded-2xl overflow-hidden shadow-md bg-black">
  {/* Globe – takes all available space */}
  <div className="flex-1 relative">
   <CustomGlobe
  locations={locations}
  width={0}
  height={0}
  initialLat={initialLat}
  initialLon={initialLon}
/>
    <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur text-white px-3 py-2 rounded-xl text-sm font-bold space-y-1">
      <p>{t('visitorsTotal')}: {data?.totalVisits ?? '—'}</p>
      <p>{t('visitors24h')}: {data?.last24hVisits ?? '—'}</p>
    </div>
  </div>

  {/* Visitor list – fixed width */}
  <div className="w-64 bg-white/90 backdrop-blur border-l border-white/20 flex flex-col text-xs shrink-0">
    <div className="px-3 py-2 border-b bg-gray-50/80 font-semibold text-gray-700">
          {t('recentVisitors')}
        </div>
        <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
          {displayedVisitors.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">{t('noVisitors')}</li>
          ) : (
            displayedVisitors.map((v, i) => (
              <li key={i} className="px-3 py-1.5 flex items-center justify-between hover:bg-gray-50/50">
                <span className="truncate text-gray-700 font-medium">
                  {(v.city || v.country || v.ip)}
                </span>
                <span className="text-gray-400 ml-2 shrink-0">
                  {new Date(v.visited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))
          )}
        </ul>
        {recentVisitors.length > 5 && (
          <button
            onClick={() => setShowAllVisitors(!showAllVisitors)}
            className="w-full px-3 py-1.5 text-center text-primary text-xs font-medium hover:bg-gray-50/50 border-t"
          >
            {showAllVisitors ? t('showLess') : t('showAll')}
          </button>
        )}
      </div>
    </div>
  );
}