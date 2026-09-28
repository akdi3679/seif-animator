import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:whychooseus' });
router.use(limiter);

const whyChooseUsSchema = z.object({
  title_fr: z.string().min(1, 'French title is required'),
  title_ar: z.string().min(1, 'Arabic title is required'),
  description_fr: z.string().min(1, 'French description is required'),
  description_ar: z.string().min(1, 'Arabic description is required'),
});

router.get('/', authenticate, requireAdmin,  async (_req, res) => {
  const { data, error } = await supabase
    .from('WhyChooseUs')
    .select('id, title_fr, title_ar, description_fr, description_ar, order_index, is_active')
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Failed to fetch items' });
  res.json(data);
});

router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = whyChooseUsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  
  const { data, error } = await supabase.from('WhyChooseUs').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Failed to create item' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'WhyChooseUs', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = whyChooseUsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase
    .from('WhyChooseUs')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'Operation failed' });
  if (!data) return res.status(404).json({ error: 'Item not found' });
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'WhyChooseUs', resourceId: req.params.id, req, success: true });
  res.json(data);
});

router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data, error } = await supabase
    .from('WhyChooseUs')
    .delete()
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'Operation failed' });
  if (!data) return res.status(404).json({ error: 'Item not found' });
  logAudit({ userId: req.user!.id, action: 'DELETE', resource: 'WhyChooseUs', resourceId: req.params.id, req, success: true });
  res.json({ success: true, id: req.params.id });
});

export default router;