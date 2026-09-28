import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';
import { decrypt } from '../../lib/encryption.js';
import { queueBackup } from '../../services/backup-service.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:messages' });
router.use(limiter);

function safeDecrypt(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(':');
  // Encrypted format: iv:authTag:data (all base64)
  if (parts.length === 3 && parts.every(p => /^[A-Za-z0-9+/=]+$/.test(p))) {
    try {
      return decrypt(value);
    } catch {
      return null;            // decryption failed → treat as unavailable
    }
  }
  // Already plain text
  return value;
}
const updateMessageSchema = z.object({
  status: z.enum(['NEW', 'READ', 'REPLIED']).optional(),
  adminNotes: z.string().optional(),
});

// GET active list with pagination & search
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { status, search, limit = 20, offset = 0 } = req.query;
  let query = supabase
    .from('Message')
.select(`id, name, email, phone, message, status, adminNotes, subject_id, custom_subject, createdAt, repliedAt, deleted_at`, { count: 'exact' })
    .is('deleted_at', null)
    .order('createdAt', { ascending: false });

  if (status && ['NEW','READ','REPLIED'].includes(status as string)) {
    query = query.eq('status', status);
  }

  if (search) {
    const term = `%${search}%`;
    query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},message.ilike.${term},custom_subject.ilike.${term}`);
  }

  query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });

  // Decrypt phone numbers before sending
  const messages = (data || []).map((m: any) => ({
    ...m,
    phone: safeDecrypt(m.phone),
  }));

  res.json({ messages, total: count });
});

// GET soft‑deleted list (trash)
router.get('/trash',  authenticate, requireAdmin, async (_req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('Message')
.select(`id, name, email, phone, message, status, adminNotes, subject_id, custom_subject, createdAt, repliedAt, deleted_at`)
.not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo)
    .order('createdAt', { ascending: false });

  if (error) return res.status(500).json({ error: 'Operation failed' });

  const messages = (data || []).map((m: any) => ({
    ...m,
    phone: safeDecrypt(m.phone),
  }));

  res.json(messages);
});

// GET single
router.get('/:id',  authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('Message')
    .select('*')
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  data.phone = safeDecrypt(data.phone);
  res.json(data);
});

// PUT update (status / adminNotes)
router.put('/:id', authenticate, requireAdmin, csrfProtection,  async (req, res) => {
  const parsed = updateMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { status, adminNotes } = parsed.data;
  const updateData: any = {};
  if (status) updateData.status = status;
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
  if (status === 'REPLIED') updateData.repliedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('Message')
    .update(updateData)
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select(`id, name, email, phone, message, status, adminNotes, subject_id, custom_subject, createdAt, repliedAt`)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'Not found' });
queueBackup('message', 'update', req.params.id)
  data.phone = safeDecrypt(data.phone);
  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'Message', resourceId: req.params.id, req, success: true });
  res.json(data);
});

// POST restore
router.post('/:id/restore', authenticate, requireAdmin, csrfProtection,  async (req, res) => {
  const { data, error } = await supabase
    .from('Message')
    .update({ deleted_at: null })
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  queueBackup('message', 'update', req.params.id)
  logAudit({ userId: req.user!.id, action: 'RESTORE', resource: 'Message', resourceId: req.params.id, req, success: true });
  res.json({ success: true, id: req.params.id });
});

// DELETE soft / permanent
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const permanent = req.query.permanent === 'true';
  if (permanent) {
    const { data, error } = await supabase
      .from('Message')
      .delete()
      .eq('id', req.params.id)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    logAudit({ userId: req.user!.id, action: 'PERMANENT_DELETE', resource: 'Message', resourceId: req.params.id, req, success: true });
  } else {
    const { data, error } = await supabase
      .from('Message')
      .update({ deleted_at: new Date() })
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    logAudit({ userId: req.user!.id, action: 'SOFT_DELETE', resource: 'Message', resourceId: req.params.id, req, success: true });
  }
  queueBackup('message', permanent ? 'delete' : 'update', req.params.id);
  res.json({ success: true, id: req.params.id });
});

export default router;