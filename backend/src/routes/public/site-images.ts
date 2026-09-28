import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  const { data, error } = await supabase
    .from('SiteImages')
    .select('name, image_url, alt_fr, alt_ar');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

export default router;