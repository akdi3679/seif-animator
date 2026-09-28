import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:brands' });
router.use(limiter);

const brandSchema = z.object({
  name_fr: z.string().min(1, 'French name required'),
  name_ar: z.string().min(1, 'Arabic name required'),
  logo_url: z.string().url().min(1, 'Logo is required'),
  website_url: z.string().url().min(1, 'Website URL is required'),
  description_fr: z.string().min(1, 'French description is required'),
  description_ar: z.string().min(1, 'Arabic description is required'),
  image_public_id: z.string().optional().nullable(),
  order_index: z.number().int().optional().default(0),
});

// ── LIST ──
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('Brand')
    .select('id, name_fr, name_ar, logo_url, website_url, description_fr, description_ar, image_public_id, order_index')
    .order('order_index');

  if (error) return res.status(500).json({ error: 'Operation failed' });

  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'Brand', req, success: true, metadata: { count: data?.length } });
  res.json(data);
});

// ── CREATE ──
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('Brand').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: error.message });

  logAudit({ userId: req.user.id, action: 'CREATE', resource: 'Brand', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});
// ── REORDER ──
router.put('/order', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items required' });

  for (const item of items) {
    await supabase.from('Brand').update({ order_index: item.order_index }).eq('id', item.id);
  }

  logAudit({ userId: req.user.id, action: 'REORDER', resource: 'Brand', req, success: true });
  res.json({ success: true });
});

// ── UPDATE ──
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data: existing } = await supabase.from('Brand').select('image_public_id').eq('id', req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (existing.image_public_id && existing.image_public_id !== parsed.data.image_public_id) {
    try { await deleteCloudinaryImage(existing.image_public_id); } catch (e) {}
  }

  const { data, error } = await supabase.from('Brand').update(parsed.data).eq('id', req.params.id).select().maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });

  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'Brand', resourceId: req.params.id, req, success: true });
  res.json(data);
});


// ── DELETE ──
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: brand } = await supabase.from('Brand').select('image_public_id').eq('id', req.params.id).maybeSingle();
  if (!brand) return res.status(404).json({ error: 'Not found' });

  if (brand.image_public_id) {
    try { await deleteCloudinaryImage(brand.image_public_id); } catch (e) {}
  }

  const { error } = await supabase.from('Brand').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });

  logAudit({ userId: req.user.id, action: 'DELETE', resource: 'Brand', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;