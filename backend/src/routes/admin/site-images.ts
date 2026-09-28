import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:site-images' });
router.use(limiter);

const imageSchema = z.object({
  image_url: z.string().url('Image URL must be a valid URL'),
  image_public_id: z.string().optional().nullable(),
  alt_fr: z.string().min(1, 'French alt text is required'),
  alt_ar: z.string().min(1, 'Arabic alt text is required'),
});

// GET — all site images
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('SiteImages')
    .select('name, image_url, image_public_id, alt_fr, alt_ar')
    .order('name');

  if (error) {
    console.error('[SiteImages] GET failed:', error);
    return res.status(500).json({ error: 'Operation failed' });
  }
  res.json(data || []);
});

// PUT /:name — replace-only (no delete); cleans up the old Cloudinary image,
// then returns the updated row for the optimistic cache.
router.put('/:name', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { image_url, image_public_id, alt_fr, alt_ar } = parsed.data;
  const { name } = req.params;

  const { data: existing } = await supabase
    .from('SiteImages')
    .select('image_public_id')
    .eq('name', name)
    .maybeSingle();

  // Delete the previous Cloudinary image when it's being replaced
  if (existing?.image_public_id && existing.image_public_id !== image_public_id) {
    try { await deleteCloudinaryImage(existing.image_public_id); }
    catch (e) { console.error('[SiteImages] old image delete failed:', e); }
  }

  const { data, error } = await supabase
    .from('SiteImages')
    .upsert({ name, image_url, image_public_id, alt_fr, alt_ar }, { onConflict: 'name' })
    .select()
    .single();

  if (error) {
    console.error('[SiteImages] PUT failed:', error);
    return res.status(500).json({ error: 'Operation failed' });
  }

  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'SiteImage', resourceId: name, req, success: true });
  res.json(data);   // full updated row → optimistic cache
});

export default router;