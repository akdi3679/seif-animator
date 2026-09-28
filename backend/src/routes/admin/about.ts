import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:about' });

router.use(limiter);

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const aboutSchema = z.object({
  content_fr: z.string().refine(val => stripHtml(val).length > 0, { message: 'French content is required' }),
  content_ar: z.string().refine(val => stripHtml(val).length > 0, { message: 'Arabic content is required' }),
  summary_fr: z.string().refine(val => stripHtml(val).length > 0, { message: 'French summary is required' }),
  summary_ar: z.string().refine(val => stripHtml(val).length > 0, { message: 'Arabic summary is required' }),
  image_url: z.string().url().or(z.literal('')).nullable().optional(),
  image_public_id: z.string().nullable().optional(),
});
router.get('/', authenticate, requireAdmin,  async (_req, res) => {
  const { data, error } = await supabase
    .from('AboutContent')
    .select('id, content_fr, content_ar, summary_fr, summary_ar, image_url, image_public_id, updated_at')
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Failed to fetch about content' });
  res.json(data || { content_fr: '', content_ar: '', summary_fr: '', summary_ar: '', image_url: '', image_public_id: null });
});

router.put('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = aboutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { content_fr, content_ar, summary_fr, summary_ar } = parsed.data;
  
  // Convert empty strings to null for Supabase
  const imageUrl = parsed.data.image_url || null;
  const imagePublicId = parsed.data.image_public_id || null;

  let { data: existing } = await supabase
    .from('AboutContent')
    .select('id, image_public_id')
    .limit(1)
    .maybeSingle();

  let id = existing?.id;

  // 2-Step Image Deletion: If image was removed or changed, delete from Cloudinary
  if (existing?.image_public_id && existing.image_public_id !== imagePublicId) {
    await deleteCloudinaryImage(existing.image_public_id);
  }

  if (!id) {
    // Insert new row
    const { data: newRow, error: insertError } = await supabase
      .from('AboutContent')
      .insert({ 
        content_fr, 
        content_ar, 
        summary_fr, 
        summary_ar, 
        image_url: imageUrl, 
        image_public_id: imagePublicId 
      })
      .select('id, content_fr, content_ar, summary_fr, summary_ar, image_url, image_public_id, updated_at')
      .single();
      
    if (insertError) return res.status(500).json({ error: 'Failed to create about content' });
    logAudit({ userId: req.user!.id, action: 'CREATE_ABOUT', resource: 'AboutContent', resourceId: newRow.id, req, success: true });
    return res.json(newRow);
  } else {
    // Update existing row
    const { data: updatedRow, error: updateError } = await supabase
      .from('AboutContent')
      .update({ 
        content_fr, 
        content_ar, 
        summary_fr, 
        summary_ar, 
        image_url: imageUrl, 
        image_public_id: imagePublicId,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select('id, content_fr, content_ar, summary_fr, summary_ar, image_url, image_public_id, updated_at')
      .single();
      
    if (updateError) return res.status(500).json({ error: 'Failed to update about content' });
    logAudit({ userId: req.user!.id, action: 'UPDATE_ABOUT', resource: 'AboutContent', resourceId: id, req, success: true });
    return res.json(updatedRow);
  }
});

export default router;