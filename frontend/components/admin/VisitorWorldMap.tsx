'use client';
import { useEffect, useState, useRef } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { RetryableError } from '@/components/shared/RetryableError';
import { useTranslations } from 'next-intl';
import { select } from 'd3-selection';
import { zoom as d3Zoom } from 'd3-zoom';

interface Location {
  lat: number;
  lon: number;
  city: string;
  country: string;
  visit_count: number;
}

interface MapData {
  locations: Location[];
  totalVisits: number;
  lastVisitAt: string | null;
  last24hVisits: number;   // <-- new field
}

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export function VisitorWorldMap() {
  const t = useTranslations('admin.monitor.visitorMap');
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);

  const { data, error, isValidating, retry, isRetrying } = useAdminGETSWR<MapData>(
    '/monitor/visitors/map-data'
  );

  // Placeholder logic
  const [showMap, setShowMap] = useState(false);
  const minDelayRef = useRef(false);

  // On mount, enforce minimum 300ms placeholder
  useEffect(() => {
    minDelayRef.current = false;
    setShowMap(false);
    const timer = setTimeout(() => {
      minDelayRef.current = true;
      if (!isValidating) setShowMap(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // When isValidating changes, immediately show/hide the map placeholder
  useEffect(() => {
    if (isValidating) {
      setShowMap(false);   // hide map while revalidating (manual refresh)
    } else if (minDelayRef.current) {
      setShowMap(true);    // show map when revalidation finishes (and min delay passed)
    }
  }, [isValidating]);

  // Zoom/pan effect – only attached when map is visible
  useEffect(() => {
    if (!showMap || !svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const g = select(gRef.current);
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });
    svg.call(zoomBehavior);
  }, [showMap]);

  const [showAll, setShowAll] = useState(false);

  const locations = data?.locations || [];
  const hasLocations = locations.length > 0;
  const showEmptyOverlay = !hasLocations;

  return (
    <>
      {!showMap && !error ? (
        <div className="h-[400px] bg-gray-50 rounded-2xl border animate-pulse" />
      ) : error && !showMap ? (
        <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-bold text-lg">{t('title')}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
              <span>{t('totalVisits')}: {data?.totalVisits ?? 0}</span>
              <span>{t('last24hVisits')}: {data?.last24hVisits ?? 0}</span>
              {data?.lastVisitAt && (
                <span>{t('lastVisit')}: {new Date(data.lastVisitAt).toLocaleString()}</span>
              )}
            </div>
          </div>

          <div className="relative">
            <svg
              ref={svgRef}
              viewBox="0 0 800 400"
              style={{ width: '100%', height: 'auto', background: '#f9fafb', cursor: 'grab' }}
            >
              <defs>
                <pattern id="paper-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#paper-grid)" />

              <g ref={gRef}>
                <ComposableMap
                  projection="geoMercator"
                  projectionConfig={{ scale: 140 }}
                  width={800}
                  height={400}
                  style={{ width: '100%', height: '100%' }}
                >
                  <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                      geographies.map(geo => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="#f3f4f6"
                          stroke="#d1d5db"
                          strokeWidth={0.5}
                        />
                      ))
                    }
                  </Geographies>

                  {locations.map((loc, i) => (
                    <Marker key={i} coordinates={[loc.lon, loc.lat]}>
                      <circle
                        r={Math.min(3.5, Math.max(0.8, Math.log2(loc.visit_count + 1) * 0.7))}
                        fill="#C184FB"
                        fillOpacity={0.85}
                        stroke="#fff"
                        strokeWidth={0.5}
                      />
                      <title>{`${loc.city}, ${loc.country} (${loc.visit_count})`}</title>
                    </Marker>
                  ))}
                </ComposableMap>
              </g>

              <text x="10" y="390" fontSize="10" fill="#9ca3af" style={{ userSelect: 'none' }}>
                {t('zoomHint')}
              </text>
            </svg>

            {showEmptyOverlay && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                <div className="bg-white rounded-xl px-6 py-4 shadow-lg text-center">
                  <p className="text-gray-500 font-medium">{t('empty')}</p>
                  <p className="text-sm text-gray-400 mt-1">{t('emptyHint')}</p>
                </div>
              </div>
            )}

            {hasLocations && (
              <div className="border-t">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">{t('country')}</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">{t('city')}</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">{t('visits')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAll ? locations : locations.slice(0, 3)).map((loc, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-4 py-2">{loc.country}</td>
                          <td className="px-4 py-2">{loc.city}</td>
                          <td className="px-4 py-2 text-right">{loc.visit_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {locations.length > 3 && (
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full px-4 py-2 text-sm text-primary hover:bg-gray-50 border-t"
                  >
                    {showAll ? t('showLess') : t('showAll')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}