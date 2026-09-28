import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:challenges' });
router.use(limiter);

// Strict HTML validator – rejects malformed fragments like "</div' or "<div>text"
function isValidHTML(code) {
  // Must contain at least one complete tag
  if (!/<[a-zA-Z][^>]*>/.test(code)) return false;

  // Simple stack-based tag balancing
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  const stack = [];
  let match;

  while ((match = tagPattern.exec(code)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    if (fullTag.startsWith('</')) {
      // Closing tag
      if (stack.length === 0 || stack[stack.length - 1] !== tagName) {
        return false;
      }
      stack.pop();
    } else {
      // Opening tag – self-closing tags are not pushed
      if (!fullTag.endsWith('/>')) {
        stack.push(tagName);
      }
    }
  }

  // All opened tags must be closed
  return stack.length === 0;
}

const challengeSchema = z.object({
  title_fr: z.string().min(1, 'French title required'),
  title_ar: z.string().min(1, 'Arabic title required'),
  html_code: z.string().min(1, 'HTML code or URL required').refine(
    (val) => {
      // Valid URL – any scheme accepted by new URL
      if (val.startsWith('http')) {
        try { new URL(val); return true; } catch { return false; }
      }
      // Strict HTML validation
      return isValidHTML(val);
    },
    { message: 'Must be a valid URL or well‑formed HTML with balanced tags' }
  ),
});

// ── GET (returns the first challenge – there is only one) ──
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('Challenge')
    .select('id, title_fr, title_ar, html_code')
    .limit(1)
    .single();

  if (error) {
    // If no challenge exists, return empty
    return res.json(null);
  }

  await logAudit({ userId: req.user.id, action: 'VIEW', resource: 'Challenge', resourceId: data.id, req, success: true });
  res.json(data);
});

// ── UPSERT (update the single challenge or create if none) ──
router.put('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = challengeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // Upsert into id = 1 (single row)
  const { data, error } = await supabase
    .from('Challenge')
    .upsert({ id: req.body.id || undefined, ...parsed.data, updated_at: new Date() })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'Challenge', resourceId: data.id, req, success: true });
  res.json(data);
});

export default router;