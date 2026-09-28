import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import redis from '../../lib/redis.js';
import { logAudit } from '../../lib/audit.js';
import { decrypt } from '../../lib/encryption.js';
const router = Router();
const adminLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 150,
  keyPrefix: 'ratelimit:admin:dashboard',
});

router.use(adminLimiter);
function safeDecrypt(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(':');
  if (parts.length === 3 && parts.every(p => /^[A-Za-z0-9+/=]+$/.test(p))) {
    try {
      return decrypt(value);
    } catch {
      return null;
    }
  }
  return value;
}
// GET /api/admin/dashboard/stats
// FIND the GET /stats route and replace the try block:
router.get('/stats', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

   const safeCount = async (query: any) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    } catch (err) {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 200)); // brief delay before retry
      } else {
        console.error('Dashboard count query failed after retry:', err);
        return 0;
      }
    }
  }
  return 0;
};

const safeData = async (query: any) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 200));
      } else {
        console.error('Dashboard data query failed after retry:', err);
        return [];
      }
    }
  }
  return [];
};
    const [
      totalBookings,
      todayBookings,
      activeEvents,
      totalProducts,
      unreadMessages,
      recentBookings,
      recentMessages,
      totalOrders,
      totalGalleryItems,
    ] = await Promise.all([
      safeCount(supabase.from('Booking').select('*', { count: 'exact', head: true }).is('deleted_at', null)),
      safeCount(supabase.from('Booking').select('*', { count: 'exact', head: true }).gte('desired_date', today.toISOString()).is('deleted_at', null)),
      safeCount(supabase.from('Event').select('*', { count: 'exact', head: true }).gte('date', new Date().toISOString()).is('deletedAt', null)),
      safeCount(supabase.from('Product').select('*', { count: 'exact', head: true }).eq('is_active', true)),
      safeCount(supabase.from('Message').select('*', { count: 'exact', head: true }).eq('status', 'NEW').is('deletedAt', null)),
     safeData(supabase.from('Booking').select('id, contact_name, contact_email, contact_phone, desired_date, created_at, status, service_type, total_price').is('deleted_at', null).order('created_at', { ascending: false }).limit(5)),
safeData(supabase.from('Message').select('id, name, email, phone, subject_id, custom_subject, message, status, createdAt').is('deletedAt', null).order('createdAt', { ascending: false }).limit(5)),
 safeCount(supabase.from('Order').select('*', { count: 'exact', head: true })),
      safeCount(supabase.from('GalleryItem').select('*', { count: 'exact', head: true }).eq('is_active', true)),
    ]);

        // Decrypt phone numbers for display on dashboard
    const decryptedBookings = (recentBookings || []).map((b: any) => ({
      ...b,
      contact_phone: safeDecrypt(b.contact_phone),
    }));
             // Collect subject IDs for name lookup
    const subjectIds: string[] = (recentMessages || [])
      .map((m: any) => m.subject_id)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

    let subjectNames: Record<string, string> = {};
    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from('ContactSubject')
        .select('id, name')
        .in('id', subjectIds);
      subjectNames = (subjects || []).reduce((acc: any, s: any) => {
        acc[s.id] = s.name;
        return acc;
      }, {});
    }

    const decryptedMessages = (recentMessages || []).map((m: any) => ({
      ...m,
      phone: safeDecrypt(m.phone),
      subjectName: subjectNames[m.subject_id] || m.custom_subject || null,
    }));
    const stats = {
      totalBookings,
      todayBookings,
      activeEvents,
      totalProducts,
      totalOrders,
      totalGalleryItems,
      unreadMessages,
      recentBookings: decryptedBookings,
      recentMessages: decryptedMessages,
    };
    res.json(stats);
  } catch (error) {
    next(error);
  }
});
router.get('/visitors', authenticate, requireAdmin, async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, last24hRes, recentRes, locationsRes] = await Promise.all([
      // Total visits = sum of visit_count across all cities
      supabase
        .from('visitor_locations')
        .select('visit_count')
        .then(({ data }) => ({
          total: data ? data.reduce((sum, row) => sum + row.visit_count, 0) : 0,
        })),
      // Last 24h visits
      supabase
        .from('visitor_log')
        .select('id', { count: 'exact', head: true })
        .gte('visited_at', twentyFourHoursAgo),
      // Recent 20 visitors
      supabase
        .from('visitor_log')
        .select('*')
        .order('visited_at', { ascending: false })
        .limit(20),
      // Aggregated locations for globe
      supabase
        .from('visitor_locations')
        .select('country, city, lat, lon, visit_count')
        .order('visit_count', { ascending: false }),
    ]);

   res.json({
  totalVisits: totalRes.error ? null : (totalRes.total ?? 0),
  last24hVisits: last24hRes.error ? null : (last24hRes.count ?? 0),
  recentVisitors: recentRes.data || [],
  locations: locationsRes.data || [],
});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch visitor data' });
  }
});
export default router;