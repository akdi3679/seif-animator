import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 50, keyPrefix: 'ratelimit:admin:sitedata' });
router.use(limiter);

const siteDataSchema = z.object({
  name_fr: z.string().min(1, 'French name is required'),
  name_ar: z.string().min(1, 'Arabic name is required'),
  slogans_fr: z.array(z.string()).max(2, 'Maximum 2 slogans').optional().nullable(),
  slogans_ar: z.array(z.string()).max(2, 'Maximum 2 slogans').optional().nullable(),
  logo_url: z.string().url().optional().or(z.literal('')).nullable(),
  favicon_url: z.string().url().optional().or(z.literal('')).nullable(),
  logo_public_id: z.string().optional().nullable(),
  favicon_public_id: z.string().optional().nullable(),
}).refine(
  (d) => (d.slogans_fr?.length ?? 0) === (d.slogans_ar?.length ?? 0),
  { message: 'FR and AR must have the same number of slogans' }
);
// GET — single row
// GET — single row (deterministic: newest)
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('SiteData')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data || {});
});

// PUT — always updates THAT one row; only inserts if none exists
router.put('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = siteDataSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data: existing } = await supabase
    .from('SiteData')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updates[k] = v;
  }

  if (existing?.logo_public_id && updates.logo_public_id !== undefined && updates.logo_public_id !== existing.logo_public_id) {
    try { await deleteCloudinaryImage(existing.logo_public_id); } catch (e) { console.error('[SiteData] logo delete failed:', e); }
  }
  if (existing?.favicon_public_id && updates.favicon_public_id !== undefined && updates.favicon_public_id !== existing.favicon_public_id) {
    try { await deleteCloudinaryImage(existing.favicon_public_id); } catch (e) { console.error('[SiteData] favicon delete failed:', e); }
  }

  const result = existing
    ? await supabase.from('SiteData').update(updates).eq('id', existing.id).select().single()
    : await supabase.from('SiteData').insert(updates).select().single();

  if (result.error) return res.status(500).json({ error: 'Operation failed' });

  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'SiteData', req, success: true });
  res.json(result.data);
});

export default router;