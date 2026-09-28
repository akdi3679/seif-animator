'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { adminAPI } from '@/lib/api/client';
import { getCachedGeo } from '@/lib/hooks/useGeoLocation';

interface WeatherData { temp?: number; desc?: string; city?: string; country?: string; }
interface Geo { lat: number; lng: number; }

interface WeatherContextType {
  weather: WeatherData | null;
  mode: 'ip' | 'geo';
  loading: boolean;
  timezone: string | null;
  lastGeo: Geo | null;
  geoLabel: string | null;
  setMode: (mode: 'ip' | 'geo', geo?: Geo) => Promise<void>;
  refreshWeather: () => Promise<void>;
}

const WeatherContext = createContext<WeatherContextType>({
  weather: null, mode: 'ip', loading: true, timezone: null,
  lastGeo: null, geoLabel: null, setMode: async () => {}, refreshWeather: async () => {},
});
export const useWeather = () => useContext(WeatherContext);

const STORAGE_MODE_KEY = 'weather_mode';
const STORAGE_GEO_KEY = 'weather_geo';
const STORAGE_TZ_KEY = 'weather_tz';

function getInitialMode(): 'ip' | 'geo' {
  if (typeof window === 'undefined') return 'ip';
  return localStorage.getItem(STORAGE_MODE_KEY) === 'geo' ? 'geo' : 'ip';
}
function getInitialGeo(): Geo | null {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem(STORAGE_GEO_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function getCachedTimezone(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_TZ_KEY) || null;
}

async function fetchTimezoneFromCoords(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.timezone || null;
  } catch { return null; }
}

async function fetchGeoLabel(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    if (!res.ok) return null;
    const data = await res.json();
    const city = data.city || data.locality;
    const country = data.countryName;
    return (city && country) ? `${city}, ${country}` : (country || city || null);
  } catch { return null; }
}

export function AdminWeatherProvider({ children }: { children: React.ReactNode }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [mode, setModeState] = useState<'ip' | 'geo'>(getInitialMode);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState<string | null>(getCachedTimezone);
  const [lastGeo, setLastGeo] = useState<Geo | null>(getInitialGeo);
  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchWeatherData = useCallback(async (currentMode: 'ip' | 'geo', geo?: Geo | null): Promise<WeatherData | null> => {
    try {
      let query: string;
      if (currentMode === 'geo' && geo) {
        query = `${geo.lat},${geo.lng}`;
      } else {
        const geoData = await getCachedGeo();
        if (!geoData || (!geoData.city && !geoData.country)) return null;
        query = geoData.city || geoData.country;
      }
      const res = await fetch(`https://wttr.in/${encodeURIComponent(query)}?format=j1`);
      if (!res.ok) return null;
      const data = await res.json();
      const current = data.current_condition?.[0];
      if (!current) return null;
      return {
        temp: current.temp_C ? parseInt(current.temp_C) : undefined,
        desc: current.weatherDesc?.[0]?.value,
        city: data.nearest_area?.[0]?.areaName?.[0]?.value,
        country: data.nearest_area?.[0]?.country?.[0]?.value,
      };
    } catch { return null; }
  }, []);

  const applyGeo = useCallback(async (geo: Geo | null) => {
    setLastGeo(geo);
    if (geo) {
      try { localStorage.setItem(STORAGE_GEO_KEY, JSON.stringify(geo)); } catch {}
      setGeoLabel(await fetchGeoLabel(geo.lat, geo.lng));
    } else {
      setGeoLabel(null);
    }
  }, []);

  const fullRefresh = useCallback(async () => {
    setLoading(true);
    try {
      let currentMode = getInitialMode();
      let currentGeo = getInitialGeo();
      try {
        const data = await adminAPI<{ mode: string; geo: Geo | null }>('/settings/weather');
        currentMode = (data.mode === 'geo' ? 'geo' : 'ip') as 'ip' | 'geo';
        currentGeo = data.geo || currentGeo;
        localStorage.setItem(STORAGE_MODE_KEY, currentMode);
        if (currentGeo) localStorage.setItem(STORAGE_GEO_KEY, JSON.stringify(currentGeo));
      } catch {}

      setModeState(currentMode);
      await applyGeo(currentGeo);

      let tz: string | null = null;
      let weatherData: WeatherData | null = null;
      if (currentMode === 'geo' && currentGeo) {
        tz = await fetchTimezoneFromCoords(currentGeo.lat, currentGeo.lng);
        weatherData = await fetchWeatherData('geo', currentGeo);
      } else {
        const ipGeo = await getCachedGeo();
        tz = ipGeo?.timezone ?? null;
        weatherData = await fetchWeatherData('ip', null);
      }
      if (!tz) tz = getCachedTimezone();
      if (!tz) { try { const ipGeo = await getCachedGeo(); tz = ipGeo?.timezone ?? null; } catch {} }
      if (tz) localStorage.setItem(STORAGE_TZ_KEY, tz);
      setTimezone(tz);
      setWeather(weatherData);
    } finally {
      setLoading(false);
    }
  }, [fetchWeatherData, applyGeo]);

  useEffect(() => {
    if (!hasFetched.current) { hasFetched.current = true; fullRefresh(); }
  }, []);

  const setMode = useCallback(async (newMode: 'ip' | 'geo', newGeo?: Geo) => {
    setLoading(true);
    try {
      await adminAPI('/settings/weather', {
        method: 'PUT',
        body: JSON.stringify({ mode: newMode, geo: newMode === 'geo' ? (newGeo || null) : undefined }),
      });
      localStorage.setItem(STORAGE_MODE_KEY, newMode);
      setModeState(newMode);

      if (newMode === 'geo' && newGeo) await applyGeo(newGeo);

      let tz: string | null = null;
      let weatherData: WeatherData | null = null;
      if (newMode === 'geo' && newGeo) {
        tz = await fetchTimezoneFromCoords(newGeo.lat, newGeo.lng);
        weatherData = await fetchWeatherData('geo', newGeo);
      } else {
        const ipGeo = await getCachedGeo();
        tz = ipGeo?.timezone ?? getCachedTimezone();
        weatherData = await fetchWeatherData('ip', null);
      }
      if (tz) localStorage.setItem(STORAGE_TZ_KEY, tz);
      setTimezone(tz);
      setWeather(weatherData);
    } catch {
      fullRefresh();
    } finally {
      setLoading(false);
    }
  }, [fetchWeatherData, fullRefresh, applyGeo]);

  return (
    <WeatherContext.Provider value={{ weather, mode, loading, timezone, lastGeo, geoLabel, setMode, refreshWeather: fullRefresh }}>
      {children}
    </WeatherContext.Provider>
  );
}