import { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { createNotification } from '../../lib/notification.js';
import { queueBackup } from '../../services/backup-service.js';
const router = Router();
const newsletterLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 3, keyPrefix: 'ratelimit:newsletter' });

const subscribeSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).refine(data => data.email || data.phone, { message: 'At least email or phone required' });

router.post('/', newsletterLimiter, async (req, res, next) => {
  try {
    const { email, phone } = subscribeSchema.parse(req.body);
    if (email) {
      const { data: existingEmail } = await supabase.from('NewsletterSubscriber').select('id').eq('email', email).maybeSingle();
      if (existingEmail) {
        return res.json({ success: true, message: 'Already subscribed with this email' });
      }
    }
    if (phone) {
      const { data: existingPhone } = await supabase.from('NewsletterSubscriber').select('id').eq('phone', phone).maybeSingle();
      if (existingPhone) {
        return res.json({ success: true, message: 'Already subscribed with this phone' });
      }
    }
    const { error } = await supabase.from('NewsletterSubscriber').insert({ email, phone }).select('id').single();

    if (error) throw error;
    queueBackup('newsletter', 'insert', subscriber.id)
    createNotification('newsletter', { reference: subscriberId });
    
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    next(error); // will be handled by error handler
  }
});

export default router;