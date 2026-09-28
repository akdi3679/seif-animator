const GEO_CACHE_KEY = 'geo_data_v3';
const TTL = 30 * 60 * 1000; // 30 minutes

interface GeoData {
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  ip?: string;
}

let inMemoryGeo: GeoData | null = null;

// ── Sources (all support CORS, tried in order) ──────────────────
const sources = [
  {
    name: 'ipinfo',
    url: 'https://ipinfo.io/json',
    parse: (d: any): GeoData | null => {
      if (!d || !d.country || !d.loc) return null;
      const [lat, lon] = d.loc.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { country: d.country, city: d.city, lat, lon, timezone: d.timezone, ip: d.ip };
    },
  },
  {
    name: 'freegeoip',
    url: 'https://freegeoip.app/json/',
    parse: (d: any): GeoData | null =>
      d && d.country_code
        ? { country: d.country_code, city: d.city, lat: d.latitude, lon: d.longitude, timezone: d.time_zone, ip: d.ip }
        : null,
  },
  {
    name: 'ipapi',
    url: 'https://ipapi.co/json/',
    parse: (d: any): GeoData | null =>
      d && !d.error && d.country_code
        ? { country: d.country_code, city: d.city, lat: d.latitude, lon: d.longitude, timezone: d.timezone, ip: d.ip }
        : null,
  },
];

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getCachedGeo(): Promise<GeoData | null> {
  if (inMemoryGeo) return inMemoryGeo;

  // Try localStorage cache first
  try {
    const cached = localStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < TTL) {
        inMemoryGeo = data;
        return data;
      }
    }
  } catch {}

  // Try each source in order
  for (const source of sources) {
    const res = await fetchWithTimeout(source.url, 3000);
    if (!res || !res.ok) continue;

    let json: any;
    try {
      json = await res.json();
    } catch {
      continue;
    }

    const parsed = source.parse(json);
    if (!parsed) continue;

    // Success – cache and return
    inMemoryGeo = parsed;
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({
        data: parsed,
        timestamp: Date.now(),
      }));
    } catch {}
    setTimeout(() => { inMemoryGeo = null; }, TTL);
    return parsed;
  }

  return null;
}