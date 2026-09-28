import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:goals' });
router.use(limiter);

const goalSchema = z.object({
  title_fr: z.string().min(1, 'French title is required'),
  title_ar: z.string().min(1, 'Arabic title is required'),
  current_value: z.coerce.number().min(0),
  target_value: z.coerce.number().min(1),
  unit: z.string().min(1).regex(/^\S+$/, 'Unit must be a single word'),
  icon_url: z.string().min(1, 'Icon is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
});

router.get('/',  authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('Goal')
    .select('id, title_fr, title_ar, current_value, target_value, unit, icon_url, start_date, end_date, order_index, is_active')
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Failed to fetch goals' });
  res.json(data);
});

router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  
  const { data, error } = await supabase.from('Goal').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Failed to create goal' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'Goal', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

router.put('/:id', authenticate, requireAdmin, csrfProtection,   async (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase
    .from('Goal')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();
    
  if (error) return res.status(400).json({ error: 'Operation failed' });
  if (!data) return res.status(404).json({ error: 'Goal not found' });
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'Goal', resourceId: req.params.id, req, success: true });
  res.json(data);
});

router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data, error } = await supabase
    .from('Goal')
    .delete()
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();
    
  if (error) return res.status(400).json({ error: 'Operation failed' });
  if (!data) return res.status(404).json({ error: 'Goal not found' });
  logAudit({ userId: req.user!.id, action: 'DELETE', resource: 'Goal', resourceId: req.params.id, req, success: true });
  res.json({ success: true, id: req.params.id });
});

export default router;