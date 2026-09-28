import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';
import { queueBackup } from '../../services/backup-service.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:gallery-items' });
router.use(limiter);

const itemSchema = z.object({
  category_id: z.string().uuid('Category is required'),
  title_fr: z.string().min(1, 'French title is required'),
  title_ar: z.string().min(1, 'Arabic title is required'),
  description_fr: z.string().optional(),
  description_ar: z.string().optional(),
  media_url: z.string().url().min(1, 'Media is required'),
  image_public_id: z.string().optional().nullable(),
  media_type: z.enum(['image', 'gif', 'video']),
  is_gif: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

// ── GET list with filters, pagination, trash ────────────────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { search, category, limit = 20, offset = 0, deleted } = req.query;

  let query = supabase
    .from('GalleryItem')
    .select(
      'id, category_id, title_fr, title_ar, media_url, media_type, is_gif, is_active, created_at, GalleryCategory(name_fr, name_ar, slug)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (deleted === 'true') {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);
  }

  if (category && category !== '__all__') {
    query = query.eq('category_id', category);
  }

  if (search) {
    const term = `%${search}%`;
    query = query.or(`title_fr.ilike.${term},title_ar.ilike.${term},description_fr.ilike.${term},description_ar.ilike.${term}`);
  }
if (req.query.media_type && ['image', 'gif', 'video'].includes(req.query.media_type)) {
  query = query.eq('media_type', req.query.media_type);
}
  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const parsedOffset = Math.max(Number(offset) || 0, 0);
  query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Operation failed' });
  await logAudit({
    userId: req.user.id,
    action: 'LIST',
    resource: 'GalleryItem',
    req,
    success: true,
    metadata: { count },
  });
  res.json({ items: data, total: count });
});

// ── GET single item for editing ─────────────────────────────────
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('GalleryItem')
    .select(`
      id, category_id, title_fr, title_ar, description_fr, description_ar,
      media_url, image_public_id, media_type, is_gif, is_active,
      GalleryCategory(name_fr, name_ar, slug)
    `)
    .eq('id', req.params.id)
    .single();

    if (error || !data) {
    await logAudit({
      userId: req.user.id,
      action: 'VIEW',
      resource: 'GalleryItem',
      resourceId: req.params.id,
      req,
      success: false,
      metadata: { error: error?.message || 'Not found' },
    });
    return res.status(404).json({ error: 'Not found' });
  }

  await logAudit({
    userId: req.user.id,
    action: 'VIEW',
    resource: 'GalleryItem',
    resourceId: req.params.id,
    req,
    success: true,
  });
  res.json(data);
});

// ── CREATE ────────────────────────────────────────────────────────
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // Enforce leaf rule: category must not have children
  const { count: childCount } = await supabase
    .from('GalleryCategory')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parsed.data.category_id)
    .eq('is_active', true);
  if (childCount && childCount > 0) {
    return res.status(400).json({ error: 'Category already contains subcategories – cannot add items' });
  }

  const { data, error } = await supabase.from('GalleryItem').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: 'Operation failed' });
  queueBackup('gallery_item', 'insert', data.id)
  logAudit({ userId: req.user.id, action: 'CREATE', resource: 'GalleryItem', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

// ── UPDATE ────────────────────────────────────────────────────────
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // Delete old media if changed
  const { data: existing } = await supabase
    .from('GalleryItem')
    .select('image_public_id')
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.image_public_id && existing.image_public_id !== parsed.data.image_public_id) {
    try { await deleteCloudinaryImage(existing.image_public_id); } catch (e) {}
  }

  const { data, error } = await supabase
    .from('GalleryItem')
    .update({ ...parsed.data, updated_at: new Date() })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  queueBackup('gallery_item', 'update', req.params.id)
  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'GalleryItem', resourceId: req.params.id, req, success: true });
  res.json(data);
});

// ── SOFT DELETE (trash) ──────────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data, error } = await supabase
    .from('GalleryItem')
    .update({ deleted_at: new Date() })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found or already deleted' });
  queueBackup('gallery_item', 'update', req.params.id)
  logAudit({ userId: req.user.id, action: 'SOFT_DELETE', resource: 'GalleryItem', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── RESTORE ──────────────────────────────────────────────────────
router.post('/:id/restore', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { data, error } = await supabase
    .from('GalleryItem')
    .update({ deleted_at: null })
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found or already restored' });
  queueBackup('gallery_item', 'update', req.params.id)
  logAudit({ userId: req.user.id, action: 'RESTORE', resource: 'GalleryItem', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── PERMANENT DELETE (with Cloudinary cleanup) ─────────────────
router.delete('/:id/permanent', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: item, error: fetchErr } = await supabase
    .from('GalleryItem')
    .select('image_public_id')
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .maybeSingle();

  if (fetchErr || !item) return res.status(404).json({ error: 'Not found or not soft‑deleted' });

  if (item.image_public_id) {
    try { await deleteCloudinaryImage(item.image_public_id); } catch (e) {}
  }

  const { error } = await supabase.from('GalleryItem').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });
queueBackup('gallery_item', 'delete', req.params.id)
  logAudit({ userId: req.user.id, action: 'PERMANENT_DELETE', resource: 'GalleryItem', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;