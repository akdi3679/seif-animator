import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { queueBackup } from '../../services/backup-service.js';

const router = Router();

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:newsletter' });
router.use(limiter);
// Active subscribers
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { search, dateFrom, dateTo, limit = 20, offset = 0 } = req.query;

  let query = supabase
    .from('NewsletterSubscriber')
    .select('id, email, phone, subscribed_at', { count: 'exact' })
    .is('deleted_at', null)
    .order('subscribed_at', { ascending: false });

  if (search) {
    const term = `%${search}%`;
    query = query.or(`email.ilike.${term},phone.ilike.${term}`);
  }

  if (dateFrom) {
    query = query.gte('subscribed_at', new Date(dateFrom as string).toISOString());
  }
  if (dateTo) {
    query = query.lte('subscribed_at', new Date(dateTo as string).toISOString());
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const parsedOffset = Math.max(Number(offset) || 0, 0);
  query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json({ subscribers: data, total: count });
});

// Soft‑deleted (trash) – only last 30 days
router.get('/trash', authenticate, requireAdmin,  async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('NewsletterSubscriber')
    .select('id, email, phone, subscribed_at')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo)
    .order('subscribed_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

// Restore
router.post('/:id/restore', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { data, error } = await supabase
    .from('NewsletterSubscriber')
    .update({ deleted_at: null })
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  queueBackup('newsletter', 'update', req.params.id)
  logAudit({ userId: req.user!.id, action: 'RESTORE', resource: 'NewsletterSubscriber', resourceId: req.params.id, req, success: true });
  res.json({ success: true, id: req.params.id });
});

// Soft‑delete / permanent
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode,   async (req, res) => {
  const permanent = req.query.permanent === 'true';
  if (permanent) {
    const { data, error } = await supabase
      .from('NewsletterSubscriber')
      .delete()
      .eq('id', req.params.id)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    logAudit({ userId: req.user!.id, action: 'PERMANENT_DELETE', resource: 'NewsletterSubscriber', resourceId: req.params.id, req, success: true });
  } else {
    const { data, error } = await supabase
      .from('NewsletterSubscriber')
      .update({ deleted_at: new Date() })
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    logAudit({ userId: req.user!.id, action: 'SOFT_DELETE', resource: 'NewsletterSubscriber', resourceId: req.params.id, req, success: true });
  }
queueBackup('newsletter', permanent ? 'delete' : 'update', req.params.id);
  res.json({ success: true, id: req.params.id });
});

export default router;