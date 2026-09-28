import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router();

router.get('/', async (_req, res) => {
  if (!(await isFeatureEnabled('faq'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  }
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  const { data, error } = await supabase
    .from('Faq')
    .select('id, question_fr, question_ar, answer_fr, answer_ar')
    .eq('is_active', true)
    .order('order_index');

  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

export default router;