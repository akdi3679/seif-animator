import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:keyfigures' });
router.use(limiter);

const keyFigureSchema = z.object({
  name_fr: z.string().min(1, 'French name is required'),
  name_ar: z.string().min(1, 'Arabic name is required'),
  value: z.string().min(1, 'Value is required'),
  description_fr: z.string().min(1, 'French description is required'),
  description_ar: z.string().min(1, 'Arabic description is required'),
  icon_url: z.string().min(1, 'Icon is required'),
  icon_public_id: z.string().nullable().optional(),
});

router.get('/', authenticate, requireAdmin,  async (_req, res) => {
  const { data, error } = await supabase
    .from('KeyFigure')
    .select('id, name_fr, name_ar, value, icon_url, icon_public_id, description_fr, description_ar, order_index, is_active')
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Failed to fetch key figures' });
  res.json(data);
});

router.post('/', authenticate, requireAdmin, csrfProtection,  async (req, res) => {
  const parsed = keyFigureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  
  const { data, error } = await supabase.from('KeyFigure').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Failed to create key figure' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'KeyFigure', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

// PUT – update a KeyFigure (icon is a Lucide name string)
router.put('/:id', authenticate, requireAdmin, csrfProtection,  async (req, res) => {
  const parsed = keyFigureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { id } = req.params;
  const { data, error } = await supabase
    .from('KeyFigure')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'Operation failed' });
  if (!data) return res.status(404).json({ error: 'Key figure not found' });
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'KeyFigure', resourceId: id, req, success: true });
  res.json(data);
});

// DELETE – hard delete (no Cloudinary cleanup needed)
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode,  async (req, res) => {
  const { data, error } = await supabase
    .from('KeyFigure')
    .delete()
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) return res.status(400).json({ error: 'Operation failed' });
  if (!data) return res.status(404).json({ error: 'Key figure not found' });
  logAudit({ userId: req.user!.id, action: 'DELETE', resource: 'KeyFigure', resourceId: req.params.id, req, success: true });
  res.json({ success: true, id: req.params.id });
});

export default router;