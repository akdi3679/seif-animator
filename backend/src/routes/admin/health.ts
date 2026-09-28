import { Router } from 'express'
import redis from '../../lib/redis.js'
import { supabase } from '../../lib/supabase.js'

const router = Router();

router.get('/', async (_req, res) => {
  try {
    // Verify Redis is reachable (lightweight)
    await redis.ping();
    await supabase.from('health_check').select('*').limit(1)
    res.json({ status: 'ok', tailscale: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[Health] Redis/supabase unreachable:', error);
    res.status(503).json({ error: 'Service unavailable' });
  }
});

export default router;