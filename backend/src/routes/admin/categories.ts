import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { deleteCloudinaryImage } from '../../lib/cloudinary.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:categories' });
router.use(limiter);

const STANDARD_SLUGS = ['all', 'top-selling', 'new', 'recommended', 'discount', 'packages'];

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
  // Attributes are sent from the form, but now stored separately
  has_discount: z.boolean().optional(),
  discount_percentage: z.coerce.number().min(0).max(100).optional().nullable(),
  is_limited: z.boolean().optional(),
});

// ── Helper: fetch all attributes and build effective values ─────
// ── Helper: fetch all attributes and build effective values ─────
async function getEffectiveAttributes() {
  const { data: categories } = await supabase
    .from('ProductCategory')
    .select('id, parent_id, slug');

  const { data: attributes } = await supabase
    .from('category_attribute')
    .select('category_id, discount_percentage, is_limited');

  const attrMap = {};
  attributes?.forEach(a => {
    attrMap[a.category_id] = {
      discount_percentage: a.discount_percentage ?? null,
      is_limited: a.is_limited ?? false,
    };
  });

  const allCategory = categories?.find(c => c.slug === 'all');
  const allDiscount = allCategory ? (attrMap[allCategory.id]?.discount_percentage ?? null) : null;
  const allLimited = allCategory ? (attrMap[allCategory.id]?.is_limited ?? false) : false;

  const effective = {};

  for (const cat of categories ?? []) {
    // Standard categories (except 'all' and 'packages') never have discount/limited
    if (STANDARD_SLUGS.includes(cat.slug) && cat.slug !== 'all' && cat.slug !== 'packages') {
      effective[cat.id] = { discount_percentage: null, is_limited: false };
      continue;
    }

    // Global overrides – but independent!
    let discount = null;
    let limited = false;

    // Global discount from 'all' only applies if 'all' actually has a discount
    if (allDiscount !== null) {
      discount = allDiscount;
    }
    // Global limited from 'all' only applies if 'all' actually is limited
    if (allLimited) {
      limited = true;
    }

    // If no global override for a particular flag, fall back to normal inheritance
    if (discount === null) {
      // Normal inheritance for discount
      let currentId = cat.id;
      while (currentId) {
        if (attrMap[currentId]?.discount_percentage != null) {
          discount = attrMap[currentId].discount_percentage;
          break;
        }
        const parent = categories?.find(c => c.id === currentId);
        currentId = parent?.parent_id ?? null;
      }
    }

    if (!limited) {
      let currentId = cat.id;
      while (currentId) {
        if (attrMap[currentId]?.is_limited) {
          limited = true;
          break;
        }
        const parent = categories?.find(c => c.id === currentId);
        currentId = parent?.parent_id ?? null;
      }
    }

    effective[cat.id] = { discount_percentage: discount, is_limited: limited };
  }

  return effective;
}

// ── Helper: get top‑selling product count (last 30 days, top 10) ─
async function getTopSellingCount() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Try last 30 days
  const { data: topProducts30 } = await supabase.rpc('get_top_selling_products', {
    start_date: thirtyDaysAgo,
    limit_rows: 10,
  });

  if (topProducts30?.length) {
    return topProducts30.length;
  }

  // 2. Fallback: find the most recent month with any shipped orders
  const { data: latestOrder } = await supabase
    .from('Order')
    .select('created_at')
    .eq('status', 'shipped')
    .order('created_at', { ascending: false })
    .limit(1);

  if (latestOrder?.[0]) {
    const startOfMonth = new Date(new Date(latestOrder[0].created_at).getFullYear(), new Date(latestOrder[0].created_at).getMonth(), 1).toISOString();
    const { data: fallback } = await supabase.rpc('get_top_selling_products', {
      start_date: startOfMonth,
      limit_rows: 10,
    });
    return fallback?.length ?? 0;
  }

  return 0;
}

// ── GET list (with virtual counts and effective attributes) ──────
router.get('/', authenticate, requireAdmin, async (_req, res) => {

    const { data, error } = await supabase
    .from('ProductCategory')
    .select('id, name_fr, name_ar, slug, parent_id, order_index, is_active, image_url, category_attribute(discount_percentage, is_limited)');

  if (error) return res.status(500).json({ error: 'Operation failed' });
 
  if (error) return res.status(500).json({ error: 'Operation failed' });

  const { data: counts } = await supabase.rpc('get_category_product_counts');
  const countMap = {};
  counts?.forEach(c => { countMap[c.category_id] = Number(c.count); });

  const effectiveAttrs = await getEffectiveAttributes();

  const categoriesWithCounts = data?.map(cat => {
    // category_attribute is a single object, NOT an array
    const attr = cat.category_attribute || {};
    return {
      ...cat,
      own_discount_percentage: attr.discount_percentage ?? null,
      own_limited: attr.is_limited ?? false,
      product_count: countMap[cat.id] || 0,
      effective_discount: effectiveAttrs[cat.id]?.discount_percentage ?? null,
      effective_limited: effectiveAttrs[cat.id]?.is_limited ?? false,
    };
  }) ?? [];
  // Virtual counts for standard categories
    for (const cat of categoriesWithCounts) {
    if (cat.slug === 'all') {
      const { count } = await supabase
        .from('Product')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      cat.product_count = count ?? 0;
    } else if (cat.slug === 'top-selling') {
      cat.product_count = await getTopSellingCount();
    } else if (cat.slug === 'new') {
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      let { count } = await supabase
        .from('Product')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', twoMonthsAgo)
        .is('deleted_at', null);
      if (!count) {
        const { data: latest } = await supabase
          .from('Product')
          .select('created_at')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        if (latest?.[0]) {
          const startOfMonth = new Date(new Date(latest[0].created_at).getFullYear(), new Date(latest[0].created_at).getMonth(), 1).toISOString();
          const { count: fallbackCount } = await supabase
            .from('Product')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfMonth)
            .is('deleted_at', null);
          count = fallbackCount;
        }
      }
      cat.product_count = count ?? 0;
    } else if (cat.slug === 'recommended') {
      const { count } = await supabase
        .from('Product')
        .select('*', { count: 'exact', head: true })
        .eq('is_recommended', true)
        .is('deleted_at', null);
      cat.product_count = count ?? 0;
    } else if (cat.slug === 'discount') {
      const { count } = await supabase
        .from('Product')
        .select('*', { count: 'exact', head: true })
        .gt('discount_percentage', 0)
        .is('deleted_at', null);
      cat.product_count = count ?? 0;
    } else if (cat.slug === 'packages') {
      const { data: packCat } = await supabase
        .from('ProductCategory')
        .select('id')
        .eq('slug', 'packages')
        .single();
      if (packCat) {
        const { data: children } = await supabase
          .from('ProductCategory')
          .select('id')
          .eq('parent_id', packCat.id);
        const ids = [packCat.id, ...(children?.map(c => c.id) ?? [])];
        const { count } = await supabase
          .from('Product')
          .select('*', { count: 'exact', head: true })
          .in('category_id', ids)
          .is('deleted_at', null);
        cat.product_count = count ?? 0;
      }
    }
  }
await logAudit({
    userId: _req.user!.id,
    action: 'LIST',
    resource: 'ProductCategory',
    _req,
    success: true,
    metadata: { count: categoriesWithCounts.length },
  });

  res.json(categoriesWithCounts);
});

// ── CREATE ────────────────────────────────────────────────────────
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const data = { ...parsed.data };

  // Extract attributes before insert (they don't go into ProductCategory)
  const { has_discount, discount_percentage, is_limited, ...categoryData } = data;

  // Auto‑generate slug if empty
  if (!categoryData.slug || categoryData.slug.trim() === '') {
    categoryData.slug = categoryData.name_fr
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Parent rules
  if (categoryData.parent_id) {
    const { data: parent } = await supabase
      .from('ProductCategory')
      .select('slug, id')
      .eq('id', categoryData.parent_id)
      .single();
    if (!parent || STANDARD_SLUGS.includes(parent.slug)) {
      return res.status(400).json({ error: 'Cannot use a standard category as parent' });
    }
    const { count } = await supabase
      .from('Product')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', categoryData.parent_id)
      .is('deleted_at', null);
    if (count && count > 0) {
      return res.status(400).json({ error: 'Parent category already contains products' });
    }
  }

  // Insert the category
  let attempts = 0;
  while (attempts < 2) {
    try {
      const { data: created, error } = await supabase
        .from('ProductCategory')
        .insert(categoryData)
        .select()
        .single();

      if (error) {
        if (error.code === '23505' && error.message.includes('ProductCategory_slug_key')) {
          categoryData.slug = categoryData.slug + '-' + Math.random().toString(36).substring(2, 8);
          attempts++;
          continue;
        }
        console.error('Category create error:', error);
        return res.status(400).json({ error: error.message });
      }

      // Insert attributes if provided
      if (has_discount || is_limited) {
        await supabase.from('category_attribute').upsert({
          category_id: created.id,
          discount_percentage: has_discount ? discount_percentage : null,
          is_limited: is_limited ?? false,
        });
      }

      logAudit({ userId: req.user!.id, action: 'CREATE', resource: 'ProductCategory', resourceId: created.id, req, success: true });
      return res.status(201).json(created);
    } catch (err) {
      console.error('Unexpected error:', err);
      return res.status(500).json({ error: 'Operation failed' });
    }
  }
  return res.status(400).json({ error: 'Could not generate a unique slug – please try again' });
});
// ── REORDER ───────────────────────────────────────────────────────
router.put('/order', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items is required and must be an array' });

  const { error } = await supabase.rpc('update_product_category_order', { items });
  if (error) {
    console.error('RPC error:', error);
    return res.status(500).json({ error: error.message });
  }

  logAudit({ userId: req.user!.id, action: 'REORDER', resource: 'ProductCategory', req, success: true });
  res.json({ success: true });
});
// ── UPDATE ────────────────────────────────────────────────────────
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const data = { ...parsed.data };
  const { has_discount, discount_percentage, is_limited, ...categoryData } = data;

  // Auto‑generate slug only if name_fr is present (not a standard category update)
  if (categoryData.name_fr !== undefined && (!categoryData.slug || categoryData.slug.trim() === '')) {
    categoryData.slug = categoryData.name_fr
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Fetch existing category – only columns that still exist in ProductCategory
  const { data: existing } = await supabase
    .from('ProductCategory')
    .select('slug, image_public_id, name_fr, name_ar')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!existing) return res.status(404).json({ error: 'Not found' });

  // Force 'all' and 'discount' to stay active
  if (['all', 'discount'].includes(existing.slug)) {
    categoryData.is_active = true;
  }

  // Protect standard category names / slug – only if the fields were actually sent
  if (STANDARD_SLUGS.includes(existing.slug)) {
    if ((categoryData.name_fr !== undefined && categoryData.name_fr !== existing.name_fr) ||
        (categoryData.name_ar !== undefined && categoryData.name_ar !== existing.name_ar) ||
        (categoryData.slug !== undefined && categoryData.slug !== existing.slug)) {
      return res.status(400).json({ error: 'Cannot modify name or slug of a standard category' });
    }
    // For standard categories, ensure the slug stays the same if not provided
    if (categoryData.slug === undefined) {
      categoryData.slug = existing.slug;
    }
  }

  // Standard categories: only 'all' and 'packages' can have discount/limited
  if (STANDARD_SLUGS.includes(existing.slug) && existing.slug !== 'all' && existing.slug !== 'packages') {
    if (has_discount || (discount_percentage != null && discount_percentage > 0) || is_limited) {
      return res.status(400).json({ error: 'This category cannot have discount or limited flag' });
    }
  }

  // Update the category row (only columns that exist)
  const updateData = {
    ...categoryData,
     image_url: categoryData.image_url,        // ensure always present
  image_public_id: categoryData.image_public_id,
    updated_at: new Date(),
  };

  let attempts = 0;
  while (attempts < 2) {
    const { data: updated, error } = await supabase
      .from('ProductCategory')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505' && error.message.includes('ProductCategory_slug_key')) {
        updateData.slug = updateData.slug + '-' + Math.random().toString(36).substring(2, 8);
        attempts++;
        continue;
      }
      console.error('Category update error:', error);
      return res.status(400).json({ error: error.message });
    }

    if (!updated) return res.status(404).json({ error: 'Not found' });

    // Delete old Cloudinary image if changed
    if (existing.image_public_id && existing.image_public_id !== updateData.image_public_id) {
      try { await deleteCloudinaryImage(existing.image_public_id); } catch (e) { console.error(e); }
    }

    // Update attributes in category_attribute table
        // Update attributes in category_attribute table
    if (has_discount === false && is_limited === false) {
      await supabase.from('category_attribute').delete().eq('category_id', req.params.id);
    } else if (has_discount || is_limited) {
      await supabase.from('category_attribute').upsert({
        category_id: req.params.id,
        discount_percentage: has_discount ? discount_percentage : null,
        is_limited: is_limited ?? false,
      });
    }

    // Compute effective attributes for this category AFTER the update
    const effectiveAttrs = await getEffectiveAttributes();
    const effective = effectiveAttrs[req.params.id] || {
      discount_percentage: null,
      is_limited: false,
    };

    const result = {
      ...updated,
      effective_discount: effective.discount_percentage,
      effective_limited: effective.is_limited,
    };

    logAudit({
      userId: req.user!.id,
      action: 'UPDATE',
      resource: 'ProductCategory',
      resourceId: req.params.id,
      req,
      success: true,
    });
    return res.json(result);
  }

  return res.status(400).json({ error: 'Could not generate a unique slug – please try again' });
});



// ── DELETE (hard, cascade) ───────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const getChildIds = async (parentId) => {
    const { data: children } = await supabase.from('ProductCategory').select('id').eq('parent_id', parentId);
    let ids = children?.map(c => c.id) ?? [];
    for (const childId of ids) ids = ids.concat(await getChildIds(childId));
    return ids;
  };

  const allCategoryIds = [req.params.id, ...(await getChildIds(req.params.id))];

  // Delete category images
  const { data: catsWithImages } = await supabase.from('ProductCategory').select('image_public_id').in('id', allCategoryIds);
  for (const cat of catsWithImages ?? []) {
    if (cat.image_public_id) {
      try { await deleteCloudinaryImage(cat.image_public_id); } catch (e) { console.error(e); }
    }
  }

  const { data: productsInCats } = await supabase.from('Product').select('id').in('category_id', allCategoryIds);
  const productIds = productsInCats?.map(p => p.id) ?? [];

  if (productIds.length) {
    const { data: productImages } = await supabase.from('ProductImage').select('public_id').in('product_id', productIds);
    for (const img of productImages ?? []) {
      if (img.public_id) {
        try { await deleteCloudinaryImage(img.public_id); } catch (e) { console.error(e); }
      }
    }
    await supabase.from('ProductImage').delete().in('product_id', productIds);

    const { data: products } = await supabase.from('Product').select('image_public_id').in('id', productIds);
    for (const p of products ?? []) {
      if (p.image_public_id) {
        try { await deleteCloudinaryImage(p.image_public_id); } catch (e) { console.error(e); }
      }
    }
    await supabase.from('Product').delete().in('id', productIds);
  }

  await supabase.from('ProductCategory').delete().in('id', allCategoryIds);

  logAudit({ userId: req.user!.id, action: 'DELETE_CATEGORY_TREE', resource: 'ProductCategory', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;