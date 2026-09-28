'use client';
import { createContext, useContext } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';
interface SiteData {
  name_fr?: string;
  name_ar?: string;
  slogan_fr?: string;
  slogan_ar?: string;
  slogans_fr?: string[];
  slogans_ar?: string[];
  logo_url?: string;
  favicon_url?: string | null;
}
export interface SiteDataContextType {
  name: string;
  slogans: string[];
  logoUrl: string;
  // undefined = still loading / field not yet known — don't touch favicon cache
  // null      = admin explicitly removed the favicon — clear the cache
  // string    = real favicon URL — cache it
  faviconUrl: string | null | undefined;
  isLoading: boolean;
  isError: boolean;
}
const SiteDataContext = createContext<SiteDataContextType | null>(null);
export function useSiteData() {
  const ctx = useContext(SiteDataContext);
  if (!ctx) throw new Error('useSiteData must be used within SiteDataProvider');
  return ctx;
}
function splitByComma(arr: string[]): string[] {
  const result: string[] = [];
  for (const part of arr) {
    if (part.includes(',')) {
      result.push(...part.split(',').map(s => s.trim()).filter(Boolean));
    } else {
      result.push(part.trim());
    }
  }
  return result.length ? result : arr;
}
function parseSlogan(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}
function getFallback(locale: string) {
  const name = locale === 'fr'
    ? process.env.NEXT_PUBLIC_SITE_NAME_FR || 'Kafela'
    : process.env.NEXT_PUBLIC_SITE_NAME_AR || 'كافيلا';
  return { name, slogans: [name] };   // slogans come only from the DB now
}
export function SiteDataProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const { data, error, isLoading } = usePublicGETSWR<SiteData>('/site-data', {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const fallback = getFallback(locale);
  // Resolve values – use data if available, otherwise immediate fallback
  const name = locale === 'fr'
    ? data?.name_fr || fallback.name
    : data?.name_ar || fallback.name;
  let slogans: string[] = [];
 if (data) {
  slogans = locale === 'fr' ? (data.slogans_fr || []) : (data.slogans_ar || []);
  slogans = splitByComma(slogans);
} else {
  slogans = fallback.slogans;
}
  if (slogans.length === 0) slogans = [name];
  const logoUrl = data?.logo_url || '/logo.svg';
  // null       = admin explicitly removed the favicon (backend sends favicon_url: null, or omits the key on a resolved row)
  // undefined  = no data yet — still loading or the request failed entirely (no `data` object at all)
  const faviconUrl: string | null | undefined = data
    ? ('favicon_url' in data ? (data.favicon_url ?? null) : null)
    : undefined;
  const value: SiteDataContextType = {
    name,
    slogans,
    logoUrl,
    faviconUrl,
    isLoading,
    isError: !!error,
  };
  // Never return early – always render children with the context available
  return (
    <SiteDataContext.Provider value={value}>
      {children}
    </SiteDataContext.Provider>
  );
}