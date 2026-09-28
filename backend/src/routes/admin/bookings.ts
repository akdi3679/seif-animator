import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { decrypt } from '../../lib/encryption.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { queueBackup } from '../../services/backup-service.js';

const router = Router();
const adminLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 100, keyPrefix: 'ratelimit:admin:bookings' });

router.use(adminLimiter);

function safeDecrypt(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  // Only attempt decryption if the value has the expected format "iv:tag:data"
  if (value.split(':').length === 3) {
    try {
      return decrypt(value);
    } catch {
      return value;   // fallback – shouldn't happen, but safe
    }
  }
  return value;       // already plain text
}

// GET list with all fields and filters
router.get('/',  authenticate, requireAdmin,  async (req, res, next) => {
  try {
    const {
      status, search, service, dateFrom, dateTo,
      deleted, includeDeleted,
      limit = 20, offset = 0, sortBy = 'created_at', sortDir = 'desc'
    } = req.query;

    let query = supabase
      .from('Booking')
      .select(`
        id, type, service_type, custom_service, children_count, contact_name,
        contact_email, contact_phone, notes, location, desired_date, duration_minutes,
        total_price, status, payment_status, event_name, description,
        calcom_uri, cancellation_reason, booking_id, reschedule_reason,
        image_url, created_at, deleted_at, user:user_id(email)
      `, { count: 'exact' });

    if (deleted === 'true') {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  query = query.not('deleted_at', 'is', null).gte('deleted_at', thirtyDaysAgo);
} else if (includeDeleted !== 'true') {
  query = query.is('deleted_at', null);
}

    if (status && ['pending','confirmed','cancelled','rescheduled','rejected'].includes(status as string)) {
      query = query.eq('status', status);
    }

    if (service) {
      query = query.eq('service_type', service);
    }

    if (search) {
      const escapedSearch = (search as string).replace(/[%_\\]/g, '\\$&');
      const term = `%${escapedSearch}%`;
      query = query.or(`contact_name.ilike.${term},contact_email.ilike.${term},contact_phone.ilike.${term},service_type.ilike.${term},location.ilike.${term},custom_service.ilike.${term},event_name.ilike.${term}`);
    }

    if (dateFrom) {
      query = query.gte('desired_date', new Date(dateFrom as string).toISOString());
    }
    if (dateTo) {
      query = query.lte('desired_date', new Date(dateTo as string).toISOString());
    }

    const validSortColumns = ['desired_date', 'created_at', 'contact_name', 'total_price'];
    const orderColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'created_at';
    query = query.order(orderColumn, { ascending: sortDir === 'asc' });

    const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const parsedOffset = Math.max(Number(offset) || 0, 0);
    query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

    const { data: bookings, error, count } = await query;
    if (error) throw error;

    const decryptedBookings = bookings?.map((b: any) => ({
      ...b,
      notes: safeDecrypt(b.notes),
      contact_phone: safeDecrypt(b.contact_phone),
    })) || [];

    // FIX: Removed logAudit to prevent database flooding on simple page views
    res.json({ bookings: decryptedBookings, total: count });
  } catch (error) {
    next(error);
  }
});

// GET single booking
router.get('/:id',  authenticate, requireAdmin,  async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('Booking')
      .select(`
        id, type, service_type, custom_service, children_count, contact_name,
        contact_email, contact_phone, notes, location, desired_date, duration_minutes,
        total_price, status, payment_status, event_name, description,
        calcom_uri, cancellation_reason, booking_id, reschedule_reason,
        image_url, created_at, deleted_at, user:user_id(email)
      `)
      .eq('id', req.params.id)
      .maybeSingle(); // FIX: Use maybeSingle to prevent 406 errors

    if (error || !data) return res.status(404).json({ error: 'Booking not found' });

    data.notes = safeDecrypt(data.notes);
    data.contact_phone = safeDecrypt(data.contact_phone);

    // FIX: Removed logAudit to prevent database flooding
    res.json({ booking: data });
  } catch (error) {
    next(error);
  }
});

// POST restore
router.post('/:id/restore', authenticate, requireAdmin, csrfProtection,   async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('Booking')
      .update({ deleted_at: null })
      .eq('id', req.params.id)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle(); // FIX: Use maybeSingle

    if (error || !data) return res.status(404).json({ error: 'Not found or already restored' });
queueBackup('booking', 'update', req.params.id)
    logAudit({ userId: req.user?.id, action: 'RESTORE_BOOKING', resource: 'Booking', resourceId: req.params.id, req, success: true });
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    next(error);
  }
});

// DELETE (soft or permanent)
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res, next) => {
  try {
    const permanent = req.query.permanent === 'true';

   if (permanent) {
  const { data: booking, error: fetchErr } = await supabase
    .from('Booking')
    .select('image_public_id')
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .maybeSingle();

  if (fetchErr || !booking) return res.status(404).json({ error: 'Not found or not soft‑deleted' });

  if (booking.image_public_id) {
    await deleteCloudinaryImage(booking.image_public_id);
  }

  const { error } = await supabase
    .from('Booking')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: 'Operation failed' });
queueBackup('booking', 'delete', req.params.id);
  logAudit({ userId: req.user!.id, action: 'PERMANENT_DELETE_BOOKING', resource: 'Booking', resourceId: req.params.id, req, success: true });
  return res.json({ success: true, id: req.params.id });
}

    // soft delete
    const { data, error } = await supabase
      .from('Booking')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle(); // FIX: Use maybeSingle

    if (error || !data) return res.status(404).json({ error: 'Not found or already deleted' });
queueBackup('booking', 'update', req.params.id);
    logAudit({ userId: req.user?.id, action: 'SOFT_DELETE_BOOKING', resource: 'Booking', resourceId: req.params.id, req, success: true });
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    logAudit({ userId: req.user?.id, action: 'DELETE_BOOKING', resource: 'Booking', resourceId: req.params.id, req, success: false, errorMessage: (error as Error).message });
    next(error);
  }
});

export default router;