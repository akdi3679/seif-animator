import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { batchTranslate } from '../../services/translation.service.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:translate' });
router.use(limiter);

const translateSchema = z.object({
  texts: z.array(z.string()).min(1, 'At least one text is required'),
  targetLang: z.string().min(1, 'Target language is required'),
  sourceLang: z.string().min(1, 'Source language is required'),
});

router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = translateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { texts, targetLang, sourceLang } = parsed.data;
  try {
    const translated = await batchTranslate(texts, targetLang, sourceLang);
    res.json({ translated });
  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ error: 'Translation failed' });
  }
});

export default router;