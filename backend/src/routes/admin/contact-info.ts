import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';
import { createRateLimiter } from '../../middleware/rate-limit.js';

const router = Router();

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:info' });
router.use(limiter);
const contactSchema = z.object({
  address: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  map_zoom: z.coerce.number().optional().default(15),
  social_links: z.any().optional(),
});

// GET
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('ContactInfo')
    .select('address, email, phone, latitude, longitude, map_zoom, social_links')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data || {});
});

// PUT – contact only
router.put('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { contact } = req.body;
  const contactParsed = contactSchema.safeParse(contact);
  if (!contactParsed.success) {
    return res.status(400).json({ error: 'Invalid contact data', details: contactParsed.error.errors });
  }

  const { data: existing } = await supabase.from('ContactInfo').select('id').limit(1).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('ContactInfo').update(contactParsed.data).eq('id', existing.id);
    if (error) return res.status(500).json({ error: 'Failed to update contact info' });
  } else {
    const { error } = await supabase.from('ContactInfo').insert(contactParsed.data);
    if (error) return res.status(500).json({ error: 'Failed to create contact info' });
  }

  logAudit({ userId: req.user!.id, action: 'UPDATE_CONTACT', resource: 'ContactInfo', req, success: true });
  res.json({ success: true });
});

export default router;