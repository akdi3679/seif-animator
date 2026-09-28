import { supabase } from '../lib/supabase.js';

const DEBUG = process.env.DEBUG_AUTH === 'true';

export async function trackPublicVisitor(
  ip: string,
  geo?: {
    country?: string;
    city?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    ip?: string;
  }
): Promise<void> {
  try {
    const usedIp = geo?.ip || ip;
    const timestamp = new Date().toISOString();

    // Insert into visitor_log (auto-pruned to 200 rows by DB trigger)
    await supabase.from('visitor_log').insert({
      ip: usedIp,
      country: geo?.country || null,
      city: geo?.city || null,
      lat: geo?.lat || null,
      lon: geo?.lon || null,
      timezone: geo?.timezone || null,
    });

    // Upsert aggregated location
    if (geo?.country && geo?.city) {
      await supabase.rpc('upsert_visitor_location', {
        p_country: geo.country,
        p_city: geo.city,
        p_lat: geo.lat || null,
        p_lon: geo.lon || null,
        p_last_visited_at: timestamp,
      });
    }

    if (DEBUG) console.log('[VISITOR] tracked', usedIp, geo?.country, geo?.city);
  } catch (error) {
    console.error('[VISITOR] tracking error:', error);
  }
}