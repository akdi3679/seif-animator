import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { getNotificationSummary, markTypeRead } from '../../lib/notification.js';
import { z } from 'zod';

const router = Router();
router.use(createRateLimiter({ windowMs: 60_000, maxRequests: 60, keyPrefix: 'ratelimit:admin:notifications' }));

router.get('/summary', authenticate, requireAdmin, async (_req, res) => {
  res.json(await getNotificationSummary());
});

const readSchema = z.object({ type: z.enum(['order', 'booking', 'contact', 'newsletter']) });
router.post('/read', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = readSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid type' });
  await markTypeRead(parsed.data.type);
  res.json({ success: true });
});

export default router;