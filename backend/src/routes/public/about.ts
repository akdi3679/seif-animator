import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  const { data, error } = await supabase
    .from('AboutContent')
    .select('content_fr, content_ar, image_url ')
    .limit(1)
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') {
      return res.json({ content_fr: '', content_ar: '', image_url: '' });
    }
    return res.status(500).json({ error: 'Operation failed' });
  }
  res.json(data);
});

router.get('/summary', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  const { data, error } = await supabase
    .from('AboutContent')
    .select('summary_fr, summary_ar ')
    .limit(1)
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') {
      return res.json({ summary_fr: '', summary_ar: '' });
    }
    return res.status(500).json({ error: 'Operation failed' });
  }
  res.json(data);
});
export default router;