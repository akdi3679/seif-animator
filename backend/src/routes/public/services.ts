import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router();

// GET active services for public display
router.get('/', async (_req, res) => {
  if (!(await isFeatureEnabled('services'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  }
  try {
    // Cache for 5 minutes
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

    const { data, error } = await supabase
  .from('Service')
  .select('id, title_fr, title_ar, description_fr, description_ar, image_url, link_url, order_index')
  .eq('is_active', true)
  .order('order_index', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('GET /public/services error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

router.get('/:id', async (req, res) => {
if (!(await isFeatureEnabled('services'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  }
  try {
    // Cache for 5 minutes
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

  const { data, error } = await supabase.from('Service').select('*').eq('id', req.params.id).eq('is_active', true).single();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
  } catch (error) {
    console.error('GET /public/services/details error:', error);
    res.status(500).json({ error: 'Failed to fetch service details ' });
  }
});
export default router;