import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();
router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  
const { data, error } = await supabase
  .from('SiteData')
 .select('name_fr, name_ar, slogans_fr, slogans_ar, logo_url, favicon_url')
  .order('created_at', { ascending: false })   // ← same rule as the admin route
  .limit(1)
  .single();
  
  if (error || !data) {
    // No row / query failure — genuinely unknown state, not a deletion.
    // 404 lets the client's SWR error path treat this as "no data yet"
    // (faviconUrl stays undefined), instead of silently coercing to
    // favicon_url: null, which would read as "admin removed the favicon."
    return res.status(404).json({ error: 'Site data not found' });
  }

  res.json(data);
});
export default router;