import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

  const { data, error } = await supabase
    .from('TermsContent')
    .select('tab, content_fr, content_ar');

  if (error) return res.status(500).json({ error: 'Operation failed' });

  // Transform rows into a flat object: { terms_fr: '...', terms_ar: '...', … }
  const result: Record<string, string> = {};
  (data || []).forEach((row: any) => {
    result[`${row.tab}_fr`] = row.content_fr || '';
    result[`${row.tab}_ar`] = row.content_ar || '';
  });

  res.json(result);
});

export default router;