import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:products' });
router.use(limiter);

// ── Zod schema (slug optional, is_active added) ──────────────────
const productSchema = z.object({
  category_id: z.string().uuid('Category is required'),
  name_fr: z.string().min(1, 'French name is required'),
  name_ar: z.string().min(1, 'Arabic name is required'),
  description_fr: z.string().optional(),
  description_ar: z.string().optional(),
  price: z.coerce.number().positive('Price must be positive'),
  discount_percentage: z.coerce.number().min(0).max(100).optional().nullable(),
  stock_quantity: z.coerce.number().int().min(0).default(0),
    image_url: z.string().url().min(1, 'Main image is required'),
  image_public_id: z.string().optional().nullable(),
  is_recommended: z.boolean().optional(),
  is_limited: z.boolean().optional(),
  is_active: z.boolean().optional().default(true),
  show_original_price: z.boolean().optional().default(false),
});

// ── GET list (active / deleted, with filters & pagination) ────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { search, category, limit = 20, offset = 0, deleted } = req.query;

  let query = supabase
    .from('Product')
    .select(
      'id, category_id, name_fr, name_ar, slug, price, show_original_price, discount_percentage, stock_quantity, image_url, is_recommended, is_limited, is_active, created_at, ProductCategory!inner(name_fr, name_ar, slug, parent_id)',
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
if (req.query.recommended === 'true') {
  query = query.eq('is_recommended', true);
} else if (req.query.recommended === 'false') {
  query = query.eq('is_recommended', false);
}

if (req.query.limited === 'true') {
  query = query.eq('is_limited', true);
} else if (req.query.limited === 'false') {
  query = query.eq('is_limited', false);
}

if (req.query.discount === 'true') {
  query = query.gt('discount_percentage', 0);
} else if (req.query.discount === 'false') {
  query = query.eq('discount_percentage', 0);
}

if (req.query.active === 'true') {
  query = query.eq('is_active', true);
} else if (req.query.active === 'false') {
  query = query.eq('is_active', false);
}
 
if (search) {
  const term = `%${search}%`;
  query = query.or(
    `name_fr.ilike.${term},name_ar.ilike.${term},description_fr.ilike.${term},description_ar.ilike.${term}`
  );
}
  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const parsedOffset = Math.max(Number(offset) || 0, 0);
  query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('[Products]', error);
    return res.status(500).json({ error: 'Operation failed' });
  }
  await logAudit({
    userId: req.user!.id,
    action: 'LIST',
    resource: 'Product',
    req,
    success: true,
    metadata: { count },
  });
  res.json({ products: data, total: count });
});

// ── GET single product for editing (includes images) ──────────────
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('Product')
    .select(`
      id, category_id, name_fr, name_ar, slug, description_fr, description_ar,
      price, compare_at_price, discount_percentage, stock_quantity,
      image_url, image_public_id, is_recommended, is_limited, show_original_price, is_active,
      ProductImage ( id, url, public_id, is_primary, order_index )
    `)
    .eq('id', req.params.id)
    .single();

    if (error || !data) {
    await logAudit({
      userId: req.user!.id,
      action: 'VIEW',
      resource: 'Product',
      resourceId: req.params.id,
      req,
      success: false,
      metadata: { error: error?.message || 'Not found' },
    });
    return res.status(404).json({ error: 'Not found' });
  }

  await logAudit({
    userId: req.user!.id,
    action: 'VIEW',
    resource: 'Product',
    resourceId: req.params.id,
    req,
    success: true,
  });
  res.json(data);
});

// ── CREATE ────────────────────────────────────────────────────────
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // The 'recommended' category can only be set via the is_recommended flag
  const { data: recCat } = await supabase
    .from('ProductCategory')
    .select('id')
    .eq('slug', 'recommended')
    .single();

  if (recCat && parsed.data.category_id === recCat.id && !parsed.data.is_recommended) {
    return res.status(400).json({ error: 'Use the "Recommended" toggle instead of selecting this category.' });
  }

  // Enforce leaf rule: category must not have children (subcategories)
  const { count: childCount } = await supabase
    .from('ProductCategory')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parsed.data.category_id)
    .eq('is_active', true);
  if (childCount && childCount > 0) {
    return res.status(400).json({ error: 'Category already contains subcategories – cannot add products' });
  }

  const productData = { ...parsed.data };

  // Auto‑generate slug from French name
  productData.slug = productData.name_fr
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const { data, error } = await supabase.from('Product').insert(productData).select().single();
  if (error) return res.status(400).json({ error: 'Operation failed' });
  logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'Product', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});
// ── UPDATE ────────────────────────────────────────────────────────
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // The 'recommended' category can only be set via the is_recommended flag
  const { data: recCat } = await supabase
    .from('ProductCategory')
    .select('id')
    .eq('slug', 'recommended')
    .single();

  if (recCat && parsed.data.category_id === recCat.id && !parsed.data.is_recommended) {
    return res.status(400).json({ error: 'Use the "Recommended" toggle instead of selecting this category.' });
  }

  // Enforce leaf rule: category must not have children (subcategories)
  const { count: childCount } = await supabase
    .from('ProductCategory')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parsed.data.category_id)
    .eq('is_active', true);
  if (childCount && childCount > 0) {
    return res.status(400).json({ error: 'Category already contains subcategories – cannot add products' });
  }

  const productData = { ...parsed.data };
  // Generate slug if empty
  if (!productData.slug) {
    productData.slug = productData.name_fr
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Delete old main image if changed
  const { data: existing } = await supabase
    .from('Product')
    .select('image_public_id')
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.image_public_id && existing.image_public_id !== productData.image_public_id) {
    await deleteCloudinaryImage(existing.image_public_id);
  }

  const { data, error } = await supabase
    .from('Product')
    .update({ ...productData, updated_at: new Date() })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
   // ── Process additional images (optional) ────────────────────────
  const imagesPayload = req.body.images; // { add?: {url, public_id}[], remove?: string[] }

  if (imagesPayload) {
    // Add new images
    if (Array.isArray(imagesPayload.add)) {
      for (const img of imagesPayload.add) {
        if (!img.url || !img.public_id) continue;
        await supabase.from('ProductImage').insert({
          product_id: req.params.id,
          url: img.url,
          public_id: img.public_id,
          is_primary: false,
          order_index: 0,
        });
      }
    }

    // Remove specified images
    if (Array.isArray(imagesPayload.remove)) {
      for (const imageId of imagesPayload.remove) {
        // Delete Cloudinary asset first
        const { data: img } = await supabase
          .from('ProductImage')
          .select('public_id')
          .eq('id', imageId)
          .eq('product_id', req.params.id)
          .maybeSingle();
        if (img?.public_id) {
          try { await deleteCloudinaryImage(img.public_id); } catch (e) { /* log */ }
        }
        await supabase.from('ProductImage').delete()
          .eq('id', imageId)
          .eq('product_id', req.params.id);
      }
    }
  }
logAudit({
  userId: req.user!.id,
  action: 'UPDATE',
  resource: 'Product',
  resourceId: req.params.id,
  req,
  success: true,
  metadata: {
    images_added: imagesPayload?.add?.length || 0,
    images_removed: imagesPayload?.remove?.length || 0,
  },
});
res.json(data);
  
});

// ── SOFT DELETE (trash) ──────────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data, error } = await supabase
    .from('Product')
    .update({ deleted_at: new Date() })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found or already deleted' });
  logAudit({ userId: req.user!.id, action: 'SOFT_DELETE', resource: 'Product', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── RESTORE ───────────────────────────────────────────────────────
router.post('/:id/restore', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { data, error } = await supabase
    .from('Product')
    .update({ deleted_at: null })
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found or already restored' });
  logAudit({ userId: req.user!.id, action: 'RESTORE', resource: 'Product', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── PERMANENT DELETE (with Cloudinary cleanup) ────────────────────
router.delete('/:id/permanent', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: product, error: fetchErr } = await supabase
    .from('Product')
    .select('image_public_id')
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .maybeSingle();

  if (fetchErr || !product) return res.status(404).json({ error: 'Not found or not soft‑deleted' });

  // 1. Delete main image
  if (product.image_public_id) {
    await deleteCloudinaryImage(product.image_public_id);
  }

  // 2. Delete all additional images
  const { data: productImages } = await supabase
    .from('ProductImage')
    .select('public_id')
    .eq('product_id', req.params.id);
  if (productImages) {
    for (const img of productImages) {
      if (img.public_id) await deleteCloudinaryImage(img.public_id);
    }
    await supabase.from('ProductImage').delete().eq('product_id', req.params.id);
  }

  // 3. Hard delete the product
  const { error } = await supabase.from('Product').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });

  logAudit({ userId: req.user!.id, action: 'PERMANENT_DELETE', resource: 'Product', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── ADD IMAGE (multi‑image support) ──────────────────────────────
router.post('/:id/images', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { url, public_id } = req.body;
  if (!url || !public_id) return res.status(400).json({ error: 'url and public_id required' });

  const { data, error } = await supabase.from('ProductImage').insert({
    product_id: req.params.id,
    url,
    public_id,
    is_primary: false,
    order_index: 0,
  }).select().single();

  if (error) {
    console.error('Add image error:', error);
    return res.status(400).json({ error: error.message });
  }

  logAudit({ userId: req.user!.id, action: 'ADD_IMAGE', resource: 'ProductImage', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});
// ── DELETE IMAGE ──────────────────────────────────────────────────
router.delete('/:id/images/:imageId', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { data: image, error: fetchErr } = await supabase
    .from('ProductImage')
    .select('public_id')
    .eq('id', req.params.imageId)
    .eq('product_id', req.params.id)
    .maybeSingle();

  if (fetchErr || !image) return res.status(404).json({ error: 'Image not found' });

  if (image.public_id) {
    await deleteCloudinaryImage(image.public_id);
  }

  const { error } = await supabase.from('ProductImage').delete().eq('id', req.params.imageId);
  if (error) {
    console.error('Delete image error:', error);
    return res.status(400).json({ error: error.message });
  }

  logAudit({ userId: req.user!.id, action: 'DELETE_IMAGE', resource: 'ProductImage', resourceId: req.params.imageId, req, success: true });
  res.json({ success: true });
});
export default router;