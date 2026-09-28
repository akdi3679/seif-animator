import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');

  try {
    const { data, error } = await supabase
      .from('ContactInfo')  // exact case as in SQL
      .select('address, email, phone, hours, latitude, longitude, map_zoom, social_links')
      .single();

    if (error) {
      console.error('ContactInfo fetch error:', error);
      return res.status(500).json({ error: 'Operation failed' });
    }
    res.json(data);
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;