import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
const router = Router();
router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const { data } = await supabase.from('FeatureFlag').select('feature_name, is_enabled');
  const flags: Record<string, boolean> = {};
  data?.forEach(f => flags[f.feature_name] = f.is_enabled);
  res.json(flags);
});
export default router;