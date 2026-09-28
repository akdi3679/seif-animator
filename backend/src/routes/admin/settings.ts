import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { z } from 'zod';
import { decrypt } from '../../lib/encryption.js';
import crypto from 'crypto';
const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:setting' });
router.use(limiter);

// ── Lock schema ──
const lockSchema = z.object({
  lockEnabled: z.boolean(),
  secretCode: z.string().optional(),
});

// GET lock_enabled status
router.get('/lock', authenticate, requireAdmin,   async (req, res) => {
  const { data, error } = await supabase
    .from('AdminSettings')
    .select('lock_enabled')
    .single();
  if (error) return res.status(500).json({ error: 'Failed to fetch' });
  res.json({ lockEnabled: data.lock_enabled });
});


router.put('/lock', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = lockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { lockEnabled, secretCode } = parsed.data;

  // Code required ONLY when disabling
  if (!lockEnabled) {
    if (!secretCode) return res.status(400).json({ error: 'Secret code required to disable lock' });

    const { data: codeData } = await supabase
      .from('SecretCode').select('code').eq('purpose', 'lock_delete').maybeSingle();
    if (!codeData?.code) return res.status(400).json({ error: 'No secret code configured' });

    let plain: string;
    try { plain = decrypt(codeData.code); }
    catch { return res.status(500).json({ error: 'Failed to verify secret code' }); }

    const a = Buffer.from(String(secretCode));
    const b = Buffer.from(String(plain));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.status(400).json({ error: 'Invalid secret code' });
  }

  const { data: existing } = await supabase.from('AdminSettings').select('id').limit(1).maybeSingle();
  if (existing) await supabase.from('AdminSettings').update({ lock_enabled: lockEnabled }).eq('id', existing.id);
  else await supabase.from('AdminSettings').insert({ lock_enabled: lockEnabled });

  logAudit({ userId: req.user?.id, action: 'UPDATE_LOCK', resource: 'AdminSettings', req, success: true });
  res.json({ success: true });
});

// ── Weather schema ──
const weatherSchema = z.object({
  mode: z.enum(['ip', 'geo']),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

// GET /api/admin/settings/weather
router.get('/weather', authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('UserSettings')
    .select('weather_mode, weather_geo')
    .eq('user_id', req.user!.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json({ mode: data?.weather_mode || 'ip', geo: data?.weather_geo || null });
});

// PUT /api/admin/settings/weather
router.put('/weather', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = weatherSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { mode, geo } = parsed.data;

  const { data: existing } = await supabase
    .from('UserSettings')
    .select('weather_geo')
    .eq('user_id', req.user!.id)
    .maybeSingle();

  // geo mode with coords → save them; IP mode (or no coords) → KEEP the last saved geo
  const weather_geo = (mode === 'geo' && geo) ? geo : (existing?.weather_geo ?? null);

  const { error } = await supabase
    .from('UserSettings')
    .upsert({ user_id: req.user!.id, weather_mode: mode, weather_geo }, { onConflict: 'user_id' });

  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json({ success: true });
});

export default router;