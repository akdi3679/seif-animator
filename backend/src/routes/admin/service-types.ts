import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:servicetypes' });
router.use(limiter);

// GET all – read‑only
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('ServiceType')
    .select(`
      id, name_fr, name_ar, duration_minutes, calcom_slug,
      description_fr, description_ar,
      calcom_title, calcom_description,
      price, currency, locations, requires_confirmation,
      is_active, is_other, order
    `)
    .is('deleted_at', null)
    .order('order');

  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

export default router;