import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');

  const { data, error } = await supabase
    .from('AdminSchedule')
    .select('day_number, day_name_fr, day_name_ar, work_parts_count, part1_start, part1_end, part2_start, part2_end, part3_start, part3_end')
    .order('day_number', { ascending: true });
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

export default router;