import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:hero' });
router.use(limiter);
const heroSchema = z.object({
  image_url: z.string().url().min(1, 'Image is required'),
  title_fr: z.string().min(1, 'French title is required'),
  title_ar: z.string().min(1, 'Arabic title is required'),
  subtitle_fr: z.string().min(1, 'French subtitle is required'),
  subtitle_ar: z.string().min(1, 'Arabic subtitle is required'),
  button_text_fr: z.string().min(1, 'French button text is required'),
  button_text_ar: z.string().min(1, 'Arabic button text is required'),
  button_link: z.string().min(1, 'Button link is required')
    .refine((val) => val.startsWith('/'), { message: 'Link must start with /' }),
  show_floating_buttons: z.boolean().optional().default(false),
  image_public_id: z.string().optional().nullable(),
  order_index: z.number().int().optional().default(0),
});

// ── LIST ──
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('HeroSlide')
    .select('id, image_url, title_fr, title_ar, subtitle_fr, subtitle_ar, button_text_fr, button_text_ar, button_link, show_floating_buttons,  order_index, image_public_id')
    .order('order_index');

  if (error) return res.status(500).json({ error: 'Operation failed' });

  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'HeroSlide', req, success: true, metadata: { count: data?.length } });
  res.json(data);
});

// ── CREATE ──
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = heroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('HeroSlide').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: error.message });

  logAudit({ userId: req.user.id, action: 'CREATE', resource: 'HeroSlide', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});
// ── REORDER ──
router.put('/order', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items required' });

  for (const item of items) {
    await supabase.from('HeroSlide').update({ order_index: item.order_index }).eq('id', item.id);
  }

  logAudit({ userId: req.user.id, action: 'REORDER', resource: 'HeroSlide', req, success: true });
  res.json({ success: true });
});
// ── UPDATE ──
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = heroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data: existing } = await supabase.from('HeroSlide').select('image_public_id').eq('id', req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (existing.image_public_id && existing.image_public_id !== parsed.data.image_public_id) {
    try { await deleteCloudinaryImage(existing.image_public_id); } catch (e) {}
  }

  const { data, error } = await supabase.from('HeroSlide').update(parsed.data).eq('id', req.params.id).select().maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });

  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'HeroSlide', resourceId: req.params.id, req, success: true });
  res.json(data);
});



// ── DELETE ──
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: hero } = await supabase.from('HeroSlide').select('image_public_id').eq('id', req.params.id).maybeSingle();
  if (!hero) return res.status(404).json({ error: 'Not found' });

  if (hero.image_public_id) {
    try { await deleteCloudinaryImage(hero.image_public_id); } catch (e) {}
  }

  const { error } = await supabase.from('HeroSlide').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });

  logAudit({ userId: req.user.id, action: 'DELETE', resource: 'HeroSlide', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;