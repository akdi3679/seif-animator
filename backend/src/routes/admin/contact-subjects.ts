import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';
import { createRateLimiter } from '../../middleware/rate-limit.js';

const router = Router();

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:subjects' });
router.use(limiter);
// Zod schemas
const subjectCreateSchema = z.object({
  title_fr: z.string().min(1),
  title_ar: z.string().min(1),
});

const subjectUpdateSchema = z.object({
  title_fr: z.string().min(1).optional(),
  title_ar: z.string().min(1).optional(),
});

// GET all active subjects
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('ContactSubject')
    .select('id, title_fr, title_ar, order_index')
    .is('deleted_at', null)
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

// CREATE
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = subjectCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('ContactSubject').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Operation failed' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'ContactSubject', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

// REORDER
router.put('/order', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid payload' });

  const { error } = await supabase.rpc('update_contact_subject_order', { items });
  if (error) {
    console.error('[ContactSubject order]', error);
    return res.status(500).json({ error: 'Operation failed' });
  }

  logAudit({ userId: req.user!.id, action: 'REORDER', resource: 'ContactSubject', req, success: true });
  res.json({ success: true });
});

// UPDATE single subject
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  console.log('called')
  const parsed = subjectUpdateSchema.safeParse(req.body);
    console.log('called' , parsed )

  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase
    .from('ContactSubject')
    .update({ ...parsed.data, updated_at: new Date() })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

      console.log('called' , data );

  if (error || !data) return res.status(404).json({ error: 'Not found' });
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'ContactSubject', resourceId: req.params.id, req, success: true });
  res.json(data);
});

// DELETE (soft) – with verification code
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { error } = await supabase
    .from('ContactSubject')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: 'Operation failed' });

  logAudit({ userId: req.user!.id, action: 'DELETE', resource: 'ContactSubject', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;