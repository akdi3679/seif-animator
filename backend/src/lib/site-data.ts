import { supabase } from './supabase.js';
// not available in Express; use a simple cache

let cached: any = null;
let lastFetch = 0;

export async function getSiteData() {
  if (Date.now() - lastFetch < 3600_000 && cached) return cached;
  const { data } = await supabase.from('SiteData').select('*').single();
  cached = data;
  lastFetch = Date.now();
  return cached || { name_fr: 'Kafela', name_ar: 'كافيلا', slogan_fr: '', slogan_ar: '', logo_url: null };
}