import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:schedule' });
router.use(limiter);

const scheduleDaySchema = z.object({
  day_number: z.number().int().min(1).max(7),
  work_parts_count: z.number().int().min(0).max(3),
  part1_start: z.string().nullable().optional(),
  part1_end: z.string().nullable().optional(),
  part2_start: z.string().nullable().optional(),
  part2_end: z.string().nullable().optional(),
  part3_start: z.string().nullable().optional(),
  part3_end: z.string().nullable().optional(),
});

const schedulePayloadSchema = z.object({
  schedule: z.array(scheduleDaySchema).length(7),
});

router.put('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = schedulePayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid schedule data' });

  const { schedule } = parsed.data;

  const { error } = await supabase.rpc('update_admin_schedule', { schedule });
  if (error) return res.status(500).json({ error: 'Failed to update schedule' });

  logAudit({ userId: req.user!.id, action: 'UPDATE_SCHEDULE', resource: 'AdminSchedule', req, success: true });
  res.json({ success: true });
});

export default router;