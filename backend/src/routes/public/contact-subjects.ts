import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  const { data, error } = await supabase
    .from('ContactSubject')
    .select('id, title_fr, title_ar, is_other')
    .eq('is_active', true)
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

export default router;