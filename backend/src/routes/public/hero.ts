import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  const { data, error } = await supabase
    .from('HeroSlide')
    .select('id, image_url, title_fr, title_ar, show_floating_buttons')
    .eq('is_active', true)
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

export default router;