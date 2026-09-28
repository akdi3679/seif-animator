
import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:faq' });
router.use(limiter);

// ── Zod schema ────────────────────────────────────────────────────
const faqSchema = z.object({
  question_fr: z.string().min(1, 'French question is required'),
  question_ar: z.string().min(1, 'Arabic question is required'),
  answer_fr: z.string().min(1, 'French answer is required'),
  answer_ar: z.string().min(1, 'Arabic answer is required'),
  order_index: z.coerce.number().int().optional(),
});

// GET
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('Faq')
    .select('id, question_fr, question_ar, answer_fr, answer_ar, order_index')
    .is('deleted_at', null)
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

// CREATE
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = faqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('Faq').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Operation failed' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'Faq', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

// UPDATE
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = faqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase
    .from('Faq')
    .update({ ...parsed.data, updated_at: new Date() })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'Faq', resourceId: req.params.id, req, success: true });
  res.json(data);
});
router.put('/order', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid payload' });

  const { error } = await supabase.rpc('update_faq_order', { items });
  if (error) return res.status(500).json({ error: 'Operation failed' });
logAudit({ userId: req.user!.id, action: 'REORDER', resource: 'Faq', req, success: true });
  res.json({ success: true });
});
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { error } = await supabase
    .from('Faq')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: 'Operation failed' });

  logAudit({ userId: req.user!.id, action: 'DELETE', resource: 'Faq', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;