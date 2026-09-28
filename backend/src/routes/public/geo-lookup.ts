import { Router } from 'express';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { trackPublicVisitor } from '../../services/visitor-service.js';

const router = Router();
const limiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 200,
  keyPrefix: 'ratelimit:geo',
});

router.post('/', limiter, async (req, res) => {
  try {
    const { country, city, lat, lon, timezone, ip } = req.body;
    const visitorIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';

    await trackPublicVisitor(visitorIp, {
      country,
      city,
      lat,
      lon,
      timezone,
      ip: ip || visitorIp,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Visitor geo insert failed:', err);
    res.status(500).json({ error: 'Operation failed' });
  }
});

export default router;