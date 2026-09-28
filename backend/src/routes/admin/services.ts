import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:services' });
router.use(limiter);

// ── Zod schema ────────────────────────────────────────────────────
const serviceSchema = z.object({
  title_fr: z.string().min(1, 'French title is required'),
  title_ar: z.string().min(1, 'Arabic title is required'),
  description_fr: z.string().min(1, 'French description is required'),
  description_ar: z.string().min(1, 'Arabic description is required'),
  image_url: z.string().url().optional().or(z.literal('')),
  image_public_id: z.string().optional(),
  order_index: z.coerce.number().int().optional(),
}).passthrough();   // allow extra fields like icon_url (not used yet)

// ── GET all (admin list) ──
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('Service')
    .select('id, title_fr, title_ar, description_fr, description_ar, image_url, image_public_id,  order_index')
    .order('order_index');

  if (error) {
    console.error('[Services]', error);
    return res.status(500).json({ error: 'Operation failed', details: error.message });
  }
  res.json(data);
});

// ── CREATE ──
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('Service').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Operation failed' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'Service', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});
router.put('/order', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { items } = req.body;
  console.log('[DEBUG order] received items:', JSON.stringify(items));

  if (!Array.isArray(items)) {
    console.log('[DEBUG order] items is not an array');
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    console.log('[DEBUG order] calling RPC with items...');
    const { data, error } = await supabase.rpc('update_service_order', { items });
    console.log('[DEBUG order] RPC data:', data);
    console.log('[DEBUG order] RPC error:', error);
    if (error) {
      console.error('[DEBUG order] Full error object:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: 'Operation failed', details: error.message });
    }
    logAudit({ userId: req.user!.id, action: 'REORDER', resource: 'Service', req, success: true });
    res.json({ success: true });
  } catch (err) {
    console.error('[DEBUG order] Exception:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ── UPDATE ──
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // If image changed, delete old Cloudinary asset
  if (req.body.image_public_id !== undefined) {
    const { data: existing } = await supabase
      .from('Service')
      .select('image_public_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (existing?.image_public_id && existing.image_public_id !== req.body.image_public_id) {
      await deleteCloudinaryImage(existing.image_public_id);
    }
  }

  const { data, error } = await supabase
    .from('Service')
    .update({ ...parsed.data, updated_at: new Date() })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'Service', resourceId: req.params.id, req, success: true });
  res.json(data);
});


// ── DELETE (hard) ──
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: existing, error: fetchErr } = await supabase
    .from('Service')
    .select('image_public_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchErr || !existing) return res.status(404).json({ error: 'Not found' });

  if (existing.image_public_id) {
    await deleteCloudinaryImage(existing.image_public_id);
  }

  const { error } = await supabase.from('Service').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });
  logAudit({ userId: req.user!.id, action: 'DELETE', resource: 'Service', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;