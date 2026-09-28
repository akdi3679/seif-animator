import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { logAudit } from '../../lib/audit.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:sensitive' });
router.use(limiter);

// POST /smtp – returns only the SMTP user
router.post('/smtp', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  logAudit({ userId: req.user!.id, action: 'VIEW', resource: 'SensitiveConfig:SMTP', req, success: true });
  res.json({ smtpUser: process.env.SMTP_USER || '' });
});

// POST /telegram – returns only the Telegram chat ID
router.post('/telegram', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  logAudit({ userId: req.user!.id, action: 'VIEW', resource: 'SensitiveConfig:Telegram', req, success: true });
  res.json({ telegramChatId: process.env.ADMIN_TELEGRAM_CHAT_ID || '' });
});

export default router;