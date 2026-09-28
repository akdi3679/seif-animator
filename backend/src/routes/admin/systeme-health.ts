import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { getSystemHealth } from '../../services/system-metrics.js';
import redis from '../../lib/redis.js';
import { supabase } from '../../lib/supabase.js';
import { v2 as cloudinary } from 'cloudinary';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { isBackupConfigured, testBackupConnection } from '../../lib/backup-supabase.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:systeme-health' });
router.use(limiter);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function checkBackupHealth(): Promise<{ configured: boolean; connected: boolean }> {
  if (!isBackupConfigured()) return { configured: false, connected: false };
  return { configured: true, connected: await testBackupConnection() };
}
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const system = getSystemHealth();
    let redisOk = false,
      supabaseOk = false,
      smtpOk = !!process.env.SMTP_HOST,
      telegramOk = !!process.env.TELEGRAM_BOT_TOKEN,
      cloudinaryOk = false;

    // Redis
    try { await redis.ping(); redisOk = true; } catch {}
    // Cloudinary
    try { await cloudinary.api.ping(); cloudinaryOk = true; } catch {}
    // Supabase
    try { const { error } = await supabase.from('User').select('id').limit(1); supabaseOk = !error; } catch {}

    // ---- Database size (Supabase) ----
    let dbSizeBytes = 0;
    try {
      const { data } = await supabase.rpc('get_database_size');
      dbSizeBytes = data ?? 0;
    } catch (err) { console.error('DB size error:', err); }

    // ---- Cloudinary usage (images + storage) ----
          let cloudinaryImageCount = 0;
    let cloudinaryStorageBytes = 0;
    try {
      const usage = await cloudinary.api.usage();
      // storage used (no limit available on Free plan)
      cloudinaryStorageBytes = usage?.storage?.usage ?? 0;
      // total assets count (images + raw + video, etc.)
      cloudinaryImageCount = usage?.resources ?? 0;
    } catch (err) { console.error('Cloudinary usage error:', err); }

    // ---- Backup configured (Supabase keys present) ----
    const backup = await checkBackupHealth();
       res.json({
      timestamp: new Date().toISOString(),
      system,
      services: {
        redis: redisOk ? 'connected' : 'disconnected',
        supabase: supabaseOk ? 'connected' : 'disconnected',
        cloudinary: cloudinaryOk ? 'connected' : 'disconnected',
        smtp: smtpOk,
        telegram: telegramOk,
        exportEncryption: !!process.env.EXPORT_ENCRYPTION_PASSWORD,
      },
      usage: {
        databaseSizeBytes: dbSizeBytes,
        cloudinaryImageCount,
        cloudinaryStorageBytes,
      },
      backup: {
        configured: backup.configured,
        connected: backup.connected,
      },
    });
  } catch (error) {
    next(error as Error);
  }
});

export default router;