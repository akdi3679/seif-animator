import { supabase } from './supabase.js';

const cache: Record<string, boolean> = {};
let lastFetch = 0;
const TTL = 60_000; // 1 minute

export async function isFeatureEnabled(feature: string): Promise<boolean> {
  if (Date.now() - lastFetch > TTL) {
    const { data } = await supabase.from('FeatureFlag').select('*');
    (data || []).forEach(f => cache[f.feature_name] = f.is_enabled);
    lastFetch = Date.now();
  }
  return cache[feature] !== false;
}