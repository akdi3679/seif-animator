import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { sendEmail, sendTelegram } from '../../services/notification-service.js';
import { revokeAllUserTokens } from '../../services/token-service.js';
const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:monitor' });
router.use(limiter);

// ── Helpers ──────────────────────────────────────────────────────
function parsePagination(req) {
let limit = Number(req.query.limit) || 20;
if (!Number.isFinite(limit)) limit = 20;
limit = Math.min(Math.max(limit, 1), 5000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}
// Reuses the same delete-code validation for full-data requests
function requireVerificationForFullData(req, res, next) {
  const limit = Number(req.query.limit) || 20;
  const isFull = req.query.full === 'true' || limit > 50;

  if (!isFull) return next();   // normal paginated request – no code needed

  // Transfer the query param to the body so verifyDeleteCode can process it
  req.body = req.body || {};
  req.body.deleteCode = req.query.deleteCode;

  // Delegate to the existing middleware
  verifyDeleteCode(req, res, next);
}
// ── AUDIT LOGS ───────────────────────────────────────────────────
router.get('/audit-logs', authenticate, requireAdmin, requireVerificationForFullData, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const { search, success, dateFrom, dateTo } = req.query;
  let query = supabase
    .from('AuditLog')
    .select(
      'id, userId, action, resource, resourceId, ipAddress, userAgent, tailscaleIp, deviceFingerprint, success, errorMessage, metadata, createdAt',
      { count: 'exact' }
    )
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);

  // Search across text columns that actually exist
 if (search) {
  const term = `%${search}%`;
  query = query.or(
    `action.ilike.${term},resource.ilike.${term},ipAddress.ilike.${term},userAgent.ilike.${term},errorMessage.ilike.${term}`
  );
}
  // Success filter
  if (success === 'true') query = query.eq('success', true);
  else if (success === 'false') query = query.eq('success', false);

  // Safe date filters
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) query = query.gte('createdAt', d.toISOString());
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) query = query.lte('createdAt', d.toISOString());
  }

  const { data, error, count } = await query;
if (error) {
  return res.status(500).json({ error: 'Operation failed' });
}
  await logAudit({
    userId: req.user.id,
    action: 'LIST',
    resource: 'AuditLog',
    req,
    success: true,
    metadata: { count },
  });
  res.json({ items: data, total: count });
});
// ── ACTIVE SESSIONS ──────────────────────────────────────────────
router.get('/sessions', authenticate, requireAdmin, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const now = new Date().toISOString();

  const { data, error, count } = await supabase
    .from('Session')
    .select(
      'id, userId, deviceFingerprint, ipAddress, geoLocation, userAgent, createdAt, expiresAt, user:User(email)',
      { count: 'exact' }
    )
    .gt('expiresAt', now)
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: 'Operation failed' });

  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'Session', req, success: true, metadata: { count } });
  res.json({ items: data, total: count });
});

// ── REVOKE SESSION ──────────────────────────────────────────────
router.delete('/sessions/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: session } = await supabase
    .from('Session')
    .select('id, userId')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Delete from Redis (best-effort)
  try {
    const { default: redis } = await import('../../lib/redis.js');
    await redis.del(`session:${req.params.id}`);
  } catch {}

await supabase.from('Session').delete().eq('id', req.params.id);

// Revoke all refresh tokens for this user so they can't silently recover
await revokeAllUserTokens(session.userId);
  logAudit({ userId: req.user.id, action: 'REVOKE_SESSION', resource: 'Session', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── NOTIFICATIONS STATUS ────────────────────────────────────────
router.get('/notifications/status', authenticate, requireAdmin, async (req, res) => {
  const status = {
    emailConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.ADMIN_TELEGRAM_CHAT_ID),
  };

  // Get queue counts
  try {
    const { emailQueue, telegramQueue } = await import('../../lib/queue.js');
    const emailCounts = await emailQueue.getJobCounts();
    const telegramCounts = await telegramQueue.getJobCounts();
    status.emailQueue = emailCounts;
    status.telegramQueue = telegramCounts;
  } catch (err) {
    status.queueError = 'Could not retrieve queue stats';
  }

  await logAudit({ userId: req.user.id, action: 'VIEW', resource: 'NotificationStatus', req, success: true });
  res.json(status);
});

// ── SEND TEST NOTIFICATION ──────────────────────────────────────
router.post('/notifications/test', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { email, telegram } = req.body; // optional, fallback to admin's own
  const adminEmail = email || req.user.email;
  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;

  try {
    await sendEmail(adminEmail, 'Test Notification', 'welcome', { name: 'Admin' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send test email' });
  }

  try {
    if (adminChatId) {
      await sendTelegram(adminChatId, `🔔 Test notification from Monitor panel\nAdmin: ${req.user.email}\nTime: ${new Date().toISOString()}`);
    }
  } catch (err) {
    // Telegram failure is not critical
  }

  logAudit({ userId: req.user.id, action: 'TEST_NOTIFICATION', resource: 'Notification', req, success: true });
  res.json({ success: true });
});

// ── VISITORS ──────────────────────────────────────────────────
router.get('/visitors', authenticate, requireAdmin, requireVerificationForFullData, async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const { search } = req.query;

  let query = supabase
    .from('visitor_log')
    .select('id, ip, country, city, lat, lon, timezone, visited_at', { count: 'exact' })
    .order('visited_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const term = `%${search}%`;
    query = query.or(`ip.ilike.${term},city.ilike.${term},country.ilike.${term},timezone.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });

  res.json({ items: data, total: count });
});

// ── MAP DATA (aggregated by city, all‑time) ──────────────────
router.get('/visitors/map-data', authenticate, requireAdmin, async (req, res) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const [locationsRes, totalRes, lastVisitRes, dailyCountsRes] = await Promise.all([
    supabase
      .from('visitor_locations')
      .select('country, city, lat, lon, visit_count')
      .order('visit_count', { ascending: false }),
    supabase
      .from('visitor_locations')
      .select('visit_count')
      .then(({ data }) => ({
        total: data ? data.reduce((sum: number, row: any) => sum + row.visit_count, 0) : 0,
      })),
    supabase
      .from('visitor_log')
      .select('visited_at')
      .order('visited_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('visitor_daily_counts')
      .select('visit_count')
      .gte('date', yesterday)
      .lte('date', today),
  ]);

  if (locationsRes.error) return res.status(500).json({ error: 'Operation failed' });

  const last24hVisits = dailyCountsRes.data
    ? dailyCountsRes.data.reduce((sum, row) => sum + row.visit_count, 0)
    : 0;

  res.json({
    locations: locationsRes.data || [],
    totalVisits: totalRes.total ?? 0,
    lastVisitAt: lastVisitRes.data?.visited_at || null,
    last24hVisits,
  });
});
export default router;