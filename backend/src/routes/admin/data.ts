import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { decrypt } from '../../lib/encryption.js';
import cloudinary from 'cloudinary';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:data' });
router.use(limiter);

// ── Helpers ──────────────────────────────────────────────────────
function parsePagination(req) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 5000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

function safeDecrypt(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.split(':').length === 3) {
    try { return decrypt(value); } catch { return value; }
  }
  return value;
}

// ── Full‑data verification – reuses verifyDeleteCode ───────────
function verifyFullDataAccess(req, res, next) {
  const limit = Number(req.query.limit) || 20;
  const isFull = req.query.full === 'true' || limit > 50;

  if (!isFull) return next();   // paginated request – no code needed

  // Transfer the query param to the body so verifyDeleteCode can process it
  req.body = req.body || {};
  req.body.deleteCode = req.query.deleteCode;

  // Delegate to the existing middleware
  verifyDeleteCode(req, res, next);
}

// ── Bookings ─────────────────────────────────────────────────────
router.get('/bookings', authenticate, requireAdmin, verifyFullDataAccess, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const { search } = req.query;

  let query = supabase
    .from('Booking')
    .select(
      'id, type, service_type, custom_service, contact_name, contact_email, contact_phone, location, desired_date, total_price, status, payment_status, created_at',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const term = `%${search}%`;
    query = query.or(`contact_name.ilike.${term},contact_email.ilike.${term},service_type.ilike.${term},location.ilike.${term},custom_service.ilike.${term},event_name.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });

  const decrypted = data?.map(b => ({
    ...b,
    contact_phone: safeDecrypt(b.contact_phone),
    notes: safeDecrypt(b.notes),
  })) || [];

  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'Booking', req, success: true, metadata: { count } });
  res.json({ items: decrypted, total: count });
});

// ── Newsletter ───────────────────────────────────────────────────
router.get('/newsletter', authenticate, requireAdmin, verifyFullDataAccess, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const { search } = req.query;

  let query = supabase
    .from('NewsletterSubscriber')
    .select('id, email, phone, subscribed_at', { count: 'exact' })
    .is('deleted_at', null)
    .order('subscribed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const term = `%${search}%`;
    query = query.or(`email.ilike.${term},phone.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });

  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'NewsletterSubscriber', req, success: true, metadata: { count } });
  res.json({ items: data, total: count });
});

// ── Messages ─────────────────────────────────────────────────────
router.get('/messages', authenticate, requireAdmin, verifyFullDataAccess, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const { search } = req.query;

  let query = supabase
    .from('Message')
    .select(
      'id, name, email, phone, message, status, adminNotes, subject_id, custom_subject, createdAt, repliedAt',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const term = `%${search}%`;
    query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},message.ilike.${term},custom_subject.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });

  const messages = (data || []).map(m => ({
    ...m,
    phone: safeDecrypt(m.phone),
  }));

  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'Message', req, success: true, metadata: { count } });
  res.json({ items: messages, total: count });
});

// ── Cloudinary Images ────────────────────────────────────────────
router.get('/cloudinary-images', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await cloudinary.v2.api.resources({
      type: 'upload',
      prefix: 'admin/',
      max_results: 500,
    });

    const items = result.resources.map(r => ({
      id: r.public_id,
      public_id: r.public_id,
      url: r.secure_url,
      format: r.format,
      width: r.width,
      height: r.height,
      created_at: r.created_at,
    }));

    const { search } = req.query;
    let filtered = items;
    if (search) {
      const term = search.toLowerCase();
      filtered = items.filter(i =>
        i.public_id.toLowerCase().includes(term) ||
        i.format.toLowerCase().includes(term)
      );
    }

    await logAudit({ userId: req.user.id, action: 'LIST', resource: 'CloudinaryImage', req, success: true, metadata: { count: filtered.length } });
    res.json({ items: filtered, total: filtered.length });
  } catch (err) {
    console.error('Cloudinary list error:', err);
    res.status(500).json({ error: 'Operation failed' });
  }
});

// ── Orders ───────────────────────────────────────────────────────
router.get('/orders', authenticate, requireAdmin, verifyFullDataAccess, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const { search } = req.query;

  let query = supabase
    .from('Order')
    .select(
      'id, order_reference, customer_name, contact_email, total_amount, status, created_at',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const term = `%${search}%`;
    query = query.or(`customer_name.ilike.${term},contact_email.ilike.${term},order_reference.ilike.${term},status.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });

  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'Order', req, success: true, metadata: { count } });
  res.json({ items: data, total: count });
});
// ── Verify code only (used for selected‑item actions) ─────────
router.post('/verify-action',
  authenticate,
  requireAdmin,
  csrfProtection,
  verifyDeleteCode,
  async (req, res) => {
    await logAudit({
      userId: req.user.id,
      action: 'ACTION_VERIFIED',
      resource: 'DataExport',
      req,
      success: true,
    });
    res.json({ success: true });
  }
);
export default router;