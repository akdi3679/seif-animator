import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:events' });
router.use(limiter);

const eventSchema = z.object({
  titleFr: z.string().min(1),
  titleAr: z.string().min(1),
  descriptionFr: z.string().min(1),
  descriptionAr: z.string().min(1),
  date: z.string(),
  endDate: z.string(),
  location: z.string().min(1),
  imageUrl: z.string().optional(),
  imagePublicId: z.string().optional(),
  auto_display: z.boolean().optional(),
});

router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('Event')
    .select('id, titleFr, titleAr, descriptionFr, descriptionAr, date, endDate, location, imageUrl, auto_display')
    .is('deletedAt', null)
    .order('date', { ascending: false });
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { data, error } = await supabase.from('Event').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Operation failed' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'Event', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // If the image is being changed or removed, delete the old one from Cloudinary
  if (req.body.imagePublicId !== undefined) {
    const { data: existing } = await supabase
      .from('Event')
      .select('imagePublicId')
      .eq('id', req.params.id)
      .is('deletedAt', null)
      .maybeSingle();

    if (existing?.imagePublicId && existing.imagePublicId !== req.body.imagePublicId) {
      await deleteCloudinaryImage(existing.imagePublicId);
    }
  }

  const { data, error } = await supabase
    .from('Event')
    .update({ ...parsed.data, updatedAt: new Date() })
    .eq('id', req.params.id)
    .is('deletedAt', null)
    .select()
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'Not found' });
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'Event', resourceId: req.params.id, req, success: true });
  res.json(data);
});

router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  // Fetch the existing event to get its imagePublicId before deleting
  const { data: existing, error: fetchErr } = await supabase
    .from('Event')
    .select('imagePublicId')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchErr) return res.status(500).json({ error: 'Operation failed' });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  // Delete the Cloudinary image if one exists
  if (existing.imagePublicId) {
    await deleteCloudinaryImage(existing.imagePublicId);
  }

  // Permanent hard delete
  const { error } = await supabase
    .from('Event')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: 'Operation failed' });

  logAudit({ userId: req.user!.id, action: 'DELETE', resource: 'Event', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;