import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { logAudit } from '../../lib/audit.js';
import { CRON_DEFINITIONS } from '../../lib/cron-registry.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:cron' });
router.use(limiter);

const cronToggleSchema = z.object({ enabled: z.boolean() });

router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data: settings } = await supabase.from('CronSetting').select('name, enabled');
  const settingMap: Record<string, boolean> = {};
  settings?.forEach(s => { settingMap[s.name] = s.enabled; });

  const crons = CRON_DEFINITIONS.map(({ run, ...meta }) => ({
    ...meta,
    enabled: meta.alwaysOn ? true : (settingMap[meta.name] ?? false),
  }));

  res.json(crons);
});

router.put('/:name', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = cronToggleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const { enabled } = parsed.data;
  const cronJob = CRON_DEFINITIONS.find(c => c.name === req.params.name);
  if (!cronJob || cronJob.alwaysOn) return res.status(400).json({ error: 'This cron cannot be toggled' });

  const { error } = await supabase
    .from('CronSetting')
    .upsert({ name: cronJob.name, enabled, updated_at: new Date().toISOString() }, { onConflict: 'name' });
  if (error) return res.status(500).json({ error: 'Operation failed' });

  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'CronSetting', resourceId: cronJob.name, req, success: true, metadata: { enabled } });
  res.json({ success: true });
});

export default router;