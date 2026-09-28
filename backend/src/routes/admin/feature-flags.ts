import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:flags' });
router.use(limiter);

const flagToggleSchema = z.object({ enabled: z.boolean() });

router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('FeatureFlag').select('feature_name, is_enabled');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

router.put('/:name', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = flagToggleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const { enabled } = parsed.data;
  const { error } = await supabase
    .from('FeatureFlag')
    .upsert({ feature_name: req.params.name, is_enabled: enabled }, { onConflict: 'feature_name' });
  if (error) return res.status(500).json({ error: 'Operation failed' });

  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'FeatureFlag', resourceId: req.params.name, req, success: true, metadata: { enabled } });
  res.json({ success: true });
});

export default router;