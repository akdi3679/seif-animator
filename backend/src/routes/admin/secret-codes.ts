import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { encrypt, decrypt } from '../../lib/encryption.js';
import redis from '../../lib/redis.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:secrets' });
router.use(limiter);

// GET only the lock_delete secret (no code, just purpose + updated_at)
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('SecretCode')
    .select('purpose, updated_at')
    .eq('purpose', 'lock_delete')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data ? [data] : []);
});
// POST reveal the lock_delete code (only requires deleteCode)
router.post('/:purpose/reveal', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  if (req.params.purpose !== 'lock_delete') {
    return res.status(400).json({ error: 'Only lock_delete can be revealed' });
  }

  const { data, error } = await supabase
    .from('SecretCode')
    .select('code')
    .eq('purpose', 'lock_delete')
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'Code not found' });

  const decrypted = decrypt(data.code);
  logAudit({ userId: req.user!.id, action: 'REVEAL', resource: 'SecretCode', resourceId: 'lock_delete', req, success: true });
  res.json({ code: decrypted });
});

// PUT update lock_delete code (requires deleteCode + emailCode)
router.put('/:purpose', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  if (req.params.purpose !== 'lock_delete') {
    return res.status(400).json({ error: 'Only lock_delete can be updated' });
  }

  const schema = z.object({
    code: z.string().min(1, 'New code is required'),
    emailCode: z.string().length(6, 'Email code must be 6 digits'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { code, emailCode } = parsed.data;
  const userId = req.user!.id;

  // Validate email code from Redis (same pattern as profile endpoint)
  const storedCode = await redis.get(`email_code:${userId}`);
  if (!storedCode || storedCode !== emailCode) {
    return res.status(400).json({ error: 'Invalid or expired email code' });
  }
  await redis.del(`email_code:${userId}`);

  // Encrypt and store
  const encrypted = encrypt(code);
  const { error } = await supabase
    .from('SecretCode')
    .upsert({ purpose: 'lock_delete', code: encrypted, updated_at: new Date().toISOString() }, { onConflict: 'purpose' });

  if (error) return res.status(500).json({ error: 'Operation failed' });

  logAudit({ userId, action: 'UPDATE', resource: 'SecretCode', resourceId: 'lock_delete', req, success: true });
  res.json({ success: true });
});


export default router;