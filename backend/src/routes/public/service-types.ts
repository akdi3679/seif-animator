import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=60');
  try {
    const { data, error } = await supabase
      .from('ServiceType')
      .select('id, name_fr, name_ar, duration_minutes, calcom_slug, order, is_other')
      .eq('is_active', true)
      .order('order', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;