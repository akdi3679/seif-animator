import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router();

router.get('/', async (_req, res) => {
  if (!(await isFeatureEnabled('brands'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  } 
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  const { data, error } = await supabase
    .from('Brand')
    .select('id, name_ar, name_fr, logo_url, website_url, description_fr, description_ar')
    .eq('is_active', true)
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

export default router;