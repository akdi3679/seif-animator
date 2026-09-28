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
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:gallery-cats' });
router.use(limiter);

const STANDARD_SLUGS = ['all', 'latest'];

const categorySchema = z.object({
  name_fr: z.string().min(1, 'French name is required'),
  name_ar: z.string().min(1, 'Arabic name is required'),
  slug: z.string().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  description_fr: z.string().optional(),
  description_ar: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  image_public_id: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

// ── GET list (with item counts) ───────────────────────────────
router.get('/', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('GalleryCategory')
    .select('id, name_fr, name_ar, slug, parent_id, order_index, is_active, image_url');

  if (error) return res.status(500).json({ error: 'Operation failed' });

  // Get item counts per category (direct + children)
  const { data: counts } = await supabase.rpc('get_gallery_category_item_counts');
  const countMap = {};
  counts?.forEach(c => { countMap[c.category_id] = Number(c.count); });

  const categoriesWithCounts = data?.map(cat => ({
    ...cat,
    item_count: countMap[cat.id] || 0,
  })) ?? [];

  // Virtual counts for standard categories
  for (const cat of categoriesWithCounts) {
    if (cat.slug === 'all') {
      const { count } = await supabase
        .from('GalleryItem')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      cat.item_count = count ?? 0;
    } else if (cat.slug === 'latest') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let { count } = await supabase
        .from('GalleryItem')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo)
        .is('deleted_at', null);
      if (!count) {
        // fallback to most recent month with items
        const { data: latest } = await supabase
          .from('GalleryItem')
          .select('created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        if (latest?.[0]) {
          const startOfMonth = new Date(new Date(latest[0].created_at).getFullYear(), new Date(latest[0].created_at).getMonth(), 1).toISOString();
          const { count: fallbackCount } = await supabase
            .from('GalleryItem')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfMonth)
            .is('deleted_at', null);
          count = fallbackCount;
        }
      }
      cat.item_count = count ?? 0;
    }
  }
  await logAudit({
    userId: _req.user.id,
    action: 'LIST',
    resource: 'GalleryCategory',
    _req,
    success: true,
    metadata: { count: categoriesWithCounts.length },
  });
  res.json(categoriesWithCounts);
});
// ── REORDER (if needed) ─────────────────────────────────────────
router.put('/order', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items is required and must be an array' });

  const { error } = await supabase.rpc('update_gallery_category_order', { items });
  if (error) {
    console.error('RPC error:', error);
    return res.status(500).json({ error: error.message });
  }

  logAudit({ userId: req.user.id, action: 'REORDER', resource: 'GalleryCategory', req, success: true });
  res.json({ success: true });
});

// ── CREATE ──────────────────────────────────────────────────────
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const data = { ...parsed.data };
  if (!data.slug) {
    data.slug = data.name_fr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
// Prevent assignment to standard virtual categories
const { data: cat } = await supabase
  .from('GalleryCategory')
  .select('slug')
  .eq('id', parsed.data.category_id)
  .single();

if (cat && STANDARD_SLUGS.includes(cat.slug)) {
  return res.status(400).json({ error: 'Cannot add items to a virtual category' });
}
  if (data.parent_id) {
    const { data: parent } = await supabase
      .from('GalleryCategory')
      .select('slug, id')
      .eq('id', data.parent_id)
      .single();
    if (!parent || STANDARD_SLUGS.includes(parent.slug)) {
      return res.status(400).json({ error: 'Cannot use a standard category as parent' });
    }
    const { count } = await supabase
      .from('GalleryItem')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', data.parent_id)
      .is('deleted_at', null);
    if (count && count > 0) {
      return res.status(400).json({ error: 'Parent category already contains items – cannot add subcategories' });
    }
  }

  const { data: created, error } = await supabase.from('GalleryCategory').insert(data).select().single();
  if (error) {
    console.error('GalleryCat create:', error);
    return res.status(400).json({ error: error.message });
  }
  queueBackup('gallery_category', 'insert', created.id)
  logAudit({ userId: req.user.id, action: 'CREATE', resource: 'GalleryCategory', resourceId: created.id, req, success: true });
  res.status(201).json(created);
});

// ── UPDATE ──────────────────────────────────────────────────────
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const data = { ...parsed.data };
  if (!data.slug) {
    data.slug = data.name_fr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const { data: existing } = await supabase
    .from('GalleryCategory')
    .select('slug, image_public_id, name_fr, name_ar, description_fr, description_ar')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (['all', 'latest'].includes(existing.slug)) {
    data.is_active = true;
  }

  // Lock all standard category text fields
  if (STANDARD_SLUGS.includes(existing.slug)) {
    const sentNameFr = (data.name_fr ?? '').trim();
    const sentNameAr = (data.name_ar ?? '').trim();
    const sentSlug = (data.slug ?? '').trim();
    const sentDescFr = (data.description_fr ?? '').trim();
    const sentDescAr = (data.description_ar ?? '').trim();

    if (
      (sentNameFr && sentNameFr !== (existing.name_fr ?? '').trim()) ||
      (sentNameAr && sentNameAr !== (existing.name_ar ?? '').trim()) ||
      (sentSlug && sentSlug !== (existing.slug ?? '').trim()) ||
      (sentDescFr && sentDescFr !== (existing.description_fr ?? '').trim()) ||
      (sentDescAr && sentDescAr !== (existing.description_ar ?? '').trim())
    ) {
      return res.status(400).json({ error: 'Cannot modify name, slug, or description of a standard category' });
    }
  }


  const { data: updated, error } = await supabase
    .from('GalleryCategory')
    .update({ ...data, updated_at: new Date() })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error || !updated) return res.status(404).json({ error: 'Not found' });

  if (existing.image_public_id && existing.image_public_id !== data.image_public_id) {
    try { await deleteCloudinaryImage(existing.image_public_id); } catch (e) {}
  }
queueBackup('gallery_category', 'update', req.params.id)
  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'GalleryCategory', resourceId: req.params.id, req, success: true });
  res.json(updated);
});


// ── DELETE (hard, cascade) ──────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const getChildIds = async (parentId) => {
    const { data: children } = await supabase.from('GalleryCategory').select('id').eq('parent_id', parentId);
    let ids = children?.map(c => c.id) ?? [];
    for (const childId of ids) ids = ids.concat(await getChildIds(childId));
    return ids;
  };

  const allCategoryIds = [req.params.id, ...(await getChildIds(req.params.id))];

  // Delete category images
  const { data: catsWithImages } = await supabase.from('GalleryCategory').select('image_public_id').in('id', allCategoryIds);
  for (const cat of catsWithImages ?? []) {
    if (cat.image_public_id) try { await deleteCloudinaryImage(cat.image_public_id); } catch (e) {}
  }

  // Get all items in these categories and delete their media
  const { data: items } = await supabase.from('GalleryItem').select('id, image_public_id, media_url').in('category_id', allCategoryIds);
  if (items) {
    for (const item of items) {
      if (item.image_public_id) try { await deleteCloudinaryImage(item.image_public_id); } catch (e) {}
      // also delete any additional media? only one image_public_id for now
    }
    const itemIds = items.map(i => i.id);
    await supabase.from('GalleryItem').delete().in('id', itemIds);
  }

  await supabase.from('GalleryCategory').delete().in('id', allCategoryIds);
for (const iid of itemIds) queueBackup('gallery_item', 'delete', iid);
for (const cid of allCategoryIds) queueBackup('gallery_category', 'delete', cid);
  logAudit({ userId: req.user.id, action: 'DELETE_CATEGORY_TREE', resource: 'GalleryCategory', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;