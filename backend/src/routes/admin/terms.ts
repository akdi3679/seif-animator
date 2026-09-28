import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';

const router = Router();

// Rate limiter for the entire terms resource
const termsLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: 'ratelimit:admin:terms',
});

router.use(termsLimiter);  
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const termsSchema = z.object({
  terms_fr: z.string().refine(val => stripHtml(val).length > 0, { message: 'Terms French content is required' }),
  terms_ar: z.string().refine(val => stripHtml(val).length > 0, { message: 'Terms Arabic content is required' }),
  privacy_fr: z.string().refine(val => stripHtml(val).length > 0, { message: 'Privacy French content is required' }),
  privacy_ar: z.string().refine(val => stripHtml(val).length > 0, { message: 'Privacy Arabic content is required' }),
  conditions_fr: z.string().refine(val => stripHtml(val).length > 0, { message: 'Conditions French content is required' }),
  conditions_ar: z.string().refine(val => stripHtml(val).length > 0, { message: 'Conditions Arabic content is required' }),
});
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('TermsContent')
    .select('tab, content_fr, content_ar');

  if (error) return res.status(500).json({ error: 'Operation failed' });

  const result: Record<string, string> = {};
  (data || []).forEach((row: any) => {
    result[`${row.tab}_fr`] = row.content_fr || '';
    result[`${row.tab}_ar`] = row.content_ar || '';
  });
  res.json(result);
});

// PUT → accepts flat object and upserts all three tabs
router.put('/', authenticate, requireAdmin, csrfProtection,  async (req, res) => {
  const parsed = termsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const tabs = ['terms', 'privacy', 'conditions'];
  const updates = tabs.map(tab =>
    supabase.from('TermsContent').upsert({
      tab,
      content_fr: parsed.data[`${tab}_fr`],
      content_ar: parsed.data[`${tab}_ar`],
      updated_at: new Date(),
    }, { onConflict: 'tab' })
  );

  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);
  if (failed) {
    console.error('Terms update failed:', failed.error);
    return res.status(500).json({ error: 'Operation failed' });
  }

  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'TermsContent', req, success: true });
  res.json({ success: true });
});
export default router;