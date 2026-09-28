import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router();

router.get('/', async (_req, res) => {
  if (!(await isFeatureEnabled('goals'))) return res.status(404).json({ error: 'Feature disabled' });
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  const [figures, goals] = await Promise.all([
    supabase.from('KeyFigure')
  .select('id, name_fr, name_ar, value, icon_url, description_fr, description_ar')
      .eq('is_active', true)
      .order('order_index'),
    supabase.from('Goal')
      .select('id, title_fr, title_ar, current_value, target_value, unit, icon_url, start_date, end_date')
      .eq('is_active', true)
      .order('order_index')
  ]);

  if (figures.error || goals.error) {
    return res.status(500).json({ error: 'Failed to fetch goals data' });
  }

  res.json({ figures: figures.data, goals: goals.data });
});

export default router;