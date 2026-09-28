import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router();

router.get('/', async (_req, res) => {
  if (!(await isFeatureEnabled('challenge'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  }
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  const { data, error } = await supabase
    .from('Challenge')
    .select('id, title_fr, title_ar, html_code')
    .eq('is_active', true)
    .single();

  if (error || !data) return res.status(404).json({ error: 'No active challenge' });
  res.json(data);
});

export default router;