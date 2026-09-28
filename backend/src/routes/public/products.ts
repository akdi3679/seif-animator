import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router();
const STANDARD_SLUGS = ['all', 'top-selling', 'new', 'recommended', 'discount', 'packages'];
// ── Effective discount inheritance (parent → child) ─────────────
async function getCategoryEffectiveAttributes() {
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

  const discountMap = {};
  const limitedSet = new Set();

  for (const cat of categories ?? []) {
    // Standard categories (except all/packages) never get discount/limited
    if (STANDARD_SLUGS.includes(cat.slug) && cat.slug !== 'all' && cat.slug !== 'packages') {
      discountMap[cat.id] = 0;
      continue;
    }

    let discount = null;
    let limited = false;

    // Apply global discount only if 'all' actually has a discount
    if (allDiscount !== null) {
      discount = allDiscount;
    }
    // Apply global limited only if 'all' actually is limited
    if (allLimited) {
      limited = true;
    }

    // If no global discount, fall back to inheritance
    if (discount === null) {
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

    // If no global limited, fall back to inheritance
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

    discountMap[cat.id] = discount ?? 0;
    if (limited) limitedSet.add(cat.id);
  }

  return { discounts: discountMap, limited: limitedSet };
}


// ── GET /api/public/products – list with filters ─────────────────
router.get('/', async (req, res) => {
  if (!(await isFeatureEnabled('products'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  }

  try {
const { discounts, limited } = await getCategoryEffectiveAttributes();
    const { category, search, sort, limit = 20, offset = 0 } = req.query;
    let query = supabase
      .from('Product')
      .select(
        'id, slug, name_fr, name_ar, price, show_original_price, discount_percentage, image_url, category_id, is_limited, stock_quantity, ProductCategory!inner(name_fr, name_ar, slug, parent_id)',
        { count: 'exact' }
      )
      .eq('is_active', true)
      .is('deleted_at', null);

    // ── Category filters ────────────────────────────────────────
    if (!category || category === 'all') {
      // no extra filter
    } else if (category === 'new') {
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('Product')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twoMonthsAgo)
        .eq('is_active', true)
        .is('deleted_at', null);
      if (count && count > 0) {
        query = query.gte('created_at', twoMonthsAgo);
      } else {
        // fallback: most recent month that has products
        const { data: latest } = await supabase
          .from('Product')
          .select('created_at')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        if (latest && latest.length > 0) {
          const startOfMonth = new Date(
            new Date(latest[0].created_at).getFullYear(),
            new Date(latest[0].created_at).getMonth(),
            1
          ).toISOString();
          query = query.gte('created_at', startOfMonth);
        }
      }
    } else if (category === 'recommended') {
      query = query.eq('is_recommended', true);
    } else if (category === 'discount') {
      query = query.gt('discount_percentage', 0);
    } else if (category === 'top-selling') {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: topIds } = await supabase.rpc('get_top_selling_products', {
    start_date: thirtyDaysAgo,
    limit_rows: 10,
  });
  if (topIds?.length) {
    query = query.in('id', topIds.map(p => p.product_id));
  } else {
    // fallback same as new – find latest month with orders
    // (simplified: reuse same logic as new fallback but with orders)
    const { data: latestOrder } = await supabase
      .from('Order')
      .select('created_at')
      .eq('status', 'shipped')
      .order('created_at', { ascending: false })
      .limit(1);
    if (latestOrder?.[0]) {
      const startOfMonth = new Date(new Date(latestOrder[0].created_at).getFullYear(), new Date(latestOrder[0].created_at).getMonth(), 1).toISOString();
      const { data: fallbackIds } = await supabase.rpc('get_top_selling_products', {
        start_date: startOfMonth,
        limit_rows: 10,
      });
      if (fallbackIds?.length) {
        query = query.in('id', fallbackIds.map(p => p.product_id));
      } else {
        // return empty
        return res.json({ products: [], total: 0 });
      }
    } else {
      return res.json({ products: [], total: 0 });
    }
  }
} else if (category === 'packages') {
      // 1. Find the "packages" parent category
      const { data: packParent } = await supabase
        .from('ProductCategory')
        .select('id')
        .eq('slug', 'packages')
        .eq('is_active', true)
        .single();

      if (packParent) {
        // 2. Find all its subcategories (children of "packages")
        const { data: packChildren } = await supabase
          .from('ProductCategory')
          .select('id')
          .eq('parent_id', packParent.id)
          .eq('is_active', true);

        const packCategoryIds = [packParent.id, ...(packChildren?.map(c => c.id) ?? [])];
        query = query.in('category_id', packCategoryIds);
      }
    } else {
      // specific category slug
      query = query.eq('ProductCategory.slug', category);
    }

    // ── Search ────────────────────────────────────────────────────
    if (search) {
      const term = `%${search}%`;
      query = query.or(`name_fr.ilike.${term},name_ar.ilike.${term}`);
    }

    // ── Sort ──────────────────────────────────────────────────────
    switch (sort) {
      case 'price_asc':  query = query.order('price', { ascending: true }); break;
      case 'price_desc': query = query.order('price', { ascending: false }); break;
      case 'name_asc':   query = query.order('name_fr', { ascending: true }); break;
      case 'name_desc':  query = query.order('name_fr', { ascending: false }); break;
      default:           query = query.order('created_at', { ascending: false }); break;
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const productsWithAttributes = (data ?? []).map((p: any) => ({
  ...p,
  discount_percentage: Math.max(p.discount_percentage ?? 0, discounts[p.category_id] ?? 0),
  is_limited: p.is_limited || limited.has(p.category_id),
}));

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
res.json({ products: productsWithAttributes, total: count });
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── GET /api/public/products/:slug – detail ─────────────────────
router.get('/:slug', async (req, res) => {
  if (!(await isFeatureEnabled('products'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  }

  try {
const { discounts, limited } = await getCategoryEffectiveAttributes();

    const { slug } = req.params;

    const { data, error } = await supabase
      .from('Product')
      .select(`
        id, slug, name_fr, name_ar, description_fr, description_ar,
        price, show_original_price, discount_percentage, image_url,
        category_id, is_limited, stock_quantity, is_recommended,
        ProductCategory ( name_fr, name_ar, slug ),
        ProductImage ( url, is_primary, order_index )
      `)
      .eq('slug', slug)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productWithAttributes = {
  ...data,
  discount_percentage: Math.max(data.discount_percentage ?? 0, discounts[data.category_id] ?? 0),
  is_limited: data.is_limited || limited.has(data.category_id),
};
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
res.json(productWithAttributes);
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).json({ error: 'Failed to fetch product detail' });
  }
});

// ── POST /api/public/products/check ─────────────────────────────
router.post('/check', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids required' });
  }

  const { data, error } = await supabase
    .from('Product')
    .select('id')
    .in('id', ids)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) return res.status(500).json({ error: 'Operation failed' });

  res.json({ existingIds: data.map(p => p.id) });
});

export default router;